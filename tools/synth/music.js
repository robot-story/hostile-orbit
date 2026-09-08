// HOSTILE ORBIT - generative music stems.
// 100 BPM, D minor, exactly 16 bars (38.4 s) per loop stem, stereo 44100 Hz.
// Every loop stem returns [L, R] with EXACTLY TOTAL_SAMPLES samples; effect tails wrap around to the
// start so the loops are seamless and all stems stack sample-accurately.
import * as D from './dsp.js';

const { sine, saw, square, pulse, fm, noise, white, pink, brown, crackle, expDecay, adsr, applyEnv, lowpass, highpass,
  bandpass, ladder, softClip, reverbStereo, pingPong, stereoChorus, thump, noiseBurst, click, metallicRing, expSweep,
  geoSweep, superSaw, addInPlace, gain, limiter, normalize, noteToFreq: nf, samples: S, mixStereo, panGains, widen } = D;

export const BPM = 100;
export const BARS = 16;
export const BEAT = 60 / BPM;          // 0.6 s
export const BAR = BEAT * 4;           // 2.4 s
export const SIXTEENTH = BEAT / 4;     // 0.15 s
export const LOOP_DUR = BAR * BARS;    // 38.4 s
export const TOTAL_SAMPLES = Math.round(LOOP_DUR * D.SR); // 1,693,440

const TAIL = 4.0; // seconds of effect tail rendered past the loop end, then wrapped to the start

