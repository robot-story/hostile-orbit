// Clears build output before `vite build` without failing on Dropbox file locks (EBUSY on rmdir while Dropbox syncs).
// Only the hashed bundles in dist/assets need clearing; public/ copies are overwritten in place.
import fs from 'node:fs';
import path from 'node:path';
const assets = path.resolve('dist', 'assets');
if (fs.existsSync(assets)) {
  for (const f of fs.readdirSync(assets)) {
    const p = path.join(assets, f);
    for (let attempt = 0; attempt < 5; attempt++) {
      try { fs.rmSync(p, { force: true, recursive: true }); break; } catch (e) { if (attempt === 4) console.warn('[clean-dist] left in place:', f, e.code); else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); }
    }
  }
}
console.log('[clean-dist] ok');
