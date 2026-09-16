// Procedural wear textures: every armour material gets a scuffed colour map + a
// matching roughness map, so plates read as used hardware instead of clean CG.
import * as THREE from 'three';

let _seed = 1337;
const rnd = () => (_seed = (_seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}

/** Speckle grain + streaks + scratch lines over a base colour. */
function wearColor(base, opts = {}) {
  const { grime = '#0e1014', dirt = 0.16, speckle = 2600, scratches = 90, patches = 26, bright = '#ffffff' } = opts;
  const c = canvas(512), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  // broad grime patches
  for (let i = 0; i < patches; i++) {
    const r = 30 + rnd() * 110;
    const g = x.createRadialGradient(rnd() * 512, rnd() * 512, 0, 0, 0, r);
    x.globalAlpha = dirt * (0.3 + rnd() * 0.7);
    const cx = rnd() * 512, cy = rnd() * 512;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, grime); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 6.284); x.fill();
    void g;
  }
  // fine speckle: paint chips and dust
  for (let i = 0; i < speckle; i++) {
    x.globalAlpha = 0.05 + rnd() * 0.28;
    x.fillStyle = rnd() > 0.55 ? grime : bright;
    const s = rnd() * 2.4 + 0.4;
    x.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  // scratches
  for (let i = 0; i < scratches; i++) {
    x.globalAlpha = 0.06 + rnd() * 0.2;
    x.strokeStyle = rnd() > 0.4 ? bright : grime;
    x.lineWidth = rnd() * 1.3 + 0.3;
    const sx = rnd() * 512, sy = rnd() * 512, a = rnd() * 6.28, len = 8 + rnd() * 70;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
  }
  x.globalAlpha = 1;
  return c;
}

/** Roughness companion: mid grey with blotches (worn = smoother, grime = rougher). */
function wearRough(mid = 140, spread = 55) {
  const c = canvas(512), x = c.getContext('2d');
  x.fillStyle = `rgb(${mid},${mid},${mid})`; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const r = 25 + rnd() * 120, cx = rnd() * 512, cy = rnd() * 512;
    const v = Math.max(0, Math.min(255, mid + (rnd() - 0.5) * spread * 2));
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, `rgba(${v},${v},${v},0.7)`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 6.284); x.fill();
  }
  for (let i = 0; i < 1800; i++) {
    const v = Math.max(0, Math.min(255, mid + (rnd() - 0.5) * spread * 3));
    x.fillStyle = `rgba(${v},${v},${v},0.5)`;
    x.fillRect(rnd() * 512, rnd() * 512, rnd() * 2.2 + 0.4, rnd() * 2.2 + 0.4);
  }
  return c;
}

/** Carbon-weave twill with wear on top. */
function weave(base = '#22262c') {
  const c = canvas(512), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  const s = 16;
  for (let i = 0; i < 512 / s; i++) for (let j = 0; j < 512 / s; j++) {
    x.globalAlpha = (i + j) % 2 ? 0.22 : 0.1;
    x.fillStyle = (i + j) % 2 ? '#000000' : '#6d7480';
    x.fillRect(i * s, j * s, s, s);
  }
  x.globalAlpha = 1;
  return c;
}

/** Tyre tread: dark rubber with chevron blocks. */
function tread() {
  const c = canvas(512), x = c.getContext('2d');
  x.fillStyle = '#15171b'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#05060a'; x.lineWidth = 22;
  for (let i = -1; i < 9; i++) {
    x.beginPath();
    x.moveTo(-20, i * 64);
    x.lineTo(256, i * 64 + 46);
    x.lineTo(532, i * 64);
    x.stroke();
  }
  x.globalAlpha = 0.35; x.strokeStyle = '#3a4048'; x.lineWidth = 3;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(-20, i * 64 - 12); x.lineTo(256, i * 64 + 34); x.lineTo(532, i * 64 - 12); x.stroke(); }
  x.globalAlpha = 1;
  for (let i = 0; i < 900; i++) { x.globalAlpha = 0.05 + rnd() * 0.2; x.fillStyle = rnd() > 0.5 ? '#000' : '#5c6470'; x.fillRect(rnd() * 512, rnd() * 512, rnd() * 2 + 0.5, rnd() * 2 + 0.5); }
  return c;
}

