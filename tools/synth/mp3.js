// MP3 encoder wrapper around lamejs (pure JS).
// NOTE: lamejs@1.2.1's CommonJS entry (src/js/index.js) is broken under Node (missing MPEGMode/Lame
// globals), so we load the self-contained browser bundle lame.all.js and pull the `lamejs` function out.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { floatToInt16 } from './wav.js';

const require = createRequire(import.meta.url);

let _lame = null;
function lame() {
  if (_lame) return _lame;
  const src = fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
  // The bundle is `function lamejs(){ ... lamejs.Mp3Encoder = ...; } lamejs();` — evaluate and return it.
  _lame = new Function(src + '\nreturn lamejs;')();
  if (!_lame || !_lame.Mp3Encoder) throw new Error('failed to load lamejs');
  return _lame;
}

/** LAME's fixed encoder delay (samples). Decoders add their own 528+1 on top. */
export const ENCODER_DELAY = 576;

/**
 * Encode PCM to MP3 (CBR). channels: Float32Array (mono) or [L, R]. Returns a Node Buffer.
 * lamejs does not write a Xing/Info header, so by default we prepend a proper "Info" frame with a LAME
 * tag carrying encoder delay + padding; gapless-aware decoders (Chrome/ffmpeg, Firefox, Safari) then
 * trim the stream back to exactly the input sample count, which makes loops seamless.
 */
export function encodeMp3(channels, sampleRate, kbps = 128, { gaplessTag = true } = {}) {
  const chans = Array.isArray(channels) ? channels : [channels];
  const nCh = chans.length;
  const n = chans[0].length;
  const L = lame();
  const enc = new L.Mp3Encoder(nCh, sampleRate, kbps);
  const ints = chans.map(floatToInt16);
  const parts = [];
  const block = 1152;
  for (let i = 0; i < n; i += block) {
    const l = ints[0].subarray(i, Math.min(n, i + block));
    const out = nCh === 2 ? enc.encodeBuffer(l, ints[1].subarray(i, Math.min(n, i + block))) : enc.encodeBuffer(l);
    if (out.length) parts.push(Buffer.from(out));
  }
  const fin = enc.flush();
  if (fin.length) parts.push(Buffer.from(fin));
  const audio = Buffer.concat(parts);
  return gaplessTag ? prependInfoTag(audio, n) : audio;
}

// CRC-16/ARC (poly 0x8005 reflected), as used by LAME for the tag CRC.
function crc16(buf, len) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
  }
  return crc & 0xffff;
}

/** Parse one MPEG audio frame header at pos. Returns null if not a valid layer III header. */
function parseHeader(buf, pos) {
  if (pos + 4 > buf.length || buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) return null;
  const ver = (buf[pos + 1] >> 3) & 3, layer = (buf[pos + 1] >> 1) & 3;
  const brIdx = (buf[pos + 2] >> 4) & 15, srIdx = (buf[pos + 2] >> 2) & 3, padding = (buf[pos + 2] >> 1) & 1;
  const chMode = (buf[pos + 3] >> 6) & 3;
  if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const sampleRate = SAMPLERATES[ver][srIdx];
  const kbps = (ver === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[brIdx];
  const spf = ver === 3 ? 1152 : 576;
  const length = Math.floor(spf / 8 * kbps * 1000 / sampleRate) + padding;
  const channels = chMode === 3 ? 1 : 2;
  const sideInfo = ver === 3 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17);
  return { ver, sampleRate, kbps, spf, length, channels, sideInfo, padding, protection: (buf[pos + 1] & 1) === 0 };
}

