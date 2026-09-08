// HOSTILE ORBIT - SFX sound designers.
// Every designer renders a mono Float32Array at 44100 Hz. The generator normalizes, trims and
// decides the output format (see generate-audio.mjs). Loops must return EXACTLY D.samples(dur) samples
// and be seamless (use loopRender or circular).
import * as D from './dsp.js';

const S = D.samples;
const { mix, sine, saw, square, tri, pulse, fm, noise, white, pink, brown, crackle, expDecay, adsr, env, applyEnv,
  lowpass, highpass, bandpass, notch, ladder, softClip, hardClip, bitcrush, reverb, delay, chorus, thump, noiseBurst,
  click, metallicRing, expSweep, geoSweep, linSweep, breakpoints, geoBreakpoints, lfo, comb, resonatorBank, addInPlace,
  gain, pad, padTo, concat, silence, fadeIn, fadeOut, loopCrossfade, normalize, foldback, superSaw, transient,
  peakEq, onePole, noteToFreq: nf } = D;

// Per-category loudness trims written into manifest "gain" (files themselves are normalized to -1 dBFS).
export const CATEGORY_GAIN = {
  ui: 0.55, weapon: 0.9, foley: 0.6, explosion: 1.0, orbital: 0.9, impact: 0.7, gore: 0.7, movement: 0.45,
  player: 0.7, enemy_weapon: 0.8, enemy: 0.7, boss: 0.9, env: 0.5, ambience: 0.35, stinger: 0.8, alarm: 0.6,
};

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
/** Sum layers, each [buf, gain, atSec]. */
const stack = (layers, minDur) => mix(layers, { minDur });
/** Copy normalized to peak 1 (silent buffers returned as-is). */
function unit(buf) { const p = D.peak(buf); if (p < 1e-9) return buf; return gain(buf, 1 / p); }
/** Like stack, but every layer is peak-normalized first so the level numbers are meaningful mix ratios. */
const stackN = (layers, minDur) => mix(layers.filter(Boolean).map((l) => [unit(l[0]), l[1] ?? 1, l[2] ?? 0]), { minDur });

/** Render a seamless loop of exactly `dur` seconds: fn(renderDur) renders dur + xfade, then crossfade. */
function loopRender(dur, xfade, fn) {
  const b = fn(dur + xfade);
  const out = loopCrossfade(D.fitSamples(b, S(dur + xfade)), xfade);
  return D.fitSamples(out, S(dur));
}
/** Circular (wrap-around) placement of event buffers into a loop of `dur` seconds. events: [buf, gain, atSec]. */
function circular(dur, events) {
  const n = S(dur), out = new Float32Array(n);
  for (const [buf, g = 1, at = 0] of events) {
    const start = S(at) % n;
    for (let i = 0; i < buf.length; i++) out[(start + i) % n] += buf[i] * g;
  }
  return out;
}
/** Render 2x the loop and keep the second half: filters/LFO state are in steady state at the seam
 *  (content must be periodic in dur: integer LFO / oscillator cycles). */
function steadyLoop(dur, fn) {
  const b = fn(2 * dur);
  return D.fitSamples(b.slice(b.length - S(dur)), S(dur));
}
/** Fold everything beyond dur back onto the start (wrap effect tails) -> exactly dur. */
function wrapTail(buf, dur) {
  const n = S(dur), out = new Float32Array(n);
  for (let i = 0; i < buf.length; i++) out[i % n] += buf[i];
  return out;
}
/** Sin^2 hump envelope: rises to 1 at `peakAt` fraction of dur then falls. */
function hump(dur, peakAt = 0.5, power = 1) {
  const n = S(dur), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const v = x < peakAt ? x / peakAt : 1 - (x - peakAt) / (1 - peakAt);
    out[i] = Math.pow(Math.sin(v * Math.PI / 2), power);
  }
  return out;
}
/** Small room / space tail on a mono buffer. */
function space(buf, o = {}) {
  return reverb(buf, { room: 0.5, damp: 0.5, wet: 0.25, dry: 1, tail: 0.3, hpf: 150, ...o });
}
/** Noise whoosh through a sweeping bandpass. points: [[t, hz], ...]; q; color. */
function whoosh(rng, dur, points, { q = 1.2, color = 'white', peakAt = 0.5, power = 1.5 } = {}) {
  let n = noise(dur, rng, color);
  n = bandpass(n, geoBreakpoints(points), q);
  applyEnv(n, hump(dur, peakAt, power));
  return n;
}
/** FM zap: falling carrier and index. */
function zap(dur, f0, f1, { ratio = 2.0, idx0 = 8, idx1 = 0.5, tau = dur / 3, pitchTau = dur / 4, phase = 0 } = {}) {
  const b = fm(dur, expSweep(f0, f1, pitchTau), 0, expSweep(idx0, idx1, tau), { ratio, phase });
  return applyEnv(b, expDecay(dur, tau, 0.0005));
}
/** Metallic clank: ring + click + little thump. */
function clank(rng, freq, dur = 0.25, { ring = 1, thumpAmt = 0.5, clickAmt = 0.8, partials = 6, bright = 1 } = {}) {
  return stackN([
    [metallicRing(dur, freq, rng, { partials, tau: dur / 4, bright }), ring],
    [click(rng, 0.003, 2500), clickAmt],
    [thump(0.12, 220 * (freq / 1500) ** 0.3, 90, 0.01, 0.025), thumpAmt],
    [noiseBurst(0.04, rng, { hp: 800, lp: 9000, tau: 0.006 }), 0.5],
  ]);
}
/** Servo whine: saw sweep, lowpassed, slight buzz. */
function servo(dur, f0, f1, { lp = 2200, res = 0.3, amp = 1 } = {}) {
  const f = geoSweep(f0, f1, dur);
  let s = saw(dur, f);
  s = ladder(s, (t) => lp * (1 + 0.15 * Math.sin(D.TAU * 7 * t)), res);
  applyEnv(s, hump(dur, 0.3, 0.6));
  return gain(s, amp);
}
/** Neon UI blip: sine (with slight FM) + bandpassed noise + tiny delay. */
function blip(rng, freq, dur, { noiseAmt = 0.25, fmIdx = 0.6, ratio = 2, dly = 0.028, dlyMix = 0.25, tau = dur / 3, attack = 0.001, slide = 1 } = {}) {
  const f = slide === 1 ? freq : geoSweep(freq, freq * slide, dur);
  const tone = fm(dur, f, 0, fmIdx, { ratio });
  applyEnv(tone, expDecay(dur, tau, attack));
  const nz = noiseBurst(Math.min(dur, 0.03), rng, { bp: freq * 1.5, q: 2, tau: 0.006 });
  let out = stackN([[tone, 1], [nz, noiseAmt]]);
  if (dly > 0) out = delay(out, dly, 0.3, dlyMix, { tail: dly * 3, damp: 8000 });
  return out;
}
/** Simple stereo-less "bell" tone: sine + partials + FM shimmer. */
function bell(freq, dur, { tau = dur / 3, shimmer = 0.4 } = {}) {
  const a = sine(dur, freq); applyEnv(a, expDecay(dur, tau, 0.002));
  const b = sine(dur, freq * 2.01); applyEnv(b, expDecay(dur, tau * 0.5, 0.002));
  const c = fm(dur, freq, 0, 1.2, { ratio: 3.5 }); applyEnv(c, expDecay(dur, tau * 0.3, 0.001));
  return stack([[a, 1], [b, 0.35], [c, shimmer]]);
}
/** Formant "bark"/vocal-ish tone. f0 accepts fn(t). */
function voiceBark(dur, f0, rng, { formants = [520, 1100, 2400], q = 7, gains = [1, 0.55, 0.25], breath = 0.15 } = {}) {
  const src = pulse(dur, f0, 0.25);
  let out = resonatorBank(src, formants, q, gains, 0);
  if (breath > 0) addInPlace(out, bandpass(noise(dur, rng), formants[1], 2), breath);
  return out;
}

// ---------------------------------------------------------------------------
// Core designers
// ---------------------------------------------------------------------------
/**
 * Layered gunshot: sub thump + mid crack + low-mid body + click + snap + room tail + distortion.
 */
function gunshot(rng, p = {}) {
  const {
    dur = 0.35, sub = 70, subTau = 0.05, subLevel = 0.5, crack = 2800, crackQ = 1.0, crackTau = 0.02, crackLevel = 1.7,
    body = 400, bodyTau = 0.045, bodyLevel = 1.1, clickLevel = 0.9, snapLevel = 0.9, drive = 1.6, room = 0.45,
    wet = 0.3, tail = 0.25, mech = 0, mechAt = 0.05, zapLevel = 0, zapF = 1400, zapRatio = 2.4, punch = 0.4,
    lowBoom = 0, pitch = 1, midCrack = 1.0,
  } = p;
  const pj = pitch * rng.semis(0.8);
  const subB = thump(dur, sub * 2.2 * pj, sub * pj, 0.012, subTau * rng.jitter(1, 0.15), { drive: 2.5 });
  const crackB = noiseBurst(dur, rng, { bp: crack * rng.jitter(1, 0.12), q: crackQ, tau: crackTau * rng.jitter(1, 0.15), attack: 0.0003 });
  const hiCrack = noiseBurst(0.06, rng, { hp: 3500, lp: 14000, tau: 0.006 });
  const bodyB = softClip(noiseBurst(dur, rng, { color: 'pink', bp: body * rng.jitter(1, 0.1), q: 1.1, tau: bodyTau }), 3);
  const clk = click(rng, 0.003, 3000);
  const snap = sine(0.012, expSweep(3000, 200, 0.003)); applyEnv(snap, expDecay(0.012, 0.003));
  const midB = softClip(noiseBurst(0.12, rng, { bp: 1300 * rng.jitter(1, 0.1), q: 1.4, tau: 0.018, attack: 0.0003 }), 2);
  const layers = [
    [subB, subLevel], [crackB, crackLevel], [hiCrack, 0.9 * crackLevel], [bodyB, bodyLevel], [midB, midCrack], [clk, clickLevel * rng.jitter(1, 0.3)], [snap, snapLevel],
  ];
  if (lowBoom > 0) {
    const boom = softClip(noiseBurst(dur, rng, { color: 'brown', lp: 180, tau: dur / 3 }), 4);
    layers.push([boom, lowBoom]);
  }
  if (zapLevel > 0) layers.push([zap(0.12, zapF * rng.jitter(1, 0.1), zapF * 0.3, { ratio: zapRatio, idx0: 7, idx1: 0.5, tau: 0.03 }), zapLevel]);
  if (mech > 0) {
    // bolt/action tick after the shot
    const m = stack([[click(rng, 0.004, 1800), 1], [metallicRing(0.08, 2400 * rng.jitter(1, 0.1), rng, { partials: 4, tau: 0.015 }), 0.6]]);
    layers.push([m, mech, mechAt * rng.jitter(1, 0.2)]);
  }
  let dry = stackN(layers);
  dry = transient(dry, punch, 1, 25);
  dry = softClip(gain(dry, 0.6), drive);
  const roomTail = reverb(stackN([[crackB, 1], [bodyB, 0.7], [midB, 0.7]]), { room, damp: 0.55, wet: 1, dry: 0, tail, hpf: 200, lpf: 6000 });
  let out = stack([[dry, 1], [roomTail, wet]]);
  out = highpass(out, 32, 0.7);
  return out;
}

/** Layered explosion. size 0..1 controls low end and length. */
function explosion(rng, { size = 0.6, dur = 1.6, drive = 2.5, crackleAmt = 0.6, room = 0.8, wet = 0.35, tail = 0.8, zapAmt = 0, pitch = 1 } = {}) {
  const pj = pitch * rng.semis(1);
  const subDur = dur * 0.8;
  const sub = thump(subDur, (95 - 40 * size) * pj, (30 - 5 * size) * pj, 0.06 + 0.12 * size, 0.12 + 0.35 * size, { drive: 3 });
  let burst = noise(dur, rng, 'white');
  burst = lowpass(burst, expSweep(7000 + 3000 * size, 220, 0.14 + 0.4 * size), 0.9);
  applyEnv(burst, expDecay(dur, 0.09 + 0.3 * size, 0.001));
  let lowmid = saw(dur * 0.5, expSweep(140 * pj, 45 * pj, 0.1));
  lowmid = ladder(lowmid, expSweep(1800, 120, 0.15), 0.5, { drive: 2 });
  applyEnv(lowmid, expDecay(dur * 0.5, 0.09 + 0.1 * size, 0.002));
  lowmid = softClip(lowmid, 4);
  let deb = crackle(dur, rng, 140 + 200 * size, 0.003);
  deb = bandpass(deb, (t) => 2200 - 1200 * Math.min(1, t / dur), 0.9);
  applyEnv(deb, (t) => (t < 0.05 ? 0 : Math.exp(-(t - 0.05) / (0.25 + 0.5 * size))));
  let rumble = brown(dur, rng); rumble = lowpass(rumble, 160, 0.8); applyEnv(rumble, expDecay(dur, 0.2 + 0.5 * size, 0.01));
  const clk = click(rng, 0.004, 1500);
  const crackB = softClip(noiseBurst(0.25, rng, { bp: 1400, q: 1.0, tau: 0.035, attack: 0.0005 }), 2);
  const layers = [[sub, 0.5], [burst, 1.5], [lowmid, 0.8], [deb, crackleAmt * 1.6], [rumble, 0.25 * size + 0.1], [clk, 0.6], [crackB, 1.2]];
  if (zapAmt > 0) layers.push([zap(0.3, 2600, 300, { ratio: 1.41, idx0: 12, idx1: 1, tau: 0.08 }), zapAmt]);
  let dry = stackN(layers);
  dry = softClip(gain(dry, 0.55), drive);
  const verb = reverb(stackN([[burst, 1], [lowmid, 0.5], [deb, 0.5]]), { room, damp: 0.5, wet: 1, dry: 0, tail, hpf: 120, lpf: 5000 });
  let out = stack([[dry, 1], [verb, wet]]);
  return highpass(out, 25, 0.7);
}

