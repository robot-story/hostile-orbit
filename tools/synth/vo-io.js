// vo-io.js — tiny WAV reader/writer + lamejs MP3 encode helpers for the VO pipeline.
// Pure Node, no external deps except lamejs (CommonJS, loaded via createRequire).

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

// lamejs 1.2.1: the src/js CommonJS entry references undeclared globals (MPEGMode etc.)
// and throws at Mp3Encoder construction. The self-contained lame.all.js bundle works, but
// it only defines a module-scoped function lamejs() with Mp3Encoder attached as a property,
// so evaluate its source and return that function.
let _lame = null;
function lame() {
  if (!_lame) {
    const src = readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
    _lame = new Function(src + '\nreturn lamejs;')();
    if (typeof _lame?.Mp3Encoder !== 'function') throw new Error('lamejs: Mp3Encoder not found in lame.all.js');
  }
  return _lame;
}

/**
 * Parse a RIFF/WAVE buffer into mono Float32 samples.
 * Supports PCM 8/16/24/32-bit, IEEE float 32/64, and WAVE_FORMAT_EXTENSIBLE.
 * Multi-channel input is averaged down to mono.
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @returns {{ sampleRate:number, channels:number, bitsPerSample:number, samples:Float32Array }}
 */
export function parseWav(input) {
  const buf = input instanceof ArrayBuffer ? Buffer.from(input)
    : Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('parseWav: not a RIFF/WAVE buffer');
  }
  let pos = 12;
  let fmt = null;
  let dataStart = -1, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    let size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      let audioFormat = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const sampleRate = buf.readUInt32LE(body + 4);
      const bitsPerSample = buf.readUInt16LE(body + 14);
      if (audioFormat === 0xfffe && size >= 26) {
        // WAVE_FORMAT_EXTENSIBLE: sub-format GUID's first two bytes hold the real format tag
        audioFormat = buf.readUInt16LE(body + 24);
      }
      fmt = { audioFormat, channels, sampleRate, bitsPerSample };
    } else if (id === 'data') {
      dataStart = body;
      dataLen = Math.min(size, buf.length - body); // tolerate streaming-style bogus sizes
      if (size === 0xffffffff || size === 0) dataLen = buf.length - body;
    }
    pos = body + size + (size & 1);
    if (dataStart >= 0 && fmt) break;
  }
  if (!fmt) throw new Error('parseWav: missing fmt chunk');
  if (dataStart < 0) throw new Error('parseWav: missing data chunk');

  const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
  const bytesPerSample = bitsPerSample >> 3;
  const frameBytes = bytesPerSample * channels;
  const frames = Math.floor(dataLen / frameBytes);
  const out = new Float32Array(frames);
  const inv = 1 / channels;

  let read;
  if (audioFormat === 3 && bitsPerSample === 32) read = (o) => buf.readFloatLE(o);
  else if (audioFormat === 3 && bitsPerSample === 64) read = (o) => buf.readDoubleLE(o);
  else if (audioFormat === 1 && bitsPerSample === 16) read = (o) => buf.readInt16LE(o) / 32768;
  else if (audioFormat === 1 && bitsPerSample === 24) read = (o) => buf.readIntLE(o, 3) / 8388608;
  else if (audioFormat === 1 && bitsPerSample === 32) read = (o) => buf.readInt32LE(o) / 2147483648;
  else if (audioFormat === 1 && bitsPerSample === 8) read = (o) => (buf.readUInt8(o) - 128) / 128;
  else throw new Error(`parseWav: unsupported format tag ${audioFormat} / ${bitsPerSample}-bit`);

  for (let i = 0; i < frames; i++) {
    const base = dataStart + i * frameBytes;
    let acc = 0;
    for (let c = 0; c < channels; c++) acc += read(base + c * bytesPerSample);
    out[i] = acc * inv;
  }
  return { sampleRate, channels, bitsPerSample, samples: out };
}

/**
 * Encode mono Float32 samples as a 16-bit PCM WAV Buffer.
 */
export function writeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = samples[i];
    if (v > 1) v = 1; else if (v < -1) v = -1;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** Float32 [-1,1] -> Int16Array with hard clip. */
export function floatToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i];
    if (v > 1) v = 1; else if (v < -1) v = -1;
    out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
  return out;
}

/**
 * Encode mono Float32 samples to a CBR MP3 Buffer using lamejs.
 * @param {Float32Array} samples
 * @param {number} sampleRate  e.g. 22050 or 24000
 * @param {number} kbps        e.g. 80
 */
export function encodeMp3(samples, sampleRate, kbps = 80) {
  const { Mp3Encoder } = lame();
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const pcm = floatToInt16(samples);
  const block = 1152;
  const chunks = [];
  for (let i = 0; i < pcm.length; i += block) {
    const part = pcm.subarray(i, Math.min(i + block, pcm.length));
    const mp3 = enc.encodeBuffer(part);
    if (mp3.length > 0) chunks.push(Buffer.from(mp3.buffer, mp3.byteOffset, mp3.length));
  }
  const tail = enc.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length));
  return Buffer.concat(chunks);
}
