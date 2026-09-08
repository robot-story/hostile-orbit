// Renders every SFX (all variants) and prints duration / peak / rms / render time. Used during development.
import * as D from './dsp.js';
import { SFX } from './sfx.js';
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
let fails = 0, total = 0;
const t0 = Date.now();
for (const [name, def] of Object.entries(SFX)) {
  if (only && !only.test(name)) continue;
  for (let v = 0; v < def.variants; v++) {
    const rng = D.makeRng(`${name}#${v}`);
    const t = Date.now();
    try {
      const buf = def.render(rng, v);
      if (!(buf instanceof Float32Array)) throw new Error('not Float32Array');
      let nan = 0; for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) nan++;
      const dur = buf.length / D.SR, pk = D.peak(buf), rm = D.rms(buf);
      const ms = Date.now() - t; total += ms;
      const flags = [];
      if (nan) flags.push('NaN=' + nan);
      if (pk < 1e-4) flags.push('SILENT');
      if (def.loop && buf.length !== D.samples(def.dur)) flags.push(`LOOPLEN ${buf.length} != ${D.samples(def.dur)}`);
      if (flags.length) fails++;
      console.log(`${(name + (def.variants > 1 ? '_' + (v + 1) : '')).padEnd(28)} ${dur.toFixed(3).padStart(7)}s peak ${pk.toFixed(3).padStart(7)} rms ${rm.toFixed(4).padStart(7)} ${String(ms).padStart(5)}ms ${flags.join(' ')}`);
    } catch (e) {
      fails++; console.log(`${name}#${v} ERROR ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
}
console.log(`\n${fails} problems, render time ${(Date.now() - t0) / 1000}s`);
