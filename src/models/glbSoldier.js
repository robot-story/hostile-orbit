// Custom character mesh support: loads a static GLB (e.g. a Meshy export), normalises its orientation and
// scale, and auto-skins it to the procedural soldier skeleton so the existing CharacterAnimator drives it.
// Skinning is capsule-based: every vertex takes weights from its two nearest bone segments (soft falloff
// at the joints). The rig is posed to match the mesh's rest pose (A/T-pose) before the bind matrices are taken.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL || '/';
const cache = new Map();

/** Load + normalise a GLB into { geometry, material, height }. Up axis and facing can be forced via opts. */
export function loadCustomMesh(url, opts = {}) {
  const key = url + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const p = new Promise((resolve, reject) => {
    new GLTFLoader().load(BASE + url, (gltf) => {
      let mesh = null; gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) return reject(new Error('no mesh in ' + url));
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox(); const size = geo.boundingBox.getSize(new THREE.Vector3());
      // Character sheets: several figures laid out along the longest axis. Split by mesh connectivity along it.
      const axes = ['x', 'y', 'z']; const ext = [size.x, size.y, size.z];
      const splitAxis = opts.split || axes[ext.indexOf(Math.max(...ext))];
      const figures = splitComponents(geo, splitAxis, opts.figures || 4);
      const partIdx = opts.part != null ? Math.min(opts.part, figures.length - 1) : figures.length - 1;
      const fig = figures[partIdx];
      const bodyGeo = fig ? extractComponents(geo, fig.compIds, fig.canon) : geo;
      const weaponGeo = fig && fig.extraIds.length ? extractComponents(geo, fig.extraIds, fig.canon) : null;
      if (fig) console.info(`[glb] ${url}: ${figures.length} figures along ${splitAxis}, using part ${partIdx}; body ${fig.count} verts, extras ${fig.extraIds.length}`);
      if (opts.mode === 'weapon') { const r = normaliseWeapon(bodyGeo, opts); const mat0 = mesh.material.clone(); mat0.side = THREE.FrontSide; mat0.envMapIntensity = 0.8; return resolve({ geometry: r.geometry, material: mat0, length: r.length, muzzle: r.muzzle, source: gltf }); }
      // --- orientation: up axis (default y), then optional yaw so the figure faces +z
      const up = opts.up || 'y';
      const m = new THREE.Matrix4();
      if (up === 'x') m.makeRotationZ(-Math.PI / 2); else if (up === 'z') m.makeRotationX(-Math.PI / 2);
      if (opts.flipUp) m.premultiply(new THREE.Matrix4().makeRotationX(Math.PI));
      if (opts.yaw) m.premultiply(new THREE.Matrix4().makeRotationY(opts.yaw));
      bodyGeo.applyMatrix4(m); if (weaponGeo) weaponGeo.applyMatrix4(m);
      // --- scale to target height (body), feet on y=0, centred in XZ; the weapon shares the same transform
      bodyGeo.computeBoundingBox(); const b2 = bodyGeo.boundingBox; const h = b2.max.y - b2.min.y;
      const sc = (opts.height || 1.9) / h;
      const fit = new THREE.Matrix4().makeScale(sc, sc, sc);
      bodyGeo.applyMatrix4(fit); bodyGeo.computeBoundingBox(); const b3 = bodyGeo.boundingBox; const c = b3.getCenter(new THREE.Vector3());
      const tr = new THREE.Matrix4().makeTranslation(-c.x, -b3.min.y, -c.z);
      bodyGeo.applyMatrix4(tr); if (weaponGeo) { weaponGeo.applyMatrix4(fit); weaponGeo.applyMatrix4(tr); }
      for (const g of [bodyGeo, weaponGeo]) if (g) { g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); }
      const finalBody = opts.decimate ? decimateGrid(bodyGeo, opts.decimate) : bodyGeo;
      const mat = mesh.material.clone(); mat.side = THREE.FrontSide; mat.envMapIntensity = 0.8;
      resolve({ geometry: finalBody, weapon: weaponGeo, material: mat, height: opts.height || 1.9, source: gltf, figures: figures.length });
    }, undefined, reject);
  });
  cache.set(key, p);
  return p;
}

