// HOSTILE ORBIT - pure JS DSP library for offline audio synthesis.
// All buffers are Float32Array mono sample buffers at SR = 44100 unless noted.
// Stereo is represented as [L, R] (array of two Float32Array).
//
// Conventions:
//   - "dur" parameters are seconds.
//   - Many parameters accept a number, a function (t) => value, or a Float32Array
//     (per-sample). See param().
//   - Most processors return a NEW buffer; in-place helpers (gainInPlace, applyEnv,
//     normalize, fadeIn/fadeOut, dcBlock) modify in place and return the buffer.

export const SR = 44100;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Seeded RNG with convenience helpers. rng() -> [0,1). */
export function makeRng(seed) {
  const base = mulberry32(typeof seed === 'string' ? hashString(seed) : (seed >>> 0));
  const r = () => base();
  r.range = (a, b) => a + (b - a) * base();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * base());
  r.pick = (arr) => arr[Math.floor(base() * arr.length)];
  r.sign = () => (base() < 0.5 ? -1 : 1);
  r.bool = (p = 0.5) => base() < p;
  r.jitter = (x, pct) => x * (1 + pct * (2 * base() - 1)); // +-pct fraction
  r.semis = (n) => Math.pow(2, (2 * base() - 1) * n / 12); // random pitch ratio within +-n semitones
  r.gauss = () => { const u = 1 - base(), v = base(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return r;
}

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------
export const samples = (sec) => Math.max(1, Math.round(sec * SR));
export const buffer = (sec) => new Float32Array(samples(sec));
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** noteToFreq('D3'), noteToFreq('Bb2'), noteToFreq('C#4') */
export function noteToFreq(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error('bad note ' + name);
  let n = NOTE_IDX[m[1].toUpperCase()];
  if (m[2] === '#') n++; else if (m[2] === 'b') n--;
  const oct = parseInt(m[3], 10);
  return mtof(n + (oct + 1) * 12);
}

/** Resolve a number | fn(t,i) | Float32Array into a function (t, i) => value. */
export function param(p) {
  if (typeof p === 'function') return p;
  if (p instanceof Float32Array) return (t, i) => (i < p.length ? p[i] : p[p.length - 1]);
  const v = +p;
  return () => v;
}

// ---------------------------------------------------------------------------
// Curves for pitch / parameter sweeps (return functions of t)
// ---------------------------------------------------------------------------
/** Exponential approach from f0 towards f1 with time constant tau. */
export const expSweep = (f0, f1, tau) => (t) => f1 + (f0 - f1) * Math.exp(-t / tau);
/** Linear from a to b over dur, then hold b. */
export const linSweep = (a, b, dur) => (t) => (t >= dur ? b : a + (b - a) * (t / dur));
/** Geometric (equal-ratio per second) sweep from a to b over dur (good for pitch). */
export const geoSweep = (a, b, dur) => (t) => (t >= dur ? b : a * Math.pow(b / a, t / dur));
/** Multi-point linear breakpoint curve. points: [[t, v], ...] */
export function breakpoints(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let k = 1; k < points.length; k++) {
      if (t <= points[k][0]) {
        const [t0, v0] = points[k - 1], [t1, v1] = points[k];
        return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-9, t1 - t0));
      }
    }
    return points[points.length - 1][1];
  };
}
/** Geometric breakpoints (each segment is an equal-ratio sweep; good for pitch). */
export function geoBreakpoints(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let k = 1; k < points.length; k++) {
      if (t <= points[k][0]) {
        const [t0, v0] = points[k - 1], [t1, v1] = points[k];
        return v0 * Math.pow(v1 / v0, (t - t0) / Math.max(1e-9, t1 - t0));
      }
    }
    return points[points.length - 1][1];
  };
}
/** LFO as a function of t. */
export const lfo = (rate, depth = 1, offset = 0, phase = 0, shape = 'sine') => (t) => {
  const p = (rate * t + phase) % 1;
  let v;
  if (shape === 'sine') v = Math.sin(TAU * p);
  else if (shape === 'tri') v = 1 - 4 * Math.abs(p - 0.5);
  else if (shape === 'saw') v = 2 * p - 1;
  else v = p < 0.5 ? 1 : -1;
  return offset + depth * v;
};

// ---------------------------------------------------------------------------
// Oscillators
// ---------------------------------------------------------------------------
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/**
 * osc(type, dur, freq, opts)
 *  type: 'sine' | 'saw' | 'square' | 'tri' | 'pulse'
 *  freq: number | fn(t) | Float32Array
 *  opts.phase (0..1), opts.pw (pulse width for 'pulse', number|fn), opts.blep (default true),
 *  opts.pm: Float32Array phase modulation (radians) added per sample.
 */