// Chord progression: 2 bars per chord, cycle repeats twice across 16 bars.
const CHORDS = [
  { name: 'Dm', root: 'D2', sub: 'D1', pad: ['D3', 'F3', 'A3', 'D4'], arp: ['D4', 'F4', 'A4', 'D5', 'F5'], fifth: 'A2', seventh: 'C3' },
  { name: 'Bb', root: 'Bb1', sub: 'Bb0', pad: ['Bb2', 'D3', 'F3', 'Bb3'], arp: ['Bb3', 'D4', 'F4', 'Bb4', 'D5'], fifth: 'F2', seventh: 'Ab2' },
  { name: 'F', root: 'F2', sub: 'F1', pad: ['F3', 'A3', 'C4', 'F4'], arp: ['F4', 'A4', 'C5', 'F5', 'A5'], fifth: 'C3', seventh: 'Eb3' },
  { name: 'A/C#', root: 'C#2', sub: 'C#1', pad: ['C#3', 'E3', 'A3', 'C#4'], arp: ['C#4', 'E4', 'A4', 'C#5', 'E5'], fifth: 'G#2', seventh: 'B2' },
];
const chordAt = (bar) => CHORDS[Math.floor(bar / 2) % 4];
/** Time in seconds of bar (0-based) + sixteenth (0-15, fractional ok). */
const T = (bar, six = 0) => bar * BAR + six * SIXTEENTH;

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------
/** Allocate a stereo work buffer of loop + tail. */
const work = () => [new Float32Array(S(LOOP_DUR + TAIL)), new Float32Array(S(LOOP_DUR + TAIL))];
/** Place a mono or stereo buffer at time t with gain and pan into stereo work buffer. */
function place(dst, buf, t, g = 1, pan = 0) {
  const at = Math.round(t * D.SR);
  if (Array.isArray(buf)) { addInPlace(dst[0], buf[0], g, at); addInPlace(dst[1], buf[1], g, at); }
  else { const [gl, gr] = panGains(pan); addInPlace(dst[0], buf, g * gl, at); addInPlace(dst[1], buf, g * gr, at); }
}
/** Wrap everything after LOOP_DUR back onto the start -> exactly TOTAL_SAMPLES. */
function wrap(st) {
  return st.map((c) => {
    const out = new Float32Array(TOTAL_SAMPLES);
    for (let i = 0; i < c.length; i++) out[i % TOTAL_SAMPLES] += c[i];
    return out;
  });
}
/** Stereo effect helpers on work buffers (keep length). */
const fx = {
  reverb: (st, o) => reverbStereo(st, { tail: 0, ...o }).map((c, k) => D.fitSamples(c, st[k].length)),
  pingpong: (st, time, fb, wet, o = {}) => pingPong(st, time, fb, wet, { tail: 0, ...o }).map((c, k) => D.fitSamples(c, st[k].length)),
  each: (st, fn) => st.map(fn),
};
/** Final stem processing: gentle limiter, then normalize to -1 dBFS, then stem trim. */
function master(st, trim = 1) {
  let out = limiter(st, 0.95, 0.08, 0.004);
  normalize(out, -1);
  return out.map((c) => gain(c, trim));
}
/** Sidechain-style ducking envelope from a list of kick times (seconds), depth 0..1, recovery seconds. */
function duckEnv(times, depth = 0.6, recover = 0.28, len = S(LOOP_DUR + TAIL)) {
  const e = new Float32Array(len).fill(1);
  for (const t of times) {
    const at = Math.round(t * D.SR), n = S(recover);
    for (let i = 0; i < n && at + i < len; i++) { const x = i / n; const g = 1 - depth * (1 - x) * (1 - x); if (g < e[at + i]) e[at + i] = g; }
  }
  return e;
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------
function padVoice(freqs, dur, rng, { cutoffFn, res = 0.25, detune = 9 } = {}) {
  let out = new Float32Array(S(dur));
  for (const f of freqs) addInPlace(out, superSaw(dur, f, 5, detune, rng), 1 / Math.sqrt(freqs.length));
  addInPlace(out, sine(dur, freqs[0] / 2), 0.35);
  out = ladder(out, cutoffFn || 900, res);
  applyEnv(out, adsr(dur, 1.4, 0.8, 0.8, 1.6));
  return out;
}
/** Brass-like FM stack (2 modulators, index env), portamento supported via freq fn. */
function brass(freq, dur, vel = 1, { bright = 1, attack = 0.03, rel = 0.25, sus = 0.8 } = {}) {
  const f = typeof freq === 'function' ? freq : () => freq;
  const idxEnv = (t) => (1.2 + 3.2 * bright * vel) * (0.55 + 0.45 * Math.exp(-t / 0.35));
  let a = fm(dur, f, 0, idxEnv, { ratio: 1, feedback: 0.15 });
  addInPlace(a, fm(dur, (t, i) => f(t, i) * 1.003, 0, (t) => 1.5 * bright * Math.exp(-t / 0.5) + 0.4, { ratio: 2 }), 0.5);
  addInPlace(a, saw(dur, (t, i) => f(t, i) * 0.5), 0.25);
  a = lowpass(a, (t) => 1200 + 4500 * bright * vel * Math.exp(-t / 0.8) + 900, 0.8);
  applyEnv(a, adsr(dur, attack, 0.25, sus, rel));
  return a;
}
function pluck(freq, dur, vel = 1) {
  let a = fm(dur, freq, 0, (t) => 2.5 * vel * Math.exp(-t / 0.12) + 0.2, { ratio: 2 });
  addInPlace(a, sine(dur, freq), 0.5);
  applyEnv(a, expDecay(dur, 0.16, 0.002));
  return a;
}
function bassNote(freq, dur, vel, rng, { drive = 3 } = {}) {
  let a = new Float32Array(S(dur));
  addInPlace(a, saw(dur, freq, { phase: 0 }), 0.6);
  addInPlace(a, saw(dur, freq * 1.006, { phase: 0.3 }), 0.5);
  addInPlace(a, square(dur, freq * 0.5), 0.35);
  a = ladder(a, (t) => 180 + (1400 + 900 * vel) * Math.exp(-t / 0.11), 0.55, { drive: 1.3 });
  a = softClip(a, drive);
  a = highpass(a, 30, 0.7);
  addInPlace(a, sine(dur, freq * 0.5), 0.45); // clean sub under the distortion
  applyEnv(a, adsr(dur, 0.003, 0.08, 0.85, 0.05));
  return a;
}
// Drums
function kick(rng, { hard = false } = {}) {
  const dur = hard ? 0.45 : 0.35;
  let k = thump(dur, hard ? 170 : 130, hard ? 42 : 46, hard ? 0.02 : 0.018, hard ? 0.13 : 0.1, { drive: hard ? 3 : 1.6 });
  if (hard) { addInPlace(k, click(rng, 0.003, 1500), 0.8); addInPlace(k, noiseBurst(0.03, rng, { bp: 2500, q: 0.8, tau: 0.006 }), 0.5); k = softClip(k, 1.4); }
  return k;
}
function snare(rng, { big = false } = {}) {
  const dur = big ? 0.5 : 0.25;
  let n = noiseBurst(dur, rng, { bp: big ? 1700 : 2100, q: 0.6, tau: big ? 0.09 : 0.05 });
  let body = thump(0.18, big ? 240 : 210, big ? 150 : 165, 0.01, 0.045);
  let out = D.mix([[n, 1], [body, big ? 0.9 : 0.6], [click(rng, 0.003, 2500), 0.5]]);
  if (big) { out = softClip(gain(out, 1.6), 2.2); out = D.reverb(out, { room: 0.7, damp: 0.5, wet: 0.45, tail: 0.5, hpf: 250 }); }
  return out;
}
function hat(rng, { open = false, vel = 1 } = {}) {
  const dur = open ? 0.28 : 0.045;
  let h = noise(dur, rng); h = highpass(h, 7500, 0.7); h = bandpass(h, 9500, 0.6);
  addInPlace(h, metallicRing(dur, 4200, rng, { partials: 4, tau: dur / 3, bright: 1 }), 0.25);
  applyEnv(h, expDecay(dur, open ? 0.09 : 0.012, 0.0005));
  return gain(h, vel);
}
function clickPerc(rng) {
  const out = noiseBurst(0.04, rng, { bp: 2200, q: 2, tau: 0.008 });
  addInPlace(out, D.applyEnv(sine(0.02, 800), expDecay(0.02, 0.005)), 0.5);
  return out;
}
function metalHit(rng, f = 2600) {
  const m = metallicRing(0.35, f, rng, { partials: 6, tau: 0.07, bright: 1.1 });
  addInPlace(m, click(rng, 0.003, 3000), 0.6);
  return softClip(m, 1.3);
}
function crash(rng, dur = 1.6) {
  let c = noise(dur, rng); c = highpass(c, 4000, 0.6); applyEnv(c, expDecay(dur, 0.45, 0.002));
  addInPlace(c, metallicRing(dur, 3100, rng, { partials: 8, tau: 0.5 }), 0.5);
  return c;
}
function tick(rng, tock = false) {
  let c = noise(0.012, rng); c = highpass(c, 3000); applyEnv(c, expDecay(0.012, 0.0025));
  addInPlace(c, D.applyEnv(sine(0.03, tock ? 1180 : 1560), expDecay(0.03, 0.007)), 0.7);
  return c;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
/** Heavy kick pattern (used for drums_heavy and for sidechain ducking in bass/lead). */
function heavyKickTimes() {
  const times = [];
  for (let bar = 0; bar < BARS; bar++) {
    const steps = bar % 4 === 3 ? [0, 6, 8, 11, 14] : [0, 6, 8, 14];
    for (const s of steps) times.push(T(bar, s));
  }
  return times;
}

// ---------------------------------------------------------------------------
// Stems
// ---------------------------------------------------------------------------
export function renderPad(rng) {
  const st = work();
  const cutoffFn = (t) => 520 + 420 * Math.sin(D.TAU * (3 / LOOP_DUR) * t) + 260 * Math.sin(D.TAU * (7 / LOOP_DUR) * t + 1);
  for (let bar = 0; bar < BARS; bar += 2) {
    const ch = chordAt(bar);
    const t0 = T(bar), dur = 2 * BAR + 1.8;
    const v = padVoice(ch.pad.map(nf), dur, rng, { cutoffFn: (t) => cutoffFn(t + t0), res: 0.28 });
    const [L, R] = stereoChorus(v, { rate: 0.13, depth: 0.005, mix: 0.6, voices: 2 });
    place(st, [L, R], t0, 0.5);
    // airy high octave shimmer voice
    let hi = superSaw(dur, nf(ch.pad[3]) * 2, 3, 6, rng); hi = bandpass(hi, 2600, 0.7); applyEnv(hi, adsr(dur, 2.0, 1.0, 0.7, 1.8));
    place(st, hi, t0, 0.07, bar % 4 === 0 ? -0.4 : 0.4);
  }
  let out = fx.pingpong(st, SIXTEENTH * 3, 0.42, 0.28, { damp: 3800 });
  out = fx.each(out, (c) => highpass(c, 60));
  out = fx.reverb(out, { room: 0.88, damp: 0.35, wet: 0.42, dry: 1, hpf: 180, lpf: 7000 });
  return master(wrap(out), 0.72);
}

export function renderPulse(rng) {
  const st = work();
  // 8th-note filtered pulse on chord root (octave 3 / 2 alternating)
  for (let bar = 0; bar < BARS; bar++) {
    const ch = chordAt(bar);
    for (let e = 0; e < 8; e++) {
      const f = nf(ch.root) * (e % 4 === 2 ? 1 : 2) * (e === 7 && bar % 2 === 1 ? 1.5 : 1);
      const vel = e % 2 === 0 ? 1 : 0.65;
      const d = 0.26;
      let p = pulse(d, f, 0.32); p = ladder(p, (t) => 380 + 1900 * vel * Math.exp(-t / 0.07), 0.5); applyEnv(p, adsr(d, 0.002, 0.08, 0.5, 0.06));
      place(st, p, T(bar, e * 2), 0.32 * vel, e % 2 === 0 ? -0.15 : 0.15);
    }
  }
  // sparse arpeggio on bars 2-3, 6-7, 10-11, 14-15 (16ths) with plucks
  for (let bar = 0; bar < BARS; bar++) {
    if (!(bar % 4 === 2 || bar % 4 === 3)) continue;
    const ch = chordAt(bar);
    const pattern = bar % 4 === 2 ? [0, 1, 2, 3, 2, 1, 0, 4] : [4, 3, 2, 1, 0, 2, 3, 4];
    for (let s = 0; s < 16; s++) {
      if (s % 2 === 1 && rng() < 0.55) continue;
      const idx = pattern[s % 8];
      const f = nf(ch.arp[idx]);
      place(st, pluck(f, 0.4, 0.8 + 0.2 * rng()), T(bar, s), 0.16, (idx - 2) * 0.3);
    }
  }
  let out = fx.pingpong(st, SIXTEENTH * 3, 0.38, 0.3, { damp: 5000 });
  out = fx.reverb(out, { room: 0.6, damp: 0.45, wet: 0.2, dry: 1, hpf: 250 });
  return master(wrap(out), 0.5);
}

export function renderDrumsLight(rng) {
  const st = work();
  for (let bar = 0; bar < BARS; bar++) {
    place(st, kick(rng), T(bar, 0), 0.8);
    place(st, kick(rng), T(bar, 8), 0.65);
    if (bar % 2 === 1) place(st, kick(rng), T(bar, 14), 0.45);
    place(st, clickPerc(rng), T(bar, 4), 0.35, -0.3);
    place(st, clickPerc(rng), T(bar, 12), 0.4, -0.3);
    for (let e = 0; e < 8; e++) {
      const open = e === 7 && bar % 2 === 1;
      place(st, hat(rng, { open, vel: e % 2 === 0 ? 0.55 : 0.35 + 0.1 * rng() }), T(bar, e * 2), open ? 0.35 : 0.4, 0.3);
      if (rng() < 0.25 && e % 2 === 0) place(st, hat(rng, { vel: 0.25 }), T(bar, e * 2 + 1), 0.25, 0.4);
    }
    if (bar % 4 === 3) place(st, snare(rng), T(bar, 12), 0.6);
    if (bar % 8 === 7) place(st, snare(rng), T(bar, 15), 0.35);
  }
  let out = fx.reverb(st, { room: 0.5, damp: 0.5, wet: 0.12, dry: 1, hpf: 300 });
  return master(wrap(out), 0.8);
}

export function renderDrumsHeavy(rng) {
  const st = work();
  const kicks = heavyKickTimes();
  for (const t of kicks) place(st, kick(rng, { hard: true }), t, 1.0);
  for (let bar = 0; bar < BARS; bar++) {
    place(st, snare(rng, { big: true }), T(bar, 4), 0.95);
    place(st, snare(rng, { big: true }), T(bar, 12), 1.0);
    if (bar % 2 === 1) place(st, snare(rng), T(bar, 15), 0.4);
    for (let s = 0; s < 16; s++) place(st, hat(rng, { vel: s % 4 === 0 ? 0.7 : s % 2 === 0 ? 0.5 : 0.32 + 0.1 * rng() }), T(bar, s), 0.42, 0.25);
    place(st, hat(rng, { open: true, vel: 0.6 }), T(bar, 14), 0.3, 0.35);
    place(st, metalHit(rng, 2600 + 300 * (bar % 3)), T(bar, 6), 0.35, -0.45);
    place(st, metalHit(rng, 1900), T(bar, 15), 0.28, 0.45);
    if (bar % 4 === 3) { // fill: 16th snare roll over the last two beats, rising
      for (let s = 8; s < 16; s++) place(st, snare(rng), T(bar, s), 0.3 + 0.5 * ((s - 8) / 7));
    }
    if (bar % 8 === 0) place(st, crash(rng), T(bar, 0), 0.5, 0.2);
  }
  let out = fx.reverb(st, { room: 0.6, damp: 0.5, wet: 0.14, dry: 1, hpf: 350 });
  out = fx.each(out, (c) => softClip(c, 1.25));
  return master(wrap(out), 1.0);
}

export function renderBassDistorted(rng) {
  const st = work();
  // 16th-grid riff per bar: [step, octaveMult, gateSteps, vel]
  const riffA = [[0, 1, 2, 1], [3, 1, 1, 0.8], [6, 2, 1, 0.9], [8, 1, 2, 1], [10, 1.5, 1, 0.7], [12, 1, 1, 0.9], [14, 1, 1, 0.8], [15, 2, 1, 0.7]];
  const riffB = [[0, 1, 3, 1], [4, 1, 1, 0.7], [6, 1, 1, 0.9], [8, 2, 1, 0.9], [9, 1, 1, 0.6], [12, 1, 2, 1], [14, 1.5, 1, 0.75]];
  for (let bar = 0; bar < BARS; bar++) {
    const ch = chordAt(bar);
    const riff = bar % 4 === 3 ? riffB : riffA;
    for (const [step, mult, gate, vel] of riff) {
      let f = nf(ch.root) * mult;
      if (mult === 1.5) f = nf(ch.fifth); // real fifth from chord table
      const d = gate * SIXTEENTH * 0.92;
      place(st, bassNote(f, d + 0.06, vel, rng), T(bar, step), 0.9 * vel);
    }
  }
  // sidechain-style duck by the heavy kick pattern
  const env = duckEnv(heavyKickTimes(), 0.5, 0.26, st[0].length);
  let out = st.map((c) => D.mul(c, env));
  out = fx.each(out, (c) => softClip(c, 1.3));
  // slight stereo width on the highs only
  const [wL, wR] = widen(D.toMono(out), 0.009, 0.35);
  const hiL = highpass(wL, 900), hiR = highpass(wR, 900);
  const lo = lowpass(D.toMono(out), 900);
  out = [D.mix([[lo, 1], [hiL, 1]]), D.mix([[lo, 1], [hiR, 1]])];
  return master(wrap(out), 0.85);
}

export function renderLeadExtraction(rng) {
  const st = work();
  // Melody: [bar, sixteenth, note, durationInSixteenths]
  const mel = [
    [0, 0, 'A4', 4], [0, 4, 'D5', 4], [0, 8, 'F5', 6], [0, 14, 'E5', 2],
    [1, 0, 'D5', 8], [1, 8, 'A4', 4], [1, 12, 'C5', 4],
    [2, 0, 'D5', 4], [2, 4, 'F5', 4], [2, 8, 'Bb5', 6], [2, 14, 'A5', 2],
    [3, 0, 'G5', 8], [3, 8, 'F5', 4], [3, 12, 'D5', 4],
    [4, 0, 'C5', 4], [4, 4, 'F5', 4], [4, 8, 'A5', 6], [4, 14, 'G5', 2],
    [5, 0, 'F5', 8], [5, 8, 'E5', 4], [5, 12, 'C5', 4],
    [6, 0, 'E5', 4], [6, 4, 'A5', 6], [6, 10, 'G#5', 2], [6, 12, 'E5', 4],
    [7, 0, 'A5', 12],
    [8, 0, 'D5', 4], [8, 4, 'F5', 4], [8, 8, 'A5', 4], [8, 12, 'D6', 4],
    [9, 0, 'C6', 6], [9, 6, 'A5', 2], [9, 8, 'F5', 8],
    [10, 0, 'D5', 4], [10, 4, 'F5', 4], [10, 8, 'Bb5', 4], [10, 12, 'D6', 4],
    [11, 0, 'C6', 6], [11, 6, 'Bb5', 2], [11, 8, 'A5', 8],
    [12, 0, 'C5', 4], [12, 4, 'F5', 4], [12, 8, 'A5', 4], [12, 12, 'C6', 4],
    [13, 0, 'A5', 6], [13, 6, 'G5', 2], [13, 8, 'F5', 4], [13, 12, 'E5', 4],
    [14, 0, 'E5', 4], [14, 4, 'A5', 4], [14, 8, 'C#6', 4], [14, 12, 'E6', 4],
    [15, 0, 'D6', 14],
  ];
  let prevF = nf('A4');
  for (const [bar, six, note, len] of mel) {
    const f1 = nf(note), f0 = prevF; prevF = f1;
    const d = len * SIXTEENTH * 0.95 + 0.25;
    const glide = 0.045;
    const freqFn = (t) => (t < glide ? f0 * Math.pow(f1 / f0, t / glide) : f1) * (1 + 0.004 * Math.sin(D.TAU * 5.5 * t) * Math.min(1, Math.max(0, (t - 0.25) / 0.4)));
    const vel = 0.8 + 0.2 * (six === 0 ? 1 : 0.4);
    const b = brass(freqFn, d, vel, { bright: 1.1, attack: 0.025, rel: 0.22 });
    place(st, b, T(bar, six), 0.55, 0);
    let ss = superSaw(d, freqFn, 5, 10, rng); ss = ladder(ss, 3800, 0.2); applyEnv(ss, adsr(d, 0.03, 0.2, 0.7, 0.22));
    place(st, stereoChorus(ss, { rate: 0.6, depth: 0.003, mix: 0.6 }), T(bar, six), 0.16);
  }
  // Rising counter-line in half notes (softer FM voice)
  const counterNotes = ['D4', 'F4', 'A4', 'C5', 'D5', 'F5', 'A5', 'C6'];
  for (let bar = 0; bar < BARS; bar++) {
    for (let h = 0; h < 2; h++) {
      const note = counterNotes[(bar * 2 + h) % counterNotes.length];
      const d = BEAT * 2 * 0.95;
      let c = fm(d, nf(note), 0, 1.6, { ratio: 3 }); addInPlace(c, sine(d, nf(note)), 0.6);
      c = lowpass(c, 3000); applyEnv(c, adsr(d, 0.15, 0.3, 0.6, 0.4));
      place(st, c, T(bar, h * 8), 0.14, h === 0 ? -0.5 : 0.5);
    }
  }
  // Militaristic stab / snare-roll layer (bars 3, 7, 11, 15 build; bar 15 densest)
  const stabPatterns = { 3: [0, 3, 6, 8, 11, 14], 7: [0, 2, 4, 6, 8, 10, 12, 14], 11: [0, 3, 6, 8, 10, 12, 13, 14, 15], 15: [0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15] };
  for (const [barStr, steps] of Object.entries(stabPatterns)) {
    const bar = +barStr, ch = chordAt(bar);
    steps.forEach((s, k) => {
      const vel = 0.6 + 0.4 * (k / steps.length);
      let stab = new Float32Array(S(0.14));
      for (const n of ch.pad.slice(1)) addInPlace(stab, saw(0.14, nf(n) * 2), 0.4);
      stab = lowpass(stab, 2500 + 2500 * vel); applyEnv(stab, expDecay(0.14, 0.035, 0.001));
      place(st, stab, T(bar, s), 0.28 * vel, (s % 2 ? 0.35 : -0.35));
      place(st, snare(rng), T(bar, s), 0.32 * vel, 0);
    });
  }
  // duck lead slightly on heavy kicks so it sits with the combat drums
  const env = duckEnv(heavyKickTimes(), 0.25, 0.18, st[0].length);
  let out = st.map((c) => D.mul(c, env));
  out = fx.pingpong(out, SIXTEENTH * 3, 0.4, 0.26, { damp: 4200 });
  out = fx.reverb(out, { room: 0.75, damp: 0.4, wet: 0.3, dry: 1, hpf: 300, lpf: 8000 });
  out = fx.each(out, (c) => softClip(c, 1.2));
  return master(wrap(out), 0.85);
}

export function renderTension(rng) {
  const st = work();
  const cluster = ['D5', 'Eb5', 'A5', 'Bb5'];
  const dur = LOOP_DUR + 2.0;
  const tremRate = 250 / LOOP_DUR; // integer cycles per loop (~6.51 Hz)
  cluster.forEach((n, k) => {
    let s = superSaw(dur, (t) => nf(n) * (1 + 0.0025 * Math.sin(D.TAU * (2 + k) / LOOP_DUR * t + k)), 7, 16, rng);
    s = bandpass(s, (t) => 1900 + 700 * Math.sin(D.TAU * (5 / LOOP_DUR) * t + k * 1.5), 0.55);
    // swells every 4 bars + tremolo
    applyEnv(s, (t) => {
      const ph = (t % (4 * BAR)) / (4 * BAR);
      const swell = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.05)), 1.4);
      return swell * (0.55 + 0.45 * Math.sin(D.TAU * tremRate * t + k * 0.7)) * Math.min(1, t / 1.5);
    });
    place(st, s, 0, 0.22, (k - 1.5) * 0.45);
  });
  // low drone with slight FM growl
  let drone = fm(dur, nf('D2'), 0, (t) => 0.6 + 0.5 * Math.sin(D.TAU * (2 / LOOP_DUR) * t), { ratio: 1 });
  addInPlace(drone, sine(dur, nf('D1')), 0.6);
  addInPlace(drone, saw(dur, nf('A2')), 0.12);
  drone = lowpass(drone, 300);
  applyEnv(drone, (t) => Math.min(1, t / 1.0) * (0.8 + 0.2 * Math.sin(D.TAU * (4 / LOOP_DUR) * t)));
  place(st, drone, 0, 0.6);
  // ticking clock, alternating tick/tock, panned
  for (let beat = 0; beat < BARS * 4; beat++) {
    const tock = beat % 2 === 1;
    place(st, tick(rng, tock), beat * BEAT, tock ? 0.32 : 0.4, tock ? 0.55 : -0.55);
    if (beat % 8 === 7) place(st, metallicRing(0.6, 1900, rng, { partials: 5, tau: 0.15 }), beat * BEAT + BEAT * 0.5, 0.12, 0);
  }
  let out = fx.reverb(st, { room: 0.9, damp: 0.3, wet: 0.5, dry: 1, hpf: 200, lpf: 9000 });
  return master(wrap(out), 0.7);
}