/** Wet flesh impact. */
function fleshHit(rng, { dur = 0.28, low = 140, squelch = 0.6, thud = 1, drive = 1.5 } = {}) {
  const pj = rng.semis(1.5);
  const t = thump(dur, low * pj, low * 0.4 * pj, 0.015, 0.045, { drive: 2 });
  const body = noiseBurst(dur, rng, { color: 'pink', bp: 260 * pj, q: 1.0, tau: 0.04 });
  const wobbleF = 900 + 300 * rng();
  let sq = noise(dur * 0.7, rng);
  sq = bandpass(sq, (tt) => wobbleF + 700 * Math.sin(D.TAU * (55 + 30 * rng()) * tt) * Math.exp(-tt / 0.06), 1.6);
  sq = lowpass(sq, 3200);
  applyEnv(sq, expDecay(dur * 0.7, 0.05, 0.002));
  const slap = noiseBurst(0.02, rng, { bp: 1500, q: 1, tau: 0.004 });
  const smack = noiseBurst(0.05, rng, { bp: 800 * pj, q: 1.2, tau: 0.012 });
  let out = stackN([[t, thud * 0.55], [body, 1.0], [sq, squelch * 1.1], [slap, 0.7], [smack, 0.8]]);
  out = softClip(gain(out, 0.5), drive);
  return space(out, { room: 0.3, wet: 0.12, tail: 0.15 });
}

/** Ground/dirt impact. */
function dirtHit(rng, { dur = 0.3, size = 0.5 } = {}) {
  const pj = rng.semis(1.5);
  const burst = noiseBurst(dur, rng, { lp: 900 * pj, hp: 80, q: 0.9, tau: 0.035 + 0.02 * size });
  const puff = noiseBurst(dur, rng, { color: 'pink', lp: 500, hp: 60, tau: 0.08 + 0.06 * size, attack: 0.004 });
  const th = thump(dur, 110 * pj, 55 * pj, 0.02, 0.05 + 0.05 * size, { drive: 1.5 });
  let grit = crackle(dur, rng, 250, 0.002); grit = bandpass(grit, 2600, 1.2); applyEnv(grit, expDecay(dur, 0.06, 0.005));
  let out = stackN([[burst, 1.0], [puff, 0.5], [th, 0.4 * (0.5 + size)], [grit, 0.4]]);
  return softClip(gain(out, 0.6), 1.4);
}

/** Metallic impact (armor / metal surface). */
function metalHit(rng, { dur = 0.35, freq = 1800, sparks = 0.4, thumpAmt = 0.6, bright = 1, partials = 6 } = {}) {
  const f = freq * rng.semis(2);
  const ring = metallicRing(dur, f, rng, { partials, tau: dur / 3.5, bright });
  const res = resonatorBank(click(rng, 0.004, 600), [f * 0.43, f * 0.71, f * 1.31, f * 2.2], 30, [1, 0.8, 0.5, 0.3], dur * 0.7);
  const th = thump(0.15, 220 * rng.semis(2), 95, 0.01, 0.03, { drive: 1.5 });
  let sp = crackle(0.15, rng, 500, 0.0015); sp = highpass(sp, 3500); applyEnv(sp, expDecay(0.15, 0.04, 0.002));
  const burst = noiseBurst(0.05, rng, { hp: 1200, lp: 12000, tau: 0.008 });
  let out = stackN([[ring, 1], [res, 0.6], [th, thumpAmt * 0.7], [sp, sparks], [burst, 0.6], [click(rng, 0.003, 3000), 0.6]]);
  out = softClip(gain(out, 0.5), 1.4);
  return space(out, { room: 0.4, wet: 0.18, tail: 0.2 });
}

/** Rock / concrete hit. */
function rockHit(rng, { dur = 0.26 } = {}) {
  const pj = rng.semis(2);
  const crack = noiseBurst(dur, rng, { bp: 1100 * pj, q: 1.4, tau: 0.02 });
  const body = noiseBurst(dur, rng, { color: 'pink', lp: 700, hp: 120, tau: 0.04 });
  const th = thump(0.2, 120 * pj, 60, 0.015, 0.04, { drive: 1.5 });
  let deb = crackle(dur, rng, 300, 0.002); deb = bandpass(deb, 1800, 1.2); applyEnv(deb, (t) => t < 0.01 ? 0 : Math.exp(-(t - 0.01) / 0.07));
  let out = stackN([[crack, 1], [body, 0.7], [th, 0.5], [deb, 0.45], [click(rng, 0.003, 2000), 0.5]]);
  return softClip(gain(out, 0.6), 1.5);
}

/** Wet splatter. */
function splat(rng, { dur = 0.4, size = 0.5, drops = 5 } = {}) {
  let sp = crackle(dur, rng, 1200 + 1500 * size, 0.0015);
  sp = bandpass(sp, (t) => 1600 - 900 * Math.min(1, t / dur) + 300 * Math.sin(D.TAU * 40 * t), 1.1);
  applyEnv(sp, expDecay(dur, 0.06 + 0.06 * size, 0.002));
  const body = noiseBurst(dur, rng, { color: 'pink', lp: 1400, hp: 150, tau: 0.05 + 0.04 * size, attack: 0.002 });
  const th = thump(0.2, 130, 60, 0.015, 0.035, { drive: 1.5 });
  const layers = [[sp, 1.2], [body, 0.9], [th, 0.2 + 0.25 * size]];
  for (let k = 0; k < drops; k++) {
    const f = rng.range(500, 1400);
    const d = sine(0.02, expSweep(f * 1.6, f, 0.006)); applyEnv(d, expDecay(0.02, 0.005, 0.001));
    layers.push([d, 0.25, rng.range(0.04, dur * 0.8)]);
  }
  let out = stackN(layers);
  out = softClip(gain(out, 0.6), 1.4);
  return lowpass(out, 6500);
}

/** Footstep. surface 'dirt' | 'metal'. */
function footstep(rng, surface, { size = 1 } = {}) {
  const pj = rng.semis(2);
  if (surface === 'dirt') {
    const heel = noiseBurst(0.12, rng, { lp: 1300 * pj, hp: 90, q: 0.9, tau: 0.022 });
    const toe = noiseBurst(0.1, rng, { lp: 1900 * pj, hp: 150, q: 0.9, tau: 0.015 });
    let grit = crackle(0.16, rng, 350, 0.0015); grit = bandpass(grit, 3200, 1.0); applyEnv(grit, expDecay(0.16, 0.05, 0.003));
    const th = thump(0.12, 75 * pj, 45, 0.01, 0.03);
    let out = stackN([[heel, 1.0], [toe, 0.6, rng.range(0.05, 0.08)], [grit, 0.4], [th, 0.25 * size]]);
    return softClip(gain(out, 0.7), 1.3);
  }
  // metal: click + hollow plate resonance + small ring
  const exc = noiseBurst(0.03, rng, { hp: 300, lp: 6000, tau: 0.006 });
  const hollow = comb(exc, rng.range(120, 190), 0.9, 0.55, 0.3);
  const ring = metallicRing(0.25, rng.range(700, 1100), rng, { partials: 4, tau: 0.05, bright: 0.6 });
  const plate = lowpass(noiseBurst(0.2, rng, { color: 'pink', hp: 100, lp: 2500, tau: 0.03 }), 3000);
  const th = thump(0.12, 95 * pj, 50, 0.01, 0.03);
  let out = stackN([[exc, 0.8], [hollow, 0.9], [ring, 0.35], [plate, 0.6], [th, 0.25 * size], [click(rng, 0.003, 2500), 0.4]]);
  return softClip(gain(out, 0.6), 1.3);
}

/** Cloth / armor rustle. */
function rustle(rng, dur = 0.2, { plates = 2, level = 1 } = {}) {
  let n = pink(dur, rng); n = bandpass(n, rng.range(600, 1100), 0.7); n = lowpass(n, 3500);
  applyEnv(n, hump(dur, rng.range(0.2, 0.5), 1.2));
  const layers = [[n, level]];
  for (let k = 0; k < plates; k++) layers.push([metallicRing(0.05, rng.range(1800, 3200), rng, { partials: 3, tau: 0.008 }), 0.25, rng.range(0.01, dur * 0.8)]);
  return stack(layers);
}

/** Electric spark burst. */
function sparks(rng, dur, density = 300, { hp = 3000, zaps = 2 } = {}) {
  let sp = crackle(dur, rng, density, 0.0012); sp = highpass(sp, hp);
  const layers = [[sp, 1]];
  for (let k = 0; k < zaps; k++) layers.push([zap(0.05, rng.range(2000, 5000), 600, { ratio: 1.7, idx0: 10, tau: 0.012 }), 0.4, rng.range(0, dur * 0.8)]);
  return stack(layers);
}

/** Heartbeat lub-dub (mono, dur seconds, loopable via circular). */
function heartbeat(rng, dur = 1.0) {
  const lub = thump(0.25, 70, 42, 0.03, 0.06, { drive: 2 });
  const dub = thump(0.2, 62, 40, 0.025, 0.045, { drive: 2 });
  let out = circular(dur, [[lub, 1, 0], [dub, 0.7, 0.19]]);
  return lowpass(out, 220, 0.8);
}

