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
  // vista cards: eight silhouettes around the compass, alternating two paintings, tinted toward the haze
  const base = (import.meta.env.BASE_URL || './') + 'textures/vista/';
  const ids = city ? ['vista_lantern_a', 'vista_lantern_b'] : ['vista_meridian_a', 'vista_meridian_b'];
  const tint = fogColor.clone().lerp(new THREE.Color('#ffffff'), city ? 0.35 : 0.55);
  const cardW = 620, cardH = cardW * (1024 / 1536), radius = 620;
  ids.forEach((id, k) => {
    _loader.load(base + id + '.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: tint, fog: false, depthWrite: false, side: THREE.DoubleSide, opacity: 0.92 });
      for (let i = k; i < 8; i += 2) {
        const a = (i / 8) * Math.PI * 2 + 0.2; const card = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), mat);
        card.position.set(Math.cos(a) * radius, cardH / 2 - 30 + (i % 3) * 8, Math.sin(a) * radius); card.lookAt(0, card.position.y, 0); card.renderOrder = -1; g.add(card);
      }
    }, undefined, () => { /* painting not generated yet: mist alone */ });
  });
  world.scene.add(g);
  return g;
}
