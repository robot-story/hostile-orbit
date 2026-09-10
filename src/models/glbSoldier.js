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
  // grips: lowest points of the mesh in two z-windows (pistol grip behind the magazine, foregrip under the handguard)
  const pos2 = geo.attributes.position; let gR = null, gL = null;
  for (let i = 0; i < pos2.count; i++) { const z = pos2.getZ(i), y = pos2.getY(i), x = pos2.getX(i); if (Math.abs(x) > 0.05) continue; if (z > -0.2 && z < 0.02 && (!gR || y < gR.y)) gR = new THREE.Vector3(x, y, z); if (z > 0.24 && z < 0.5 && (!gL || y < gL.y)) gL = new THREE.Vector3(x, y, z); }
  const gripR = new THREE.Vector3(0.02, gR ? THREE.MathUtils.clamp(gR.y + 0.08, -0.13, -0.01) : -0.02, gR ? THREE.MathUtils.clamp(gR.z + 0.02, -0.08, 0.06) : 0.04);
  const gripL = new THREE.Vector3(-0.02, gL ? THREE.MathUtils.clamp(gL.y + 0.05, -0.06, 0.05) : 0.0, gL ? gL.z : 0.34);
  return { geometry: geo, length: b3.max.z - b3.min.z, muzzle: new THREE.Vector3(0, 0.055, geo.boundingBox.max.z - 0.01), gripR, gripL };
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
  const fit = custom.fit || null;
  // skin weights depend only on the rig layout in its zero pose, so one weighted geometry is shared by every instance
  if (custom.skinnedGeo) { const sk = new THREE.SkinnedMesh(custom.skinnedGeo, custom.material); sk.castShadow = !custom.noShadow; sk.frustumCulled = true; sk.name = 'part:custom'; rootGroup.add(sk); rootGroup.updateWorldMatrix(true, true); sk.bind(new THREE.Skeleton(Object.keys(bones).map((n) => bones[n]))); return sk; }
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
  // hierarchy adjacency: a vertex may only blend between its nearest segment and segments that touch it in the
  // skeleton (parent/child). Hands never pull on thighs, arms never tear the torso.
  const PARENT = { spine: 'root', chest: 'spine', neck: 'chest', head: 'neck', upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL', upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR', thighL: 'root', shinL: 'thighL', footL: 'shinL', thighR: 'root', shinR: 'thighR', footR: 'shinR' };
  const segByName = {}; for (const [a] of SEGMENTS) segByName[a] = SEGMENTS.findIndex((x) => x[0] === a);
  const adjacent = (a, b) => PARENT[a] === b || PARENT[b] === a || (PARENT[a] && PARENT[a] === PARENT[b] && (a.startsWith('thigh') || a.startsWith('upperArm')) && false);
  const dists = new Float32Array(segs.length);
  const BAND = 0.9; // in normalised-radius units
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let best = 0;
    const inLegColumn = fit && p.y < fit.crotchY + 0.12 && Math.abs(p.x) < fit.hipX + 0.11;   // thigh/shin region: arms may not claim it
    const inArmZone = fit && p.y > fit.crotchY - 0.05 && Math.abs(p.x) > fit.armCx - 0.09;     // hanging arm region: legs may not claim it
    best = -1;
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k]; const nm = SEGMENTS[k][0];
      const isArm = nm.startsWith('upperArm') || nm.startsWith('forearm') || nm.startsWith('hand');
      const isLeg = nm.startsWith('thigh') || nm.startsWith('shin') || nm.startsWith('foot');
      let d = segDist(p, sg.a, sg.b, tmp) / sg.r;            // radius-normalised distance (1 = on the capsule surface)
      if (isArm && inLegColumn) d += 4; if (isLeg && inArmZone) d += 4;
      dists[k] = d; if (best < 0 || d < dists[best]) best = k;
    }
    const nameBest = SEGMENTS[best][0];
    let w0 = 1, w1 = 0, w2 = 0, i1 = best, i2 = best;
    // up to two adjacent segments inside the blend band
    const cands = [];
    for (let k = 0; k < segs.length; k++) { if (k === best) continue; if (!adjacent(nameBest, SEGMENTS[k][0])) continue; const dd = dists[k] - dists[best]; if (dd < BAND * 1.8) cands.push({ k, dd }); }
    cands.sort((x, y) => x.dd - y.dd);
    const armJoint = nameBest.startsWith('upperArm') || nameBest.startsWith('forearm') || nameBest.startsWith('hand');
    const band = armJoint ? BAND * 1.8 : BAND;
    if (cands[0] && cands[0].dd < band) { const t = 1 - cands[0].dd / band; w1 = (armJoint ? 0.5 : 0.5) * t; i1 = cands[0].k; }
    if (cands[1] && cands[1].dd < band) { const t = 1 - cands[1].dd / band; w2 = 0.25 * t * t; i2 = cands[1].k; }
    w0 = 1 - w1 - w2;
    skinIndex[i * 4] = segs[best].idx; skinWeight[i * 4] = w0;
    skinIndex[i * 4 + 1] = segs[i1].idx; skinWeight[i * 4 + 1] = w1;
    skinIndex[i * 4 + 2] = segs[i2].idx; skinWeight[i * 4 + 2] = w2;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  custom.skinnedGeo = geo;
  const skinned = new THREE.SkinnedMesh(geo, custom.material);
  geo.computeBoundingSphere(); geo.boundingSphere.radius *= 1.6; geo.boundingSphere.center.y = 0.95;
  skinned.castShadow = !custom.noShadow; skinned.receiveShadow = false; skinned.frustumCulled = true; skinned.name = 'part:custom';
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

