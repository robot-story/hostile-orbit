// radio.js — pure-JS DSP for HOSTILE ORBIT voice lines.
// Operates on mono Float32Array audio. No dependencies.
//
// processVoice(samples, sampleRate, speaker, { seed, outRate }) -> { samples, sampleRate, duration }
// Chain: trim silence -> per-speaker FX -> resample -> normalise/limit to -3 dBFS.

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

export function dbToLin(db) { return Math.pow(10, db / 20); }
export function linToDb(x) { return 20 * Math.log10(Math.max(x, 1e-12)); }

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function makeRng(seedStr = 'vo') {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^ (h >>> 16)) >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ms(fs, m) { return Math.max(1, Math.round(fs * m / 1000)); }

// ---------------------------------------------------------------------------
// biquads (RBJ cookbook), applied in place
// ---------------------------------------------------------------------------

function biquad(type, fs, f0, Q = Math.SQRT1_2, gainDb = 0) {
  const w0 = 2 * Math.PI * Math.min(f0, fs * 0.49) / fs;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': {
      const al = sw / (2 * Q);
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
      a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    }
    case 'highpass': {
      const al = sw / (2 * Q);
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
      a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    }
    case 'peaking': {
      const al = sw / (2 * Q);
      b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A;
      a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    }
    case 'highshelf': {
      const S = Q; // shelf slope
      const al = sw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + sq);
      b1 = -2 * A * ((A - 1) + (A + 1) * cw);
      b2 = A * ((A + 1) + (A - 1) * cw - sq);
      a0 = (A + 1) - (A - 1) * cw + sq;
      a1 = 2 * ((A - 1) - (A + 1) * cw);
      a2 = (A + 1) - (A - 1) * cw - sq; break;
    }
    case 'lowshelf': {
      const S = Q;
      const al = sw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + sq);
      b1 = 2 * A * ((A - 1) - (A + 1) * cw);
      b2 = A * ((A + 1) - (A - 1) * cw - sq);
      a0 = (A + 1) + (A - 1) * cw + sq;
      a1 = -2 * ((A - 1) + (A + 1) * cw);
      a2 = (A + 1) + (A - 1) * cw - sq; break;
    }
    default: throw new Error('biquad: unknown type ' + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(x, c) {
  const { b0, b1, b2, a1, a2 } = c;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
  return x;
}

export function highpass(x, fs, f, Q = Math.SQRT1_2) { return applyBiquad(x, biquad('highpass', fs, f, Q)); }
export function lowpass(x, fs, f, Q = Math.SQRT1_2) { return applyBiquad(x, biquad('lowpass', fs, f, Q)); }
export function highShelf(x, fs, f, gainDb, S = 0.8) { return applyBiquad(x, biquad('highshelf', fs, f, S, gainDb)); }
export function lowShelf(x, fs, f, gainDb, S = 0.8) { return applyBiquad(x, biquad('lowshelf', fs, f, S, gainDb)); }
export function peaking(x, fs, f, Q, gainDb) { return applyBiquad(x, biquad('peaking', fs, f, Q, gainDb)); }
/** 2nd-order HP + 2nd-order LP band-pass. */
export function bandpass(x, fs, lo, hi) { highpass(x, fs, lo); lowpass(x, fs, hi); return x; }

// ---------------------------------------------------------------------------
// envelopes, trim, gain
// ---------------------------------------------------------------------------

/** One-pole attack/release envelope follower on |x|. */
export function envelope(x, fs, attackMs = 5, releaseMs = 60) {
  const ca = Math.exp(-1 / ms(fs, attackMs));
  const cr = Math.exp(-1 / ms(fs, releaseMs));
  const env = new Float32Array(x.length);
  let e = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    e = a > e ? ca * e + (1 - ca) * a : cr * e + (1 - cr) * a;
    env[i] = e;
  }
  return env;
}

export function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}

export function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

export function gain(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }

export function fadeEdges(x, fs, inMs = 5, outMs = 8) {
  const ni = Math.min(ms(fs, inMs), x.length), no = Math.min(ms(fs, outMs), x.length);
  for (let i = 0; i < ni; i++) x[i] *= i / ni;
  for (let i = 0; i < no; i++) x[x.length - 1 - i] *= i / no;
  return x;
}

/**
 * Trim leading/trailing silence, leaving padMs of silent head/tail.
 * Threshold is relative to peak (default -42 dB) with an absolute floor.
 */