/** Engine thrum generator used by gunship / dropship. freqFn(t) hz multiplier curve; returns buffer of dur. */
function engine(rng, dur, { base = 95, freqFn = () => 1, rotorHz = 22, whine = 1800, whineFn = null, lp = 1400, lpFn = null, rough = 0.5 } = {}) {
  const f = (t) => base * freqFn(t);
  let core = stack([[saw(dur, f), 0.6], [pulse(dur, (t) => f(t) * 0.5, 0.3), 0.5], [sine(dur, (t) => f(t) * 0.5), 0.8]]);
  core = lowpass(core, lpFn || lp, 0.9);
  // rotor chop: amplitude modulation
  applyEnv(core, (t) => 0.65 + 0.35 * Math.max(0, Math.sin(D.TAU * rotorHz * freqFn(t) * t)) ** 2);
  let wh = saw(dur, (t) => (whineFn ? whineFn(t) : whine) * freqFn(t));
  wh = bandpass(wh, (t) => (whineFn ? whineFn(t) : whine) * freqFn(t) * 1.02, 4);
  let rumble = brown(dur, rng); rumble = lowpass(rumble, 220);
  let mid = noise(dur, rng, 'pink'); mid = bandpass(mid, (t) => 700 * freqFn(t), 1.2);
  applyEnv(mid, (t) => 0.7 + 0.3 * Math.sin(D.TAU * rotorHz * freqFn(t) * t));
  let out = stack([[core, 1], [wh, 0.22], [rumble, 0.9], [mid, 0.45 * rough]]);
  return softClip(gain(out, 0.45), 1.8);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// Each entry: { cat, variants?, loop?, dur? (loops), render(rng, variantIndex) }
export const SFX = {};
const def = (name, cat, render, opts = {}) => { SFX[name] = { cat, variants: 1, loop: false, ...opts, render }; };

// ---------------------------- UI ------------------------------------------------
def('ui_hover', 'ui', (r) => blip(r, 1900, 0.06, { noiseAmt: 0.2, fmIdx: 0.4, dly: 0.02, dlyMix: 0.15 }));
def('ui_click', 'ui', (r) => stack([
  [click(r, 0.003, 3500), 0.9],
  [blip(r, 2600, 0.05, { noiseAmt: 0.3, slide: 0.85, tau: 0.012 }), 1],
  [blip(r, 3300, 0.035, { noiseAmt: 0.2, tau: 0.008, dly: 0 }), 0.5, 0.012],
]));
def('ui_back', 'ui', (r) => stack([[blip(r, 1700, 0.11, { slide: 0.55, tau: 0.035, noiseAmt: 0.25 }), 1], [click(r, 0.003, 2500), 0.5]]));
def('ui_confirm', 'ui', (r) => {
  const notes = [nf('D5'), nf('A5'), nf('D6')];
  const layers = notes.map((f, k) => [blip(r, f, 0.16, { tau: 0.05, fmIdx: 0.8, dly: 0 }), 0.8 + 0.1 * k, k * 0.055]);
  let out = stack(layers);
  out = delay(out, 0.09, 0.35, 0.3, { tail: 0.35, damp: 7000 });
  return out;
});
def('ui_deploy', 'ui', (r) => {
  const hitAt = 0.26;
  const pre = whoosh(r, hitAt + 0.02, [[0, 250], [hitAt, 3500]], { q: 1.5, peakAt: 0.92, power: 2 });
  const th = thump(0.5, 150, 42, 0.03, 0.12, { drive: 3 });
  const imp = softClip(noiseBurst(0.3, r, { bp: 900, q: 1.0, tau: 0.05 }), 2);
  const crack = noiseBurst(0.1, r, { hp: 2000, lp: 12000, tau: 0.012 });
  let neon = saw(0.45, nf('D3')); neon = ladder(neon, expSweep(6000, 250, 0.12), 0.65); applyEnv(neon, expDecay(0.45, 0.12, 0.002));
  const shimmer = zap(0.4, 2400, 900, { ratio: 1.5, idx0: 4, idx1: 1, tau: 0.12 });
  let hit = stackN([[th, 0.45], [imp, 1.0], [crack, 0.9], [neon, 0.9], [shimmer, 0.45], [click(r, 0.004, 2000), 0.8]]);
  hit = transient(hit, 0.4);
  hit = reverb(hit, { room: 0.6, damp: 0.4, wet: 0.35, dry: 1, tail: 0.5, hpf: 120 });
  return stack([[pre, 0.5], [hit, 1, hitAt]]);
});
def('ui_error', 'ui', (r) => {
  const one = (at) => {
    let a = stack([[square(0.09, 220), 1], [square(0.09, 233), 0.8], [saw(0.09, 110), 0.4]]);
    a = lowpass(a, 1500, 1.5); applyEnv(a, adsr(0.09, 0.003, 0.02, 0.8, 0.03));
    return [a, 1, at];
  };
  return stack([one(0), one(0.13), [click(r, 0.003, 2000), 0.3]]);
});
def('ui_tab', 'ui', (r) => stack([[click(r, 0.003, 3000), 0.8], [blip(r, 3100, 0.03, { tau: 0.007, noiseAmt: 0.3, dly: 0.015, dlyMix: 0.2 }), 0.9]]));
def('ui_type', 'ui', (r) => stack([[click(r, 0.004, 3500), 1], [blip(r, 5200, 0.014, { tau: 0.003, dly: 0, noiseAmt: 0.4 }), 0.6]]));
def('ui_slider_tick', 'ui', (r) => stack([[click(r, 0.002, 4000), 0.7], [blip(r, 2800, 0.02, { tau: 0.005, dly: 0, noiseAmt: 0.3 }), 1]]));

// ---------------------------- Player weapons -----------------------------------
def('viper_fire', 'weapon', (r) => gunshot(r, { dur: 0.36, sub: 70, subTau: 0.045, crack: 2800, body: 420, drive: 1.7, mech: 0.35, mechAt: 0.055, punch: 0.5 }), { variants: 4 });
def('hammer_fire', 'weapon', (r) => gunshot(r, { dur: 0.72, sub: 52, subTau: 0.11, subLevel: 0.5, crack: 1500, crackQ: 0.7, crackTau: 0.035, crackLevel: 2.0, body: 240, bodyTau: 0.09, bodyLevel: 1.5, drive: 2.6, room: 0.7, wet: 0.45, tail: 0.5, lowBoom: 0.4, punch: 0.6, clickLevel: 0.9, midCrack: 1.4 }), { variants: 3 });
def('atlas_fire', 'weapon', (r) => gunshot(r, { dur: 0.42, sub: 58, subTau: 0.07, subLevel: 0.65, crack: 2100, crackQ: 0.9, crackTau: 0.025, crackLevel: 1.8, body: 300, bodyTau: 0.06, bodyLevel: 1.4, drive: 2.1, lowBoom: 0.15, mech: 0.3, mechAt: 0.045, punch: 0.5, midCrack: 1.2 }), { variants: 4 });
def('pistol_fire', 'weapon', (r) => gunshot(r, { dur: 0.3, sub: 92, subTau: 0.03, subLevel: 0.45, crack: 3600, crackQ: 1.2, crackTau: 0.015, crackLevel: 1.8, body: 520, bodyTau: 0.035, bodyLevel: 1.0, drive: 1.5, clickLevel: 1.0, snapLevel: 1.0, mech: 0.3, mechAt: 0.04, room: 0.4, wet: 0.25, midCrack: 1.1 }), { variants: 3 });
def('dry_fire', 'foley', (r) => stack([
  [click(r, 0.004, 2500), 1], [metallicRing(0.08, 2600, r, { partials: 4, tau: 0.015 }), 0.5],
  [sine(0.05, expSweep(1200, 700, 0.01)), 0.35], [click(r, 0.003, 1500), 0.6, 0.03],
]));
def('reload_mag_out', 'foley', (r) => {
  const latch = click(r, 0.004, 2000);
  const ring = metallicRing(0.1, 2900, r, { partials: 4, tau: 0.02 });
  let scrape = noise(0.09, r); scrape = bandpass(scrape, geoSweep(1500, 2600, 0.09), 3); applyEnv(scrape, hump(0.09, 0.4));
  const clack = stack([[noiseBurst(0.04, r, { bp: 650, q: 1.2, tau: 0.008 }), 1], [thump(0.06, 210, 110, 0.008, 0.015), 0.6]]);
  return stack([[latch, 1], [ring, 0.5], [scrape, 0.45, 0.03], [clack, 0.9, 0.12]]);
});
def('reload_mag_in', 'foley', (r) => {
  let scrape = noise(0.1, r); scrape = bandpass(scrape, geoSweep(2400, 1300, 0.1), 3); applyEnv(scrape, hump(0.1, 0.6));
  const seat = stack([[thump(0.12, 230, 85, 0.01, 0.03, { drive: 2 }), 1], [noiseBurst(0.06, r, { bp: 900, q: 1, tau: 0.01 }), 0.9], [click(r, 0.004, 1500), 0.8]]);
  const ring = metallicRing(0.15, 2200, r, { partials: 5, tau: 0.03 });
  return stack([[scrape, 0.5], [seat, 1, 0.1], [ring, 0.45, 0.1]]);
});
def('reload_bolt', 'foley', (r) => {
  const pullC = clank(r, 1500, 0.15, { thumpAmt: 0.3 });
  const spring = sine(0.08, expSweep(420, 300, 0.03)); applyEnv(spring, expDecay(0.08, 0.025));
  const rel = stack([[clank(r, 1100, 0.2, { thumpAmt: 0.9, partials: 5 }), 1], [noiseBurst(0.05, r, { bp: 700, q: 1, tau: 0.01 }), 0.8]]);
  return stack([[pullC, 0.8], [spring, 0.4, 0.05], [rel, 1, 0.16]]);
});
def('reload_shotgun_shell', 'foley', (r) => stack([
  [click(r, 0.004, 3000), 0.8],
  [noiseBurst(0.05, r, { bp: 1200 * r.semis(2), q: 1.2, tau: 0.01 }), 0.9],
  [sine(0.06, expSweep(300, 200, 0.02)), 0.5, 0.02],
  [metallicRing(0.08, 3200, r, { partials: 3, tau: 0.012 }), 0.3, 0.02],
  [noiseBurst(0.05, r, { bp: 500, q: 1.5, tau: 0.012 }), 0.7, 0.06],
]), { variants: 3 });
def('reload_lmg_box', 'foley', (r) => {
  const clunk = stack([[thump(0.2, 160, 70, 0.015, 0.04, { drive: 2 }), 1], [noiseBurst(0.08, r, { bp: 420, q: 1, tau: 0.02 }), 0.8]]);
  const latch = clank(r, 1900, 0.15, { thumpAmt: 0.3 });
  let belt = crackle(0.28, r, 220, 0.002); belt = bandpass(belt, 2600, 1.5); applyEnv(belt, hump(0.28, 0.4, 0.8));
  const belt2 = metallicRing(0.1, 3400, r, { partials: 3, tau: 0.015 });
  const slam = stack([[thump(0.25, 140, 60, 0.015, 0.05, { drive: 2 }), 1], [clank(r, 1300, 0.25, { thumpAmt: 0.5 }), 0.9]]);
  return stack([[clunk, 1], [latch, 0.7, 0.14], [belt, 0.5, 0.26], [belt2, 0.3, 0.36], [slam, 1, 0.58]]);
});
def('shell_drop', 'foley', (r) => {
  const f = r.range(3400, 5600);
  const ting = (g, d) => [metallicRing(0.12, f * r.jitter(1, 0.03), r, { partials: 4, tau: 0.03, bright: 1.2 }), g, d];
  let roll = crackle(0.15, r, 200, 0.001); roll = highpass(roll, 3000); applyEnv(roll, expDecay(0.15, 0.05));
  return stack([ting(1, 0), ting(0.55, r.range(0.05, 0.08)), ting(0.3, r.range(0.1, 0.14)), [roll, 0.2, 0.12]]);
}, { variants: 4 });
def('weapon_swap', 'foley', (r) => stack([[rustle(r, 0.18, { plates: 1 }), 0.8], [clank(r, 2000, 0.12, { thumpAmt: 0.2 }), 0.6, 0.07], [clank(r, 1300, 0.2, { thumpAmt: 0.6 }), 0.9, 0.16]]));
def('weapon_pickup', 'foley', (r) => stack([
  [clank(r, 1600, 0.15, { thumpAmt: 0.4 }), 0.8], [rustle(r, 0.15, { plates: 0 }), 0.5, 0.02],
  [blip(r, 700, 0.14, { slide: 1.8, tau: 0.05, fmIdx: 1.0, dly: 0.04 }), 0.6, 0.1],
]));

// ---------------------------- Grenades / explosions -----------------------------
def('grenade_pin', 'foley', (r) => stack([[metallicRing(0.2, 3300, r, { partials: 5, tau: 0.05, bright: 1.1 }), 1], [click(r, 0.003, 2500), 0.7], [noiseBurst(0.04, r, { bp: 2500, q: 2, tau: 0.01 }), 0.4, 0.01]]));
def('grenade_throw', 'foley', (r) => stack([[whoosh(r, 0.38, [[0, 350], [0.15, 2400], [0.38, 700]], { q: 1.3, peakAt: 0.4 }), 1], [rustle(r, 0.2, { plates: 0 }), 0.5]]));
def('grenade_bounce', 'foley', (r, i) => {
  const f = i === 0 ? 950 : 650;
  let roll = crackle(0.2, r, 150, 0.0015); roll = bandpass(roll, 2000, 1); applyEnv(roll, expDecay(0.2, 0.06));
  return stack([[clank(r, f, 0.3, { thumpAmt: 0.9, partials: 5, bright: i === 0 ? 1 : 0.6 }), 1], [dirtHit(r, { dur: 0.15, size: 0.2 }), 0.4], [roll, 0.3, 0.05]]);
}, { variants: 2 });
def('explosion_small', 'explosion', (r) => explosion(r, { size: 0.35, dur: 1.0, drive: 2.2, tail: 0.5 }), { variants: 3 });
def('explosion_medium', 'explosion', (r) => explosion(r, { size: 0.6, dur: 1.6, drive: 2.5 }), { variants: 3 });
def('explosion_large', 'explosion', (r) => explosion(r, { size: 0.85, dur: 2.4, drive: 2.8, tail: 1.0, room: 0.85 }), { variants: 2 });
def('explosion_huge', 'explosion', (r) => {
  const ex = explosion(r, { size: 1.0, dur: 3.5, drive: 3.0, tail: 1.4, room: 0.9, wet: 0.4 });
  const sub2 = thump(3.0, 42, 26, 0.3, 0.9, { drive: 3 });
  const shock = whoosh(r, 0.5, [[0, 200], [0.5, 4000]], { q: 1, peakAt: 0.95, power: 3 });
  return stack([[ex, 1], [sub2, 0.6], [shock, 0.4, 0.08]]);
});
def('debris_fall', 'foley', (r) => {
  const dur = 1.3;
  let deb = crackle(dur, r, 120, 0.003); deb = bandpass(deb, (t) => 1500 - 700 * t / dur, 1); applyEnv(deb, (t) => Math.min(1, t / 0.15) * Math.exp(-t / 0.5));
  const layers = [[deb, 1]];
  for (let k = 0; k < 7; k++) layers.push([rockHit(r, { dur: 0.15 }), r.range(0.2, 0.6), r.range(0.05, dur - 0.2)]);
  return space(stack(layers), { room: 0.5, wet: 0.2, tail: 0.3 });
}, { variants: 2 });

// ---------------------------- Orbital ------------------------------------------
def('kinetic_charge', 'orbital', (r) => {
  const dur = 2.5;
  const pitch = geoSweep(nf('D2'), nf('D4'), dur);
  let s = superSaw(dur, pitch, 5, 10, r);
  s = ladder(s, geoSweep(280, 9000, dur), 0.62, { drive: 1.5 });
  const trem = (t) => 0.75 + 0.25 * Math.sin(D.TAU * (3 + 27 * (t / dur) ** 2) * t);
  applyEnv(s, (t) => trem(t) * Math.min(1, t / 0.08) * (t > dur - 0.05 ? (dur - t) / 0.05 : 1));
  let f = fm(dur, geoSweep(110, 1760, dur), 0, geoSweep(2, 9, dur), { ratio: 1.5 });
  applyEnv(f, (t) => (0.3 + 0.7 * t / dur) * Math.min(1, t / 0.1) * (t > dur - 0.05 ? (dur - t) / 0.05 : 1));
  let nz = noise(dur, r); nz = bandpass(nz, geoSweep(400, 7000, dur), 2); applyEnv(nz, (t) => (t / dur) ** 2);
  let out = stack([[s, 0.9], [f, 0.45], [nz, 0.35], [thump(0.4, 90, 40, 0.03, 0.1), 0.6]]);
  out = softClip(out, 1.5);
  out = delay(out, 0.15, 0.35, 0.3, { tail: 0.4, damp: 6000 });
  return out;
});
def('kinetic_beam', 'orbital', (r) => {
  const dur = 1.5;
  const wob = (t) => 1 + 0.02 * Math.sin(D.TAU * 12 * t);
  let core = stack([[saw(dur, (t) => 55 * wob(t)), 1], [saw(dur, (t) => 82.5 * wob(t)), 0.7], [square(dur, (t) => 110.5 * wob(t)), 0.4]]);
  core = ladder(core, (t) => 1200 + 800 * Math.sin(D.TAU * 5.5 * t), 0.7, { drive: 3 });
  core = softClip(core, 4);
  let hiss = noise(dur, r); hiss = highpass(hiss, 2000); applyEnv(hiss, (t) => 0.6 + 0.4 * Math.sin(D.TAU * 9 * t));
  let screech = fm(dur, (t) => 800 * (1 + 0.01 * Math.sin(D.TAU * 6 * t)), 0, 6, { ratio: 2.01 });
  screech = highpass(screech, 500);
  const sub = sine(dur, 41); applyEnv(sub, (t) => 0.8 + 0.2 * Math.sin(D.TAU * 8 * t));
  let out = stack([[core, 1], [hiss, 0.3], [screech, 0.3], [sub, 0.8]]);
  applyEnv(out, adsr(dur, 0.03, 0.1, 0.9, 0.35));
  out = softClip(out, 1.5);
  return reverb(out, { room: 0.6, damp: 0.5, wet: 0.2, tail: 0.4, hpf: 100 });
});
def('kinetic_impact', 'orbital', (r) => {
  const ex = explosion(r, { size: 1.0, dur: 2.6, drive: 3, tail: 1.2, room: 0.9, wet: 0.4, zapAmt: 0.6 });
  const shock = whoosh(r, 0.35, [[0, 6000], [0.35, 300]], { q: 0.8, peakAt: 0.1, power: 1 });
  const sub2 = thump(2.2, 36, 24, 0.25, 0.7, { drive: 3 });
  const ring = zap(0.8, 3200, 400, { ratio: 1.33, idx0: 10, idx1: 0.5, tau: 0.25 });
  return stack([[ex, 1], [shock, 0.6], [sub2, 0.7], [ring, 0.35]]);
});
def('gunship_pass', 'orbital', (r) => {
  const dur = 4.0;
  const dop = (t) => 1 + 0.16 * Math.tanh((1.9 - t) * 1.6);
  let e = engine(r, dur, { base: 92, freqFn: dop, rotorHz: 19, whine: 2100, lp: (t) => 500 + 2200 * Math.exp(-((t - 1.9) ** 2) / 0.9) });
  applyEnv(e, (t) => 0.06 + 0.94 * Math.exp(-((t - 1.9) ** 2) / 0.8));
  fadeIn(e, 0.2); fadeOut(e, 0.5);
  return reverb(e, { room: 0.6, damp: 0.6, wet: 0.15, tail: 0.3, hpf: 80 });
});
def('gunship_cannon', 'orbital', (r) => {
  const dur = 1.0, n = 8;
  const events = [];
  for (let k = 0; k < n; k++) events.push([gunshot(r, { dur: 0.25, sub: 58, subTau: 0.04, subLevel: 0.55, crack: 1700, crackQ: 0.8, crackLevel: 1.7, body: 260, bodyLevel: 1.4, drive: 2.2, room: 0.5, wet: 0.25, tail: 0.15, lowBoom: 0.15, midCrack: 1.2 }), 1, k * (dur / n)]);
  return softClip(gain(circular(dur, events), 0.6), 1.2);
}, { loop: true, dur: 1.0 });
def('pod_whistle', 'orbital', (r) => {
  const dur = 3.0;
  const f = (t) => geoSweep(380, 1900, dur)(t) * (1 + 0.006 * Math.sin(D.TAU * 6 * t));
  const w = sine(dur, f);
  let nz = noise(dur, r); nz = bandpass(nz, (t) => f(t) * 1.5, 9);
  let rum = brown(dur, r); rum = lowpass(rum, (t) => 100 + 400 * (t / dur) ** 2);
  const wind = whoosh(r, dur, [[0, 300], [dur, 2500]], { q: 0.9, peakAt: 0.98, power: 2.5 });
  let out = stack([[w, 0.8], [nz, 0.7], [rum, 1.0], [wind, 0.8]]);
  applyEnv(out, (t) => Math.pow(t / dur, 1.6) * 0.9 + 0.05);
  fadeIn(out, 0.05); fadeOut(out, 0.01);
  return softClip(out, 1.3);
});
def('pod_impact', 'orbital', (r) => {
  const dur = 1.8;
  const th = thump(dur, 90, 28, 0.05, 0.3, { drive: 3 });
  const ringBank = resonatorBank(noiseBurst(0.05, r, { hp: 100, lp: 4000, tau: 0.01 }), [180, 265, 410, 720, 1180], 25, [1, 0.8, 0.6, 0.4, 0.3], 1.2);
  const clang = metallicRing(1.2, 380, r, { partials: 7, tau: 0.3, bright: 0.8 });
  const burst = noiseBurst(0.5, r, { lp: 3000, hp: 80, tau: 0.08 });
  let deb = crackle(1.2, r, 200, 0.003); deb = bandpass(deb, 1400, 1); applyEnv(deb, (t) => t < 0.05 ? 0 : Math.exp(-(t - 0.05) / 0.4));
  let out = stackN([[th, 0.9], [ringBank, 0.9], [clang, 0.7], [burst, 1.0], [deb, 0.5], [click(r, 0.005, 1000), 0.6]]);
  out = softClip(gain(out, 0.5), 2.2);
  return reverb(out, { room: 0.85, damp: 0.5, wet: 0.35, tail: 0.8, hpf: 90 });
});
def('pod_door_open', 'orbital', (r) => {
  let hiss = noise(0.7, r); hiss = bandpass(hiss, geoSweep(3200, 1400, 0.7), 1.2); applyEnv(hiss, hump(0.7, 0.15, 0.8));
  const whine = servo(0.65, 900, 620, { lp: 1800, amp: 0.35 });
  const clk = stack([[thump(0.3, 120, 55, 0.02, 0.07, { drive: 2 }), 1], [clank(r, 700, 0.5, { thumpAmt: 0.6, partials: 6 }), 1], [noiseBurst(0.1, r, { lp: 2000, tau: 0.02 }), 0.6]]);
  const out = stack([[hiss, 0.9], [whine, 1, 0.02], [clk, 1, 0.68], [click(r, 0.004, 1500), 0.6]]);
  return space(out, { room: 0.6, wet: 0.25, tail: 0.4 });
});
def('turret_deploy', 'orbital', (r) => {
  const layers = [];
  let t = 0;
  for (let k = 0; k < 4; k++) {
    const f0 = r.range(280, 420);
    layers.push([servo(0.22, f0, f0 * 1.25, { lp: 2400, amp: 0.7 }), 0.8, t]);
    layers.push([clank(r, r.range(1200, 1900), 0.15, { thumpAmt: 0.5 }), 0.7, t + 0.2]);
    t += 0.27;
  }
  layers.push([clank(r, 900, 0.3, { thumpAmt: 1.0, partials: 6 }), 1.1, t + 0.05]);
  layers.push([blip(r, 1200, 0.2, { slide: 1.5, tau: 0.06, fmIdx: 1.2 }), 0.5, t + 0.15]);
  return space(stack(layers), { room: 0.4, wet: 0.15 });
});
def('turret_fire', 'enemy_weapon', (r) => gunshot(r, { dur: 0.3, sub: 75, subTau: 0.035, crack: 3000, crackQ: 1.1, body: 450, drive: 1.8, zapLevel: 0.5, zapF: 1300, zapRatio: 1.4, punch: 0.5 }), { variants: 3 });
def('orbital_unlock', 'stinger', (r) => {
  const dur = 2.0;
  const notes = [['D4', 0], ['A4', 0.1], ['D5', 0.2], ['F5', 0.3], ['A5', 0.4]];
  const layers = [];
  for (const [nm, at] of notes) {
    let s = superSaw(1.6 - at * 0.5, nf(nm), 5, 8, r);
    s = ladder(s, expSweep(9000, 1500, 0.5), 0.35);
    applyEnv(s, adsr(1.6 - at * 0.5, 0.01, 0.3, 0.6, 0.6));
    layers.push([s, 0.35, at]);
    layers.push([bell(nf(nm) * 2, 0.6, { tau: 0.2 }), 0.25, at]);
  }
  layers.push([thump(0.6, 110, 45, 0.03, 0.15, { drive: 2 }), 0.8, 0]);
  layers.push([fm(1.2, geoSweep(300, 2400, 1.2), 0, 3, { ratio: 1.5 }), 0.15, 0]);
  let out = stack(layers, dur);
  out = D.fitSamples(out, S(dur));
  applyEnv(out, (t) => (t > dur - 0.3 ? (dur - t) / 0.3 : 1));
  out = softClip(out, 1.3);
  out = delay(out, 0.2, 0.4, 0.3, { tail: 0, damp: 5000 });
  out = reverb(out, { room: 0.7, damp: 0.4, wet: 0.3, tail: 0, hpf: 150 });
  return D.fitSamples(out, S(dur));
});
def('beacon_throw', 'foley', (r) => stack([[whoosh(r, 0.35, [[0, 400], [0.15, 2200], [0.35, 800]], { q: 1.3, peakAt: 0.4 }), 1], [blip(r, 1400, 0.1, { tau: 0.03 }), 0.5, 0.05], [rustle(r, 0.15, { plates: 0 }), 0.4]]));
def('beacon_beep', 'foley', (r) => {
  const one = (at) => { let s = square(0.07, 1400); s = lowpass(s, 4000, 1); applyEnv(s, adsr(0.07, 0.002, 0.01, 0.9, 0.02)); return [s, 1, at]; };
  let out = stack([one(0), one(0.13)], 0.4);
  out = delay(out, 0.04, 0.3, 0.2, { tail: 0 });
  return D.fitSamples(out, S(0.4));
});

// ---------------------------- Impacts / gore -----------------------------------
def('hit_flesh', 'impact', (r) => fleshHit(r), { variants: 4 });
def('hit_armor', 'impact', (r) => metalHit(r, { dur: 0.32, freq: 1700, sparks: 0.5, thumpAmt: 0.7 }), { variants: 4 });
def('armor_break', 'impact', (r) => {
  const layers = [];
  for (let k = 0; k < 3; k++) layers.push([metalHit(r, { dur: 0.35, freq: 1900 - 450 * k, sparks: 0.3, thumpAmt: 0.4 }), 0.8, k * 0.035]);
  let cr = crackle(0.3, r, 900, 0.0015); cr = bandpass(cr, 2500, 1); applyEnv(cr, expDecay(0.3, 0.09, 0.002));
  layers.push([cr, 0.7], [thump(0.3, 150, 55, 0.02, 0.07, { drive: 2.5 }), 1], [noiseBurst(0.2, r, { lp: 3000, hp: 200, tau: 0.04 }), 0.8]);
  return softClip(gain(stack(layers), 0.5), 1.6);
}, { variants: 3 });
def('hit_dirt', 'impact', (r) => dirtHit(r, { dur: 0.3, size: 0.5 }), { variants: 4 });
def('hit_metal', 'impact', (r) => metalHit(r, { dur: 0.4, freq: 2400, sparks: 0.45, thumpAmt: 0.5, bright: 1.1 }), { variants: 4 });
def('hit_rock', 'impact', (r) => rockHit(r), { variants: 3 });
def('hit_marker', 'ui', (r) => stack([[click(r, 0.003, 3000), 0.8], [blip(r, 2200, 0.03, { tau: 0.008, dly: 0, noiseAmt: 0.3 }), 1]]));
def('headshot_marker', 'ui', (r) => stack([[click(r, 0.003, 4000), 0.9], [blip(r, 3200, 0.05, { tau: 0.012, dly: 0.02, dlyMix: 0.2, noiseAmt: 0.3 }), 1], [blip(r, 2600, 0.04, { tau: 0.01, dly: 0 }), 0.6, 0.015], [thump(0.15, 95, 48, 0.02, 0.035, { drive: 2 }), 0.9]]));
def('blood_splat', 'gore', (r) => splat(r, { dur: 0.42, size: 0.5, drops: 5 }), { variants: 4 });
def('gib', 'gore', (r) => {
  let bone = crackle(0.18, r, 2500, 0.0012); bone = highpass(bone, 900); bone = resonatorBank(bone, [1700, 2600, 3900], 12, [1, 0.6, 0.4], 0.05); applyEnv(bone, expDecay(0.23, 0.06, 0.001));
  return softClip(gain(stack([[splat(r, { dur: 0.6, size: 1, drops: 8 }), 1], [bone, 0.7, 0.01], [thump(0.3, 120, 50, 0.02, 0.08, { drive: 2 }), 0.9], [fleshHit(r, { dur: 0.25 }), 0.7]]), 0.55), 1.4);
}, { variants: 3 });
def('body_fall', 'impact', (r) => {
  const th = thump(0.5, 95 * r.semis(1), 38, 0.03, 0.09, { drive: 2.5 });
  const cloth = noiseBurst(0.35, r, { color: 'pink', lp: 800, hp: 80, tau: 0.09, attack: 0.003 });
  const th2 = thump(0.3, 80, 40, 0.02, 0.06, { drive: 2 });
  const layers = [[th, 0.4], [unit(cloth), 0.9], [th2, 0.25, r.range(0.16, 0.22)], [dirtHit(r, { dur: 0.25, size: 0.4 }), 0.9]];
  for (let k = 0; k < 3; k++) layers.push([metallicRing(0.12, r.range(1500, 2800), r, { partials: 4, tau: 0.02 }), 0.25, r.range(0.02, 0.2)]);
  return softClip(space(stack(layers), { room: 0.4, wet: 0.15, tail: 0.25 }), 1.3);
}, { variants: 3 });
def('limb_off', 'gore', (r) => {
  let tear = noise(0.25, r); tear = bandpass(tear, geoSweep(1700, 380, 0.25), 3); applyEnv(tear, hump(0.25, 0.2, 1));
  let cr = crackle(0.2, r, 1500, 0.002); cr = bandpass(cr, 1200, 1); applyEnv(cr, expDecay(0.2, 0.07));
  return softClip(stack([[tear, 1], [cr, 0.6], [splat(r, { dur: 0.4, size: 0.6, drops: 4 }), 0.8, 0.03], [fleshHit(r, { dur: 0.3 }), 0.6, 0.05]]), 1.4);
}, { variants: 2 });

// ---------------------------- Movement ------------------------------------------
def('footstep_dirt', 'movement', (r) => footstep(r, 'dirt'), { variants: 6 });
def('footstep_metal', 'movement', (r) => footstep(r, 'metal'), { variants: 6 });
def('armor_rustle', 'movement', (r) => rustle(r, r.range(0.16, 0.24), { plates: 2 }), { variants: 4 });
def('roll', 'movement', (r) => stack([
  [whoosh(r, 0.4, [[0, 300], [0.18, 1300], [0.4, 350]], { q: 1.1, peakAt: 0.45 }), 0.9], [rustle(r, 0.35, { plates: 3 }), 0.8],
  [thump(0.25, 85, 42, 0.02, 0.07, { drive: 2 }), 0.9, 0.3], [dirtHit(r, { dur: 0.25, size: 0.4 }), 0.6, 0.3],
]), { variants: 2 });
def('vault', 'movement', (r) => stack([
  [noiseBurst(0.08, r, { bp: 600, q: 1, tau: 0.015 }), 0.8], [whoosh(r, 0.4, [[0, 400], [0.2, 1500], [0.4, 500]], { q: 1.2 }), 0.7, 0.05],
  [rustle(r, 0.3, { plates: 2 }), 0.7, 0.05], [thump(0.25, 90, 45, 0.02, 0.06, { drive: 2 }), 0.8, 0.42], [dirtHit(r, { dur: 0.25, size: 0.4 }), 0.6, 0.42],
]), { variants: 2 });
def('cover_snap', 'movement', (r) => softClip(gain(stackN([
  [thump(0.3, 105, 48, 0.02, 0.07, { drive: 2.5 }), 0.6], [noiseBurst(0.2, r, { lp: 1500, hp: 100, tau: 0.04 }), 1.0],
  [metallicRing(0.25, 1600 * r.semis(2), r, { partials: 5, tau: 0.05 }), 0.6, 0.005], [rustle(r, 0.2, { plates: 2 }), 0.6, 0.02],
]), 0.5), 1.4), { variants: 2 });
def('land', 'movement', (r) => softClip(gain(stack([
  [thump(0.45, 72, 34, 0.03, 0.09, { drive: 2.5 }), 0.35], [dirtHit(r, { dur: 0.35, size: 0.8 }), 1.0], [rustle(r, 0.3, { plates: 3 }), 0.9, 0.02],
]), 0.6), 1.4), { variants: 2 });
def('crouch', 'movement', (r) => rustle(r, 0.26, { plates: 1 }));

// ---------------------------- Player -------------------------------------------
def('heal_inject', 'player', (r) => {
  let hiss = noise(0.3, r); hiss = bandpass(hiss, geoSweep(4200, 2400, 0.3), 1.5); applyEnv(hiss, hump(0.3, 0.2, 0.8));
  const clk = stack([[click(r, 0.004, 2000), 1], [metallicRing(0.08, 2400, r, { partials: 3, tau: 0.015 }), 0.5]]);
  const toneDur = 1.1;
  let tone = stack([[sine(toneDur, nf('D5')), 1], [sine(toneDur, nf('A5')), 0.5], [fm(toneDur, nf('D6'), 0, 0.6, { ratio: 2 }), 0.25]]);
  tone = chorus(tone, { rate: 0.7, depth: 0.004, mix: 0.5 });
  applyEnv(tone, adsr(toneDur, 0.08, 0.3, 0.6, 0.5));
  tone = delay(tone, 0.16, 0.35, 0.3, { tail: 0.3, damp: 5000 });
  return stack([[hiss, 0.8], [clk, 0.8, 0.28], [tone, 0.5, 0.32]]);
});
def('player_hurt', 'player', (r) => {
  const f0 = r.range(95, 125);
  let v = voiceBark(0.3, expSweep(f0 * 1.1, f0 * 0.8, 0.12), r, { formants: [480 * r.semis(2), 1000, 2400], q: 6 });
  v = lowpass(v, 3000); applyEnv(v, adsr(0.3, 0.01, 0.08, 0.5, 0.15));
  const th = thump(0.25, 130, 60, 0.015, 0.05, { drive: 2 });
  return softClip(stack([[v, 1], [th, 0.8], [noiseBurst(0.1, r, { bp: 700, q: 1, tau: 0.02 }), 0.5]]), 1.6);
}, { variants: 4 });
def('player_death', 'player', (r) => {
  const dur = 2.0;
  let v = voiceBark(1.0, expSweep(115, 55, 0.5), r, { formants: [450, 950, 2300], q: 6 });
  v = lowpass(v, expSweep(3000, 500, 0.5)); applyEnv(v, adsr(1.0, 0.02, 0.2, 0.6, 0.5));
  const hb = stack([[heartbeat(r, 1.0), 1, 0.6], [heartbeat(r, 1.0), 0.6, 1.4]]);
  let wash = pink(dur, r); wash = lowpass(wash, expSweep(2500, 200, 0.8)); applyEnv(wash, adsr(dur, 0.05, 0.5, 0.4, 0.8));
  let out = stack([[v, 1], [thump(0.4, 120, 45, 0.02, 0.1, { drive: 2 }), 0.9], [hb, 0.8], [wash, 0.5]], dur);
  out = softClip(out, 1.5);
  out = reverb(out, { room: 0.8, damp: 0.5, wet: 0.35, tail: 0.5, hpf: 80 });
  return out;
});
def('heartbeat', 'player', (r) => heartbeat(r, 1.0), { loop: true, dur: 1.0 });
def('pickup', 'player', (r) => stack([[blip(r, nf('A5'), 0.12, { tau: 0.04, fmIdx: 0.8 }), 0.9], [blip(r, nf('D6'), 0.2, { tau: 0.06, fmIdx: 0.8 }), 1, 0.07], [click(r, 0.003, 2500), 0.4]]));
def('objective_complete', 'player', (r) => {
  const notes = ['D5', 'F5', 'A5', 'D6'];
  const layers = notes.map((n, k) => [bell(nf(n), k === 3 ? 0.9 : 0.4, { tau: k === 3 ? 0.3 : 0.12 }), 0.8 + 0.1 * k, k * 0.09]);
  layers.push([sine(0.9, nf('D4')), 0.3, 0.27]);
  let out = stack(layers);
  applyEnv(out, (t) => (t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.2) : 1));
  out = delay(out, 0.13, 0.35, 0.3, { tail: 0.2, damp: 6000 });
  out = reverb(out, { room: 0.6, damp: 0.4, wet: 0.25, tail: 0.1, hpf: 200 });
  return D.fitSamples(out, S(1.25));
});
def('objective_new', 'player', (r) => {
  let out = stack([[bell(nf('A4'), 0.4, { tau: 0.13, shimmer: 0.25 }), 0.8], [bell(nf('D5'), 0.55, { tau: 0.2, shimmer: 0.25 }), 1, 0.12]]);
  out = delay(out, 0.11, 0.3, 0.25, { tail: 0.15, damp: 5000 });
  return D.fitSamples(out, S(0.8));
});
def('download_beep', 'player', (r) => {
  let a = square(0.08, 1200); a = lowpass(a, 3500, 1); applyEnv(a, adsr(0.08, 0.002, 0.01, 0.9, 0.02));
  let b = square(0.05, 1600); b = lowpass(b, 4500, 1); applyEnv(b, adsr(0.05, 0.002, 0.01, 0.9, 0.015));
  return stack([[a, 1], [b, 0.7, 0.1], [click(r, 0.002, 3000), 0.3]]);
});
def('countdown_tick', 'player', (r) => stack([[blip(r, 1800, 0.05, { tau: 0.012, dly: 0, noiseAmt: 0.3 }), 1], [click(r, 0.003, 3000), 0.7]]));
def('countdown_final', 'player', (r) => {
  let t = fm(0.42, 2400, 0, 0.5, { ratio: 2 }); applyEnv(t, adsr(0.42, 0.003, 0.05, 0.8, 0.15));
  let out = stack([[t, 1], [click(r, 0.003, 3000), 0.6], [sine(0.42, 1200), 0.3]]);
  applyEnv(out, adsr(0.42, 0.002, 0.05, 0.85, 0.15));
  return delay(out, 0.06, 0.3, 0.25, { tail: 0.15 });
});
def('checkpoint', 'player', (r) => {
  let out = stack([[bell(nf('D5'), 0.5, { tau: 0.18 }), 1], [bell(nf('F5'), 0.5, { tau: 0.18 }), 0.8, 0.01], [bell(nf('A5'), 0.5, { tau: 0.18 }), 0.7, 0.02], [bell(nf('D6'), 0.4, { tau: 0.15 }), 0.5, 0.1]]);
  out = delay(out, 0.1, 0.3, 0.25, { tail: 0.1 });
  return D.fitSamples(out, S(0.65));
});
def('mission_complete_stinger', 'stinger', (r) => {
  const dur = 4.0;
  const chord = ['D3', 'A3', 'D4', 'F#4', 'A4'];
  const layers = [];
  for (const n of chord) {
    const f = nf(n);
    let brass = fm(3.4, (t) => f * (1 + 0.003 * Math.sin(D.TAU * 5 * t)), 0, (t) => 1.5 + 2.5 * Math.min(1, t / 0.6), { ratio: 1 });
    addInPlace(brass, fm(3.4, f * 1.005, 0, 2, { ratio: 2 }), 0.4);
    brass = lowpass(brass, (t) => 800 + 5000 * Math.min(1, t / 0.9), 0.9);
    applyEnv(brass, adsr(3.4, 0.35, 0.4, 0.75, 1.2));
    layers.push([brass, 0.28]);
    let ss = superSaw(3.4, f, 5, 9, r); ss = ladder(ss, (t) => 500 + 5500 * Math.min(1, t / 1.2), 0.3); applyEnv(ss, adsr(3.4, 0.5, 0.5, 0.7, 1.2));
    layers.push([ss, 0.16]);
  }
  const counter = [['A4', 1.5], ['D5', 1.85], ['F#5', 2.2], ['A5', 2.55]];
  for (const [n, at] of counter) layers.push([bell(nf(n), 1.2, { tau: 0.35 }), 0.4, at]);
  layers.push([thump(0.8, 100, 40, 0.04, 0.2, { drive: 2.5 }), 1.0, 0]);
  layers.push([noiseBurst(0.5, r, { bp: 1500, q: 0.8, tau: 0.08 }), 0.5, 0]);
  layers.push([noiseBurst(0.5, r, { bp: 1800, q: 0.8, tau: 0.08 }), 0.4, 1.5]);
  layers.push([thump(0.6, 90, 40, 0.04, 0.15, { drive: 2.5 }), 0.7, 1.5]);
  layers.push([fm(2.0, geoSweep(200, 3200, 2.0), 0, 3, { ratio: 1.5 }), 0.1, 0]);
  let out = stack(layers, dur);
  out = D.fitSamples(out, S(dur));
  out = softClip(out, 1.3);
  out = delay(out, 0.3, 0.35, 0.25, { tail: 0, damp: 4500 });
  out = reverb(out, { room: 0.85, damp: 0.4, wet: 0.35, tail: 0, hpf: 120 });
  out = D.fitSamples(out, S(dur));
  applyEnv(out, (t) => (t > dur - 0.6 ? Math.max(0, (dur - t) / 0.6) : 1));
  return out;
});
def('mission_failed_stinger', 'stinger', (r) => {
  const dur = 4.0;
  const chord = ['D2', 'F2', 'Ab2', 'D3'];
  const layers = [];
  for (const n of chord) {
    const f0 = nf(n);
    const f = (t) => f0 * Math.pow(2, -1 / 12 * Math.min(1, t / dur));
    let brass = fm(dur, f, 0, (t) => 2 + 2 * Math.exp(-t / 1.5), { ratio: 1 });
    brass = softClip(brass, 2);
    brass = lowpass(brass, (t) => 2500 * Math.exp(-t / 1.6) + 200, 1.2);
    applyEnv(brass, adsr(dur, 0.05, 0.6, 0.6, 1.5));
    layers.push([brass, 0.4]);
  }
  const sub = sine(dur, (t) => 36.7 * Math.pow(2, -1 / 12 * t / dur)); applyEnv(sub, adsr(dur, 0.05, 0.5, 0.8, 1.2));
  layers.push([sub, 0.9]);
  let strings = superSaw(dur, (t) => nf('Ab5') * Math.pow(2, -3 / 12 * (t / dur)), 7, 18, r);
  strings = bandpass(strings, 2200, 0.6);
  const strEnv = adsr(dur, 0.6, 0.5, 0.6, 1.5);
  applyEnv(strings, (t, i) => (0.6 + 0.4 * Math.sin(D.TAU * 7 * t)) * strEnv[i]);
  layers.push([strings, 0.2]);
  let wash = noise(dur, r, 'pink'); wash = lowpass(wash, (t) => 1500 * Math.exp(-t / 1.2) + 120); applyEnv(wash, adsr(dur, 0.02, 1.0, 0.3, 1.5));
  layers.push([wash, 0.5]);
  layers.push([thump(1.0, 70, 30, 0.06, 0.3, { drive: 3 }), 1.0, 0]);
  layers.push([explosion(r, { size: 0.5, dur: 1.2, drive: 2, wet: 0.5 }), 0.4, 0.02]);
  let out = stack(layers, dur);
  out = D.fitSamples(out, S(dur));
  out = softClip(out, 1.4);
  out = reverb(out, { room: 0.9, damp: 0.55, wet: 0.4, tail: 0, hpf: 60 });
  out = D.fitSamples(out, S(dur));
  applyEnv(out, (t) => (t > dur - 0.8 ? Math.max(0, (dur - t) / 0.8) : 1));
  return out;
});