export function osc(type, dur, freq, opts = {}) {
  const n = samples(dur);
  const out = new Float32Array(n);
  const f = param(freq);
  const pw = param(opts.pw ?? 0.5);
  const blep = opts.blep !== false;
  const pm = opts.pm || null;
  let ph = (opts.phase || 0) % 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const dt = Math.max(0, f(t, i)) / SR;
    let p = ph; if (pm) { p = (p + pm[i] / TAU) % 1; if (p < 0) p += 1; }
    let v;
    switch (type) {
      case 'sine': v = Math.sin(TAU * p); break;
      case 'saw': v = 2 * p - 1; if (blep) v -= polyBlep(p, dt); break;
      case 'square':
      case 'pulse': {
        const w = type === 'square' ? 0.5 : clamp(pw(t, i), 0.02, 0.98);
        v = p < w ? 1 : -1;
        if (blep) { v += polyBlep(p, dt); v -= polyBlep((p + 1 - w) % 1, dt); }
        break;
      }
      case 'tri': v = 1 - 4 * Math.abs(p - 0.5); break;
      default: throw new Error('unknown osc type ' + type);
    }
    out[i] = v;
    ph += dt; if (ph >= 1) ph -= Math.floor(ph);
  }
  return out;
}
export const sine = (dur, freq, o) => osc('sine', dur, freq, o);
export const saw = (dur, freq, o) => osc('saw', dur, freq, o);
export const square = (dur, freq, o) => osc('square', dur, freq, o);
export const tri = (dur, freq, o) => osc('tri', dur, freq, o);
export const pulse = (dur, freq, pw, o = {}) => osc('pulse', dur, freq, { ...o, pw });

/**
 * Two-operator FM (phase modulation). carrier/mod freqs, index all accept number|fn|Float32Array.
 * opts.ratio: if given, modFreq = carrierFreq * ratio (mod param ignored).
 * opts.feedback: modulator self-feedback amount (0..1).
 */
export function fm(dur, carrier, mod, index, opts = {}) {
  const n = samples(dur);
  const out = new Float32Array(n);
  const fc = param(carrier), fmf = param(mod), idx = param(index);
  const ratio = opts.ratio;
  const fb = opts.feedback || 0;
  let pc = (opts.phase || 0) * TAU, pmod = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const c = fc(t, i);
    const m = ratio != null ? c * ratio : fmf(t, i);
    const modv = Math.sin(pmod + fb * last);
    last = modv;
    out[i] = Math.sin(pc + idx(t, i) * modv);
    pc += TAU * c / SR; pmod += TAU * m / SR;
    if (pc > 1e6) pc -= 1e6; if (pmod > 1e6) pmod -= 1e6;
  }
  return out;
}

/** N detuned saws mixed (supersaw). detune in cents. */
export function superSaw(dur, freq, voices = 5, detuneCents = 12, rng = Math.random) {
  const f = param(freq);
  const out = new Float32Array(samples(dur));
  for (let v = 0; v < voices; v++) {
    const c = voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * detuneCents;
    const ratio = Math.pow(2, c / 1200);
    const s = osc('saw', dur, (t, i) => f(t, i) * ratio, { phase: rng() });
    addInPlace(out, s, 1 / Math.sqrt(voices));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------
export function noise(dur, rng = Math.random, color = 'white') {
  const n = samples(dur);
  const out = new Float32Array(n);
  if (color === 'white') {
    for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  } else if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
  } else throw new Error('unknown noise color ' + color);
  return out;
}
export const white = (dur, rng) => noise(dur, rng, 'white');
export const pink = (dur, rng) => noise(dur, rng, 'pink');
export const brown = (dur, rng) => noise(dur, rng, 'brown');

/** Sparse decaying impulses (crackle / debris / sparks). density = impulses per second. */
export function crackle(dur, rng, density = 60, decay = 0.004) {
  const n = samples(dur);
  const out = new Float32Array(n);
  const p = density / SR;
  const k = Math.exp(-1 / (decay * SR));
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (rng() < p) v += (rng() * 2 - 1);
    out[i] = v; v *= k;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------
/** Linear breakpoints -> Float32Array of length dur. */
export function env(dur, points) {
  const n = samples(dur), out = new Float32Array(n), f = breakpoints(points);
  for (let i = 0; i < n; i++) out[i] = f(i / SR);
  return out;
}

/** ADSR of total length dur; release starts at dur - r (or at opts.gate). */
export function adsr(dur, a, d, s, r, opts = {}) {
  const n = samples(dur), out = new Float32Array(n);
  const gate = opts.gate != null ? opts.gate : Math.max(a + d, dur - r);
  const curve = opts.curve ?? 2;
  let relStart = s;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v;
    if (t < a) v = a > 0 ? t / a : 1;
    else if (t < a + d) { const x = (t - a) / Math.max(1e-9, d); v = 1 + (s - 1) * (1 - Math.pow(1 - x, curve)); }
    else if (t < gate) v = s;
    else { const x = (t - gate) / Math.max(1e-9, r); v = x >= 1 ? 0 : relStart * Math.pow(1 - x, curve); }
    if (t < gate) relStart = v;
    out[i] = v;
  }
  return out;
}

/** Exponential decay with optional short linear attack. */
export function expDecay(dur, tau, attack = 0) {
  const n = samples(dur), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = Math.exp(-t / tau);
    if (attack > 0 && t < attack) v *= t / attack;
    out[i] = v;
  }
  return out;
}
/** Percussive: attack then exp decay; decays to ~-60 dB by dur if tau omitted. */
export const perc = (dur, attack = 0.001, tau = dur / 6.9) => expDecay(dur, tau, attack);