export function trimSilence(x, fs, { padMs = 60, relDb = -42, absFloor = 0.0025 } = {}) {
  const env = envelope(x, fs, 2, 25);
  const p = peak(env);
  const th = Math.max(absFloor, p * dbToLin(relDb));
  let s = 0, e = x.length - 1;
  while (s < x.length && env[s] < th) s++;
  while (e > s && env[e] < th) e--;
  if (s >= e) return { samples: new Float32Array(x), start: 0, end: x.length };
  // back off a touch so soft consonant onsets and decays survive
  s = Math.max(0, s - ms(fs, 15));
  e = Math.min(x.length - 1, e + ms(fs, 40));
  const pad = ms(fs, padMs);
  const len = e - s + 1;
  const out = new Float32Array(pad + len + pad);
  out.set(x.subarray(s, e + 1), pad);
  fadeEdges(out.subarray(pad, pad + len), fs, 4, 12);
  return { samples: out, start: s, end: e + 1 };
}

// ---------------------------------------------------------------------------
// dynamics & saturation
// ---------------------------------------------------------------------------

/** Feed-forward peak compressor with soft knee, in place. */
export function compress(x, fs, { threshDb = -18, ratio = 3, attackMs = 3, releaseMs = 80, kneeDb = 6, makeupDb = 0 } = {}) {
  const env = envelope(x, fs, attackMs, releaseMs);
  const mk = dbToLin(makeupDb);
  const half = kneeDb / 2;
  for (let i = 0; i < x.length; i++) {
    const lv = linToDb(env[i]);
    const over = lv - threshDb;
    let gr = 0;
    if (over > half) gr = over * (1 - 1 / ratio);
    else if (over > -half) { const t = over + half; gr = (1 - 1 / ratio) * t * t / (2 * kneeDb); }
    x[i] *= dbToLin(-gr) * mk;
  }
  return x;
}

/** tanh soft clipper; drive 1 = gentle, 4 = heavy. Level compensated. */
export function softClip(x, drive = 1.5, mix = 1) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) {
    const d = Math.tanh(x[i] * drive) / k;
    x[i] = x[i] * (1 - mix) + d * mix;
  }
  return x;
}

/** Slightly asymmetric exponential waveshaper for "distortion" flavours. */
export function distort(x, drive = 3, mix = 0.5) {
  const norm = 1 / (1 - Math.exp(-drive));
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * drive;
    const d = (v >= 0 ? (1 - Math.exp(-v)) : -(1 - Math.exp(v)) * 0.92) * norm;
    x[i] = x[i] * (1 - mix) + d * mix;
  }
  return x;
}

/** Simple look-ahead limiter to ceiling (linear), in place. */
export function limiter(x, fs, ceiling = dbToLin(-3), { lookaheadMs = 2, releaseMs = 60 } = {}) {
  const la = ms(fs, lookaheadMs);
  const cr = Math.exp(-1 / ms(fs, releaseMs));
  const n = x.length;
  const g = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a > ceiling) {
      const need = ceiling / a;
      const from = Math.max(0, i - la);
      for (let j = from; j <= i; j++) if (need < g[j]) g[j] = need;
    }
  }
  let cur = 1;
  for (let i = 0; i < n; i++) {
    cur = g[i] < cur ? g[i] : cr * cur + (1 - cr) * g[i];
    x[i] *= cur;
  }
  return x;
}

/** Peak-normalise then limit: pushes to pushDb then clamps at ceilingDb. */
export function normalizeLimit(x, fs, { ceilingDb = -3, pushDb = -1 } = {}) {
  const p = peak(x);
  if (p > 1e-6) gain(x, dbToLin(pushDb) / p);
  limiter(x, fs, dbToLin(ceilingDb));
  const c = dbToLin(ceilingDb);
  for (let i = 0; i < x.length; i++) { if (x[i] > c) x[i] = c; else if (x[i] < -c) x[i] = -c; }
  return x;
}

// ---------------------------------------------------------------------------
// noise, delays, reverb, modulation
// ---------------------------------------------------------------------------

/** Pink noise (Kellet refined filter), RMS-normalised to 1. */
export function pinkNoise(n, rng = Math.random) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const r = rms(out);
  if (r > 0) gain(out, 1 / r);
  return out;
}

export function whiteNoise(n, rng = Math.random) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}

/** Mix src into dst at offset with gain g. */
export function mixInto(dst, src, offset = 0, g = 1) {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) dst[offset + i] += src[i] * g;
  return dst;
}

