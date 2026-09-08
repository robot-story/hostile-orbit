#!/usr/bin/env node
// HOSTILE ORBIT - offline audio generation.
// Renders every SFX and music stem into public/audio and writes public/audio/manifest.json.
//
// Output format policy (consistent across the set):
//   - Everything is synthesized at 44100 Hz.
//   - SFX with duration <= 1.0 s  -> 44100 Hz 16-bit mono WAV (punchy transients keep full bandwidth).
//   - SFX 1.0 s < d <= 4.0 s     -> 22050 Hz 16-bit mono WAV (tails/ambient content; halves size).
//   - SFX longer than 4.0 s      -> 22050 Hz mono MP3 @ 96 kbps (ambience beds, long one-shots).
//     Every MP3 gets a Xing/"Info" frame with a LAME tag (encoder delay 576 + padding) so gapless-aware
//     decoders (Chrome/ffmpeg, Firefox, Safari) return exactly the original sample count and loops are
//     seamless. Fallback for decoders that ignore it: manifest entries carry "samples" and "encoderDelay";
//     if decoded length > samples, set loopStart = (encoderDelay + 529) / sampleRate and
//     loopEnd = loopStart + samples / sampleRate on the AudioBufferSourceNode.
//   - Music stems -> 44100 Hz stereo MP3 @ 128 kbps, every loop stem has EXACTLY the same sample count.
//   - Every file is peak-normalized to -1 dBFS; per-category loudness trims live in manifest "gain".
//
// Usage: node tools/generate-audio.mjs [--only <regex>] [--skip-music] [--skip-sfx]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './synth/dsp.js';
import { SFX, CATEGORY_GAIN } from './synth/sfx.js';
import { MUSIC, BPM, BARS, TOTAL_SAMPLES, LOOP_DUR, previewMix } from './synth/music.js';
import { encodeWav } from './synth/wav.js';
import { encodeMp3, ENCODER_DELAY } from './synth/mp3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'audio');
const SFX_DIR = path.join(OUT, 'sfx');
const MUSIC_DIR = path.join(OUT, 'music');
const STATS_PATH = path.join(__dirname, 'audio-stats.json');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new RegExp(args[onlyIdx + 1]) : null;
const SKIP_MUSIC = args.includes('--skip-music');
const SKIP_SFX = args.includes('--skip-sfx');

const SFX_MP3_KBPS = 96;
const MUSIC_MP3_KBPS = 128;

fs.mkdirSync(SFX_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR, { recursive: true });

const fmtKB = (b) => (b / 1024).toFixed(1).padStart(7) + ' KB';
const stats = fs.existsSync(STATS_PATH) && ONLY ? JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')) : {};
let manifest = { sfx: {}, music: {} };
const manifestPath = path.join(OUT, 'manifest.json');
if (ONLY && fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* fresh */ } }

function removeDc(buf) { let m = 0; for (let i = 0; i < buf.length; i++) m += buf[i]; m /= buf.length; for (let i = 0; i < buf.length; i++) buf[i] -= m; return buf; }

/** Resample a loop seamlessly: filter over two copies and keep the second half so IIR startup is not at the seam. */
function resampleLoop(buf, from, to) {
  const twice = D.concat(buf, buf);
  const r = D.resample(twice, from, to);
  const n = Math.round(buf.length * to / from);
  return r.slice(r.length - n);
}

function chooseFormat(durSec) {
  if (durSec <= 1.0) return { sr: 44100, ext: 'wav' };
  if (durSec <= 4.0) return { sr: 22050, ext: 'wav' };
  return { sr: 22050, ext: 'mp3' };
}

function recordStats(rel, chans, sr) {
  const list = Array.isArray(chans) ? chans : [chans];
  let pk = 0, sq = 0, n = 0, clipped = 0;
  for (const c of list) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > pk) pk = a; sq += a * a; n++; if (a >= 0.999) clipped++; }
  stats[rel] = { sampleRate: sr, samples: list[0].length, channels: list.length, duration: list[0].length / sr, peak: pk, rms: Math.sqrt(sq / Math.max(1, n)), clippedFraction: clipped / Math.max(1, n) };
}

function writeOut(rel, chans, sr, ext, kbps) {
  const abs = path.join(OUT, rel);
  const data = ext === 'wav' ? encodeWav(chans, sr) : encodeMp3(chans, sr, kbps);
  fs.writeFileSync(abs, data);
  recordStats(rel, chans, sr);
  return data.length;
}

// ---------------------------------------------------------------------------
// SFX
// ---------------------------------------------------------------------------
function renderSfxVariant(name, def, v) {
  const rng = D.makeRng(`${name}#${v}`);
  let buf = def.render(rng, v);
  if (!(buf instanceof Float32Array)) throw new Error(`${name}: render did not return Float32Array`);
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) throw new Error(`${name}#${v}: non-finite sample at ${i}`);
  if (def.loop) {
    const want = D.samples(def.dur);
    if (buf.length !== want) throw new Error(`${name}: loop length ${buf.length} != ${want}`);
    removeDc(buf);
  } else {
    D.dcBlock(buf);
    buf = D.trimTail(buf, -60, 0.04);
  }
  D.normalize(buf, -1);
  const dur = buf.length / D.SR;
  const { sr, ext } = chooseFormat(def.loop ? def.dur : dur);
  let out = buf;
  if (sr !== D.SR) {
    out = def.loop ? resampleLoop(buf, D.SR, sr) : D.resample(buf, D.SR, sr);
    D.normalize(out, -1);
  }
  return { out, sr, ext, dur: out.length / sr };
}