export function renderStingerAlert(rng) {
  const dur = 2.0;
  const st = [new Float32Array(S(dur)), new Float32Array(S(dur))];
  const pre = noiseBurst(0.12, rng, { bp: 1200, q: 1, tau: 0.5, attack: 0.1 });
  place(st, D.reverse(pre), 0, 0.5);
  const hitAt = 0.12;
  place(st, thump(1.0, 120, 38, 0.03, 0.22, { drive: 3 }), hitAt, 1.0);
  place(st, noiseBurst(0.5, rng, { bp: 1800, q: 0.7, tau: 0.09 }), hitAt, 0.8);
  for (const [n, p] of [['D3', -0.3], ['A3', 0.3], ['Eb4', -0.5], ['D4', 0.5]]) place(st, brass(nf(n), 1.4, 1, { bright: 1.3, attack: 0.01, rel: 0.8, sus: 0.5 }), hitAt, 0.32, p);
  place(st, metallicRing(1.2, 2200, rng, { partials: 6, tau: 0.3 }), hitAt, 0.3, 0.2);
  place(st, click(rng, 0.004, 1500), hitAt, 0.8);
  let out = fx.reverb(st, { room: 0.8, damp: 0.4, wet: 0.35, dry: 1, hpf: 150 });
  out = out.map((c) => { const o = D.fitSamples(c, S(dur)); D.fadeOut(o, 0.25); return o; });
  out = fx.each(out, (c) => softClip(c, 1.3));
  return master(out, 1.0);
}