/** Feedback comb filter (metallic resonance). Returns wet signal. */
export function comb(x, fs, delayMs, feedback = 0.5, damp = 0.2) {
  const d = ms(fs, delayMs);
  const buf = new Float32Array(d);
  const out = new Float32Array(x.length);
  let idx = 0, lp = 0;
  for (let i = 0; i < x.length; i++) {
    const y = buf[idx];
    lp = lp * damp + y * (1 - damp);
    out[i] = y;
    buf[idx] = x[i] + lp * feedback;
    idx = (idx + 1) % d;
  }
  return out;
}

function allpass(x, fs, delayMs, g = 0.7) {
  const d = ms(fs, delayMs);
  const buf = new Float32Array(d);
  const out = new Float32Array(x.length);
  let idx = 0;
  for (let i = 0; i < x.length; i++) {
    const bufout = buf[idx];
    const y = -g * x[i] + bufout;
    buf[idx] = x[i] + g * bufout;
    out[i] = y;
    idx = (idx + 1) % d;
  }
  return out;
}

/**
 * Small Schroeder reverb. Returns wet signal only (input length + tail).
 */
export function reverbWet(x, fs, { combsMs = [17.9, 22.3, 26.1, 29.7], fb = 0.5, apMs = [5.1, 1.7], damp = 0.3, tailMs = 120, hpHz = 400, lpHz = 9000 } = {}) {
  const src = new Float32Array(x.length + ms(fs, tailMs));
  src.set(x);
  const acc = new Float32Array(src.length);
  for (const c of combsMs) mixInto(acc, comb(src, fs, c, fb, damp), 0, 1 / combsMs.length);
  let w = acc;
  for (const a of apMs) w = allpass(w, fs, a, 0.68);
  highpass(w, fs, hpHz);
  lowpass(w, fs, lpHz);
  return w;
}

/** Ring modulation with a sine carrier, mixed with dry. */
export function ringMod(x, fs, hz = 35, mix = 0.35) {
  const w = 2 * Math.PI * hz / fs;
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - mix) + x[i] * Math.sin(w * i) * mix;
  return x;
}

/** Sample-and-hold at holdRate Hz plus bit quantisation (pitch preserving). */
export function bitcrush(x, fs, holdRate = 11000, bits = 9) {
  const step = holdRate / fs;
  const q = Math.pow(2, bits - 1);
  let acc = 1, held = 0;
  for (let i = 0; i < x.length; i++) {
    acc += step;
    if (acc >= 1) { acc -= 1; held = Math.round(x[i] * q) / q; }
    x[i] = held;
  }
  return x;
}

/** Chorus/doubling: delayed copy at levelDb with a tiny LFO wobble. Returns new array. */
export function doubler(x, fs, delayMs = 7, levelDb = -6, depthMs = 0.25, rateHz = 0.7) {
  const out = new Float32Array(x.length);
  const g = dbToLin(levelDb);
  const base = fs * delayMs / 1000, dep = fs * depthMs / 1000;
  for (let i = 0; i < x.length; i++) {
    const d = base + dep * Math.sin(2 * Math.PI * rateHz * i / fs);
    const p = i - d;
    const i0 = Math.floor(p), fr = p - i0;
    const a = i0 >= 0 ? x[i0] : 0;
    const b = (i0 + 1 >= 0 && i0 + 1 < x.length) ? x[i0 + 1] : 0;
    out[i] = x[i] + (a + (b - a) * fr) * g;
  }
  return out;
}

/** 30 ms band-limited noise burst with a decaying envelope and a click. */
export function squelchBurst(fs, rng, { lenMs = 30, level = 0.35 } = {}) {
  const n = ms(fs, lenMs);
  const b = whiteNoise(n, rng);
  bandpass(b, fs, 900, 3200);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.exp(-t * 4.5) * (i < 8 ? i / 8 : 1);
    b[i] = b[i] * env * level;
  }
  b[0] += level * 0.9; b[1] -= level * 0.5; // the click
  lowpass(b, fs, 5000);
  return b;
}

/** Two-tone sine chime (E6 then B6), each noteMs, quiet. */
export function chime(fs, { notes = [1318.51, 1975.53], noteMs = 80, level = 0.16 } = {}) {
  const n = ms(fs, noteMs);
  const ring = ms(fs, 25);
  const out = new Float32Array(n * notes.length + ring + ms(fs, 5));
  notes.forEach((f, k) => {
    for (let i = 0; i < n + ring && k * n + i < out.length; i++) {
      const t = i / fs;
      const a = Math.min(1, i / ms(fs, 3)) * Math.exp(-i / (n * 0.9));
      out[k * n + i] += Math.sin(2 * Math.PI * f * t) * a * level * (1 + 0.15 * Math.sin(2 * Math.PI * 2 * f * t));
    }
  });
  return out;
}