/** Stencil decals painted on transparent canvases, mounted on thin planes. */
export function decalMaterial(kind, accent = '#00e5ff') {
  const w = 256, h = kind === 'hazard' ? 64 : kind === 'stencil' || kind === 'serial' ? 96 : kind === 'tally' ? 128 : 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  if (kind === 'unit') {
    x.fillStyle = '#e9edf0'; x.font = '900 168px "Arial Black", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('07', w / 2, h / 2 - 6);
    x.fillStyle = accent; x.font = '700 26px Arial'; x.fillText('ORBITAL ASSAULT', w / 2, h - 34);
    x.fillRect(40, h - 18, w - 80, 5);
  } else if (kind === 'chevron') {
    x.strokeStyle = '#e9edf0'; x.lineWidth = 30; x.lineCap = 'square';
    for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(34, 70 + i * 84); x.lineTo(w / 2, 158 + i * 84); x.lineTo(w - 34, 70 + i * 84); x.stroke(); }
  } else if (kind === 'hazard') {
    for (let i = -2; i < 12; i++) { x.fillStyle = i % 2 ? '#14161a' : '#f2c744'; x.beginPath(); x.moveTo(i * 28, 0); x.lineTo(i * 28 + 28, 0); x.lineTo(i * 28 + 6, h); x.lineTo(i * 28 - 22, h); x.closePath(); x.fill(); }
  } else if (kind === 'stencil') {
    x.fillStyle = '#cfd6dc'; x.font = '700 42px "Courier New", monospace';
    x.fillText('MC-7 / OUTRIDER', 8, 46);
    x.fillStyle = accent; x.fillRect(8, 62, 150, 6);
    x.fillStyle = 'rgba(207,214,220,0.7)'; x.font = '700 24px "Courier New", monospace';
    x.fillText('MERIDIAN COMMONWEALTH', 8, 90);
  } else if (kind === 'serial') {
    x.fillStyle = 'rgba(214,221,227,0.85)'; x.font = '700 34px "Courier New", monospace';
    x.fillText('SN 4471-K', 8, 38);
    x.font = '700 22px "Courier New", monospace';
    x.fillStyle = 'rgba(214,221,227,0.6)';
    x.fillText('7.62 CW · PROPERTY MCV', 8, 68);
    x.fillStyle = accent; x.fillRect(8, 78, 96, 4);
  } else if (kind === 'tally') {
    x.strokeStyle = '#e6ebee'; x.lineWidth = 7; x.lineCap = 'round';
    for (let grp = 0; grp < 3; grp++) {
      const ox = 18 + grp * 78;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(ox + i * 14, 22); x.lineTo(ox + i * 14 - 4, 104); x.stroke(); }
      if (grp < 2) { x.beginPath(); x.moveTo(ox - 8, 96); x.lineTo(ox + 48, 26); x.stroke(); }
    }
  } else if (kind === 'scuff') {
    for (let i = 0; i < 70; i++) {
      x.globalAlpha = 0.05 + rnd() * 0.35;
      x.fillStyle = rnd() > 0.45 ? '#3a4048' : '#8c949e';
      const px = rnd() * w, py = rnd() * h, rw = 6 + rnd() * 46, rh = 3 + rnd() * 12;
      x.save(); x.translate(px, py); x.rotate(rnd() * 3.14); x.fillRect(-rw / 2, -rh / 2, rw, rh); x.restore();
    }
    x.globalAlpha = 0.5; x.strokeStyle = '#20242b'; x.lineWidth = 2.5;
    for (let i = 0; i < 22; i++) { const px = rnd() * w, py = rnd() * h, a = rnd() * 6.28, l = 20 + rnd() * 70; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    x.globalAlpha = 1;
  }
  // scuff the decal so it looks sprayed on and worn off
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { x.globalAlpha = 0.1 + rnd() * 0.5; x.beginPath(); x.arc(rnd() * w, rnd() * h, rnd() * 7 + 1, 0, 6.284); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    name: 'decal_' + kind, map: t, transparent: true, roughness: 0.72, metalness: 0.1,
    polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false,
  });
}