function generateSfx() {
  const names = Object.keys(SFX).filter((n) => !ONLY || ONLY.test(n));
  let total = 0, files = 0;
  const t0 = Date.now();
  // wipe stale sfx files when doing a full run
  if (!ONLY) for (const f of fs.readdirSync(SFX_DIR)) fs.unlinkSync(path.join(SFX_DIR, f));
  for (const name of names) {
    const def = SFX[name];
    const variants = [];
    let bytes = 0, ext = 'wav', sr = 44100, dur = 0;
    for (let v = 0; v < def.variants; v++) {
      const r = renderSfxVariant(name, def, v);
      const fname = def.variants > 1 ? `${name}_${v + 1}.${r.ext}` : `${name}.${r.ext}`;
      const rel = `sfx/${fname}`;
      bytes += writeOut(rel, r.out, r.sr, r.ext, SFX_MP3_KBPS);
      variants.push(rel); ext = r.ext; sr = r.sr; dur = r.dur; files++;
    }
    total += bytes;
    manifest.sfx[name] = {
      file: variants[0], variants, loop: !!def.loop, gain: CATEGORY_GAIN[def.cat] ?? 1.0,
      duration: +dur.toFixed(3), sampleRate: sr, category: def.cat,
      ...(ext === 'mp3' ? { samples: Math.round(dur * sr), encoderDelay: ENCODER_DELAY, decoderDelay: 529 } : {}),
    };
    console.log(`  ${name.padEnd(26)} x${def.variants} ${ext} ${String(sr).padStart(5)} Hz ${dur.toFixed(2).padStart(6)} s ${fmtKB(bytes)}`);
  }
  console.log(`SFX: ${files} files, ${(total / 1024 / 1024).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------
function generateMusic() {
  const names = Object.keys(MUSIC).filter((n) => !ONLY || ONLY.test(n));
  const t0 = Date.now();
  const stems = {};
  let total = 0;
  for (const name of names) {
    const t = Date.now();
    const def = MUSIC[name];
    const st = def.render(D.makeRng('music:' + name));
    for (const c of st) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) throw new Error(`${name}: non-finite sample`);
    if (def.loop && st[0].length !== TOTAL_SAMPLES) throw new Error(`${name}: ${st[0].length} samples != ${TOTAL_SAMPLES}`);
    stems[name] = st;
    const rel = `music/${name}.mp3`;
    const bytes = writeOut(rel, st, 44100, 'mp3', MUSIC_MP3_KBPS);
    total += bytes;
    const dur = st[0].length / 44100;
    manifest.music[name] = { file: rel, bpm: BPM, bars: def.loop ? BARS : +(dur / (LOOP_DUR / BARS)).toFixed(3), loop: !!def.loop, duration: +dur.toFixed(3), sampleRate: 44100, samples: st[0].length, encoderDelay: ENCODER_DELAY, decoderDelay: 529 };
    console.log(`  ${name.padEnd(18)} ${dur.toFixed(2).padStart(6)} s ${fmtKB(bytes)}  (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  // preview mix for verification only (not in manifest)
  const loopNames = Object.keys(MUSIC).filter((n) => MUSIC[n].loop);
  if (loopNames.every((n) => stems[n])) {
    const pm = previewMix(stems);
    const bytes = writeOut('music/preview_mix.mp3', pm, 44100, 'mp3', MUSIC_MP3_KBPS);
    console.log(`  ${'preview_mix'.padEnd(18)} ${(pm[0].length / 44100).toFixed(2).padStart(6)} s ${fmtKB(bytes)}  (verification only, not in manifest)`);
  }
  console.log(`MUSIC: ${names.length} stems, ${(total / 1024 / 1024).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------------------
const tAll = Date.now();
console.log(`HOSTILE ORBIT audio generation -> ${OUT}`);
if (!SKIP_SFX) { console.log('\n[SFX]'); generateSfx(); }
if (!SKIP_MUSIC) { console.log('\n[MUSIC]'); generateMusic(); }

// stable key ordering
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
manifest = { sfx: sortObj(manifest.sfx), music: sortObj(manifest.music) };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 1) + '\n');

let bytes = 0;
for (const dir of [SFX_DIR, MUSIC_DIR]) for (const f of fs.readdirSync(dir)) bytes += fs.statSync(path.join(dir, f)).size;
console.log(`\nmanifest: ${Object.keys(manifest.sfx).length} sfx entries, ${Object.keys(manifest.music).length} music entries -> ${path.relative(ROOT, manifestPath)}`);
console.log(`public/audio total: ${(bytes / 1024 / 1024).toFixed(2)} MB   (${((Date.now() - tAll) / 1000).toFixed(1)} s)`);