// ---------------------------- Enemies ------------------------------------------
def('enemy_rifle_fire', 'enemy_weapon', (r) => {
  const g = gunshot(r, { dur: 0.3, sub: 82, subTau: 0.03, subLevel: 0.4, crack: 3300, crackQ: 1.3, crackTau: 0.014, crackLevel: 1.6, body: 600, bodyTau: 0.03, bodyLevel: 0.9, drive: 1.8, zapLevel: 1.1, zapF: 1500, zapRatio: 2.4, punch: 0.4, midCrack: 0.9 });
  let sizzle = bitcrush(zap(0.15, 2600 * r.semis(2), 500, { ratio: 3.1, idx0: 12, idx1: 1, tau: 0.04 }), 6, 3);
  sizzle = highpass(sizzle, 800);
  return softClip(stack([[g, 1], [sizzle, 0.35]]), 1.2);
}, { variants: 4 });
def('enemy_shotgun_fire', 'enemy_weapon', (r) => {
  const g = gunshot(r, { dur: 0.6, sub: 55, subTau: 0.1, subLevel: 0.65, crack: 1700, crackQ: 0.7, crackTau: 0.03, crackLevel: 1.9, body: 280, bodyTau: 0.07, bodyLevel: 1.4, drive: 2.4, room: 0.6, wet: 0.4, tail: 0.4, lowBoom: 0.3, zapLevel: 0.8, zapF: 900, zapRatio: 1.5, midCrack: 1.3 });
  const z2 = zap(0.25, 1300 * r.semis(1), 200, { ratio: 2.9, idx0: 10, idx1: 1, tau: 0.06 });
  return softClip(stack([[g, 0.75], [z2, 0.35]]), 1.2);
}, { variants: 3 });
def('enemy_suppressor_fire', 'enemy_weapon', (r) => gunshot(r, { dur: 0.36, sub: 50, subTau: 0.07, subLevel: 0.7, crack: 1500, crackQ: 0.8, crackTau: 0.025, crackLevel: 1.8, body: 200, bodyTau: 0.06, bodyLevel: 1.6, drive: 2.6, lowBoom: 0.25, mech: 0.5, mechAt: 0.05, punch: 0.6, clickLevel: 0.9, midCrack: 1.3 }), { variants: 4 });
def('enemy_grenade_throw', 'enemy', (r) => stack([[whoosh(r, 0.4, [[0, 300], [0.15, 2000], [0.4, 600]], { q: 1.3, peakAt: 0.4 }), 1], [servo(0.25, 500, 380, { lp: 2500, amp: 0.4 }), 0.6], [clank(r, 1800, 0.1, { thumpAmt: 0.2 }), 0.4, 0.02]]));
def('enemy_alert', 'enemy', (r, i) => {
  const syl = i === 0 ? [[0, 0.16, 300, 460], [0.19, 0.2, 440, 320]] : [[0, 0.11, 320, 400], [0.13, 0.11, 400, 480], [0.26, 0.2, 480, 300]];
  const layers = [];
  for (const [at, d, f0, f1] of syl) {
    let v = fm(d, geoSweep(f0, f1, d), 0, 2.5, { ratio: 1.5 });
    addInPlace(v, voiceBark(d, geoSweep(f0, f1, d), r, { formants: [700, 1400, 2600], q: 6 }), 0.6);
    v = bitcrush(v, 7, 2); v = lowpass(v, 4500);
    applyEnv(v, adsr(d, 0.01, 0.03, 0.8, 0.05));
    layers.push([v, 1, at]);
  }
  let out = softClip(stack(layers), 1.6);
  return delay(out, 0.05, 0.3, 0.2, { tail: 0.1 });
}, { variants: 2 });
def('enemy_death_mech', 'enemy', (r) => {
  const dur = 1.25;
  let down = saw(0.9, expSweep(420 * r.semis(2), 38, 0.3)); down = ladder(down, expSweep(3500, 150, 0.35), 0.5, { drive: 2 }); applyEnv(down, adsr(0.9, 0.005, 0.2, 0.7, 0.4));
  let warble = fm(0.7, expSweep(900, 120, 0.25), 0, (t) => 6 * Math.exp(-t / 0.3), { ratio: 1.41 }); applyEnv(warble, expDecay(0.7, 0.25, 0.003));
  const sp = sparks(r, 1.0, 250, { zaps: 4 });
  const endClank = clank(r, 800, 0.4, { thumpAmt: 1.0, partials: 6 });
  const burst = noiseBurst(0.3, r, { lp: 2500, hp: 150, tau: 0.05 });
  let out = stack([[down, 0.9], [warble, 0.5], [sp, 0.6], [burst, 0.7], [endClank, 1, 0.75], [thump(0.3, 120, 50, 0.02, 0.07, { drive: 2 }), 0.8, 0.75]], dur);
  out = softClip(out, 1.5);
  return space(out, { room: 0.5, wet: 0.2, tail: 0.3 });
}, { variants: 3 });
def('enemy_stagger', 'enemy', (r) => {
  let stut = saw(0.18, 210 * r.semis(2)); stut = lowpass(stut, 1800); applyEnv(stut, (t) => (Math.sin(D.TAU * 32 * t) > 0 ? 1 : 0.2) * Math.exp(-t / 0.08));
  return softClip(stack([[clank(r, 1400, 0.25, { thumpAmt: 0.6 }), 1], [stut, 0.6, 0.02], [zap(0.1, 1800, 400, { ratio: 1.7, idx0: 8, tau: 0.03 }), 0.4, 0.01]]), 1.4);
}, { variants: 2 });
def('drone_hum', 'enemy', (r) => {
  const dur = 2.0;
  // all oscillator/LFO rates are integer cycles per 2 s; steadyLoop removes filter start-up transients
  const tonal = steadyLoop(dur, (d) => {
    let core = stack([[saw(d, 130), 1], [saw(d, 131.5), 0.9], [sine(d, 65), 0.6]]);
    core = lowpass(core, 900, 1.2);
    applyEnv(core, (t) => 0.75 + 0.25 * Math.sin(D.TAU * 45 * t) ** 2);
    const whine = sine(d, (t) => 2600 * (1 + 0.004 * Math.sin(D.TAU * 1.0 * t)));
    return stack([[core, 1], [whine, 0.12]]);
  });
  const rotor = loopRender(dur, 0.2, (d) => { let n = noise(d, r, 'pink'); n = bandpass(n, 1400, 1.5); return applyEnv(n, (t) => 0.5 + 0.5 * Math.sin(D.TAU * 45 * t) ** 4); });
  const out = stack([[tonal, 1], [rotor, 0.35]]);
  return D.fitSamples(softClip(gain(out, 0.4), 1.3), S(dur));
}, { loop: true, dur: 2.0 });
def('drone_alert', 'enemy', (r) => {
  const layers = [];
  const steps = [800, 1130, 1600, 2260];
  steps.forEach((f, k) => layers.push([blip(r, f, 0.1, { tau: 0.04, fmIdx: 1.0, dly: 0 }), 0.8, k * 0.09]));
  layers.push([blip(r, 2400, 0.25, { tau: 0.08, fmIdx: 1.5, slide: 1.02 }), 1, 0.38]);
  let out = stack(layers);
  return delay(out, 0.07, 0.35, 0.25, { tail: 0.15 });
});
def('drone_marking', 'enemy', (r) => {
  const one = () => { let s = fm(0.06, 2200, 0, 0.8, { ratio: 2 }); s = lowpass(s, 6000); applyEnv(s, adsr(0.06, 0.002, 0.01, 0.9, 0.02)); return s; };
  return wrapTail(delay(circular(1.0, [[one(), 1, 0], [one(), 0.9, 0.12], [one(), 0.8, 0.24]]), 0.05, 0.3, 0.2, { tail: 0.3 }), 1.0);
}, { loop: true, dur: 1.0 });
def('drone_explode', 'enemy', (r) => {
  const ex = explosion(r, { size: 0.4, dur: 1.1, drive: 2.2, zapAmt: 0.8, tail: 0.5 });
  const layers = [[ex, 1], [sparks(r, 0.6, 400, { zaps: 3 }), 0.5, 0.02]];
  for (let k = 0; k < 3; k++) layers.push([metallicRing(0.4, r.range(1800, 4000), r, { partials: 4, tau: 0.08 }), 0.35, r.range(0.03, 0.25)]);
  return softClip(stack(layers), 1.2);
}, { variants: 2 });
def('warden_step', 'boss', (r) => {
  const th = thump(0.9, 55 * r.semis(1), 27, 0.06, 0.24, { drive: 3 });
  let hiss = noise(0.12, r); hiss = bandpass(hiss, 2600, 1.2); applyEnv(hiss, hump(0.12, 0.3));
  const ground = noiseBurst(0.5, r, { lp: 480, hp: 40, tau: 0.09, attack: 0.002 });
  const cl = clank(r, 420, 0.5, { thumpAmt: 0.8, partials: 6, bright: 0.7 });
  let deb = crackle(0.6, r, 250, 0.003); deb = bandpass(deb, 1200, 1); applyEnv(deb, (t) => t < 0.03 ? 0 : Math.exp(-(t - 0.03) / 0.18));
  let out = stackN([[hiss, 0.5], [th, 0.8, 0.1], [ground, 1.0, 0.1], [cl, 0.8, 0.1], [deb, 0.5, 0.1]]);
  out = softClip(gain(out, 0.5), 2);
  return reverb(out, { room: 0.7, damp: 0.5, wet: 0.25, tail: 0.4, hpf: 60 });
}, { variants: 3 });
def('warden_cannon', 'boss', (r) => {
  const g = gunshot(r, { dur: 1.0, sub: 44, subTau: 0.16, subLevel: 0.8, crack: 1200, crackQ: 0.6, crackTau: 0.045, crackLevel: 2.0, body: 150, bodyTau: 0.12, bodyLevel: 1.8, drive: 3, room: 0.85, wet: 0.5, tail: 0.7, lowBoom: 0.5, punch: 0.6, zapLevel: 0.7, zapF: 600, zapRatio: 1.5, midCrack: 1.5 });
  return stack([[g, 1], [thump(0.9, 60, 24, 0.1, 0.3, { drive: 3 }), 0.25]]);
}, { variants: 2 });
def('warden_rocket_launch', 'boss', (r) => {
  const ign = noise(1.0, r);
  const ignB = lowpass(ign, breakpoints([[0, 500], [0.1, 5000], [1.0, 800]]), 0.8);
  applyEnv(ignB, (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.35));
  const wh = whoosh(r, 0.5, [[0, 300], [0.5, 2500]], { q: 1.2, peakAt: 0.85, power: 2 });
  const th = thump(0.4, 110, 45, 0.02, 0.09, { drive: 2.5 });
  let tail = brown(1.2, r); tail = lowpass(tail, expSweep(1800, 300, 0.4)); applyEnv(tail, (t) => Math.exp(-t / 0.4));
  let out = stack([[wh, 0.6], [ignB, 1, 0.42], [th, 1, 0.42], [tail, 0.9, 0.5], [clank(r, 900, 0.2, { thumpAmt: 0.5 }), 0.5, 0.42]]);
  return softClip(out, 1.8);
});
def('warden_rocket_fly', 'boss', (r) => {
  const dur = 1.5;
  return loopRender(dur, 0.25, (d) => {
    let roar = stack([[brown(d, r), 1], [white(d, r), 0.25]]);
    roar = lowpass(roar, (t) => 1400 + 300 * Math.sin(D.TAU * 4 * t), 0.9);
    applyEnv(roar, (t) => 0.8 + 0.2 * Math.sin(D.TAU * 20 * t) * Math.sin(D.TAU * 2 * t));
    const sub = sine(d, (t) => 60 + 3 * Math.sin(D.TAU * 2 * t));
    return softClip(stack([[roar, 1], [sub, 0.6]]), 1.5);
  });
}, { loop: true, dur: 1.5 });
def('warden_roar', 'boss', (r, i) => {
  const dur = 2.0;
  const base = i === 0 ? 105 : 132;
  const bend = (t) => base * Math.pow(2, (t < 0.35 ? 2 * t / 0.35 : 2 - 1.5 * Math.min(1, (t - 0.35) / 1.2)) / 12);
  let horn = stack([[saw(dur, bend), 1], [saw(dur, (t) => bend(t) * 1.5 * 1.003), 0.8], [square(dur, (t) => bend(t) * 2.01), 0.5], [saw(dur, (t) => bend(t) * 0.5), 0.6]]);
  horn = ladder(horn, (t) => 700 + 2200 * Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.7, 0.55, { drive: 2 });
  horn = resonatorBank(horn, [420, 900, 1600], 3, [1, 0.7, 0.4], 0);
  addInPlace(horn, ladder(stack([[saw(dur, bend), 1], [saw(dur, (t) => bend(t) * 1.5), 0.8]]), 1800, 0.3), 0.5);
  horn = softClip(horn, 3);
  applyEnv(horn, adsr(dur, 0.06, 0.3, 0.8, 0.5));
  let rattle = crackle(dur, r, 60, 0.004); rattle = bandpass(rattle, 900, 1); applyEnv(rattle, adsr(dur, 0.1, 0.3, 0.6, 0.5));
  const sub = sine(dur, (t) => bend(t) * 0.25); applyEnv(sub, adsr(dur, 0.05, 0.3, 0.8, 0.5));
  let out = stack([[horn, 1], [rattle, 0.3], [sub, 0.8], [thump(0.5, 90, 40, 0.03, 0.12, { drive: 2 }), 0.7]]);
  out = softClip(out, 1.4);
  return reverb(out, { room: 0.8, damp: 0.5, wet: 0.3, tail: 0.6, hpf: 70 });
}, { variants: 2 });
def('warden_armor_break', 'boss', (r) => {
  const layers = [];
  for (let k = 0; k < 4; k++) layers.push([metalHit(r, { dur: 0.45, freq: 1400 - 250 * k, sparks: 0.5, thumpAmt: 0.5, partials: 7 }), 0.8, k * 0.04]);
  let cr = crackle(0.45, r, 900, 0.002); cr = bandpass(cr, 2000, 1); applyEnv(cr, expDecay(0.45, 0.12, 0.002));
  let hiss = noise(0.5, r); hiss = bandpass(hiss, 3000, 1.5); applyEnv(hiss, (t) => t < 0.1 ? 0 : Math.exp(-(t - 0.1) / 0.15));
  layers.push([cr, 0.7], [hiss, 0.5], [thump(0.6, 120, 40, 0.03, 0.15, { drive: 3 }), 1.1], [sparks(r, 0.6, 300, { zaps: 3 }), 0.5, 0.05], [noiseBurst(0.3, r, { lp: 2500, hp: 100, tau: 0.06 }), 0.9]);
  return space(softClip(stack(layers), 1.6), { room: 0.6, wet: 0.2, tail: 0.3 });
}, { variants: 2 });
def('warden_death', 'boss', (r) => {
  const dur = 5.0;
  const layers = [];
  const exAt = [[0, 0.5], [0.55, 0.6], [1.05, 0.55], [1.8, 0.7], [2.5, 0.65], [3.1, 1.0]];
  for (const [at, size] of exAt) layers.push([explosion(r, { size, dur: 0.9 + size * 1.6, drive: 2.5, tail: 0.6 }), 0.6 + 0.4 * size, at]);
  let down = saw(3.2, expSweep(220, 18, 1.2)); down = ladder(down, expSweep(2500, 80, 1.0), 0.5, { drive: 2 }); applyEnv(down, adsr(3.2, 0.05, 0.5, 0.7, 1.0));
  layers.push([down, 0.6, 0.2]);
  layers.push([sparks(r, 4.0, 180, { zaps: 10 }), 0.5, 0.1]);
  let whine = servo(1.5, 1400, 300, { lp: 3000, amp: 0.4 }); layers.push([whine, 0.5, 3.2]);
  layers.push([fm(1.6, expSweep(600, 40, 0.6), 0, 5, { ratio: 1.41 }), 0.3, 3.3]);
  for (let k = 0; k < 4; k++) layers.push([clank(r, r.range(300, 900), 0.6, { thumpAmt: 0.9, partials: 6 }), 0.7, r.range(3.4, 4.5)]);
  let out = stack(layers, dur);
  out = D.fitSamples(out, S(dur));
  out = softClip(gain(out, 0.6), 1.5);
  out = reverb(out, { room: 0.85, damp: 0.5, wet: 0.3, tail: 0, hpf: 50 });
  out = D.fitSamples(out, S(dur));
  applyEnv(out, (t) => (t > dur - 0.5 ? Math.max(0, (dur - t) / 0.5) : 1));
  return out;
});
def('warden_charge', 'boss', (r) => {
  const dur = 2.0;
  const f = geoSweep(60, 240, dur);
  let s = stack([[saw(dur, f), 1], [saw(dur, (t) => f(t) * 1.5), 0.7], [square(dur, (t) => f(t) * 0.5), 0.5]]);
  s = ladder(s, geoSweep(200, 6000, dur), 0.7, { drive: 2 });
  applyEnv(s, (t) => (0.6 + 0.4 * (Math.sin(D.TAU * (2 + 20 * (t / dur) ** 2) * t) > 0 ? 1 : 0.3)) * Math.min(1, t / 0.05));
  let nz = noise(dur, r); nz = bandpass(nz, geoSweep(300, 5000, dur), 1.5); applyEnv(nz, (t) => (t / dur) ** 2);
  let whine = fm(dur, geoSweep(400, 3200, dur), 0, 3, { ratio: 2 }); applyEnv(whine, (t) => 0.2 + 0.8 * (t / dur) ** 2);
  let out = stack([[s, 1], [nz, 0.5], [whine, 0.3], [thump(0.5, 80, 35, 0.04, 0.15, { drive: 2 }), 0.8]], dur);
  out = D.fitSamples(out, S(dur));
  out = softClip(out, 1.6);
  applyEnv(out, (t) => (t > dur - 0.04 ? (dur - t) / 0.04 : 1));
  return stack([[out, 1], [click(r, 0.004, 2000), 0.8, dur - 0.01]]);
});