/** Brief -12 dB dropouts on voiced regions (1–2 per line), in place. */
export function dropouts(x, fs, rng, { count = 1, minMs = 20, maxMs = 40, depthDb = -12 } = {}) {
  const env = envelope(x, fs, 5, 50);
  const p = peak(env);
  const n = x.length;
  const g = dbToLin(depthDb);
  const ramp = ms(fs, 3);
  let placed = 0, tries = 0;
  const used = [];
  while (placed < count && tries < 60) {
    tries++;
    const pos = Math.floor(n * (0.15 + 0.7 * rng()));
    if (env[pos] < p * 0.35) continue;
    if (used.some(u => Math.abs(u - pos) < ms(fs, 250))) continue;
    const len = ms(fs, minMs + (maxMs - minMs) * rng());
    for (let i = 0; i < len && pos + i < n; i++) {
      let w = 1;
      if (i < ramp) w = i / ramp; else if (len - i < ramp) w = (len - i) / ramp;
      x[pos + i] *= 1 - (1 - g) * w;
    }
    used.push(pos); placed++;
  }
  return x;
}

/** Repeat a 40 ms grain twice (heard 3x in total). Returns new array. */
export function stutter(x, fs, rng, { grainMs = 40, repeats = 2 } = {}) {
  const env = envelope(x, fs, 5, 50);
  const p = peak(env);
  const n = x.length;
  const glen = ms(fs, grainMs);
  let pos = -1;
  for (let t = 0; t < 40; t++) {
    const c = Math.floor(n * (0.25 + 0.5 * rng()));
    if (env[c] > p * 0.5 && c + glen < n) { pos = c; break; }
  }
  if (pos < 0) return x;
  const grain = new Float32Array(x.subarray(pos, pos + glen));
  fadeEdges(grain, fs, 2, 2);
  const out = new Float32Array(n + glen * repeats);
  out.set(x.subarray(0, pos + glen), 0);
  let w = pos + glen;
  for (let r = 0; r < repeats; r++) { mixInto(out, grain, w, 0.9 - r * 0.1); w += glen; }
  out.set(x.subarray(pos + glen), w);
  return out;
}

// ---------------------------------------------------------------------------
// resampling
// ---------------------------------------------------------------------------