/** Named PBR material set shared across the whole model. */
export function makeMaterials() {
  const ceramic = new THREE.MeshStandardMaterial({
    name: 'ceramic_white', color: '#d3d8dc', roughness: 0.52, metalness: 0.18,
    map: tex(wearColor('#eef1f3', { grime: '#343a41', dirt: 0.17, speckle: 700, scratches: 70, patches: 26 }), 1.4),
    roughnessMap: tex(wearRough(122, 44), 1.4, false),
  });
  const carbon = new THREE.MeshStandardMaterial({
    name: 'carbon_dark', color: '#32373f', roughness: 0.58, metalness: 0.34,
    map: tex(weave('#2b3037'), 3), roughnessMap: tex(wearRough(145, 50), 3, false),
  });
  const slate = new THREE.MeshStandardMaterial({
    name: 'slate_panel', color: '#78818f', roughness: 0.46, metalness: 0.36,
    map: tex(wearColor('#8a94a2', { grime: '#20242b', dirt: 0.18, speckle: 700, scratches: 70 }), 2),
    roughnessMap: tex(wearRough(110, 60), 2, false),
  });
  const gunmetal = new THREE.MeshStandardMaterial({
    name: 'gunmetal', color: '#9aa1ab', roughness: 0.35, metalness: 0.42,
    map: tex(wearColor('#a7aeb8', { grime: '#191d23', dirt: 0.2, speckle: 800, scratches: 90 }), 2),
    roughnessMap: tex(wearRough(92, 60), 2, false),
  });
  const rubber = new THREE.MeshStandardMaterial({
    name: 'tyre_rubber', color: '#2d3239', roughness: 0.96, metalness: 0.0, envMapIntensity: 0.3,
    map: tex(tread(), 3), roughnessMap: tex(wearRough(232, 24), 3, false),
  });
  const suit = new THREE.MeshStandardMaterial({
    name: 'undersuit', color: '#4a505a', roughness: 0.9, metalness: 0.06,
    map: tex(wearColor('#565d68', { grime: '#15181d', dirt: 0.3, speckle: 1800, scratches: 40 }), 3),
  });
  return {
    ceramic, carbon, slate, metal: gunmetal, rubber, suit,
    legion: new THREE.MeshStandardMaterial({
      name: 'legion_chassis', color: '#6d5f4e', roughness: 0.6, metalness: 0.4,
      map: tex(wearColor('#7d6d59', { grime: '#221a12', dirt: 0.3, speckle: 1200, scratches: 120, patches: 34 }), 2),
      roughnessMap: tex(wearRough(140, 60), 2, false),
    }),
    tape: new THREE.MeshStandardMaterial({
      name: 'field_tape', color: '#3b4038', roughness: 0.95, metalness: 0.02,
      map: tex(wearColor('#474d43', { grime: '#1a1d18', dirt: 0.3, speckle: 900, scratches: 40 }), 2),
    }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'lens_glass', color: '#9fd9e6', roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.42, emissive: '#0b3a44', emissiveIntensity: 0.5 }),
    red: new THREE.MeshStandardMaterial({ name: 'neon_red', color: '#ff6a3c', roughness: 0.3, metalness: 0, emissive: '#ff3a08', emissiveIntensity: 1.15 }),
    violet: new THREE.MeshStandardMaterial({ name: 'neon_violet', color: '#c79cff', roughness: 0.3, metalness: 0, emissive: '#8c2eff', emissiveIntensity: 1.15 }),
    green: new THREE.MeshStandardMaterial({ name: 'neon_green', color: '#8affc6', roughness: 0.3, metalness: 0, emissive: '#12ff8a', emissiveIntensity: 1.15 }),
    amber: new THREE.MeshStandardMaterial({ name: 'accent_amber', color: '#ff8a2a', roughness: 0.42, metalness: 0.1, emissive: '#ff5a05', emissiveIntensity: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ name: 'neon_cyan', color: '#5fe6ff', roughness: 0.3, metalness: 0, emissive: '#00c8e6', emissiveIntensity: 1.25 }),
    visor: new THREE.MeshStandardMaterial({ name: 'visor_glass', color: '#0b171d', roughness: 0.08, metalness: 0.5, emissive: '#00cde8', emissiveIntensity: 0.75 }),
  };
}