// ---------------------------- Environment --------------------------------------
def('alarm', 'alarm', (r) => {
  const dur = 2.0;
  const wail = (at) => {
    const d = 0.85;
    const f = breakpoints([[0, 330], [0.35, 470], [0.6, 470], [d, 330]]);
    let s = stack([[square(d, f), 1], [saw(d, (t) => f(t) * 2), 0.4]]);
    s = bandpass(s, 1100, 1.1); s = softClip(s, 2);
    applyEnv(s, adsr(d, 0.02, 0.1, 0.9, 0.12));
    return [s, 1, at];
  };
  const out = circular(dur, [wail(0), wail(1.0)]);
  return wrapTail(reverb(out, { room: 0.5, damp: 0.5, wet: 0.15, tail: 1.0 }), dur);
}, { loop: true, dur: 2.0 });
def('jammer_hum', 'env', (r) => {
  const dur = 4.0;
  let out = steadyLoop(dur, (d) => {
    let core = stack([[saw(d, 55), 1], [saw(d, 82.5), 0.7], [sine(d, 27.5), 0.9], [pulse(d, 110, (t) => 0.5 + 0.3 * Math.sin(D.TAU * 0.25 * t)), 0.4]]);
    core = ladder(core, (t) => 350 + 250 * Math.sin(D.TAU * 0.5 * t), 0.6, { drive: 2 });
    applyEnv(core, (t) => 0.6 + 0.4 * Math.sin(D.TAU * 6.5 * t) ** 2);
    let buzz = pulse(d, 110, 0.1); buzz = highpass(buzz, 900); applyEnv(buzz, (t) => 0.5 + 0.5 * Math.sin(D.TAU * 0.75 * t) ** 2);
    return softClip(stack([[core, 1], [buzz, 0.12]]), 1.5);
  });
  const sp = loopRender(dur, 0.3, (d) => { let c = crackle(d, r, 25, 0.003); return highpass(c, 2500); });
  return D.fitSamples(stack([[out, 1], [sp, 0.25]]), S(dur));
}, { loop: true, dur: 4.0 });
def('jammer_explode', 'env', (r) => {
  const dur = 5.0;
  let charge = fm(0.85, geoSweep(200, 3000, 0.85), 0, geoSweep(2, 10, 0.85), { ratio: 1.5 }); applyEnv(charge, (t) => (t / 0.85) ** 1.5);
  let chargeSaw = ladder(saw(0.85, geoSweep(55, 220, 0.85)), geoSweep(300, 8000, 0.85), 0.6); applyEnv(chargeSaw, (t) => (t / 0.85) ** 1.2);
  const ex = explosion(r, { size: 1.0, dur: 3.6, drive: 3, tail: 0.6, room: 0.9, wet: 0.4, zapAmt: 1.0 });
  const layers = [[charge, 0.5], [chargeSaw, 0.5], [ex, 1, 0.85]];
  for (let k = 0; k < 8; k++) layers.push([zap(0.3, r.range(800, 4000), r.range(100, 400), { ratio: r.range(1.2, 2.5), idx0: 10, tau: 0.08 }), 0.35, 0.9 + r.range(0, 2.2)]);
  layers.push([sparks(r, 3.0, 200, { zaps: 6 }), 0.5, 1.0]);
  let drone = saw(3.0, expSweep(110, 25, 1.2)); drone = ladder(drone, expSweep(1500, 60, 1.0), 0.5); applyEnv(drone, adsr(3.0, 0.05, 0.5, 0.6, 1.2)); layers.push([drone, 0.5, 1.2]);
  let out = stack(layers, dur);
  out = D.fitSamples(out, S(dur));
  out = softClip(out, 1.4);
  applyEnv(out, (t) => (t > dur - 0.5 ? Math.max(0, (dur - t) / 0.5) : 1));
  return out;
});
def('dropship_engine', 'env', (r) => {
  const dur = 4.0;
  return loopRender(dur, 0.4, (d) => engine(r, d, { base: 78, freqFn: (t) => 1 + 0.01 * Math.sin(D.TAU * 0.25 * t), rotorHz: 22, whine: 1750, lp: 1300, rough: 0.6 }));
}, { loop: true, dur: 4.0 });
def('dropship_land', 'env', (r) => {
  const dur = 4.0;
  const ff = (t) => 1.15 - 0.25 * Math.min(1, t / 3.4);
  let e = engine(r, dur, { base: 80, freqFn: ff, rotorHz: 22, whine: 2000, lp: (t) => 1600 - 900 * Math.min(1, t / 3.4), rough: 0.7 });
  applyEnv(e, (t) => t < 3.4 ? 0.6 + 0.4 * (t / 3.4) : Math.max(0.15, 1 - (t - 3.4) / 0.6));
  let dust = noise(dur, r, 'pink'); dust = bandpass(dust, 700, 0.8); applyEnv(dust, (t) => Math.pow(Math.min(1, t / 3.2), 2) * (t > 3.4 ? Math.exp(-(t - 3.4) / 0.4) : 1));
  const thud = stack([[thump(0.7, 80, 30, 0.04, 0.2, { drive: 3 }), 1], [noiseBurst(0.4, r, { lp: 600, hp: 40, tau: 0.08 }), 0.9], [clank(r, 350, 0.5, { thumpAmt: 0.8, bright: 0.6 }), 0.7]]);
  let hiss = noise(0.5, r); hiss = bandpass(hiss, 2800, 1.2); applyEnv(hiss, hump(0.5, 0.2));
  let out = stack([[e, 1], [dust, 0.6], [thud, 1.2, 3.4], [hiss, 0.5, 3.5]], dur);
  out = D.fitSamples(out, S(dur));
  return softClip(out, 1.5);
});
def('dropship_takeoff', 'env', (r) => {
  const dur = 5.0;
  const ff = (t) => 0.9 + 0.3 * Math.min(1, t / 2.2) - 0.1 * Math.max(0, (t - 3) / 2);
  let e = engine(r, dur, { base: 80, freqFn: ff, rotorHz: 22, whine: 1800, lp: (t) => 900 + 1200 * Math.min(1, t / 2.2) - 1500 * Math.max(0, (t - 3) / 2), rough: 0.7 });
  applyEnv(e, (t) => Math.min(1, 0.5 + 0.5 * t / 2.0) * (t > 3 ? Math.pow(Math.max(0, 1 - (t - 3) / 2.0), 1.5) : 1));
  let dust = noise(dur, r, 'pink'); dust = bandpass(dust, 600, 0.8); applyEnv(dust, (t) => Math.pow(Math.min(1, t / 1.5), 2) * (t > 2.5 ? Math.exp(-(t - 2.5) / 0.8) : 1));
  let hiss = noise(0.6, r); hiss = bandpass(hiss, 2500, 1.2); applyEnv(hiss, hump(0.6, 0.2));
  let out = stack([[e, 1], [dust, 0.55], [hiss, 0.4], [clank(r, 400, 0.4, { thumpAmt: 0.6 }), 0.5, 0.15]], dur);
  out = D.fitSamples(out, S(dur));
  fadeOut(out, 0.3);
  return softClip(out, 1.5);
});
def('ambience_wind', 'ambience', (r) => {
  const dur = 12.0;
  return loopRender(dur, 0.8, (d) => {
    const gust = (t) => Math.max(0.02, 0.45 + 0.25 * Math.sin(D.TAU * t / 12) + 0.18 * Math.sin(D.TAU * 2 * t / 12 + 1.3) + 0.12 * Math.sin(D.TAU * 5 * t / 12 + 0.4));
    let w = noise(d, r, 'pink');
    w = bandpass(w, (t) => 320 + 500 * gust(t) ** 2, 0.8);
    applyEnv(w, (t) => gust(t) ** 1.5);
    let whistle = noise(d, r); whistle = bandpass(whistle, (t) => 2400 + 400 * Math.sin(D.TAU * 3 * t / 12), 14);
    applyEnv(whistle, (t) => Math.max(0, gust(t) - 0.55) * 1.6);
    let grit = crackle(d, r, 40, 0.001); grit = highpass(grit, 4000); applyEnv(grit, (t) => Math.max(0, gust(t) - 0.4));
    let low = brown(d, r); low = lowpass(low, 120); applyEnv(low, (t) => gust(t));
    return stack([[w, 1], [whistle, 0.35], [grit, 0.15], [low, 0.6]]);
  });
}, { loop: true, dur: 12.0 });
def('ambience_alien', 'ambience', (r) => {
  const dur = 12.0;
  return loopRender(dur, 1.0, (d) => {
    let drone = stack([[sine(d, 36.7), 1], [sine(d, (t) => 55 * (1 + 0.002 * Math.sin(D.TAU * t / 12))), 0.7], [fm(d, 73.4, 0, (t) => 1 + 0.6 * Math.sin(D.TAU * 2 * t / 12), { ratio: 1.5 }), 0.4]]);
    drone = lowpass(drone, 600);
    applyEnv(drone, (t) => 0.7 + 0.3 * Math.sin(D.TAU * t / 12 + 2));
    const layers = [[drone, 0.8]];
    for (let k = 0; k < 14; k++) {
      const f = r.range(1400, 4200);
      let c = fm(0.12, geoSweep(f * 0.7, f, 0.05), 0, 1.5, { ratio: r.pick([1.5, 2, 2.5]) });
      applyEnv(c, adsr(0.12, 0.005, 0.03, 0.6, 0.06));
      c = delay(c, r.range(0.09, 0.2), 0.45, 0.6, { tail: 0.8, damp: 6000 });
      layers.push([c, r.range(0.15, 0.35), r.range(0, d - 1.2)]);
    }
    for (const at of [3.6, 8.9]) {
      let g = voiceBark(1.6, expSweep(72, 52, 0.9), r, { formants: [300, 700, 1600], q: 5, breath: 0.3 });
      g = lowpass(g, 900); applyEnv(g, adsr(1.6, 0.3, 0.3, 0.7, 0.7));
      g = reverb(g, { room: 0.9, damp: 0.6, wet: 0.8, dry: 0.3, tail: 1.0 });
      layers.push([g, 0.35, at]);
    }
    let air = noise(d, r, 'pink'); air = bandpass(air, 900, 0.5); applyEnv(air, (t) => 0.5 + 0.5 * Math.sin(D.TAU * 3 * t / 12));
    layers.push([air, 0.12]);
    return D.fitSamples(stack(layers), S(d));
  });
}, { loop: true, dur: 12.0 });
def('ambience_base', 'ambience', (r) => {
  const dur = 10.0;
  return loopRender(dur, 0.8, (d) => {
    let hum = stack([[sine(d, 60), 1], [sine(d, 120), 0.5], [sine(d, 180), 0.25], [saw(d, 60), 0.15]]);
    hum = lowpass(hum, 400);
    let vent = noise(d, r, 'pink'); vent = lowpass(vent, 600); applyEnv(vent, (t) => 0.8 + 0.2 * Math.sin(D.TAU * t / 10));
    let buzz = pulse(d, 100, 0.08); buzz = highpass(buzz, 2500); applyEnv(buzz, (t) => 0.35 + 0.65 * (Math.sin(D.TAU * 1.3 * t) > 0.6 ? 1 : 0.2));
    const layers = [[hum, 0.7], [vent, 0.5], [buzz, 0.05]];
    for (let t = 0.2; t < d - 0.3; t += 0.8) layers.push([thump(0.3, 70, 45, 0.02, 0.06), 0.35, t]);
    for (let k = 0; k < 6; k++) layers.push([reverb(clank(r, r.range(500, 1500), 0.4, { thumpAmt: 0.3 }), { room: 0.8, wet: 0.7, dry: 0.2, tail: 0.8 }), r.range(0.1, 0.25), r.range(0, d - 1.5)]);
    return D.fitSamples(stack(layers), S(d));
  });
}, { loop: true, dur: 10.0 });
def('ambience_ship', 'ambience', (r) => {
  const dur = 10.0;
  return loopRender(dur, 0.8, (d) => {
    let hum = stack([[saw(d, 50), 1], [saw(d, 50.3), 0.8], [sine(d, 25), 0.6], [saw(d, 100), 0.3]]);
    hum = lowpass(hum, 260, 1.0);
    hum = chorus(hum, { rate: 0.2, depth: 0.006, mix: 0.4 });
    applyEnv(hum, (t) => 0.8 + 0.2 * Math.sin(D.TAU * 2 * t / 10));
    let air = noise(d, r, 'pink'); air = lowpass(air, 320);
    const layers = [[hum, 0.7], [air, 0.5]];
    const beepTimes = [1.2, 3.7, 6.4, 8.6];
    beepTimes.forEach((t, k) => {
      let b = sine(0.07, k % 2 ? 1500 : 1200); applyEnv(b, adsr(0.07, 0.003, 0.02, 0.8, 0.03));
      b = delay(b, 0.11, 0.35, 0.5, { tail: 0.4, damp: 5000 });
      layers.push([b, 0.12, t]);
    });
    let hiss = noise(d, r); hiss = bandpass(hiss, 6000, 2); applyEnv(hiss, (t) => 0.5 + 0.5 * Math.sin(D.TAU * 3 * t / 10));
    layers.push([hiss, 0.02]);
    return D.fitSamples(stack(layers), S(d));
  });
}, { loop: true, dur: 10.0 });
def('hologram_loop', 'env', (r) => {
  const dur = 3.0;
  return loopRender(dur, 0.3, (d) => {
    let tone = stack([[sine(d, 240), 1], [tri(d, 480), 0.4], [sine(d, 960), 0.15]]);
    // random flicker AM
    const n = S(d); const flick = new Float32Array(n); let v = 1, next = 0;
    for (let i = 0; i < n; i++) { if (i >= next) { v = r() < 0.7 ? 1 : r.range(0.3, 0.8); next = i + S(r.range(0.01, 0.04)); } flick[i] = v; }
    applyEnv(tone, flick);
    let shimmer = sine(d, (t) => 6000 + 40 * Math.sin(D.TAU * 5 * t)); applyEnv(shimmer, flick); applyEnv(shimmer, (t) => 0.5 + 0.5 * Math.sin(D.TAU * 2 * t));
    let nz = noise(d, r); nz = bandpass(nz, 3000, 3); applyEnv(nz, flick);
    return stack([[tone, 1], [shimmer, 0.08], [nz, 0.12]]);
  });
}, { loop: true, dur: 3.0 });
def('door_open', 'env', (r) => {
  const w = servo(0.62, 340, 430, { lp: 2600, amp: 0.8 });
  let hiss = noise(0.5, r); hiss = bandpass(hiss, geoSweep(3000, 1500, 0.5), 1.3); applyEnv(hiss, hump(0.5, 0.1, 0.8));
  const out = stack([[click(r, 0.004, 1800), 0.7], [clank(r, 1800, 0.12, { thumpAmt: 0.3 }), 0.5, 0.02], [hiss, 0.6, 0.05], [w, 1, 0.08], [clank(r, 600, 0.4, { thumpAmt: 0.8, partials: 6 }), 1, 0.72]]);
  return space(out, { room: 0.6, wet: 0.25, tail: 0.3 });
});
def('terminal_interact', 'env', (r) => {
  const layers = [];
  for (let k = 0; k < 3; k++) layers.push([stack([[click(r, 0.003, 3000), 1], [blip(r, r.range(2200, 3400), 0.025, { tau: 0.006, dly: 0 }), 0.6]]), 0.8, k * 0.065]);
  layers.push([blip(r, 1100, 0.25, { slide: 1.5, tau: 0.08, fmIdx: 1.0, dly: 0.05 }), 0.7, 0.22]);
  let hum = sine(0.45, 120); applyEnv(hum, adsr(0.45, 0.05, 0.1, 0.5, 0.2)); layers.push([hum, 0.15]);
  return stack(layers);
});
def('sparks_loop', 'env', (r) => loopRender(2.0, 0.25, (d) => {
  let out = sparks(r, d, 130, { zaps: 5 });
  let hiss = noise(d, r); hiss = highpass(hiss, 5000); applyEnv(hiss, (t) => 0.3 + 0.7 * (Math.sin(D.TAU * 7 * t) > 0.8 ? 1 : 0.2));
  return stack([[out, 1], [hiss, 0.12]]);
}), { loop: true, dur: 2.0 });
def('fire_loop', 'env', (r) => loopRender(3.0, 0.4, (d) => {
  let roar = brown(d, r);
  const n = S(d); const wander = new Float32Array(n); let v = 800, target = 800, k = 0;
  for (let i = 0; i < n; i++) { if (k-- <= 0) { target = r.range(400, 1600); k = S(r.range(0.05, 0.2)); } v += (target - v) * 0.0008; wander[i] = v; }
  roar = lowpass(roar, wander, 0.9);
  let pops = crackle(d, r, 22, 0.004); pops = lowpass(pops, 4000); pops = bandpass(pops, wander, 0.8);
  let hiss = noise(d, r); hiss = bandpass(hiss, 2500, 0.7); applyEnv(hiss, (t) => 0.4 + 0.6 * Math.max(0, Math.sin(D.TAU * 0.9 * t) * Math.sin(D.TAU * 2.3 * t)));
  return stack([[roar, 1.2], [pops, 0.8], [hiss, 0.15]]);
}), { loop: true, dur: 3.0 });
def('radio_open', 'env', (r) => stack([[click(r, 0.003, 2500), 0.8], [noiseBurst(0.05, r, { hp: 1500, lp: 4200, tau: 0.02 }), 1, 0.003], [sine(0.02, 1000), 0.4, 0.02]]));
def('radio_close', 'env', (r) => stack([[sine(0.018, 800), 0.4], [noiseBurst(0.045, r, { hp: 1200, lp: 3800, tau: 0.012 }), 1, 0.012], [click(r, 0.003, 2000), 0.7, 0.045]]));
def('radio_static', 'env', (r) => loopRender(2.0, 0.25, (d) => {
  let st = noise(d, r); st = bandpass(st, 1200, 0.5); st = highpass(st, 300); st = lowpass(st, 3200);
  const n = S(d); const am = new Float32Array(n); let v = 1;
  for (let i = 0; i < n; i++) { if (r() < 0.0004) v = r.range(0.4, 1.4); v += (1 - v) * 0.001; am[i] = v; }
  applyEnv(st, am);
  let cr = crackle(d, r, 30, 0.002); cr = bandpass(cr, 1800, 1);
  return stack([[st, 1], [cr, 0.5], [sine(d, 60), 0.03]]);
}), { loop: true, dur: 2.0 });
def('thunder_distant', 'env', (r, i) => {
  const dur = 2.2;
  let rum = brown(dur, r); rum = lowpass(rum, (t) => 110 + 120 * Math.sin(D.TAU * 0.7 * t) ** 2, 0.9);
  const envF = i === 0 ? breakpoints([[0, 0], [0.15, 1], [0.5, 0.4], [0.8, 0.8], [1.4, 0.3], [2.2, 0]]) : breakpoints([[0, 0], [0.3, 0.6], [0.6, 1], [1.0, 0.5], [1.5, 0.6], [2.2, 0]]);
  applyEnv(rum, envF);
  let crack = noiseBurst(0.3, r, { lp: 600, hp: 60, tau: 0.08 });
  let out = stack([[rum, 1], [crack, 0.3, i === 0 ? 0.08 : 0.5], [sine(dur, 38), 0.2]]);
  out = softClip(out, 2.5);
  out = reverb(out, { room: 0.9, damp: 0.7, wet: 0.5, tail: 0.6, hpf: 30 });
  return out;
}, { variants: 2 });
def('orbital_beam_distant', 'env', (r, i) => {
  const dur = 2.4;
  let rum = brown(dur, r); rum = lowpass(rum, 220, 0.9);
  let roar = saw(dur, 40 + 6 * i); roar = lowpass(roar, 320, 1.2); applyEnv(roar, (t) => 0.7 + 0.3 * Math.sin(D.TAU * 8 * t));
  let whine = sine(dur, geoSweep(3000, 2700, dur)); whine = bandpass(whine, 2850, 5);
  let out = stack([[rum, 1], [roar, 0.6], [whine, 0.05]]);
  applyEnv(out, breakpoints([[0, 0], [0.4, 1], [1.4, 0.8], [2.4, 0]]));
  out = softClip(out, 2);
  return reverb(out, { room: 0.9, damp: 0.6, wet: 0.5, tail: 0.6, hpf: 30 });
}, { variants: 2 });

export const SFX_NAMES = Object.keys(SFX);
export const designers = { gunshot, explosion, fleshHit, dirtHit, metalHit, rockHit, splat, footstep, rustle, sparks, heartbeat, engine, whoosh, zap, clank, servo, blip, bell, voiceBark };