/** Fast vertex-clustering decimation: snap vertices to a grid of `cell` metres, merge, drop degenerate triangles. */
export function decimateGrid(geo, cell = 0.012) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv; const idx = geo.index;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const map = new Map(); const P = [], Nn = [], U = []; const remap = new Int32Array(pos.count);
  const keyOf = (i) => `${Math.round(pos.getX(i) / cell)},${Math.round(pos.getY(i) / cell)},${Math.round(pos.getZ(i) / cell)}`;
  for (let i = 0; i < pos.count; i++) { const k = keyOf(i); let r = map.get(k); if (r == null) { r = P.length / 3; map.set(k, r); P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); if (nrm) Nn.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i)); if (uv) U.push(uv.getX(i), uv.getY(i)); } remap[i] = r; }
  const I = [];
  for (let t = 0; t < tri; t++) { const a = remap[idx ? idx.getX(t * 3) : t * 3], b = remap[idx ? idx.getX(t * 3 + 1) : t * 3 + 1], c = remap[idx ? idx.getX(t * 3 + 2) : t * 3 + 2]; if (a !== b && b !== c && a !== c) I.push(a, b, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  console.info(`[glb] decimated ${pos.count} -> ${P.length / 3} verts, ${tri} -> ${I.length / 3} tris`);
  return g;
}

/** Orient a weapon mesh: long axis -> +z (thin end forward), scale to `length`, grip region at the origin. */
function normaliseWeapon(geo, opts) {
  geo.computeBoundingBox(); const size = geo.boundingBox.getSize(new THREE.Vector3());
  const axes = [size.x, size.y, size.z]; const long = axes.indexOf(Math.max(...axes));
  const m = new THREE.Matrix4();
  if (long === 0) m.makeRotationY(Math.PI / 2); else if (long === 1) m.makeRotationX(-Math.PI / 2); // long axis -> z
  geo.applyMatrix4(m);
  // thin end forward: compare cross-section extents of the front/back 20 %
  geo.computeBoundingBox(); const bb = geo.boundingBox; const pos = geo.attributes.position; const zl = bb.max.z - bb.min.z;
  let fx = 0, bx = 0, fn = 0, bn = 0;
  for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); const r = Math.hypot(pos.getX(i), pos.getY(i) - (bb.min.y + bb.max.y) / 2); if (z > bb.max.z - zl * 0.2) { fx += r; fn++; } else if (z < bb.min.z + zl * 0.2) { bx += r; bn++; } }
  const frontThin = (fx / Math.max(1, fn)) < (bx / Math.max(1, bn));
  if (!frontThin !== !!opts.flipForward) geo.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  if (opts.rollUp) geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(opts.rollUp));
  geo.computeBoundingBox(); const b2 = geo.boundingBox; const len = b2.max.z - b2.min.z; const sc = (opts.length || 1.1) / len;
  geo.applyMatrix4(new THREE.Matrix4().makeScale(sc, sc, sc));
  geo.computeBoundingBox(); const b3 = geo.boundingBox; const cx = (b3.min.x + b3.max.x) / 2;
  // grip at origin: rear of the weapon at z = -0.33 (like the procedural rifles), barrel line at y ~ 0.055
  const barrelY = b3.min.y + (b3.max.y - b3.min.y) * 0.62;
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-cx, 0.055 - barrelY, -0.33 - b3.min.z));
  geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geometry: geo, length: b3.max.z - b3.min.z, muzzle: new THREE.Vector3(0, 0.055, geo.boundingBox.max.z - 0.01) };
}