/** Multiply buffer by envelope (Float32Array | fn(t) | number). In place. */
export function applyEnv(buf, e) {
  const f = param(e);
  for (let i = 0; i < buf.length; i++) buf[i] *= f(i / SR, i);
  return buf;
}

/** Envelope follower (peak, attack/release in seconds). */
export function envFollower(buf, attack = 0.005, release = 0.1) {
  const out = new Float32Array(buf.length);
  const ga = Math.exp(-1 / (attack * SR)), gr = Math.exp(-1 / (release * SR));
  let e = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = Math.abs(buf[i]);
    e = x > e ? ga * e + (1 - ga) * x : gr * e + (1 - gr) * x;
    out[i] = e;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
function biquadCoefs(type, fc, Q, gainDb, c) {
  fc = clamp(fc, 5, SR * 0.49);
  const w0 = TAU * fc / SR, cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Math.max(0.05, Q));
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    case 'allpass': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    default: throw new Error('unknown filter ' + type);
  }
  c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
}

/**
 * Biquad filter. cutoff / Q / gainDb accept number | fn(t) | Float32Array (recomputed every `step` samples).
 * Returns a new buffer.
 */
export function biquad(buf, type, cutoff, Q = 0.7071, gainDb = 0, opts = {}) {
  const n = buf.length, out = new Float32Array(n);
  const fc = param(cutoff), fq = param(Q), fg = param(gainDb);
  const modulated = typeof cutoff !== 'number' || typeof Q !== 'number' || typeof gainDb !== 'number';
  const step = opts.step || 16;
  const c = new Float64Array(5);
  biquadCoefs(type, fc(0, 0), fq(0, 0), fg(0, 0), c);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    if (modulated && (i % step) === 0 && i > 0) { const t = i / SR; biquadCoefs(type, fc(t, i), fq(t, i), fg(t, i), c); }
    const x = buf[i];
    const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}
export const lowpass = (b, fc, q, o) => biquad(b, 'lowpass', fc, q, 0, o);
export const highpass = (b, fc, q, o) => biquad(b, 'highpass', fc, q, 0, o);
export const bandpass = (b, fc, q, o) => biquad(b, 'bandpass', fc, q, 0, o);
export const notch = (b, fc, q, o) => biquad(b, 'notch', fc, q, 0, o);
export const peakEq = (b, fc, q, db, o) => biquad(b, 'peak', fc, q, db, o);
export const lowshelf = (b, fc, db, o) => biquad(b, 'lowshelf', fc, 0.7071, db, o);
export const highshelf = (b, fc, db, o) => biquad(b, 'highshelf', fc, 0.7071, db, o);
/** Two cascaded biquads (24 dB/oct). */
export const lowpass2 = (b, fc, q = 0.7071) => lowpass(lowpass(b, fc, q), fc, q);
export const highpass2 = (b, fc, q = 0.7071) => highpass(highpass(b, fc, q), fc, q);

/** One-pole lowpass (cheap, smooth). cutoff number|fn|array. */
export function onePole(buf, cutoff) {
  const out = new Float32Array(buf.length), f = param(cutoff);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = 1 - Math.exp(-TAU * clamp(f(i / SR, i), 1, SR / 2) / SR);
    y += a * (buf[i] - y); out[i] = y;
  }
  return out;
}

/**
 * 4-pole resonant ladder lowpass (Moog-ish, tanh saturating). cutoff number|fn|array, res 0..1.1.
 */
export function ladder(buf, cutoff, res = 0.5, opts = {}) {
  const n = buf.length, out = new Float32Array(n);
  const fc = param(cutoff), fr = param(res);
  const drive = opts.drive || 1;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  const th = Math.tanh;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = clamp(fc(t, i), 10, 18000);
    const g = 1 - Math.exp(-TAU * f / SR / 2); // 2x oversampled
    const k = 4 * clamp(fr(t, i), 0, 1.15);
    const inp = buf[i] * drive;
    for (let os = 0; os < 2; os++) {
      const x = th(inp - k * s4);
      s1 += g * (x - s1);
      s2 += g * (s1 - s2); s3 += g * (s2 - s3); s4 += g * (s3 - s4);
    }
    out[i] = s4;
  }
  return out;
}

