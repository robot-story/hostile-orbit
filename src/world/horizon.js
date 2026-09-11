// Beyond the playable 400 m square: a fog-coloured ground sheet so the heightfield edge never shows, a mist wall that
// rises around the map and fades out with height, and a ring of distant vista cards (OpenAI-painted silhouettes with
// transparent skies) so looking outward or down from the recon flyover reads as a world, not a table edge.
import * as THREE from 'three';

const _loader = new THREE.TextureLoader();

function gradientTex(color, bottomAlpha = 0.95) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, `rgba(255,255,255,${bottomAlpha})`); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(0.75, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildHorizon(world) {
  const map = world.map || {}; const L = world.lighting || {};
  const fogColor = new THREE.Color(L.fog || '#c9946f');
  const city = map.terrain?.style === 'city';
  const g = new THREE.Group(); g.name = 'horizon'; g.userData.noMerge = true;
  // ground sheet far below the map rim (the rim walls hide the seam, the mist wall covers the rest)
  const sheet = new THREE.Mesh(new THREE.RingGeometry(150, 2200, 64, 1), new THREE.MeshBasicMaterial({ color: fogColor, fog: false, depthWrite: false }));
  sheet.rotation.x = -Math.PI / 2; sheet.position.y = city ? -6 : -3; sheet.renderOrder = -2; g.add(sheet);
  // mist wall: two concentric cylinders with a vertical fade, slightly different heights so the top edge is not a line
  const mistTex = gradientTex();
  for (const [r, h, op] of [[212, 55, 0.95], [236, 85, 0.75], [300, 120, 0.5]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72, 1, true), new THREE.MeshBasicMaterial({ color: fogColor, map: mistTex, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    m.position.y = h / 2 - 4; m.renderOrder = -1; g.add(m);
  }
  // procedural vista: layered skyline silhouettes painted to a canvas (used when no generated painting is on disk)
  const paintedVista = (seed) => {
    const c = document.createElement('canvas'); c.width = 1536; c.height = 1024; const x = c.getContext('2d');
    let r = seed; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const horizonY = 700; const haze = fogColor.getStyle();
    for (let layer = 0; layer < 3; layer++) {
      const alpha = 0.32 + layer * 0.26; x.fillStyle = city ? `rgba(8,7,16,${alpha})` : `rgba(60,28,14,${alpha})`;
      x.beginPath(); x.moveTo(0, 1024); let px = 0; const base = horizonY + layer * 70;
      while (px < 1536) {
        if (city) { const w = 30 + rnd() * 90, h = 40 + rnd() * (260 - layer * 70); x.lineTo(px, base); x.lineTo(px, base - h); x.lineTo(px + w, base - h); x.lineTo(px + w, base); px += w + rnd() * 30; }
        else { const w = 160 + rnd() * 320, h = 40 + rnd() * (150 - layer * 40); x.quadraticCurveTo(px + w * 0.25, base - h * 1.1, px + w * 0.5, base - h); x.quadraticCurveTo(px + w * 0.75, base - h * 0.9, px + w, base - h * 0.15); px += w; }
      }
      x.lineTo(1536, 1024); x.closePath(); x.fill();
      // window lights / vein glints on the nearest layer
      if (layer >= 1) { for (let i = 0; i < (city ? 520 : 60); i++) { x.fillStyle = city ? (rnd() < 0.5 ? 'rgba(0,229,255,0.95)' : (rnd() < 0.5 ? 'rgba(255,63,216,0.9)' : 'rgba(255,190,90,0.85)')) : 'rgba(155,77,255,0.45)'; x.fillRect(rnd() * 1536, base - 20 - rnd() * 220, city ? 4 : 6, city ? 7 : 2); } if (city) { for (let i = 0; i < 6; i++) { const sx = rnd() * 1536, sy = base - 120 - rnd() * 160; x.fillStyle = rnd() < 0.5 ? 'rgba(0,229,255,0.35)' : 'rgba(255,63,216,0.3)'; x.fillRect(sx, sy, 60 + rnd() * 90, 30 + rnd() * 40); } } } // holo boards glow in the far city
      // spires / masts
      for (let i = 0; i < (city ? 5 : 1); i++) { const sx = rnd() * 1536, h = city ? 200 + rnd() * 300 : 120 + rnd() * 120; x.fillStyle = city ? `rgba(6,6,12,${alpha})` : `rgba(20,10,20,${alpha})`; x.beginPath(); x.moveTo(sx - 6, base); x.lineTo(sx, base - h); x.lineTo(sx + 6, base); x.closePath(); x.fill(); }
    }
    // haze bands at the base so the silhouettes sink into the mist
    const gr = x.createLinearGradient(0, horizonY + 80, 0, 1024); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, haze); x.fillStyle = gr; x.fillRect(0, horizonY, 1536, 1024 - horizonY);
    // soften everything into the sky: the whole painting fades out toward its top edge
    x.globalCompositeOperation = 'destination-in'; const top = x.createLinearGradient(0, 300, 0, 760); top.addColorStop(0, 'rgba(0,0,0,0)'); top.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = top; x.fillRect(0, 0, 1536, 1024); x.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  // vista cards: eight silhouettes around the compass, alternating two paintings, tinted toward the haze
  const base = (import.meta.env.BASE_URL || './') + 'textures/vista/';
  const ids = city ? ['vista_lantern_a', 'vista_lantern_b'] : ['vista_meridian_a', 'vista_meridian_b'];
  const tint = fogColor.clone().lerp(new THREE.Color('#ffffff'), city ? 0.35 : 0.55);
  const cardW = 760, cardH = cardW * (1024 / 1536), radius = 780;
  ids.forEach((id, k) => {
    _loader.load(base + id + '.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: tint, fog: false, depthWrite: false, side: THREE.DoubleSide, opacity: 0.92 });
      for (let i = k; i < 8; i += 2) {
        const a = (i / 8) * Math.PI * 2 + 0.2; const card = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), mat);
        card.position.set(Math.cos(a) * radius, cardH / 2 - 90 + (i % 3) * 8, Math.sin(a) * radius); card.lookAt(0, card.position.y, 0); card.renderOrder = -1; g.add(card);
      }
    }, undefined, () => {
      // no painting on disk: fall back to the procedural skyline
      const tex = paintedVista(11 + k * 7 + (city ? 100 : 0));
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: fogColor.clone().lerp(new THREE.Color('#ffffff'), city ? 0.2 : 0.35), fog: false, depthWrite: false, side: THREE.DoubleSide, opacity: 0.75 });
      for (let i = k; i < 8; i += 2) { const a = (i / 8) * Math.PI * 2 + 0.2; const card = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), mat); card.position.set(Math.cos(a) * radius, cardH / 2 - 120 + (i % 3) * 8, Math.sin(a) * radius); card.lookAt(0, card.position.y, 0); card.renderOrder = -1; g.add(card); }
    });
  });
  world.scene.add(g);
  return g;
}