/** Connected components by shared quantised positions; grouped into `figures` clusters along `axis`. */
function splitComponents(geo, axis, figures) {
  const pos = geo.attributes.position, idx = geo.index; const n = pos.count;
  const get = axis === 'x' ? (i) => pos.getX(i) : axis === 'y' ? (i) => pos.getY(i) : (i) => pos.getZ(i);
  const key = (i) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  const canon = new Int32Array(n); const seen = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); const c = seen.get(k); if (c == null) { seen.set(k, i); canon[i] = i; } else canon[i] = c; }
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const tri = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) { const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; union(canon[a], canon[b]); union(canon[b], canon[c]); }
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(canon[i]); let c = comps.get(r); if (!c) { c = { id: r, min: Infinity, max: -Infinity, count: 0, sum: 0 }; comps.set(r, c); } const v = get(i); c.min = Math.min(c.min, v); c.max = Math.max(c.max, v); c.count++; c.sum += v; }
  const list = [...comps.values()].sort((a, b) => b.count - a.count);
  const bodies = list.slice(0, Math.min(figures, list.length)).sort((a, b) => a.min - b.min).map((c) => ({ min: c.min, max: c.max, count: c.count, compIds: [c.id], extraIds: [] }));
  for (const c of list.slice(bodies.length)) { let best = null, bo = -Infinity; const mid = c.sum / c.count; for (const b of bodies) { const o = Math.min(b.max, c.max) - Math.max(b.min, c.min); const score = o + (mid >= b.min && mid <= b.max ? 1 : 0) - Math.abs(mid - (b.min + b.max) / 2) * 0.1; if (score > bo) { bo = score; best = b; } } if (best) { best.extraIds.push(c.id); best.count += c.count; } }
  const root = new Int32Array(n); for (let i = 0; i < n; i++) root[i] = find(canon[i]);
  for (const b of bodies) b.canon = root;
  console.info('[glb] components', list.length, 'largest', list.slice(0, 8).map((c) => c.count).join('/'));
  return bodies;
}
function extractComponents(geo, ids, root) {
  const set = new Set(ids);
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv; const idx = geo.index;
  const tri = idx ? idx.count / 3 : pos.count / 3; const P = [], Nn = [], U = [];
  for (let t = 0; t < tri; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    if (!set.has(root[a])) continue;
    for (const i of [a, b, c]) { P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); if (nrm) Nn.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i)); if (uv) U.push(uv.getX(i), uv.getY(i)); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

/** Segment definitions (parent bone -> child bone) used as skinning capsules; radius grows the influence. */
const SEGMENTS = [
  ['root', 'spine', 0.16], ['spine', 'chest', 0.17], ['chest', 'neck', 0.15], ['neck', 'head', 0.12], ['head', null, 0.14],
  ['upperArmL', 'forearmL', 0.085], ['forearmL', 'handL', 0.07], ['handL', null, 0.07],
  ['upperArmR', 'forearmR', 0.085], ['forearmR', 'handR', 0.07], ['handR', null, 0.07],
  ['thighL', 'shinL', 0.11], ['shinL', 'footL', 0.085], ['footL', null, 0.08],
  ['thighR', 'shinR', 0.11], ['shinR', 'footR', 0.085], ['footR', null, 0.08],
];

function segDist(p, a, b, out) {
  const ab = out.sub.copy(b).sub(a); const l2 = ab.lengthSq();
  const t = l2 > 1e-8 ? THREE.MathUtils.clamp(out.ap.copy(p).sub(a).dot(ab) / l2, 0, 1) : 0;
  return out.q.copy(a).addScaledVector(ab, t).distanceTo(p);
}

/**
 * Build a SkinnedMesh from a normalised custom mesh and the procedural rig's bones (already posed to
 * match the mesh's rest pose). Bone world matrices must be current. Returns the SkinnedMesh.
 */