/** Catmull-Rom resample with anti-alias low-pass when decimating. */
export function resample(x, fromRate, toRate) {
  if (fromRate === toRate) return x;
  const src = new Float32Array(x);
  if (toRate < fromRate) {
    const fc = toRate * 0.45;
    lowpass(src, fromRate, fc); lowpass(src, fromRate, fc);
  }
  const ratio = fromRate / toRate;
  const n = Math.floor(src.length / ratio);
  const out = new Float32Array(n);
  const at = (i) => (i < 0 || i >= src.length) ? 0 : src[i];
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const i1 = Math.floor(p), t = p - i1;
    const p0 = at(i1 - 1), p1 = at(i1), p2 = at(i1 + 1), p3 = at(i1 + 2);
    out[i] = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// speaker chains
// ---------------------------------------------------------------------------

function chainVoss(v, fs, rng) {
  // fleet radio: narrow band, compressed, saturated, static bed, squelch, interference
  bandpass(v, fs, 300, 3400);
  peaking(v, fs, 1800, 1.2, 2.5);                 // presence honk
  compress(v, fs, { threshDb: -20, ratio: 3.5, attackMs: 1.5, releaseMs: 70, makeupDb: 4 });
  softClip(v, 1.8, 0.9);
  dropouts(v, fs, rng, { count: 1 + (rng() < 0.5 ? 1 : 0) });

  // extend the tail a little so the closing squelch sits after the last word
  const extra = ms(fs, 45);
  const out = new Float32Array(v.length + extra);
  out.set(v);

  // static bed: -38 dBFS under voice, ~+5 dB louder in the gaps
  const env = envelope(out, fs, 8, 120);
  const ep = peak(env) || 1;
  const bed = pinkNoise(out.length, rng);
  bandpass(bed, fs, 300, 3400);
  const base = dbToLin(-38);
  for (let i = 0; i < out.length; i++) {
    const open = 1 - Math.min(1, env[i] / (ep * 0.5));
    out[i] += bed[i] * base * (1 + 0.8 * open);
  }

  // squelch bursts at the very start and end
  mixInto(out, squelchBurst(fs, rng), 0, 1);
  const tail = squelchBurst(fs, rng, { level: 0.3 });
  mixInto(out, tail, out.length - tail.length, 1);
  return out;
}

function chainShip(v, fs) {
  // clean, bright, app-voice sheen, tiny bright room, chime prefix
  highpass(v, fs, 90);
  highShelf(v, fs, 3800, 3.5);
  peaking(v, fs, 7500, 1.0, 1.5);
  compress(v, fs, { threshDb: -16, ratio: 2, attackMs: 8, releaseMs: 120, makeupDb: 1 });
  const w = doubler(v, fs, 7, -6, 0.3, 0.6);
  const rv = reverbWet(w, fs, { combsMs: [13.1, 16.7, 19.9, 23.3], fb: 0.42, apMs: [4.3, 1.3], damp: 0.15, tailMs: 140, hpHz: 700, lpHz: 11000 });
  const out = new Float32Array(rv.length);
  out.set(w);
  mixInto(out, rv, 0, 0.14);
  // chime, then 150 ms, then the voice
  const ch = chime(fs);
  const gap = ms(fs, 150);
  const full = new Float32Array(ch.length + gap + out.length);
  full.set(ch, 0);
  full.set(out, ch.length + gap);
  return full;
}

function chainVanguard(v, fs) {
  // in-helmet comms: band-limited, compressed, lightly distorted, tiny close reverb, no static
  bandpass(v, fs, 250, 5000);
  peaking(v, fs, 2600, 1.1, 2);
  compress(v, fs, { threshDb: -18, ratio: 4, attackMs: 2, releaseMs: 90, makeupDb: 3 });
  distort(v, 2.2, 0.35);
  softClip(v, 1.4, 1);
  const rv = reverbWet(v, fs, { combsMs: [3.1, 4.7, 6.3, 8.1], fb: 0.5, apMs: [1.9, 0.9], damp: 0.35, tailMs: 60, hpHz: 300, lpHz: 6000 });
  const out = new Float32Array(rv.length);
  out.set(v);
  mixInto(out, rv, 0, 0.18);
  return out;
}

function chainLegion(v, fs, rng) {
  // distorted synthetic-but-human: ring mod, bitcrush, band-limit, distortion, metallic comb, stutter
  const dry = new Float32Array(v);
  ringMod(v, fs, 35, 0.35);
  bitcrush(v, fs, 11000, 9);
  bandpass(v, fs, 200, 4500);
  compress(v, fs, { threshDb: -20, ratio: 4, attackMs: 1.5, releaseMs: 70, makeupDb: 3 });
  distort(v, 3.2, 0.5);
  softClip(v, 2.2, 1);
  // keep a little clean signal underneath for intelligibility
  bandpass(dry, fs, 200, 4500);
  for (let i = 0; i < v.length; i++) v[i] = v[i] * 0.85 + dry[i] * 0.25;
  const metal = comb(v, fs, 4.6 + rng() * 1.4, 0.55, 0.25);
  highpass(metal, fs, 400);
  for (let i = 0; i < v.length; i++) v[i] = v[i] * 0.7 + metal[i] * 0.3;
  return stutter(v, fs, rng, { grainMs: 40, repeats: 2 });
}

const CHAINS = {
  voss: chainVoss,
  ship: chainShip,
  vanguard: chainVanguard,
  legion: chainLegion,
};

export const SPEAKERS = Object.keys(CHAINS);

/**
 * Full pipeline for one line.
 * @param {Float32Array} samples  mono input
 * @param {number} sampleRate     input rate
 * @param {'voss'|'ship'|'vanguard'|'legion'} speaker
 * @param {{ seed?: string, outRate?: number }} opts
 * @returns {{ samples: Float32Array, sampleRate: number, duration: number }}
 */
export function processVoice(samples, sampleRate, speaker, { seed = speaker, outRate = 24000 } = {}) {
  const chain = CHAINS[speaker];
  if (!chain) throw new Error(`processVoice: unknown speaker "${speaker}"`);
  const rng = makeRng(seed);
  const fs = sampleRate;

  // (a) trim, ~60 ms head/tail
  let v = trimSilence(samples, fs, { padMs: 60 }).samples;
  // pre-level so the chains see a consistent input
  const p = peak(v);
  if (p > 1e-6) gain(v, 0.5 / p);

  // (b) per-speaker chain
  v = chain(v, fs, rng);

  // (d) resample, then (c) normalise / limit at the output rate
  v = resample(v, fs, outRate);
  fadeEdges(v, outRate, 2, 10);
  normalizeLimit(v, outRate, { ceilingDb: -3, pushDb: -1 });

  return { samples: v, sampleRate: outRate, duration: v.length / outRate };
}