export function renderStingerDrop(rng) {
  const dur = 4.0, hitAt = 3.2;
  const st = [new Float32Array(S(dur + 1)), new Float32Array(S(dur + 1))];
  // noise riser
  let riser = noise(hitAt, rng); riser = bandpass(riser, geoSweep(300, 9000, hitAt), 1.2); applyEnv(riser, (t) => Math.pow(t / hitAt, 2));
  place(st, riser, 0, 0.7);
  // pitch riser
  let sw = superSaw(hitAt, geoSweep(nf('D3'), nf('D5'), hitAt), 5, 12, rng); sw = ladder(sw, geoSweep(400, 9000, hitAt), 0.5); applyEnv(sw, (t) => 0.3 + 0.7 * Math.pow(t / hitAt, 1.5));
  place(st, stereoChorus(sw, { rate: 0.8, depth: 0.003, mix: 0.6 }), 0, 0.35);
  // accelerating snare roll
  let t = 0, step = SIXTEENTH * 2;
  while (t < hitAt - 0.02) {
    const prog = t / hitAt;
    place(st, snare(rng), t, 0.25 + 0.6 * prog, (rng() - 0.5) * 0.4);
    if (prog > 0.9) step = SIXTEENTH / 4; else if (prog > 0.72) step = SIXTEENTH / 2; else if (prog > 0.4) step = SIXTEENTH;
    t += step;
  }
  for (let k = 0; k < 8; k++) place(st, kick(rng, { hard: true }), k * (hitAt / 8), 0.5 + 0.06 * k);
  // the hit
  place(st, kick(rng, { hard: true }), hitAt, 1.0);
  place(st, snare(rng, { big: true }), hitAt, 1.0);
  place(st, thump(1.2, 90, 28, 0.08, 0.3, { drive: 3 }), hitAt, 0.9);
  for (const [n, p] of [['D2', 0], ['D3', -0.3], ['A3', 0.3], ['F4', -0.5], ['D4', 0.5]]) place(st, brass(nf(n), 1.4, 1, { bright: 1.2, attack: 0.01, rel: 0.7, sus: 0.6 }), hitAt, 0.3, p);
  place(st, crash(rng, 1.2), hitAt, 0.45, 0.3);
  let out = fx.reverb(st, { room: 0.85, damp: 0.4, wet: 0.35, dry: 1, hpf: 120 });
  out = out.map((c) => { const o = D.fitSamples(c, S(dur)); D.fadeOut(o, 0.3); return o; });
  out = fx.each(out, (c) => softClip(c, 1.3));
  return master(out, 1.0);
}

export const MUSIC = {
  pad: { render: renderPad, loop: true },
  pulse: { render: renderPulse, loop: true },
  drums_light: { render: renderDrumsLight, loop: true },
  drums_heavy: { render: renderDrumsHeavy, loop: true },
  bass_distorted: { render: renderBassDistorted, loop: true },
  lead_extraction: { render: renderLeadExtraction, loop: true },
  tension: { render: renderTension, loop: true },
  stinger_alert: { render: renderStingerAlert, loop: false },
  stinger_drop: { render: renderStingerDrop, loop: false },
};

/** Sum of all loop stems (for verification only). */
export function previewMix(stems) {
  const names = Object.keys(MUSIC).filter((n) => MUSIC[n].loop);
  const L = new Float32Array(TOTAL_SAMPLES), R = new Float32Array(TOTAL_SAMPLES);
  for (const n of names) { addInPlace(L, stems[n][0]); addInPlace(R, stems[n][1]); }
  const out = limiter([L, R], 0.95, 0.1, 0.005);
  return normalize(out, -1);
}
