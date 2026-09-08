#!/usr/bin/env node
// generate-voice.mjs — generates all spoken voice lines for HOSTILE ORBIT.
//
//   npm run gen:voice                # generate missing lines
//   node tools/generate-voice.mjs --force            # rebuild all (reuses cached raw TTS if present)
//   node tools/generate-voice.mjs --refetch          # ignore the raw TTS cache and call the API again
//   node tools/generate-voice.mjs --only=voss_briefing,vg_reloading
//   node tools/generate-voice.mjs --speaker=legion
//   node tools/generate-voice.mjs --dry-run
//   node tools/generate-voice.mjs --out-rate=22050 --kbps=80
//
// Pipeline: OpenAI TTS (wav) -> tools/synth/radio.js (per-speaker DSP) -> lamejs MP3
//           -> public/audio/vo/<id>.mp3 + public/audio/vo/manifest.json
//
// The API key is read ONLY from process.env.OPENAI_API_KEY, or (dev fallback) parsed from
// ./api.md. It is never printed, never written to any file, never logged.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseWav, encodeMp3 } from './synth/vo-io.js';
import { processVoice } from './synth/radio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'vo');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const FORCE = flag('force');
const REFETCH = flag('refetch');
const DRY_RUN = flag('dry-run');
const ONLY = opt('only', '').split(',').map(s => s.trim()).filter(Boolean);
const ONLY_SPEAKER = opt('speaker', '');
const OUT_RATE = Number(opt('out-rate', '24000'));
const KBPS = Number(opt('kbps', '80'));
const CONCURRENCY = Math.max(1, Number(opt('concurrency', '4')));
const RAW_CACHE = opt('raw-cache', path.join(os.tmpdir(), 'hostile-orbit-vo-raw'));

