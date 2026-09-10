// Dev-only screenshot sink: the running game POSTs PNG data URLs here (window.HO.snap('name')) and they land in
// screenshot/auto/<name>.png so animation strips and critic reviews can be produced from real frames.
// Usage: node tools/shotserver.mjs   (listens on http://127.0.0.1:5174)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshot', 'auto');
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(404); return res.end('nope'); }
  const url = new URL(req.url, 'http://x');
  const name = (url.searchParams.get('name') || `shot_${Date.now()}`).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks).toString('utf8');
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      const file = path.join(OUT, name + '.png');
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(file);
      console.log('saved', file, Math.round(b64.length * 0.75 / 1024) + ' KB');
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
});
server.listen(5174, '127.0.0.1', () => console.log('[shotserver] http://127.0.0.1:5174  ->', OUT));
