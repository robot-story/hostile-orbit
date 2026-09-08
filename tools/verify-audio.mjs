#!/usr/bin/env node
// Verifies public/audio output: loads every file referenced by manifest.json (and checks for orphans),
// prints duration / peak / RMS, and FAILS if any file is silent (RMS < 0.005), clipped badly
// (> 1% of samples at full scale), missing on disk, or present on disk but missing from the manifest.
// WAVs are decoded directly. MP3s cannot be decoded without ffmpeg, so their duration/frame count is
// parsed from the MPEG frame headers and peak/RMS come from the pre-encode PCM stats the generator
// recorded in tools/audio-stats.json (marked with * in the table).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWav } from './synth/wav.js';
import { mp3Info } from './synth/mp3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'audio');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const statsPath = path.join(__dirname, 'audio-stats.json');
const stats = fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) : {};

const SILENT_RMS = 0.005, CLIP_FRACTION = 0.01;
const problems = [];
const rows = [];
let totalBytes = 0;

function analyzeWav(buf) {
  const { sampleRate, channels } = decodeWav(buf);
  let pk = 0, sq = 0, n = 0, clipped = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > pk) pk = a; sq += a * a; n++; if (a >= 0.999) clipped++; }
  return { sampleRate, channels: channels.length, samples: channels[0].length, duration: channels[0].length / sampleRate, peak: pk, rms: Math.sqrt(sq / Math.max(1, n)), clipFrac: clipped / Math.max(1, n), est: false };
}
function analyzeMp3(buf, rel) {
  const info = mp3Info(buf);
  if (!info.hasInfoTag) problems.push(`${rel}: MP3 has no Xing/Info gapless tag`);
  const s = stats[rel];
  const base = { sampleRate: info.sampleRate, channels: info.channels, samples: info.gaplessSamples, rawSamples: info.samples, duration: info.gaplessSamples / info.sampleRate, est: true, frames: info.frames, gapless: info.hasInfoTag };
  if (!s) return { ...base, peak: NaN, rms: NaN, clipFrac: NaN };
  if (s.samples !== info.gaplessSamples) problems.push(`${rel}: gapless sample count ${info.gaplessSamples} != encoded PCM ${s.samples}`);
  return { ...base, pcmSamples: s.samples, peak: s.peak, rms: s.rms, clipFrac: s.clippedFraction };
}

function check(kind, key, rel, extra = {}) {
  const abs = path.join(OUT, rel);
  if (!fs.existsSync(abs)) { problems.push(`${rel}: MISSING on disk (manifest ${kind}:${key})`); return; }
  const buf = fs.readFileSync(abs);
  totalBytes += buf.length;
  let a;
  try { a = rel.endsWith('.wav') ? analyzeWav(buf) : analyzeMp3(buf, rel); }
  catch (e) { problems.push(`${rel}: decode error ${e.message}`); return; }
  if (!(a.rms >= SILENT_RMS)) problems.push(`${rel}: SILENT (rms ${a.rms})`);
  if (!(a.clipFrac <= CLIP_FRACTION)) problems.push(`${rel}: CLIPPED (${(a.clipFrac * 100).toFixed(2)}% at full scale)`);
  if (a.duration < 0.005) problems.push(`${rel}: too short (${a.duration}s)`);
  rows.push({ kind, key, rel, bytes: buf.length, ...a, ...extra });
  return a;
}

// --- SFX
for (const [name, e] of Object.entries(manifest.sfx)) {
  if (!e.file || !Array.isArray(e.variants) || e.variants.length === 0) { problems.push(`sfx ${name}: bad manifest entry`); continue; }
  if (!e.variants.includes(e.file)) problems.push(`sfx ${name}: file ${e.file} not in variants`);
  if (typeof e.gain !== 'number' || typeof e.loop !== 'boolean') problems.push(`sfx ${name}: gain/loop missing`);
  for (const rel of e.variants) check('sfx', name, rel, { loop: e.loop, gain: e.gain });
}
// --- Music
const loopSamples = new Set();
for (const [name, e] of Object.entries(manifest.music)) {
  const a = check('music', name, e.file, { loop: e.loop, bpm: e.bpm, bars: e.bars });
  if (a && e.loop) loopSamples.add(a.samples);
  if (a && e.loop && a.sampleRate !== 44100) problems.push(`${e.file}: music loop not 44100 Hz`);
  if (a && a.channels !== 2) problems.push(`${e.file}: music not stereo`);
}
if (loopSamples.size > 1) problems.push(`music loop stems have differing sample counts: ${[...loopSamples].join(', ')}`);
// --- Orphans (files on disk not referenced by manifest)
const referenced = new Set([...Object.values(manifest.sfx).flatMap((e) => e.variants), ...Object.values(manifest.music).map((e) => e.file)]);
for (const dir of ['sfx', 'music']) {
  for (const f of fs.readdirSync(path.join(OUT, dir))) {
    const rel = `${dir}/${f}`;
    if (rel === 'music/preview_mix.mp3') { totalBytes += fs.statSync(path.join(OUT, rel)).size; continue; } // verification-only artifact
    if (!referenced.has(rel)) problems.push(`${rel}: on disk but MISSING FROM MANIFEST`);
  }
}

// --- Table
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
console.log(pad('file', 36) + rpad('dur s', 8) + rpad('sr', 7) + rpad('ch', 3) + rpad('peak', 8) + rpad('rms', 8) + rpad('clip%', 7) + rpad('KB', 9) + '  flags');
for (const r of rows) {
  const flags = [];
  if (r.loop) flags.push('loop');
  if (r.est) flags.push(r.gapless ? '*mp3 (gapless tag, pre-encode peak/rms)' : '*mp3 NO TAG');
  console.log(pad(r.rel, 36) + rpad(r.duration.toFixed(3), 8) + rpad(r.sampleRate, 7) + rpad(r.channels, 3) + rpad(r.peak.toFixed(3), 8) + rpad(r.rms.toFixed(4), 8) + rpad((r.clipFrac * 100).toFixed(2), 7) + rpad((r.bytes / 1024).toFixed(1), 9) + '  ' + flags.join(' '));
}
const sfxRows = rows.filter((r) => r.kind === 'sfx'), musRows = rows.filter((r) => r.kind === 'music');
const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);
console.log('\nSUMMARY');
console.log(`  sfx  : ${sfxRows.length} files (${Object.keys(manifest.sfx).length} manifest entries), ${(sum(sfxRows, (r) => r.bytes) / 1024 / 1024).toFixed(2)} MB, rms range ${Math.min(...sfxRows.map((r) => r.rms)).toFixed(3)}..${Math.max(...sfxRows.map((r) => r.rms)).toFixed(3)}, peak range ${Math.min(...sfxRows.map((r) => r.peak)).toFixed(3)}..${Math.max(...sfxRows.map((r) => r.peak)).toFixed(3)}`);
console.log(`  music: ${musRows.length} files, ${(sum(musRows, (r) => r.bytes) / 1024 / 1024).toFixed(2)} MB, loop stem samples: ${[...loopSamples].join(',') || 'n/a'}`);
console.log(`  public/audio total (incl. preview_mix): ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
if (problems.length) {
  console.log(`\nFAILED: ${problems.length} problem(s)`);
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nPASS: all files present, non-silent, unclipped, and in the manifest.');