/** Simple feedback comb resonator (metallic ring). freq in Hz, feedback 0..0.999, damp 0..1. */
export function comb(buf, freq, feedback = 0.9, damp = 0.3, tail = 0.3) {
  const d = Math.max(1, Math.round(SR / freq));
  const n = buf.length + samples(tail), out = new Float32Array(n);
  const line = new Float32Array(d); let idx = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const x = i < buf.length ? buf[i] : 0;
    const y = line[idx];
    lp += (1 - damp) * (y - lp);
    line[idx] = x + lp * feedback; idx = (idx + 1) % d;
    out[i] = y;
  }
  return out;
}

/** Bank of parallel resonant bandpasses at given freqs (metallic body). */
export function resonatorBank(buf, freqs, Q = 40, gains = null, tail = 0.4) {
  const padded = pad(buf, tail);
  const out = new Float32Array(padded.length);
  freqs.forEach((f, k) => addInPlace(out, bandpass(padded, f, Q), gains ? gains[k] : 1));
  return out;
}

// ---------------------------------------------------------------------------
// Distortion
// ---------------------------------------------------------------------------
export function softClip(buf, drive = 2, mix = 1) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = Math.tanh(x * drive);
    out[i] = x + (y - x) * mix;
  }
  return out;
}
export function hardClip(buf, thresh = 0.8, drive = 1) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = clamp(buf[i] * drive, -thresh, thresh);
  return out;
}
export function waveshape(buf, fn) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = fn(buf[i]);
  return out;
}
/** Asymmetric tube-ish shaper. */
export const tube = (buf, drive = 2) => waveshape(buf, (x) => { x *= drive; return x >= 0 ? 1 - Math.exp(-x) : -1 + Math.exp(x * 0.8); });
export function foldback(buf, thresh = 0.6, drive = 1.5) {
  return waveshape(buf, (x) => {
    x *= drive;
    let guard = 0;
    while ((x > thresh || x < -thresh) && guard++ < 16) x = x > thresh ? 2 * thresh - x : -2 * thresh - x;
    return x;
  });
}
export function bitcrush(buf, bits = 8, hold = 1) {
  const out = new Float32Array(buf.length);
  const q = Math.pow(2, bits - 1);
  let last = 0;
  for (let i = 0; i < buf.length; i++) {
    if (i % hold === 0) last = Math.round(buf[i] * q) / q;
    out[i] = last;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time-based effects
// ---------------------------------------------------------------------------
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const AP_TUNING = [556, 441, 341, 225];

/**
 * Freeverb-style mono reverb. opts: room (0..1), damp (0..1), wet, dry, tail (sec appended),
 * predelay (sec), spread (extra samples on delay lines, for stereo decorrelation), hpf/lpf (Hz on wet).
 */
export function reverb(buf, opts = {}) {
  const { room = 0.7, damp = 0.4, wet = 0.3, dry = 1, tail = 1.0, predelay = 0, spread = 0, hpf = 0, lpf = 0 } = opts;
  const n = buf.length + samples(tail);
  const feedback = 0.7 + 0.28 * clamp(room, 0, 1);
  const d1 = clamp(damp, 0, 1), d2 = 1 - d1;
  const combs = COMB_TUNING.map((len) => ({ buf: new Float32Array(len + spread), idx: 0, f: 0 }));
  const aps = AP_TUNING.map((len) => ({ buf: new Float32Array(len + spread), idx: 0 }));
  const pre = predelay > 0 ? samples(predelay) : 0;
  const wetBuf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i - pre;
    const x = (j >= 0 && j < buf.length ? buf[j] : 0) * 0.015;
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.idx];
      c.f = y * d2 + c.f * d1;
      c.buf[c.idx] = x + c.f * feedback;
      if (++c.idx >= c.buf.length) c.idx = 0;
      acc += y;
    }
    for (const a of aps) {
      const bufout = a.buf[a.idx];
      const v = acc + bufout * 0.5;
      a.buf[a.idx] = v; if (++a.idx >= a.buf.length) a.idx = 0;
      acc = bufout - acc;
    }
    wetBuf[i] = acc;
  }
  let w = wetBuf;
  if (hpf > 0) w = highpass(w, hpf);
  if (lpf > 0) w = lowpass(w, lpf);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (i < buf.length ? buf[i] * dry : 0) + w[i] * wet;
  return out;
}

/** Stereo reverb from mono or stereo input: returns [L, R]. */
export function reverbStereo(input, opts = {}) {
  const [L, R] = Array.isArray(input) ? input : [input, input];
  return [reverb(L, { ...opts, spread: 0 }), reverb(R, { ...opts, spread: 23 })];
}

