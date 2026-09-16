// Dry-run by default. Restores only the files listed in the verified backup manifest.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backup = path.join(root, 'backups/characters-before-mk3-2026-09-14');
const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
const apply = process.argv.includes('--apply');
const safetyCopy = path.join(root, 'backups', 'before-character-restore-' + new Date().toISOString().replaceAll(':', '-'));
for (const { file, sha256 } of manifest.files) {
  const source = path.resolve(backup, file), dest = path.resolve(root, file);
  if (!source.startsWith(backup + path.sep) || !dest.startsWith(root + path.sep)) throw new Error('Path outside workspace: ' + file);
  const bytes = fs.readFileSync(source);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Backup checksum mismatch: ' + file);
}
if (apply) {
  for (const { file } of manifest.files) {
    const dest = path.join(root, file), saved = path.join(safetyCopy, file);
    if (fs.existsSync(dest)) { fs.mkdirSync(path.dirname(saved), { recursive: true }); fs.copyFileSync(dest, saved); }
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(backup, file), dest);
  }
  console.log('Original character files restored. Previous files saved in ' + safetyCopy + '. Run npm run build.');
} else console.log('Verified ' + manifest.files.length + ' backup files. Preview only; use node tools/restore-characters.mjs --apply to restore.');
