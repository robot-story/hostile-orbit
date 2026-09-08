// WAV writer/reader (16-bit PCM, mono or stereo).
import fs from 'node:fs';

/** Float32 [-1,1] -> Int16 with clamping. */
export function floatToInt16(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const s = buf[i] < -1 ? -1 : buf[i] > 1 ? 1 : buf[i];
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}

/**
 * Encode WAV. channels: Float32Array (mono) or [L, R].
 * Returns a Node Buffer.
 */
export function encodeWav(channels, sampleRate) {
  const chans = Array.isArray(channels) ? channels : [channels];
  const nCh = chans.length;
  const n = chans[0].length;
  for (const c of chans) if (c.length !== n) throw new Error('encodeWav: channel length mismatch');
  const bytesPerSample = 2;
  const dataBytes = n * nCh * bytesPerSample;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);            // PCM chunk size
  buf.writeUInt16LE(1, 20);             // PCM format
  buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * nCh * bytesPerSample, 28);
  buf.writeUInt16LE(nCh * bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  const ints = chans.map(floatToInt16);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) { buf.writeInt16LE(ints[c][i], o); o += 2; }
  }
  return buf;
}

export function writeWav(path, channels, sampleRate) {
  fs.writeFileSync(path, encodeWav(channels, sampleRate));
}

/**
 * Decode a WAV file (PCM 8/16/24/32-bit or float32). Returns { sampleRate, channels: Float32Array[] }.
 */
export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
      if (fmt.format === 0xFFFE && size >= 26) fmt.format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE subformat
    } else if (id === 'data') { data = { start: body, size: Math.min(size, buf.length - body) }; }
    pos = body + size + (size & 1);
    if (fmt && data) break;
  }
  if (!fmt || !data) throw new Error('WAV missing fmt or data chunk');
  const { channels: nCh, bits, sampleRate, format } = fmt;
  const bps = bits / 8;
  const frames = Math.floor(data.size / (bps * nCh));
  const chans = Array.from({ length: nCh }, () => new Float32Array(frames));
  let o = data.start;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      let v;
      if (format === 3 && bits === 32) v = buf.readFloatLE(o);
      else if (bits === 16) v = buf.readInt16LE(o) / 32768;
      else if (bits === 24) v = ((buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16)) << 8 >> 8) / 8388608;
      else if (bits === 32) v = buf.readInt32LE(o) / 2147483648;
      else if (bits === 8) v = (buf[o] - 128) / 128;
      else throw new Error('unsupported WAV bit depth ' + bits);
      chans[c][i] = v; o += bps;
    }
  }
  return { sampleRate, channels: chans };
}

export function readWav(path) { return decodeWav(fs.readFileSync(path)); }