/** Feedback delay. opts: tail (sec), damp (lowpass Hz in feedback path), hpf, dry. Returns new buffer. */
export function delay(buf, time, feedback = 0.4, wet = 0.3, opts = {}) {
  const { tail = time * 6, damp = 6000, hpf = 0, dry = 1 } = opts;
  const d = Math.max(1, samples(time));
  const n = buf.length + samples(tail);
  const line = new Float32Array(d);
  const out = new Float32Array(n);
  const a = 1 - Math.exp(-TAU * damp / SR);
  const ah = 1 - Math.exp(-TAU * Math.max(1, hpf) / SR);
  let idx = 0, lp = 0, hpState = 0;
  for (let i = 0; i < n; i++) {
    const x = i < buf.length ? buf[i] : 0;
    const y = line[idx];
    lp += a * (y - lp);
    let fbv = lp;
    if (hpf > 0) { hpState += ah * (fbv - hpState); fbv = fbv - hpState; }
    line[idx] = x + fbv * feedback;
    idx = (idx + 1) % d;
    out[i] = x * dry + y * wet;
  }
  return out;
}

/** Stereo ping-pong delay from a mono or stereo source. Returns [L,R]. */
export function pingPong(input, time, feedback = 0.4, wet = 0.3, opts = {}) {
  const [L, R] = Array.isArray(input) ? input : [input, input];
  const { tail = time * 8, damp = 5000, dry = 1 } = opts;
  const d = Math.max(1, samples(time));
  const n = L.length + samples(tail);
  const lineL = new Float32Array(d), lineR = new Float32Array(d);
  const oL = new Float32Array(n), oR = new Float32Array(n);
  const a = 1 - Math.exp(-TAU * damp / SR);
  let idx = 0, lpL = 0, lpR = 0;
  for (let i = 0; i < n; i++) {
    const xl = i < L.length ? L[i] : 0, xr = i < R.length ? R[i] : 0;
    const yl = lineL[idx], yr = lineR[idx];
    lpL += a * (yl - lpL); lpR += a * (yr - lpR);
    lineL[idx] = xl * 0.5 + xr * 0.5 + lpR * feedback;
    lineR[idx] = lpL * feedback;
    idx = (idx + 1) % d;
    oL[i] = xl * dry + yl * wet; oR[i] = xr * dry + yr * wet;
  }
  return [oL, oR];
}

/** Chorus (mono in -> mono out). opts: rate Hz, depth sec, mix, voices, base delay sec, phase. */
export function chorus(buf, opts = {}) {
  const { rate = 0.8, depth = 0.003, mix = 0.5, voices = 2, base = 0.012, phase = 0 } = opts;
  const n = buf.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let v = 0; v < voices; v++) {
      const ph = TAU * (rate * i / SR + phase + v / voices);
      const dS = (base + depth * (0.5 + 0.5 * Math.sin(ph))) * SR;
      const rp = i - dS;
      const i0 = Math.floor(rp), fr = rp - i0;
      const a = i0 >= 0 ? buf[i0] : 0, b = i0 + 1 >= 0 && i0 + 1 < n ? buf[i0 + 1] : 0;
      acc += a + (b - a) * fr;
    }
    out[i] = buf[i] * (1 - mix) + (acc / voices) * mix;
  }
  return out;
}
/** Stereo chorus/widener from mono: returns [L,R] with opposite-phase modulation. */
export function stereoChorus(buf, opts = {}) {
  return [chorus(buf, { ...opts, phase: 0 }), chorus(buf, { ...opts, phase: 0.5 })];
}