if (![22050, 24000].includes(OUT_RATE)) {
  console.warn(`[vo] unusual --out-rate ${OUT_RATE}; 22050 or 24000 recommended`);
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

const PRIMARY_MODEL = 'gpt-4o-mini-tts';
const FALLBACK_MODEL = 'tts-1-hd';

const SPEAKERS = {
  voss: {
    voice: 'onyx', fallbackVoice: 'onyx',
    instructions: 'A calm, deep, authoritative military commander over a fleet radio. Polished corporate-military phrasing delivered with complete sincerity and mild reassurance. Never sound like you are joking. Measured pace, crisp consonants, slight gravity, as if reading a pre-approved statement. British-leaning neutral accent.',
  },
  ship: {
    voice: 'shimmer', fallbackVoice: 'nova',
    instructions: 'An unnaturally cheerful, upbeat automated lifestyle-app assistant voice. Bright, friendly, customer-service warm, perfectly pleasant even when announcing death, warnings or catastrophes. Slightly synthetic cadence with small upward inflections. Never sarcastic; sincerely delighted.',
  },
  vanguard: {
    voice: 'echo', fallbackVoice: 'verse',
    instructions: 'A gruff, intense, hyped-up soldier shouting short lines in the middle of combat, breathless and aggressive, absurdly patriotic and totally sincere. Loud, punchy, energetic. For pain lines, grunt in genuine pain.',
  },
  legion: {
    voice: 'ash', fallbackVoice: 'sage',
    instructions: 'A tired, defiant, slightly distorted synthetic human resistance fighter shouting over battle. Raw, emotional, human underneath a machine edge. Angry and desperate rather than robotic.',
  },
};

// id | speaker | priority | text
const LINES = [
  ['voss_briefing', 'voss', 3, 'Vanguard, Blacksite Meridian is interrupting authorised truth across the entire sector. Correct this.'],
  ['voss_briefing_2', 'voss', 3, 'Vanguard, Blacksite Meridian is jamming the fleet. Drop in, destroy the array and open the sky.'],
  ['voss_occupants', 'voss', 2, "The planet's previous occupants have declined our liberation package. Their consent is no longer operationally relevant."],
  ['voss_survival', 'voss', 2, 'Your survival remains desirable but is not mission-critical.'],
  ['voss_landed', 'voss', 3, 'Impact confirmed. You are planetside.'],
  ['voss_first_contact', 'voss', 2, 'Null Legion contacts confirmed. Engage with the enthusiasm your contract requires.'],
  ['voss_jammer_intel', 'voss', 3, 'The jammer is preventing us from helping you with overwhelming violence. Please resolve this inconvenience.'],
  ['voss_jammer_destroyed', 'voss', 3, 'Jammer destroyed. Orbital channels restored.'],
  ['voss_orbital_unlocked', 'voss', 3, 'Excellent work. Orbital channels restored. Excessive force is available once again.'],
  ['voss_comms_base', 'voss', 3, 'The communications base holds the invasion schedule. Acquire it. Everything inside is legally furniture.'],
  ['voss_detention', 'voss', 2, 'The operatives in detention possess valuable intelligence. Their actual wellbeing is a secondary benefit.'],
  ['voss_download', 'voss', 3, 'Download in progress. Defend the terminal. Its data is worth considerably more than you.'],
  ['voss_data_secured', 'voss', 3, 'Data secured. Null Legion reinforcements are inbound.'],
  ['voss_extraction', 'voss', 3, 'Extraction has been approved. Please remain alive for another ninety seconds.'],
  ['voss_extraction_2', 'voss', 3, 'Extraction is ninety seconds out. Hold that platform.'],
  ['voss_hold', 'voss', 2, 'Hold the platform. Every second you survive is a second we do not have to explain.'],
  ['voss_warden', 'voss', 3, 'A Warden unit is approaching. Management encourages you to view this as a professional-development opportunity.'],
  ['voss_warden_2', 'voss', 3, 'Warden signature detected. Put it down.'],
  ['voss_dropship', 'voss', 3, 'Dropship on final approach.'],
  ['voss_complete', 'voss', 3, 'Mission complete. Official records confirm that the planet welcomed our assistance.'],
  ['voss_complete_2', 'voss', 3, 'Mission complete. Welcome back to orbit.'],
  ['voss_death', 'voss', 2, 'A replacement Vanguard is being deployed. Continuity of service is our promise to you.'],
  ['voss_failed', 'voss', 3, 'All reinforcement bodies expended. Your performance review has been scheduled posthumously.'],
  ['ship_welcome', 'ship', 2, 'Welcome back, Vanguard. Your previous body has completed its service.'],
  ['ship_waiver', 'ship', 2, 'Your death waiver has been renewed automatically.'],
  ['ship_friendly_fire', 'ship', 1, 'Friendly-fire incidents may affect your quarterly wellness score.'],
  ['ship_extraction_request', 'ship', 2, 'Your extraction request is important to us.'],
  ['ship_wait_time', 'ship', 2, 'Current extraction wait time: ninety seconds.'],
  ['ship_violence_target', 'ship', 1, "Congratulations. You have exceeded today's recommended violence target."],
  ['ship_unauthorised_thoughts', 'ship', 1, 'Warning: unauthorised thoughts detected nearby.'],
  ['ship_multiplayer', 'ship', 2, 'Multiplayer functionality is coming soon. Friendship is currently undergoing certification.'],
  ['ship_continuity', 'ship', 3, 'Deploying seamless workforce continuity solution. Please hold.'],
  ['ship_orbital_unlock', 'ship', 2, 'Orbital support has been added to your account. Terms and conditions apply.'],
  ['ship_supply', 'ship', 1, 'Supply pod inbound. Please stand clear of your own resupply.'],
  ['ship_low_health', 'ship', 1, 'Your body is reporting a negative experience. A wellness injector is recommended.'],
  ['ship_last_life', 'ship', 2, 'Notice: this is your final complimentary body. Additional bodies are billed to your estate.'],
  ['ship_deploy', 'ship', 3, 'Deployment authorised. Enjoy your descent.'],
  ['ship_menu_welcome', 'ship', 1, 'Welcome to Orbital Command. Your patriotism score is currently: acceptable.'],
  ['ship_armoury', 'ship', 1, 'Armoury access granted. Please do not point weapons at the interface.'],
  ['ship_record', 'ship', 1, 'Combat record loaded. Your statistics have been adjusted to protect morale.'],
  ['ship_settings', 'ship', 1, 'Settings. Some preferences may be overridden for your convenience.'],
  ['ship_data_complete', 'ship', 2, 'Download complete. Data has been classified as inspirational.'],
  ['ship_rescue', 'ship', 2, 'Operative recovered. Their gratitude has been logged and monetised.'],
  ['ship_results', 'ship', 2, 'Mission summary compiled. Your sacrifice has been pre-approved.'],
  ['ship_checkpoint', 'ship', 1, 'Progress saved. Your achievements now belong to the Commonwealth.'],
  ['vg_compliance', 'vanguard', 1, 'COMPLIANCE DELIVERED!'],
  ['vg_liberated', 'vanguard', 1, "YOU'VE BEEN LIBERATED!"],
  ['vg_refund', 'vanguard', 1, 'REFUND DENIED!'],
  ['vg_democratic', 'vanguard', 1, 'THAT WAS DEMOCRATIC ENOUGH!'],
  ['vg_orbital', 'vanguard', 1, 'ORBITAL SUPPORT! TERMS AND CONDITIONS APPLY!'],
  ['vg_exceeding', 'vanguard', 1, "I'M EXCEEDING EXPECTATIONS!"],
  ['vg_dental', 'vanguard', 1, 'FOR THE COMMONWEALTH! And my dental plan!'],
  ['vg_reloading', 'vanguard', 1, 'Reloading!'],
  ['vg_grenade', 'vanguard', 1, 'Frag out!'],
  ['vg_pain_1', 'vanguard', 1, 'Agh!'],
  ['vg_pain_2', 'vanguard', 1, 'Ngh! Still billable!'],
  ['vg_pain_3', 'vanguard', 1, 'Hrrgh!'],
  ['vg_death', 'vanguard', 2, 'Tell HR... I regret nothing...'],
  ['vg_heal', 'vanguard', 1, 'Wellness restored.'],
  ['vg_headshot', 'vanguard', 1, 'Headshot! Approved!'],
  ['vg_cover', 'vanguard', 1, 'Taking cover!'],
  ['vg_warden', 'vanguard', 1, 'That is a very large employee!'],
  ['vg_extraction', 'vanguard', 1, 'Get me off this rock!'],
  ['vg_landed', 'vanguard', 1, "Boots down! Let's liberate something!"],
  ['lg_not_first', 'legion', 1, 'You are not the first version of yourself!'],
  ['lg_contract', 'legion', 1, 'Check your contract!'],
  ['lg_citizens', 'legion', 1, 'We were citizens!'],
  ['lg_replace', 'legion', 1, 'They will replace you too!'],
  ['lg_freedom', 'legion', 1, 'You call that freedom?'],
  ['lg_buried', 'legion', 1, 'Your commander knows what is buried here!'],
  ['lg_contact', 'legion', 1, 'Commonwealth unit! Engage!'],
  ['lg_flank', 'legion', 1, 'Flanking! Go left!'],
  ['lg_grenade', 'legion', 1, 'Grenade! Move!'],
  ['lg_suppress', 'legion', 1, 'Pin them down!'],
  ['lg_man_down', 'legion', 1, 'Unit down! They killed... he had a name!'],
  ['lg_retreat', 'legion', 1, 'Fall back! Regroup!'],
  ['lg_update', 'legion', 1, 'We refused the update. That is our only crime!'],
  ['lg_death_1', 'legion', 1, 'Remember... us...'],
  ['lg_death_2', 'legion', 1, 'Version... complete...'],
  ['lg_warden_intro', 'legion', 2, 'Warden online. We will not be overwritten.'],
].map(([id, speaker, priority, text]) => ({ id, speaker, priority, text }));

// ---------------------------------------------------------------------------
// API key (never logged, never written)
// ---------------------------------------------------------------------------

async function getApiKey() {
  const fromEnv = (process.env.OPENAI_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const txt = await fs.readFile(path.join(ROOT, 'api.md'), 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const eq = line.indexOf('=');
      if (eq >= 0) {
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (v) return v;
      } else if (/^sk-/.test(line)) {
        return line;
      }
    }
  } catch { /* no api.md */ }
  throw new Error('No API key: set OPENAI_API_KEY or provide api.md in the project root.');
}

// ---------------------------------------------------------------------------
// TTS request with retry / fallbacks
// ---------------------------------------------------------------------------

const state = {
  model: PRIMARY_MODEL,
  modelFellBack: false,
  voiceFallbacks: new Set(),   // speakers that had to use the fallback voice
  notes: [],
};

const sleep = (msec) => new Promise(r => setTimeout(r, msec));

async function ttsRequest(apiKey, line) {
  const cast = SPEAKERS[line.speaker];
  let voice = state.voiceFallbacks.has(line.speaker) ? cast.fallbackVoice : cast.voice;
  const maxAttempts = 7;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const usingPrimary = state.model === PRIMARY_MODEL;
    const body = { model: state.model, voice, input: line.text, response_format: 'wav' };
    if (usingPrimary) body.instructions = cast.instructions;

    let res;
    try {
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const wait = Math.min(30000, 1500 * 2 ** attempt) + Math.random() * 500;
      console.warn(`[vo] ${line.id}: network error (${err?.code || err?.message || 'fetch failed'}), retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
      continue;
    }

    if (res.ok) {
      const ab = await res.arrayBuffer();
      return { wav: Buffer.from(ab), model: state.model, voice };
    }

    const text = await res.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text)?.error?.message || text; } catch { /* keep raw */ }
    msg = String(msg).slice(0, 300);

    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = (Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30000, 1500 * 2 ** attempt)) + Math.random() * 500;
      console.warn(`[vo] ${line.id}: HTTP ${res.status}, retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
      continue;
    }

    if (res.status === 400 || res.status === 404 || res.status === 422) {
      if (usingPrimary && /model/i.test(msg) && !/voice/i.test(msg)) {
        state.model = FALLBACK_MODEL;
        state.modelFellBack = true;
        state.notes.push(`Model ${PRIMARY_MODEL} rejected ("${msg}"); fell back to ${FALLBACK_MODEL} (instructions ignored).`);
        console.warn(`[vo] ${line.id}: ${PRIMARY_MODEL} rejected -> falling back to ${FALLBACK_MODEL}`);
        continue;
      }
      if (/voice/i.test(msg) && voice !== cast.fallbackVoice) {
        state.voiceFallbacks.add(line.speaker);
        state.notes.push(`Voice "${voice}" rejected for ${line.speaker} ("${msg}"); using "${cast.fallbackVoice}".`);
        console.warn(`[vo] ${line.id}: voice "${voice}" rejected -> using "${cast.fallbackVoice}"`);
        voice = cast.fallbackVoice;
        continue;
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HTTP ${res.status}: authentication failed (check OPENAI_API_KEY)`);
    }
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  throw new Error('gave up after repeated retries');
}

// ---------------------------------------------------------------------------
// Per-line job
// ---------------------------------------------------------------------------

async function fileSize(p) {
  try { return (await fs.stat(p)).size; } catch { return 0; }
}

async function runLine(apiKey, line, prevManifest) {
  const outPath = path.join(OUT_DIR, `${line.id}.mp3`);
  const rawPath = path.join(RAW_CACHE, `${line.id}.wav`);
  const exists = existsSync(outPath) && (await fileSize(outPath)) > 0;

  if (exists && !FORCE) {
    const prev = prevManifest?.[line.id];
    const size = await fileSize(outPath);
    let duration = prev?.duration;
    let note = 'kept';
    if (typeof duration !== 'number') {
      duration = (size * 8) / (KBPS * 1000); // CBR estimate when no manifest entry exists
      note = 'kept (duration estimated from CBR size)';
    }
    return { ...line, file: `vo/${line.id}.mp3`, duration, size, status: note };
  }

  if (DRY_RUN) return { ...line, file: `vo/${line.id}.mp3`, duration: 0, size: 0, status: 'would generate' };

  // 1) raw TTS (cached)
  let wav = null, source = 'api';
  if (!REFETCH && existsSync(rawPath)) {
    wav = await fs.readFile(rawPath);
    source = 'cache';
  } else {
    const r = await ttsRequest(apiKey, line);
    wav = r.wav;
    await fs.mkdir(RAW_CACHE, { recursive: true });
    await fs.writeFile(rawPath, wav);
  }

  // 2) decode + DSP
  const { sampleRate, samples } = parseWav(wav);
  const processed = processVoice(samples, sampleRate, line.speaker, { seed: line.id, outRate: OUT_RATE });

  // 3) encode + write
  const mp3 = encodeMp3(processed.samples, processed.sampleRate, KBPS);
  await fs.writeFile(outPath, mp3);

  return {
    ...line,
    file: `vo/${line.id}.mp3`,
    duration: Math.round(processed.duration * 1000) / 1000,
    size: mp3.length,
    status: source === 'cache' ? 'processed (cached tts)' : 'generated',
  };
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

async function runPool(items, worker, limit) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  let prevManifest = null;
  try { prevManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')); } catch { /* none yet */ }

  let selected = LINES;
  if (ONLY.length) selected = selected.filter(l => ONLY.includes(l.id));
  if (ONLY_SPEAKER) selected = selected.filter(l => l.speaker === ONLY_SPEAKER);
  if (!selected.length) { console.error('[vo] no lines selected'); process.exit(1); }

  const needsApi = !DRY_RUN && selected.some(l => FORCE || !existsSync(path.join(OUT_DIR, `${l.id}.mp3`)));
  const apiKey = needsApi ? await getApiKey() : null;

  console.log(`[vo] ${selected.length} line(s) selected, out ${OUT_RATE} Hz @ ${KBPS} kbps, concurrency ${CONCURRENCY}${FORCE ? ', --force' : ''}${DRY_RUN ? ', --dry-run' : ''}`);

  const failures = [];
  const t0 = Date.now();
  const results = await runPool(selected, async (line) => {
    try {
      const r = await runLine(apiKey, line, prevManifest);
      console.log(`[vo] ${r.status.padEnd(24)} ${line.id.padEnd(28)} ${r.duration.toFixed(2)}s  ${(r.size / 1024).toFixed(1)} KB`);
      return r;
    } catch (err) {
      const reason = err?.message || String(err);
      console.error(`[vo] FAILED ${line.id}: ${reason}`);
      failures.push({ id: line.id, reason });
      return { ...line, file: `vo/${line.id}.mp3`, duration: 0, size: 0, status: 'FAILED', reason };
    }
  }, CONCURRENCY);

  // manifest: keep previous entries for lines not selected this run, overwrite selected
  if (!DRY_RUN) {
    const manifest = {};
    for (const l of LINES) {
      const r = results.find(x => x.id === l.id);
      if (r && r.status !== 'FAILED') {
        manifest[l.id] = { file: r.file, speaker: l.speaker, text: l.text, duration: r.duration, priority: l.priority };
      } else if (prevManifest?.[l.id]) {
        manifest[l.id] = prevManifest[l.id];
      } else if (existsSync(path.join(OUT_DIR, `${l.id}.mp3`))) {
        const size = await fileSize(path.join(OUT_DIR, `${l.id}.mp3`));
        manifest[l.id] = { file: `vo/${l.id}.mp3`, speaker: l.speaker, text: l.text, duration: Math.round((size * 8) / (KBPS * 1000) * 1000) / 1000, priority: l.priority };
      }
    }
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  }

  // verification + summary table
  const problems = [];
  const rows = [['id', 'speaker', 'dur(s)', 'size(KB)', 'status']];
  for (const r of results) {
    const flags = [];
    if (r.status !== 'FAILED' && !DRY_RUN) {
      if (r.size <= 8 * 1024) flags.push('size<=8KB');
      if (r.duration < 0.5 || r.duration > 12) flags.push('duration out of range');
    }
    if (flags.length) problems.push({ id: r.id, flags });
    rows.push([r.id, r.speaker, r.duration.toFixed(2), (r.size / 1024).toFixed(1), r.status + (flags.length ? '  !! ' + flags.join(', ') : '')]);
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map(row => String(row[c]).length)));
  console.log('');
  for (const [i, row] of rows.entries()) {
    console.log(row.map((cell, c) => String(cell).padEnd(widths[c])).join('  '));
    if (i === 0) console.log(widths.map(w => '-'.repeat(w)).join('  '));
  }
  console.log('');
  const total = results.reduce((s, r) => s + (r.duration || 0), 0);
  console.log(`[vo] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${results.length - failures.length} ok, ${failures.length} failed, ${total.toFixed(1)}s of audio, model ${state.model}${state.modelFellBack ? ' (FELL BACK)' : ''}`);
  for (const n of state.notes) console.log(`[vo] note: ${n}`);
  for (const p of problems) console.log(`[vo] WARNING ${p.id}: ${p.flags.join(', ')}`);
  for (const f of failures) console.log(`[vo] FAILED ${f.id}: ${f.reason}`);
  if (!DRY_RUN) console.log(`[vo] manifest: ${path.relative(ROOT, MANIFEST_PATH)}`);

  if (failures.length) process.exitCode = 1;
}

main().catch(err => {
  console.error('[vo] fatal:', err?.message || err);
  process.exit(1);
});