/** Estimate joint heights/offsets from the mesh silhouette (crotch, knees, shoulders, wrists, head) once per custom body. */
export function measureBody(custom) {
  if (custom.fit) return custom.fit;
  const pos = custom.geometry.attributes.position; const n = pos.count;
  custom.geometry.computeBoundingBox(); const H = custom.geometry.boundingBox.max.y;
  const slab = 0.02; const bins = Math.ceil(H / slab) + 1;
  const centerCount = new Uint32Array(bins), total = new Uint32Array(bins), armCount = new Uint32Array(bins); const armX = new Float64Array(bins); const legX = new Float64Array(bins); const legCount = new Uint32Array(bins);
  let armMinY = H, torsoHalfW = 0.2;
  // torso half-width estimate at 55 % height (below the shoulders, above the hips)
  { let sum = 0, c = 0; for (let i = 0; i < n; i++) { const y = pos.getY(i); if (Math.abs(y - H * 0.55) < 0.03) { sum += Math.abs(pos.getX(i)); c++; } } if (c) torsoHalfW = Math.min(0.32, Math.max(0.14, (sum / c) * 1.35)); }
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i); const b = Math.min(bins - 1, Math.floor(y / slab));
    total[b]++;
    if (Math.abs(x) < 0.045) centerCount[b]++;
    if (y < H * 0.62 && Math.abs(x) > 0.03) { legX[b] += Math.abs(x); legCount[b]++; }
    if (Math.abs(x) > torsoHalfW && y > H * 0.3) { armCount[b]++; armX[b] += Math.abs(x); if (y < armMinY) armMinY = y; }
  }
  // crotch: lowest slab (scanning upward from the ankles) where the centre line is occupied and stays occupied
  let crotchY = H * 0.47;
  for (let b = Math.floor(H * 0.15 / slab); b < Math.floor(H * 0.62 / slab); b++) { const occ = (k) => total[k] > 0 && centerCount[k] / total[k] > 0.06; if (occ(b) && occ(b + 1) && occ(b + 2)) { crotchY = b * slab; break; } }
  // shoulders: highest slab with substantial arm vertices outside the torso width
  let shoulderY = H * 0.8;
  for (let b = bins - 1; b > 0; b--) { if (armCount[b] > 12) { shoulderY = Math.min(H - 0.12, b * slab + 0.02); break; } }
  // arm centre x just below the shoulder
  let armCx = torsoHalfW + 0.09; { const b = Math.max(0, Math.floor((shoulderY - 0.12) / slab)); let sx = 0, c = 0; for (let k = b - 2; k <= b + 2; k++) if (k >= 0 && k < bins) { sx += armX[k]; c += armCount[k]; } if (c) armCx = sx / c; }
  const ankleY = Math.min(0.12, H * 0.06);
  const wristY = Math.max(crotchY - 0.05, armMinY + 0.09);
  // hip x: mean |x| of leg vertices around mid-thigh
  let hipX = 0.12; { const b = Math.floor(((crotchY + ankleY) * 0.62) / slab); let sx = 0, c = 0; for (let k = b - 2; k <= b + 2; k++) if (k >= 0 && k < bins) { sx += legX[k]; c += legCount[k]; } if (c) hipX = THREE.MathUtils.clamp(sx / c, 0.08, 0.2); }
  const fit = { H, crotchY, kneeY: (crotchY + ankleY) * 0.52, ankleY, shoulderY, armCx: THREE.MathUtils.clamp(armCx, 0.22, 0.42), wristY, hipX };
  custom.fit = fit; console.info('[glb] body fit', Object.fromEntries(Object.entries(fit).map(([k, v]) => [k, +v.toFixed(3)])));
  return fit;
}