/** Flanger. */
export function flanger(buf, opts = {}) {
  const { rate = 0.3, depth = 0.002, base = 0.001, feedback = 0.5, mix = 0.5 } = opts;
  const n = buf.length, out = new Float32Array(n);
  const line = new Float32Array(samples(base + depth) + 4);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const dS = (base + depth * (0.5 + 0.5 * Math.sin(TAU * rate * i / SR))) * SR;
    let rp = w - dS; while (rp < 0) rp += line.length;
    const i0 = Math.floor(rp) % line.length, i1 = (i0 + 1) % line.length, fr = rp - Math.floor(rp);
    const dl = line[i0] + (line[i1] - line[i0]) * fr;
    line[w] = buf[i] + dl * feedback;
    w = (w + 1) % line.length;
    out[i] = buf[i] * (1 - mix) + dl * mix;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dynamics
// ---------------------------------------------------------------------------
/**
 * Feed-forward compressor. Accepts mono buffer or [L,R] (linked). Returns same shape.
 * opts: threshold dB, ratio, attack s, release s, makeup dB, knee dB, sidechain (Float32Array key signal).
 */
export function compressor(input, opts = {}) {
  const { threshold = -18, ratio = 4, attack = 0.005, release = 0.12, makeup = 0, knee = 6, sidechain = null } = opts;
  const chans = Array.isArray(input) ? input : [input];
  const n = chans[0].length;
  const ga = Math.exp(-1 / (attack * SR)), gr = Math.exp(-1 / (release * SR));
  const mk = dbToGain(makeup);
  const outs = chans.map(() => new Float32Array(n));
  let e = 0;
  for (let i = 0; i < n; i++) {
    let x = 0;
    if (sidechain) x = Math.abs(i < sidechain.length ? sidechain[i] : 0);
    else for (const c of chans) x = Math.max(x, Math.abs(c[i]));
    e = x > e ? ga * e + (1 - ga) * x : gr * e + (1 - gr) * x;
    const db = gainToDb(e);
    const over = db - threshold; let gdb = 0;
    if (knee > 0 && over > -knee / 2 && over < knee / 2) { const z = over + knee / 2; gdb = (1 / ratio - 1) * z * z / (2 * knee); }
    else if (over >= knee / 2) gdb = (1 / ratio - 1) * over;
    const g = dbToGain(gdb) * mk;
    for (let c = 0; c < chans.length; c++) outs[c][i] = chans[c][i] * g;
  }
  return Array.isArray(input) ? outs : outs[0];
}

/** Lookahead limiter. Accepts mono or [L,R]. ceiling linear (0.97 ~ -0.26 dBFS). */
export function limiter(input, ceiling = 0.97, release = 0.06, lookahead = 0.003) {
  const chans = Array.isArray(input) ? input : [input];
  const n = chans[0].length;
  const la = Math.max(1, samples(lookahead));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0; for (const c of chans) { const a = Math.abs(c[i]); if (a > x) x = a; }
    need[i] = x > ceiling ? ceiling / x : 1;
  }
  // running minimum over the lookahead window (sliding window minimum via monotonic deque)
  const winMin = new Float32Array(n);
  const dq = new Int32Array(n); let head = 0, tailIdx = 0;
  for (let i = 0; i < n; i++) {
    while (tailIdx > head && need[dq[tailIdx - 1]] >= need[i]) tailIdx--;
    dq[tailIdx++] = i;
    const start = i - la + 1; // window [i-la+1, i] of need -> this is min for sample (i-la+1)
    while (dq[head] < start) head++;
    if (start >= 0) winMin[start] = need[dq[head]];
  }
  for (let i = Math.max(0, n - la + 1); i < n; i++) { let m = 1; for (let j = i; j < n; j++) if (need[j] < m) m = need[j]; winMin[i] = m; }
  // moving average of the window-min over the past la samples: guarantees gain[i] <= need[i]
  // (every raw value in the average has i inside its window) with a linear attack ramp.
  const avg = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += winMin[i];
    if (i >= la) acc -= winMin[i - la];
    avg[i] = acc / Math.min(la, i + 1);
  }
  const gainCurve = new Float32Array(n);
  const gr = Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    const m = avg[i];
    g = m < g ? m : gr * g + (1 - gr) * m;
    gainCurve[i] = g;
  }
  // hard safety clamp (should never engage)
  const outs = chans.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = clamp(c[i] * gainCurve[i], -ceiling, ceiling); return o; });
  return Array.isArray(input) ? outs : outs[0];
}

