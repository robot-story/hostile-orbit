// Quick self-test for dsp.js / wav.js / mp3.js. Run: node tools/synth/selftest.mjs
import * as D from './dsp.js';
import { encodeWav, decodeWav } from './wav.js';
import { encodeMp3, mp3Info } from './mp3.js';

let fails = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${info}`); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// oscillators
const s = D.sine(0.1, 440);
check('sine peak ~1', near(D.peak(s), 1, 0.01), D.peak(s).toFixed(3));
check('sine rms ~0.707', near(D.rms(s), 0.707, 0.01), D.rms(s).toFixed(3));
const sw = D.saw(0.1, 220);
check('saw range', D.peak(sw) <= 1.3 && D.rms(sw) > 0.5, `peak ${D.peak(sw).toFixed(2)} rms ${D.rms(sw).toFixed(2)}`);
const sq = D.square(0.1, 220);
check('square rms ~1', near(D.rms(sq), 1, 0.08), D.rms(sq).toFixed(3));
const tr = D.tri(0.1, 220);
check('tri rms ~0.577', near(D.rms(tr), 0.577, 0.08), D.rms(tr).toFixed(3));
const f = D.fm(0.1, 200, 400, 3);
check('fm finite', Number.isFinite(D.rms(f)) && D.peak(f) <= 1.0001);
const sweep = D.sine(0.2, D.expSweep(1000, 100, 0.05));
check('sweep finite', Number.isFinite(D.rms(sweep)));

// noise
const rng = D.makeRng('test');
const wn = D.white(0.5, rng), pn = D.pink(0.5, rng), bn = D.brown(0.5, rng);
check('white rms ~0.577', near(D.rms(wn), 0.577, 0.02), D.rms(wn).toFixed(3));
check('pink finite & bounded', D.peak(pn) < 1.5 && D.rms(pn) > 0.05, `peak ${D.peak(pn).toFixed(2)} rms ${D.rms(pn).toFixed(3)}`);
check('brown bounded', D.peak(bn) < 2 && D.rms(bn) > 0.02, `peak ${D.peak(bn).toFixed(2)} rms ${D.rms(bn).toFixed(3)}`);
const r1 = D.makeRng(42), r2 = D.makeRng(42);
check('rng deterministic', r1() === r2() && r1.range(0, 5) === r2.range(0, 5));

// envelopes
const e = D.adsr(1, 0.1, 0.2, 0.5, 0.3);
check('adsr peak 1 & ends 0', near(D.peak(e), 1, 0.01) && e[e.length - 1] < 0.01);
check('adsr sustain', near(e[D.samples(0.5)], 0.5, 0.01), e[D.samples(0.5)].toFixed(3));
const ed = D.expDecay(1, 0.2);
check('expDecay', near(ed[D.samples(0.2)], Math.exp(-1), 0.01));

// filters: lowpass should attenuate 8 kHz much more than 100 Hz
const hi = D.sine(0.3, 8000), lo = D.sine(0.3, 100);
check('lowpass attenuates', D.rms(D.lowpass(hi, 500)) < 0.02 && D.rms(D.lowpass(lo, 500)) > 0.65, `${D.rms(D.lowpass(hi, 500)).toFixed(3)} ${D.rms(D.lowpass(lo, 500)).toFixed(3)}`);
check('highpass attenuates', D.rms(D.highpass(lo, 2000)) < 0.02 && D.rms(D.highpass(hi, 2000)) > 0.65);
const bp = D.bandpass(D.white(0.5, rng), 1000, 10);
check('bandpass narrows', D.rms(bp) < 0.2 && D.rms(bp) > 0.005, D.rms(bp).toFixed(3));
const modLp = D.lowpass(D.white(0.3, rng), (t) => 200 + 5000 * t, 2);
check('modulated lowpass finite', Number.isFinite(D.rms(modLp)) && D.peak(modLp) < 3);
const lad = D.ladder(D.saw(0.3, 110), (t) => 300 + 3000 * t, 0.8);
check('ladder finite', Number.isFinite(D.rms(lad)) && D.peak(lad) < 1.5, D.peak(lad).toFixed(3));

// distortion
check('softClip bounded', D.peak(D.softClip(D.gain(s, 5), 3)) <= 1);
check('hardClip', D.peak(D.hardClip(s, 0.5)) <= 0.5);
check('bitcrush', Number.isFinite(D.rms(D.bitcrush(s, 4, 8))));

// time based
const imp = new Float32Array(D.samples(0.5)); imp[100] = 1;
const rv = D.reverb(imp, { room: 0.8, damp: 0.3, wet: 1, dry: 0, tail: 1.5 });
check('reverb has tail & decays', D.rms(rv.subarray(D.samples(0.2), D.samples(0.6))) > 1e-4 && D.peak(rv.subarray(D.samples(1.8))) < D.peak(rv.subarray(0, D.samples(0.5))), `${D.peak(rv).toFixed(3)} tailpk ${D.peak(rv.subarray(D.samples(1.8))).toExponential(2)}`);
check('reverb finite', Number.isFinite(D.rms(rv)) && D.peak(rv) < 2);
const dl = D.delay(imp, 0.1, 0.5, 1, { tail: 0.5 });
check('delay echoes', dl[100 + D.samples(0.1)] > 0.3 && dl[100 + 2 * D.samples(0.1)] > 0.1);
const ch = D.chorus(s, { mix: 0.5 });
check('chorus finite', Number.isFinite(D.rms(ch)) && D.peak(ch) < 1.2);
const [pl, pr] = D.pingPong(imp, 0.1, 0.5, 1);
check('pingpong stereo', pl.length === pr.length && D.peak(pl) > 0 && D.peak(pr) > 0);

// dynamics
const loud = D.gain(D.sine(0.5, 100), 3);
const lim = D.limiter(loud, 0.9);
check('limiter ceiling', D.peak(lim) <= 0.9 + 1e-6 && D.rms(lim) > 0.5, `peak ${D.peak(lim).toFixed(3)} rms ${D.rms(lim).toFixed(3)}`);
const [cl, cr] = D.limiter([loud, D.gain(loud, 0.5)], 0.9);
check('limiter stereo linked', D.peak(cl) <= 0.9 + 1e-6 && near(D.peak(cr) / D.peak(cl), 0.5, 0.02));
const comp = D.compressor(loud, { threshold: -20, ratio: 8 });
check('compressor reduces', D.rms(comp) < D.rms(loud));

// mix / utils
const m = D.mix([[s, 1, 0], [s, 0.5, 0.05]]);
check('mix length', m.length === D.samples(0.05) + s.length);
const nrm = D.normalize(D.gain(s, 0.1), -1);
check('normalize -1dB', near(D.peak(nrm), D.dbToGain(-1), 0.002));
check('noteToFreq', near(D.noteToFreq('A4'), 440, 0.01) && near(D.noteToFreq('D3'), 146.83, 0.05) && near(D.noteToFreq('Bb2'), 116.54, 0.05));
const rs = D.resample(D.sine(1, 1000), 44100, 22050);
check('resample length', rs.length === 22050, rs.length);
check('resample level', near(D.rms(rs), 0.707, 0.02), D.rms(rs).toFixed(3));
const rsHi = D.resample(D.sine(1, 15000), 44100, 22050);
check('resample kills alias', D.rms(rsHi) < 0.02, D.rms(rsHi).toFixed(4));
const lc = D.loopCrossfade(D.white(1, rng), 0.1);
check('loopCrossfade length', lc.length === D.samples(0.9));
const dc = new Float32Array(1000).fill(0.5); D.dcBlock(dc);
check('dcBlock', Math.abs(dc[999]) < 0.01);
const tt = D.trimTail(D.concat(s, D.silence(1)));
check('trimTail', tt.length < s.length + D.samples(0.05), tt.length);
const [pL, pR] = D.pan(s, 1);
check('pan hard right', D.peak(pL) < 0.01 && near(D.peak(pR), 1, 0.01));

// wav round trip
const stereo = [D.sine(0.2, 440), D.sine(0.2, 660)];
const wb = encodeWav(stereo, 44100);
const dec = decodeWav(wb);
check('wav roundtrip', dec.sampleRate === 44100 && dec.channels.length === 2 && dec.channels[0].length === stereo[0].length && near(dec.channels[1][1000], stereo[1][1000], 1e-3));

// mp3
const mp = encodeMp3(stereo, 44100, 128);
const info = mp3Info(mp);
check('mp3 encodes', mp.length > 1000 && info.frames > 5 && info.sampleRate === 44100 && info.channels === 2, JSON.stringify(info));
check('mp3 gapless tag', info.hasInfoTag && info.encoderDelay === 576 && info.gaplessSamples === stereo[0].length, `gapless ${info.gaplessSamples} vs ${stereo[0].length}`);
const mpMono = encodeMp3(D.resample(D.sine(1, 440), 44100, 22050), 22050, 64);
const infoM = mp3Info(mpMono);
check('mp3 mono 22050', infoM.sampleRate === 22050 && infoM.channels === 1 && infoM.gaplessSamples === 22050, JSON.stringify(infoM));

console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exit(fails ? 1 : 0);
