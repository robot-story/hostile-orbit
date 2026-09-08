// Procedural canvas textures. Everything is generated at runtime; no external image assets except the level map.
import * as THREE from 'three';
import { seededRandom, clamp } from '../core/mathx.js';

const cache = new Map();
function canvasTex(key, size, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = size; c.height = opts.height || size;
  const ctx = c.getContext('2d');
  draw(ctx, c.width, c.height, seededRandom(hashStr(key)));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  cache.set(key, t);
  return t;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function grime(ctx, w, h, rnd, n, alpha, color = '0,0,0') {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha * rnd()})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function scratches(ctx, w, h, rnd, n, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 12); ctx.stroke(); }
}
function noiseFill(ctx, w, h, rnd, amount) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amount; d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255); }
  ctx.putImageData(img, 0, 0);
}

export const Tex = {
  /** Dirty white armour with chips exposing dark metal. */
  armorWhite() {
    return canvasTex('armorWhite', 512, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#d9d4c8'; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 26);
      grime(ctx, w, h, rnd, 160, 0.35, '60,50,40');
      grime(ctx, w, h, rnd, 40, 0.3, '120,90,60');
      // chips
      ctx.fillStyle = '#1b1c1f';
      for (let i = 0; i < 160; i++) { const x = rnd() * w, y = rnd() * h, s = 1 + rnd() * 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * (1 + rnd()), y + s * (rnd() - 0.5)); ctx.lineTo(x + s * rnd(), y + s); ctx.closePath(); ctx.fill(); }
      scratches(ctx, w, h, rnd, 90, 'rgba(40,40,45,0.5)');
      // panel seams
      ctx.strokeStyle = 'rgba(30,30,35,0.55)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const y = rnd() * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (rnd() - 0.5) * 30); ctx.stroke(); }
    });
  },
  /** Black armour under-suit / plates. */
  armorBlack() {
    return canvasTex('armorBlack', 512, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#17181b'; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 18);
      grime(ctx, w, h, rnd, 80, 0.4, '80,70,60');
      scratches(ctx, w, h, rnd, 120, 'rgba(120,120,130,0.35)');
      // hex weave
      ctx.strokeStyle = 'rgba(70,72,80,0.35)'; ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 16) { const ox = (y / 14) % 2 ? 8 : 0; ctx.strokeRect(x + ox, y, 12, 10); }
    });
  },
  /** Dark military metal panels with rivets; base for crates, walls, buildings. */
  metalPanel(variant = 0) {
    return canvasTex('metalPanel' + variant, 512, (ctx, w, h, rnd) => {
      const base = ['#3a3d42', '#2c2f34', '#4a4d52', '#34363b'][variant % 4];
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 22);
      const cols = 2 + (variant % 2), rows = 2 + ((variant + 1) % 2);
      const pw = w / cols, ph = h / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = i * pw, y = j * ph;
        ctx.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.15})`; ctx.fillRect(x, y, pw, 4); ctx.fillRect(x, y, 4, ph);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 4, y + ph - 3, pw - 4, 3);
        // rivets
        ctx.fillStyle = '#1a1b1e';
        for (let k = 0; k < 6; k++) { const rx = x + 10 + (k % 3) * ((pw - 20) / 2), ry = y + 10 + Math.floor(k / 3) * (ph - 20); ctx.beginPath(); ctx.arc(rx, ry, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#5a5e66'; ctx.beginPath(); ctx.arc(rx - 1, ry - 1, 1.5, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1b1e'; }
      }
      grime(ctx, w, h, rnd, 120, 0.45, '20,18,15');
      grime(ctx, w, h, rnd, 30, 0.35, '150,90,40'); // rust / dust
      scratches(ctx, w, h, rnd, 80, 'rgba(160,160,170,0.3)');
    });
  },
  /** Hazard stripes strip. */
  hazard() {
    return canvasTex('hazard', 256, (ctx, w, h) => {
      ctx.fillStyle = '#e0a020'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#151516';
      for (let x = -h; x < w + h; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 24, 0); ctx.lineTo(x + 24 - h, h); ctx.lineTo(x - h, h); ctx.closePath(); ctx.fill(); }
      grime(ctx, w, h, seededRandom(7), 60, 0.5, '30,25,20');
    }, { height: 64 });
  },
  /** Ground: burnt orange dust with darker rock speckle. */
  terrain() {
    return canvasTex('terrain', 1024, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#c9783f'; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 34);
      for (let i = 0; i < 1800; i++) { const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 5; ctx.fillStyle = rnd() < 0.45 ? `rgba(70,40,26,${0.12 + rnd() * 0.3})` : `rgba(240,170,110,${0.15 + rnd() * 0.3})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      grime(ctx, w, h, rnd, 120, 0.22, '90,50,30');
      grime(ctx, w, h, rnd, 140, 0.3, '245,180,120');
      // cracks
      ctx.strokeStyle = 'rgba(30,18,12,0.6)'; ctx.lineWidth = 2;
      for (let i = 0; i < 60; i++) { let x = rnd() * w, y = rnd() * h; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y); } ctx.stroke(); }
    }, { repeat: [40, 40] });
  },
  /** Neon energy veins mask (emissive) for terrain cracks. */
  veins() {
    return canvasTex('veins', 1024, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        let x = rnd() * w, y = rnd() * h; const col = rnd() < 0.5 ? '#9b4dff' : '#3dff9a';
        ctx.strokeStyle = col; ctx.lineWidth = 2 + rnd() * 3; ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 14; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }, { repeat: [40, 40] });
  },
  rock() {
    return canvasTex('rock', 512, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#26221f'; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 30);
      for (let i = 0; i < 700; i++) { const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 14; ctx.fillStyle = rnd() < 0.6 ? `rgba(15,12,10,${0.2 + rnd() * 0.5})` : `rgba(150,90,50,${0.1 + rnd() * 0.25})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, 7); ctx.fill(); }
      scratches(ctx, w, h, rnd, 200, 'rgba(90,70,55,0.35)');
    }, { repeat: [2, 2] });
  },
  concrete() {
    return canvasTex('concrete', 512, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#6a6b68'; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 28);
      grime(ctx, w, h, rnd, 160, 0.4, '30,28,25');
      grime(ctx, w, h, rnd, 60, 0.3, '160,100,60');
      ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      scratches(ctx, w, h, rnd, 100, 'rgba(0,0,0,0.3)');
    }, { repeat: [2, 2] });
  },
  /** Neon strip texture: bright core with soft falloff, used with emissive materials. */
  neonStrip() {
    return canvasTex('neonStrip', 64, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#000'); g.addColorStop(0.35, '#fff'); g.addColorStop(0.65, '#fff'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, { height: 16, clamp: true });
  },
  /** Soft radial glow sprite. */
  glow() {
    return canvasTex('glow', 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, { clamp: true });
  },
  /** Hard-edged particle (sparks/blood droplets). */
  dot() {
    return canvasTex('dot', 32, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, { clamp: true });
  },
  smoke() {
    return canvasTex('smoke', 128, (ctx, w, h, rnd) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { const x = w / 2 + (rnd() - 0.5) * 60, y = h / 2 + (rnd() - 0.5) * 60, r = 14 + rnd() * 26; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    }, { clamp: true });
  },
  /** Blood splatter decal (irregular). */
  bloodSplat(variant = 0) {
    return canvasTex('blood' + variant, 256, (ctx, w, h, rnd) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 70; i++) { const a = rnd() * 6.283, d = Math.pow(rnd(), 1.6) * 100, r = 2 + rnd() * 18 * (1 - d / 120); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, 7); ctx.fill(); }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 7); ctx.fill();
      for (let i = 0; i < 24; i++) { const a = rnd() * 6.283, d = 40 + rnd() * 70; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rnd() * 3, 3 + rnd() * 8, a, 0, 7); ctx.fill(); }
    }, { clamp: true });
  },
  scorch() {
    return canvasTex('scorch', 256, (ctx, w, h, rnd) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 60; i++) { const a = rnd() * 6.283, d = 60 + rnd() * 70; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + rnd() * 16, 0, 7); ctx.fill(); }
    }, { clamp: true });
  },
  bulletHole() {
    return canvasTex('bulletHole', 64, (ctx, w, h, rnd) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { const a = rnd() * 6.283; ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1 + rnd() * 2; ctx.stroke(); }
    }, { clamp: true });
  },
  /** Holographic grid for war table / screens. */
  holoGrid() {
    return canvasTex('holoGrid', 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i <= w; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0,229,255,0.12)';
      for (let i = 0; i <= w; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    }, { repeat: [8, 8] });
  },
  /** Commonwealth chevron emblem (the V logo). */
  emblem(color = '#00e5ff') {
    return canvasTex('emblem' + color, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(40, 50); ctx.lineTo(216, 50); ctx.lineTo(128, 200); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(90, 78); ctx.lineTo(166, 78); ctx.lineTo(128, 140); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(104, 160); ctx.lineTo(152, 160); ctx.lineTo(128, 210); ctx.closePath(); ctx.fill();
    }, { clamp: true });
  },
  /** Propaganda poster: slogan on neon panel. */
  poster(slogan, sub = 'MERIDIAN COMMONWEALTH', accent = '#00e5ff', idx = 0) {
    return canvasTex('poster:' + slogan + idx, 512, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#0a0f14'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(0,229,255,0.15)'); g.addColorStop(1, 'rgba(255,90,20,0.12)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      // frame
      ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.shadowColor = accent; ctx.shadowBlur = 20;
      // emblem
      ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(w / 2 - 50, 60); ctx.lineTo(w / 2 + 50, 60); ctx.lineTo(w / 2, 150); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // slogan
      ctx.fillStyle = '#eef6f8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const words = slogan.toUpperCase().split(' ');
      const lines = []; let cur = '';
      for (const wd of words) { const test = cur ? cur + ' ' + wd : wd; if (test.length > 14 && cur) { lines.push(cur); cur = wd; } else cur = test; }
      if (cur) lines.push(cur);
      const fs = lines.length > 3 ? 52 : 62;
      ctx.font = `700 ${fs}px Rajdhani, Bahnschrift, "Segoe UI", sans-serif`;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, 255 + (i - (lines.length - 1) / 2) * (fs + 6)));
      ctx.fillStyle = accent; ctx.font = '500 22px Rajdhani, Bahnschrift, sans-serif';
      ctx.fillText(sub, w / 2, h - 60);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '400 14px Rajdhani, Bahnschrift, sans-serif';
      ctx.fillText('APPROVED MESSAGING  //  REF ' + (1000 + Math.floor(rnd() * 9000)), w / 2, h - 34);
      grime(ctx, w, h, rnd, 60, 0.4, '20,15,10');
    }, { clamp: true, height: 640 });
  },
  /** Console screen content (fake tactical UI) */
  screen(variant = 0) {
    return canvasTex('screen' + variant, 256, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#031014'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,229,255,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(10, 20 + i * 14); ctx.lineTo(10 + rnd() * 200, 20 + i * 14); ctx.stroke(); }
      ctx.strokeStyle = '#00e5ff'; ctx.beginPath(); ctx.arc(190, 60, 40, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(190, 60, 25, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ff5a1f'; for (let i = 0; i < 6; i++) { ctx.fillRect(20 + rnd() * 200, 120 + rnd() * 100, 6, 6); }
      ctx.fillStyle = '#00e5ff'; ctx.font = '12px monospace'; ctx.fillText(['SIGNAL LOST', 'B-07 ARRAY', 'JAMMING 98%', 'CITIZEN SCORE OK'][variant % 4], 14, 240);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    }, { clamp: true });
  },
  planet() {
    return canvasTex('planet', 1024, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#b4582a'; ctx.fillRect(0, 0, w, h);
      noiseFill(ctx, w, h, rnd, 30);
      for (let i = 0; i < 900; i++) { const x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 40; const g = ctx.createRadialGradient(x, y, 0, x, y, r); const dark = rnd() < 0.55; g.addColorStop(0, dark ? `rgba(60,30,20,${0.3 + rnd() * 0.4})` : `rgba(240,160,90,${0.2 + rnd() * 0.3})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      // polar cap
      const pc = ctx.createLinearGradient(0, 0, 0, 90); pc.addColorStop(0, 'rgba(220,230,240,0.85)'); pc.addColorStop(1, 'rgba(220,230,240,0)'); ctx.fillStyle = pc; ctx.fillRect(0, 0, w, 90);
      // city lights (cyan) and burning zones (orange)
      for (let i = 0; i < 260; i++) { ctx.fillStyle = rnd() < 0.6 ? 'rgba(0,229,255,0.9)' : 'rgba(255,120,40,0.9)'; ctx.fillRect(rnd() * w, 200 + rnd() * 600, 2, 2); }
    }, { height: 512 });
  },
  planetEmissive() {
    return canvasTex('planetEmissive', 1024, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { const x = rnd() * w, y = 220 + rnd() * 500; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 8; ctx.fillStyle = '#00e5ff'; for (let k = 0; k < 30; k++) ctx.fillRect(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 30, 2, 2); }
      for (let i = 0; i < 12; i++) { const x = rnd() * w, y = 250 + rnd() * 400; const g = ctx.createRadialGradient(x, y, 0, x, y, 30); g.addColorStop(0, 'rgba(255,120,30,0.9)'); g.addColorStop(1, 'rgba(255,60,10,0)'); ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60); }
    }, { height: 512 });
  },
  membrane() {
    return canvasTex('membrane', 256, (ctx, w, h, rnd) => {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.quadraticCurveTo(w / 2 + (rnd() - 0.5) * 200, h / 2, rnd() * w, 0); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,1)'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 4, 0, 7); ctx.fill(); }
    }, { clamp: true });
  },
};