/** Transient shaper: amount > 0 boosts attacks, < 0 softens. */
export function transient(buf, amount = 0.5, fastMs = 1, slowMs = 30) {
  const fast = envFollower(buf, fastMs / 1000, 0.02), slow = envFollower(buf, slowMs / 1000, 0.08);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const diff = Math.max(0, fast[i] - slow[i]) / (slow[i] + 1e-4);
    out[i] = buf[i] * (1 + amount * Math.min(3, diff));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mixing / utilities
// ---------------------------------------------------------------------------
export function addInPlace(dst, src, g = 1, atSamples = 0) {
  const n = Math.min(src.length, dst.length - atSamples);
  for (let i = 0; i < n; i++) dst[i + atSamples] += src[i] * g;
  return dst;
}
/**
 * mix(layers): layers = [ [buf, gain=1, atSec=0], ... ] or [{buf, gain, at}].
 * Returns a new buffer sized to the latest end. Mono only.
 */
export function mix(layers, opts = {}) {
  const items = layers.filter(Boolean).map((l) => Array.isArray(l) ? { buf: l[0], gain: l[1] ?? 1, at: l[2] ?? 0 } : l);
  let len = 0;
  for (const it of items) len = Math.max(len, (it.at ? samples(it.at) : 0) + it.buf.length);
  if (opts.minDur) len = Math.max(len, samples(opts.minDur));
  const out = new Float32Array(len);
  for (const it of items) addInPlace(out, it.buf, it.gain ?? 1, it.at ? samples(it.at) : 0);
  return out;
}
/** mixStereo(layers): layers = [ [ [L,R] | mono, gain, atSec, pan ] ]. Returns [L,R]. */
export function mixStereo(layers, opts = {}) {
  let len = 0;
  const items = layers.filter(Boolean).map((l) => Array.isArray(l) ? { buf: l[0], gain: l[1] ?? 1, at: l[2] ?? 0, pan: l[3] ?? 0 } : l);
  for (const it of items) { const b = Array.isArray(it.buf) ? it.buf[0] : it.buf; len = Math.max(len, (it.at ? samples(it.at) : 0) + b.length); }
  if (opts.minDur) len = Math.max(len, samples(opts.minDur));
  const L = new Float32Array(len), R = new Float32Array(len);
  for (const it of items) {
    const at = it.at ? samples(it.at) : 0;
    if (Array.isArray(it.buf)) { addInPlace(L, it.buf[0], it.gain, at); addInPlace(R, it.buf[1], it.gain, at); }
    else { const [gl, gr] = panGains(it.pan || 0); addInPlace(L, it.buf, it.gain * gl, at); addInPlace(R, it.buf, it.gain * gr, at); }
  }
  return [L, R];
}
export function gain(buf, g) { const out = new Float32Array(buf.length); for (let i = 0; i < buf.length; i++) out[i] = buf[i] * g; return out; }
export function gainInPlace(buf, g) { for (let i = 0; i < buf.length; i++) buf[i] *= g; return buf; }
export function mul(a, b) { const n = Math.min(a.length, b.length), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = a[i] * b[i]; return out; }
export function concat(...bufs) { let n = 0; for (const b of bufs) n += b.length; const out = new Float32Array(n); let o = 0; for (const b of bufs) { out.set(b, o); o += b.length; } return out; }
export function slice(buf, t0, t1) { return buf.slice(samples(t0), t1 != null ? samples(t1) : buf.length); }
export function pad(buf, sec) { const out = new Float32Array(buf.length + samples(sec)); out.set(buf); return out; }
export function padTo(buf, sec) { const n = samples(sec); if (buf.length >= n) return buf.slice(0, n); const out = new Float32Array(n); out.set(buf); return out; }
export function reverse(buf) { return buf.slice().reverse(); }
export function silence(sec) { return new Float32Array(samples(sec)); }
/** Constant-power pan gains. p in [-1, 1]. */
export function panGains(p) { const a = (clamp(p, -1, 1) + 1) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; }
export function pan(mono, p = 0) { const [gl, gr] = panGains(p); return [gain(mono, gl), gain(mono, gr)]; }
export function toStereo(x) { return Array.isArray(x) ? x : [x, x.slice()]; }
export function toMono(x) { if (!Array.isArray(x)) return x; const n = x[0].length, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = 0.5 * (x[0][i] + x[1][i]); return o; }
/** Haas widener: returns [L,R] from mono. */
export function widen(mono, delaySec = 0.012, amount = 0.5) {
  const d = samples(delaySec), n = mono.length;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = mono[i]; R[i] = mono[i] * (1 - amount) + (i >= d ? mono[i - d] : 0) * amount; }
  return [L, R];
}
/** Apply fn to each channel of mono or stereo. */
export function eachChan(x, fn) { return Array.isArray(x) ? x.map((c, k) => fn(c, k)) : fn(x, 0); }

export function peak(buf) { let m = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } return m; }
export function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, buf.length)); }
/** Normalize to peakDb (default -1 dBFS). In place. Works on mono or stereo (linked). */
export function normalize(x, peakDb = -1) {
  const chans = Array.isArray(x) ? x : [x];
  let p = 0; for (const c of chans) p = Math.max(p, peak(c));
  if (p > 1e-9) { const g = dbToGain(peakDb) / p; for (const c of chans) gainInPlace(c, g); }
  return x;
}
export function fadeIn(buf, sec, curve = 1) { const n = Math.min(buf.length, samples(sec)); for (let i = 0; i < n; i++) buf[i] *= Math.pow(i / n, curve); return buf; }
export function fadeOut(buf, sec, curve = 1) { const n = Math.min(buf.length, samples(sec)); const L = buf.length; for (let i = 0; i < n; i++) buf[L - 1 - i] *= Math.pow(i / n, curve); return buf; }
/** DC blocker (in place). */
export function dcBlock(buf, R = 0.995) { let x1 = 0, y1 = 0; for (let i = 0; i < buf.length; i++) { const x = buf[i]; const y = x - x1 + R * y1; x1 = x; y1 = y; buf[i] = y; } return buf; }
/** Trim trailing near-silence (keeps `keep` sec after the last sample above threshold). */
export function trimTail(buf, thresholdDb = -66, keep = 0.03) {
  const th = dbToGain(thresholdDb); let last = buf.length - 1;
  while (last > 0 && Math.abs(buf[last]) < th) last--;
  const end = Math.min(buf.length, last + 1 + samples(keep));
  const out = buf.slice(0, end); fadeOut(out, Math.min(keep, 0.01)); return out;
}
/** Seamless loop: crossfade the last `sec` seconds into the start; output is shorter by `sec`. */
export function loopCrossfade(buf, sec) {
  const n = samples(sec); if (n * 2 > buf.length) throw new Error('loopCrossfade: buffer too short');
  const len = buf.length - n, out = new Float32Array(len);
  out.set(buf.subarray(0, len));
  for (let i = 0; i < n; i++) { const t = i / n; const a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2); out[i] = buf[i] * b + buf[len + i] * a; }
  return out;
}
/** Force exact length (truncate or zero-pad) in samples. */
export function fitSamples(buf, n) { if (buf.length === n) return buf; const out = new Float32Array(n); out.set(buf.subarray(0, Math.min(n, buf.length))); return out; }