/** Move the procedural rig's joints to the measured mesh joints (zero pose). Weapon sockets and IK follow the bones. */
export function fitRigToMesh(model, custom) {
  const f = measureBody(custom); const B = model.bones;
  const rootY = f.crotchY + 0.04;
  B.root.position.y = rootY;
  const thigh = Math.max(0.25, f.crotchY - f.kneeY), shin = Math.max(0.25, f.kneeY - f.ankleY);
  for (const side of ['L', 'R']) { const sgn = side === 'L' ? 1 : -1; B['thigh' + side].position.set(sgn * f.hipX, -0.04, 0); B['shin' + side].position.y = -thigh; B['foot' + side].position.y = -shin; }
  const chestY = f.shoulderY - 0.20; // shoulders sit 0.20 above the chest bone in this rig
  B.spine.position.y = 0.10; B.chest.position.y = Math.max(0.12, chestY - (rootY + 0.10));
  const neckY = Math.max(chestY + 0.14, f.H - 0.30); B.neck.position.y = neckY - chestY; B.head.position.y = 0.08;
  const upper = Math.max(0.2, (f.shoulderY - f.wristY) * 0.52), fore = Math.max(0.18, (f.shoulderY - f.wristY) * 0.48);
  for (const side of ['L', 'R']) { const sgn = side === 'L' ? 1 : -1; B['shoulder' + side].position.set(sgn * (f.armCx - 0.06), 0.20, 0); B['upperArm' + side].position.set(sgn * 0.06, -0.02, 0); B['forearm' + side].position.y = -upper; B['hand' + side].position.y = -fore; }
  model.root.updateWorldMatrix(true, true);
  return f;
}

/** Drop the leg triangles (below the crotch, inside the leg column) so the torso can ride a ball. Cached per custom. */
function legless(custom) {
  if (custom.leglessGeo) return custom.leglessGeo;
  const f = measureBody(custom); const geo = custom.geometry; const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv; const idx = geo.index;
  const tri = idx ? idx.count / 3 : pos.count / 3; const P = [], Nn = [], U = []; const I = []; const remap = new Int32Array(pos.count).fill(-1);
  const cutY = f.crotchY + 0.16; // waist line: everything below goes, except the hanging arms/hands
  const isLeg = (i) => pos.getY(i) < cutY && !(Math.abs(pos.getX(i)) > f.armCx - 0.1 && pos.getY(i) > f.crotchY - 0.2);
  custom.waistCut = cutY;
  const push = (i) => { if (remap[i] >= 0) return remap[i]; remap[i] = P.length / 3; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); if (nrm) Nn.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i)); if (uv) U.push(uv.getX(i), uv.getY(i)); return remap[i]; };
  for (let t = 0; t < tri; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    if (isLeg(a) && isLeg(b) && isLeg(c)) continue;
    I.push(push(a), push(b), push(c));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeBoundingBox(); g.computeBoundingSphere();
  custom.leglessGeo = g; return g;
}

/** Mount a rolling ball under the torso (Sentinel sphere hull when loaded, neon sphere otherwise). */
export function attachBall(model, radius = 0.44) {
  const g = new THREE.Group(); g.name = 'ball';
  const hull = CUSTOM.body.drone;
  let mesh;
  if (hull) { const hm = hull.material.clone(); hm.color.set('#8c8f98'); hm.emissive = new THREE.Color('#000000'); hm.emissiveIntensity = 0; hm.envMapIntensity = 0.5; mesh = new THREE.Mesh(hull.geometry, hm); const s0 = radius / 0.45; mesh.scale.setScalar(s0); }
  else { mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshStandardMaterial({ color: '#c8c8cc', roughness: 0.45, metalness: 0.35 })); }
  mesh.castShadow = true; g.add(mesh);
  // neon equator ring so the roll reads clearly
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.018, 8, 48), new THREE.MeshStandardMaterial({ color: '#00e5ff', emissive: '#00e5ff', emissiveIntensity: 0.5, roughness: 0.3 }));
  ring.rotation.x = Math.PI / 2; g.add(ring);

  // waist collar at the top of the ball (does not roll): matte ring, four short struts, thin emissive lip, two vents
  const collar = new THREE.Group(); collar.name = 'collar';
  const matte = new THREE.MeshStandardMaterial({ color: '#2c3038', roughness: 0.55, metalness: 0.7 });
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.48, 0.045, 10, 40), matte); ringM.rotation.x = Math.PI / 2; ringM.position.y = radius * 0.9; collar.add(ringM);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.46, radius * 0.6, 0.14, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#2c3038', roughness: 0.55, metalness: 0.7, side: THREE.DoubleSide })); cup.position.y = radius * 0.8; collar.add(cup);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), matte); strut.position.set(Math.cos(a) * radius * 0.54, radius * 0.72, Math.sin(a) * radius * 0.54); strut.rotation.z = Math.cos(a) * 0.5; strut.rotation.x = -Math.sin(a) * 0.5; collar.add(strut); }
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.5, 0.014, 8, 40), new THREE.MeshStandardMaterial({ color: '#00e5ff', emissive: '#00e5ff', emissiveIntensity: 0.6 })); lip.rotation.x = Math.PI / 2; lip.position.y = radius * 0.96; collar.add(lip);
  for (let i = 0; i < 2; i++) { const a = i * Math.PI + 0.6; const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.07, 8), matte); vent.position.set(Math.cos(a) * radius * 0.62, radius * 0.6, Math.sin(a) * radius * 0.62); vent.rotation.z = Math.cos(a) * 1.0; vent.rotation.x = -Math.sin(a) * 1.0; collar.add(vent); }
  const roll = new THREE.Group(); roll.add(g); roll.position.y = radius;
  const holder = new THREE.Group(); holder.name = 'ballRig'; holder.add(roll); collar.position.y = radius; holder.add(collar);
  model.root.add(holder);
  model.ball = g; model.ballRig = holder; model.ballRadius = radius; model.ballCollar = collar;
  return holder;
}