export function skinToRig(custom, bones, rootGroup) {
  // skin weights depend only on the rig layout in its zero pose, so one weighted geometry is shared by every instance
  if (custom.skinnedGeo) { const sk = new THREE.SkinnedMesh(custom.skinnedGeo, custom.material); sk.castShadow = !custom.noShadow; sk.frustumCulled = false; sk.name = 'part:custom'; rootGroup.add(sk); rootGroup.updateWorldMatrix(true, true); sk.bind(new THREE.Skeleton(Object.keys(bones).map((n) => bones[n]))); return sk; }
  const geo = custom.geometry.clone();
  const boneList = []; const nameIdx = {};
  for (const n of Object.keys(bones)) { nameIdx[n] = boneList.length; boneList.push(bones[n]); }
  rootGroup.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();
  // segment endpoints in rig-root space (the mesh lives in the same space)
  const segs = SEGMENTS.map(([a, b, r]) => {
    const pa = new THREE.Vector3().setFromMatrixPosition(bones[a].matrixWorld).applyMatrix4(inv);
    let pb;
    if (b) pb = new THREE.Vector3().setFromMatrixPosition(bones[b].matrixWorld).applyMatrix4(inv);
    else { // leaf: extend along the bone's local -y / +y (child direction guess) by a fixed length
      const dir = new THREE.Vector3(0, a.startsWith('hand') || a.startsWith('foot') ? -0.12 : 0.18, 0);
      if (a === 'head') dir.set(0, 0.22, 0); if (a.startsWith('foot')) dir.set(0, -0.04, 0.16);
      pb = pa.clone().add(dir.applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(bones[a].matrixWorld)));
    }
    return { a: pa, b: pb, r, idx: nameIdx[a] };
  });
  const pos = geo.attributes.position; const n = pos.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const p = new THREE.Vector3(); const tmp = { sub: new THREE.Vector3(), ap: new THREE.Vector3(), q: new THREE.Vector3() };
  const cand = [];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i); cand.length = 0;
    for (const s of segs) { const d = Math.max(0, segDist(p, s.a, s.b, tmp) - s.r * 0.5); cand.push({ d, idx: s.idx }); }
    cand.sort((x, y) => x.d - y.d);
    // two nearest with a soft blend; a third only when very close (joint regions)
    const d0 = cand[0].d, d1 = cand[1].d, d2 = cand[2].d;
    const w0 = 1 / (d0 + 0.035) ** 2.2, w1 = 1 / (d1 + 0.035) ** 2.2, w2 = d2 - d0 < 0.11 ? 1 / (d2 + 0.035) ** 2.2 : 0;
    const sum = w0 + w1 + w2;
    skinIndex[i * 4] = cand[0].idx; skinWeight[i * 4] = w0 / sum;
    skinIndex[i * 4 + 1] = cand[1].idx; skinWeight[i * 4 + 1] = w1 / sum;
    skinIndex[i * 4 + 2] = cand[2].idx; skinWeight[i * 4 + 2] = w2 / sum;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  custom.skinnedGeo = geo;
  const skinned = new THREE.SkinnedMesh(geo, custom.material);
  skinned.castShadow = !custom.noShadow; skinned.receiveShadow = false; skinned.frustumCulled = false; skinned.name = 'part:custom';
  rootGroup.add(skinned); rootGroup.updateWorldMatrix(true, true);
  skinned.bind(new THREE.Skeleton(boneList)); // world-space bind at the current (rest) pose
  return skinned;
}

