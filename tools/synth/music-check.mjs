import * as D from './dsp.js';
import { MUSIC, TOTAL_SAMPLES } from './music.js';
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const [name, def] of Object.entries(MUSIC)) {
  if (only && !only.test(name)) continue;
  const t = Date.now();
  try {
    const st = def.render(D.makeRng('music:' + name));
    let nan = 0; for (const c of st) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) nan++;
    const pkL = D.peak(st[0]), pkR = D.peak(st[1]), rm = D.rms(st[0]);
    const lenOk = !def.loop || st[0].length === TOTAL_SAMPLES;
    console.log(`${name.padEnd(18)} len ${st[0].length} ${lenOk ? 'OK' : 'BAD LEN'} peak ${pkL.toFixed(3)}/${pkR.toFixed(3)} rms ${rm.toFixed(3)} ${nan ? 'NaN=' + nan : ''} ${Date.now() - t}ms`);
  } catch (e) { console.log(name, 'ERROR', e.stack.split('\n').slice(0, 4).join(' | ')); }
}