/** Build and prepend a Xing/"Info" frame with LAME tag (delay/padding) to a raw CBR mp3 stream. */
export function prependInfoTag(audio, pcmSamples, encoderDelay = ENCODER_DELAY) {
  const h = parseHeader(audio, 0);
  if (!h) throw new Error('prependInfoTag: first bytes are not an MPEG frame');
  // count audio frames
  let frames = 0, pos = 0;
  while (pos + 4 <= audio.length) { const f = parseHeader(audio, pos); if (!f) { pos++; continue; } frames++; pos += f.length; }
  const totalOut = frames * h.spf;
  const padding = Math.max(0, totalOut - pcmSamples - encoderDelay);
  const frameLen = Math.floor(h.spf / 8 * h.kbps * 1000 / h.sampleRate); // unpadded
  const frame = Buffer.alloc(frameLen, 0);
  frame[0] = audio[0]; frame[1] = audio[1] | 0x01 /* no CRC */; frame[2] = audio[2] & ~0x02 /* no padding */; frame[3] = audio[3];
  let o = 4 + h.sideInfo;
  frame.write('Info', o); o += 4;
  frame.writeUInt32BE(0x0000000F, o); o += 4;            // flags: frames, bytes, toc, quality
  frame.writeUInt32BE(frames, o); o += 4;                 // audio frames (excluding this one)
  frame.writeUInt32BE(audio.length + frameLen, o); o += 4;// total bytes incl. this frame
  for (let i = 0; i < 100; i++) frame[o + i] = Math.floor(256 * i / 100); o += 100; // linear TOC (CBR)
  frame.writeUInt32BE(0, o); o += 4;                      // quality
  frame.write('LAME3.99r', o, 'latin1'); o += 9;
  frame[o++] = 0x01;                                      // tag revision 0, VBR method 1 = CBR
  frame[o++] = 0;                                         // lowpass
  o += 8;                                                 // replay gain fields (zero)
  frame[o++] = 0;                                         // encoding flags / ATH type
  frame[o++] = Math.min(255, h.kbps);                     // bitrate
  frame[o++] = (encoderDelay >> 4) & 0xff;                // delay (12 bits) + padding (12 bits), big-endian 24-bit
  frame[o++] = ((encoderDelay & 0x0f) << 4) | ((padding >> 8) & 0x0f);
  frame[o++] = padding & 0xff;
  frame[o++] = 0;                                         // misc
  frame[o++] = 0;                                         // mp3 gain
  o += 2;                                                 // preset / surround
  frame.writeUInt32BE(audio.length, o); o += 4;           // music length (bytes of audio frames)
  o += 2;                                                 // music CRC (0)
  frame.writeUInt16BE(crc16(frame, o), o);                // tag CRC over everything before it
  return Buffer.concat([frame, audio]);
}

export function writeMp3(path, channels, sampleRate, kbps = 128) {
  fs.writeFileSync(path, encodeMp3(channels, sampleRate, kbps));
}

// --- Minimal MPEG frame parser (for verification: duration / frame count) ---------------------
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLERATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * Parse MP3 frame headers. Returns { frames, sampleRate, channels, durationSec, bitrateKbps, samples,
 * hasInfoTag, encoderDelay, encoderPadding, gaplessSamples }.
 * `frames`/`samples` exclude the Info frame; `gaplessSamples` is what a gapless-aware decoder outputs.
 */
export function mp3Info(buf) {
  let pos = 0, frames = 0, sampleRate = 0, channels = 0, kbpsSum = 0, samplesTotal = 0;
  let hasInfoTag = false, encoderDelay = 0, encoderPadding = 0;
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    pos = 10 + size;
  }
  let first = true;
  while (pos + 4 <= buf.length) {
    const h = parseHeader(buf, pos);
    if (!h || h.length <= 4) { pos++; continue; }
    if (first) {
      first = false;
      const tag = buf.toString('latin1', pos + 4 + h.sideInfo, pos + 4 + h.sideInfo + 4);
      if (tag === 'Info' || tag === 'Xing') {
        hasInfoTag = true;
        const lameAt = pos + 4 + h.sideInfo + 120;
        const ver = buf.toString('latin1', lameAt, lameAt + 4);
        if (ver === 'LAME' || ver === 'Lavf' || ver === 'Lavc') {
          const b = lameAt + 21;
          encoderDelay = (buf[b] << 4) | (buf[b + 1] >> 4);
          encoderPadding = ((buf[b + 1] & 0x0f) << 8) | buf[b + 2];
        }
        sampleRate = h.sampleRate; channels = h.channels;
        pos += h.length; continue;
      }
    }
    frames++; sampleRate = h.sampleRate; channels = h.channels; kbpsSum += h.kbps; samplesTotal += h.spf;
    pos += h.length;
  }
  const gaplessSamples = hasInfoTag ? samplesTotal - encoderDelay - encoderPadding : samplesTotal;
  return { frames, sampleRate, channels, durationSec: sampleRate ? samplesTotal / sampleRate : 0, bitrateKbps: frames ? kbpsSum / frames : 0, samples: samplesTotal, hasInfoTag, encoderDelay, encoderPadding, gaplessSamples };
}