/** Swap a procedural soldier's body for a custom skinned mesh (rig must still be in its zero pose). */
export function applyCustomBody(model, custom, opts = {}) {
  if (!custom || model.custom) return null;
  for (const n in model.bones) model.bones[n].rotation.set(0, 0, 0);
  try { fitRigToMesh(model, custom); } catch (e) { console.warn('[glb] rig fit failed', e); }
  let skinned;
  if (opts.noLegs) {
    const sub = custom._legless || (custom._legless = { ...custom, geometry: legless(custom), skinnedGeo: null, _mats: custom._mats, fit: custom.fit });
    custom._legless.fit = custom.fit; skinned = skinToRig(sub, model.bones, model.root); custom._legless = sub;
    // torso rides higher: pelvis sits on top of the ball
    const r = opts.ballRadius || 0.58; const cut = custom.waistCut ?? (custom.fit.crotchY + 0.16); model.ballRootY = (custom.fit.crotchY + 0.04) + (r * 2 - 0.05 - cut); model.bones.root.position.y = model.ballRootY; model.root.updateWorldMatrix(true, true);
    attachBall(model, r);
    if (opts.torsoScale && opts.torsoScale !== 1) { const k = opts.torsoScale; model.bones.root.scale.setScalar(k); model.torsoScale = k; }
    for (const n of ['upperArmL', 'upperArmR']) model.bones[n].scale.set(1.28, 1, 1.28); // thicker limbs (children inherit)
  } else skinned = skinToRig(custom, model.bones, model.root);
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
  const gripR = new THREE.Object3D(); gripR.name = 'gripR'; gripR.position.copy(custom.gripR || new THREE.Vector3(0.02, -0.02, 0.04)); g.add(gripR);
  const gripL = new THREE.Object3D(); gripL.name = 'gripL'; gripL.position.copy(custom.gripL || new THREE.Vector3(-0.02, 0.0, Math.min(custom.muzzle.z * 0.45, 0.34))); g.add(gripL);
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
    if (neon) { d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255; d[i + 3] = 255; } else { d[i] = d[i + 1] = d[i + 2] = 36; d[i + 3] = 255; }
  }
  ctx.putImageData(id, 0, 0);
  const em = new THREE.CanvasTexture(cv); em.colorSpace = THREE.SRGBColorSpace; em.flipY = tex.flipY; em.wrapS = tex.wrapS; em.wrapT = tex.wrapT;
  material.emissiveMap = em; material.emissive = new THREE.Color('#ffffff'); material.emissiveIntensity = 0.7; material.needsUpdate = true;
}

/** Roll a ball-mounted body: spin the sphere with ground velocity, squash it on landing. */
export function rollBall(model, vx, vz, dt, land = 0, rootYaw = 0, crouch = 0) {
  if (!model?.ball) return;
  const sp = Math.hypot(vx, vz);
  if (sp > 0.05 && dt > 0) {
    const inv = 1 / sp; let ax = vz * inv, az = -vx * inv;                  // world axis = up x velocity
    const c = Math.cos(-rootYaw), s = Math.sin(-rootYaw); const lx = ax * c + az * s, lz = -ax * s + az * c; // into root-local space
    _axis.set(lx, 0, lz).normalize(); _q.setFromAxisAngle(_axis, sp * dt / model.ballRadius); model.ball.quaternion.premultiply(_q);
  }
  void land; void crouch;
}
const _axis = new THREE.Vector3(), _q = new THREE.Quaternion();