// ---------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------
/**
 * Resample mono buffer from fromSR to toSR. Downsampling applies a steep anti-alias lowpass
 * (8th-order Butterworth as 4 cascaded biquads) then Catmull-Rom interpolation.
 */
export function resample(buf, fromSR, toSR) {
  if (fromSR === toSR) return buf;
  let src = buf;
  if (toSR < fromSR) {
    const fc = toSR * 0.44;
    const qs = [0.51, 0.60, 0.90, 2.56];
    for (const q of qs) src = lowpassAtRate(src, fc, q, fromSR);
  }
  const ratio = fromSR / toSR;
  const n = Math.round(buf.length / ratio);
  const out = new Float32Array(n);
  const N = src.length;
  for (let i = 0; i < n; i++) {
    const p = i * ratio; const i1 = Math.min(N - 1, Math.floor(p)); const fr = p - Math.floor(p);
    const i0 = Math.max(0, i1 - 1), i2 = Math.min(N - 1, i1 + 1), i3 = Math.min(N - 1, i1 + 2);
    const y0 = src[i0], y1 = src[i1], y2 = src[i2], y3 = src[i3];
    const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3, a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, a2 = -0.5 * y0 + 0.5 * y2;
    out[i] = ((a0 * fr + a1) * fr + a2) * fr + y1;
  }
  return out;
}
function lowpassAtRate(buf, fc, Q, rate) {
  const w0 = TAU * fc / rate, cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * Q);
  let b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const out = new Float32Array(buf.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i]; const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y; }
  return out;
}

// ---------------------------------------------------------------------------
// Higher-level building blocks commonly used by sound designers
// ---------------------------------------------------------------------------
/** Decaying sine with pitch drop: sub thump / kick body. */
export function thump(dur, f0, f1, pitchTau, ampTau, opts = {}) {
  const s = sine(dur, expSweep(f0, f1, pitchTau), { phase: opts.phase ?? 0.25 });
  applyEnv(s, expDecay(dur, ampTau, opts.attack ?? 0.0005));
  return opts.drive ? softClip(s, opts.drive) : s;
}
/** Filtered noise burst: crack / hit body. */
export function noiseBurst(dur, rng, opts = {}) {
  const { color = 'white', hp = 200, lp = 8000, bp = null, q = 0.8, tau = dur / 5, attack = 0.0005 } = opts;
  let n = noise(dur, rng, color);
  if (bp) n = bandpass(n, bp, q); else { if (hp) n = highpass(n, hp, 0.7); if (lp) n = lowpass(n, lp, q); }
  applyEnv(n, expDecay(dur, tau, attack));
  return n;
}
/** Short click transient (a few ms). */
export function click(rng, dur = 0.004, hp = 2000) {
  let c = noise(dur, rng); c = highpass(c, hp, 0.7); applyEnv(c, expDecay(dur, dur / 4, 0)); return c;
}
/** Metallic inharmonic ring (bell/plate) via detuned partials. */
export function metallicRing(dur, baseFreq, rng, opts = {}) {
  const { partials = 6, tau = dur / 4, spread = 1.0, bright = 1 } = opts;
  const ratios = [1, 1.47, 2.09, 2.56, 3.01, 3.87, 4.42, 5.3];
  const out = new Float32Array(samples(dur));
  for (let k = 0; k < partials; k++) {
    const r = ratios[k % ratios.length] * (1 + spread * 0.02 * (rng() - 0.5));
    const f = baseFreq * r; if (f > 16000) continue;
    const s = sine(dur, f, { phase: rng() });
    applyEnv(s, expDecay(dur, tau / (1 + k * 0.35), 0.0005));
    addInPlace(out, s, Math.pow(0.7, k) * (k === 0 ? 1 : bright));
  }
  return out;
}
/** Simple formant-ish "vocal" bark: resonator bank over a buzzy pulse. */
export function bark(dur, f0, rng, formants = [600, 1200, 2500], q = 8) {
  const src = pulse(dur, f0, 0.3);
  return resonatorBank(src, formants, q, [1, 0.6, 0.3], 0);
}