/** Registry of preloaded custom assets (body meshes by style key, weapon meshes by weapon id). */
export const CUSTOM = { body: {}, weapon: {}, ready: false };
export function preloadCustomModels() {
  const jobs = [
    loadCustomMesh('models/vanguard.glb', { part: 0, height: 1.88, decimate: 0.008 }).then((c) => { CUSTOM.body.vanguard = c; }),
    loadCustomMesh('models/sentinel.glb', { part: 0, height: 1.9, decimate: 0.02 }).then((c) => { CUSTOM.body.sentinel = c; c.noShadow = true; }),
    loadCustomMesh('models/sentinel.glb', { part: 2, mode: 'weapon', length: 1.08 }).then((c) => { CUSTOM.weapon.viper = c; const dark = c.material.clone(); dark.color.set('#6f6f78'); CUSTOM.weapon.legion_rifle = { ...c, material: dark }; }),
    loadCustomMesh('models/sentinel.glb', { part: 1, mode: 'weapon', length: 1.32 }).then((c) => { CUSTOM.weapon.longshot = c; }),
    loadCustomMesh('models/sentinel.glb', { part: 3, height: 0.9, decimate: 0.015 }).then((c) => { c.geometry.translate(0, -0.45, 0); c.geometry.computeBoundingBox(); CUSTOM.body.drone = c; }),
  ];
  return Promise.allSettled(jobs).then((r) => { CUSTOM.ready = true; const failed = r.filter((x) => x.status === 'rejected'); if (failed.length) console.warn('[glb] some custom models failed', failed.map((f) => String(f.reason))); else console.info('[glb] custom models ready'); });
}

/** Swap a procedural soldier's body for a custom skinned mesh (rig must still be in its zero pose). */
export function applyCustomBody(model, custom, opts = {}) {
  if (!custom || model.custom) return null;
  for (const n in model.bones) model.bones[n].rotation.set(0, 0, 0);
  const skinned = skinToRig(custom, model.bones, model.root);
  if (opts.neon || opts.tint) { const key = 'mat:' + (opts.neon || '') + ':' + (opts.tint || ''); custom._mats = custom._mats || {}; if (!custom._mats[key]) { const m = custom.material.clone(); if (opts.tint) m.color.set(opts.tint); if (opts.neon) makeNeonMask(m, opts.neon); custom._mats[key] = m; } skinned.material = custom._mats[key]; }
  for (const m of model.meshes) m.visible = false;
  model.custom = skinned; model.customMeshes = [skinned];
  return skinned;
}

/** Build a weapon group from a custom weapon mesh with the same sockets as the procedural builders. */
export function buildCustomWeapon(custom, id, neon) {
  const g = new THREE.Group(); g.name = 'weapon:' + id;
  const mesh = new THREE.Mesh(custom.geometry, custom.material); mesh.castShadow = true; g.add(mesh);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.copy(custom.muzzle); g.add(muzzle);
  const gripR = new THREE.Object3D(); gripR.name = 'gripR'; gripR.position.set(0.02, -0.02, 0.04); g.add(gripR);
  const gripL = new THREE.Object3D(); gripL.name = 'gripL'; gripL.position.set(-0.02, 0.0, Math.min(custom.muzzle.z * 0.45, 0.34)); g.add(gripL);
  const flash = new THREE.Object3D(); flash.name = 'ejector'; flash.position.set(0.03, 0.05, 0.05); g.add(flash);
  g.userData.gripR = gripR; g.userData.gripL = gripL; g.userData.muzzle = muzzle; g.userData.ejector = flash; g.userData.custom = true;
  return g;
}

/** Bright-cyan regions of the base colour become an emissive mask so squad colours can retint the strips. */
export function makeNeonMask(material, color) {
  const tex = material.map; if (!tex || !tex.image || !tex.image.width) return;
  const img = tex.image; const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0); const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
  const col = new THREE.Color(color);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const neon = b > 150 && g > 140 && r < 120 && (b - r) > 90; // cyan-ish emissive strips in the texture
    if (neon) { d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255; d[i + 3] = 255; } else { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; }
  }
  ctx.putImageData(id, 0, 0);
  const em = new THREE.CanvasTexture(cv); em.colorSpace = THREE.SRGBColorSpace; em.flipY = tex.flipY; em.wrapS = tex.wrapS; em.wrapT = tex.wrapT;
  material.emissiveMap = em; material.emissive = new THREE.Color('#ffffff'); material.emissiveIntensity = 1.6; material.needsUpdate = true;
}
