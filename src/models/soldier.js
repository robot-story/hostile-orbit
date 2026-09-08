// Procedural rigged soldier: one SkinnedMesh per material, rigid-bound to a bone hierarchy we pose in code.
// Used for the player (Commonwealth white/black + cyan) and Null Legion infantry (dark chassis + red-orange).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat, COLORS } from '../render/materials.js';

// Bone definitions: name, parent, rest position (relative to parent), and which mesh-limb group it belongs to.
export const BONES = [
  ['root', null, [0, 0.98, 0]],
  ['spine', 'root', [0, 0.10, 0]],
  ['chest', 'spine', [0, 0.22, 0]],
  ['neck', 'chest', [0, 0.26, 0]],
  ['head', 'neck', [0, 0.08, 0]],
  ['shoulderL', 'chest', [0.24, 0.20, 0]],
  ['upperArmL', 'shoulderL', [0.06, -0.02, 0]],
  ['forearmL', 'upperArmL', [0, -0.30, 0]],
  ['handL', 'forearmL', [0, -0.27, 0]],
  ['shoulderR', 'chest', [-0.24, 0.20, 0]],
  ['upperArmR', 'shoulderR', [-0.06, -0.02, 0]],
  ['forearmR', 'upperArmR', [0, -0.30, 0]],
  ['handR', 'forearmR', [0, -0.27, 0]],
  ['thighL', 'root', [0.12, -0.04, 0]],
  ['shinL', 'thighL', [0, -0.46, 0]],
  ['footL', 'shinL', [0, -0.46, 0]],
  ['thighR', 'root', [-0.12, -0.04, 0]],
  ['shinR', 'thighR', [0, -0.46, 0]],
  ['footR', 'shinR', [0, -0.46, 0]],
];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// Limb groups for dismemberment (bone names included in each detachable part)
export const LIMBS = {
  head: ['head'],
  armL: ['upperArmL', 'forearmL', 'handL'],
  armR: ['upperArmR', 'forearmR', 'handR'],
  legL: ['thighL', 'shinL', 'footL'],
  legR: ['thighR', 'shinR', 'footR'],
};

const _geoCache = new Map();
function partGeo(kind, ...args) {
  const key = kind + args.join(',');
  if (!_geoCache.has(key)) {
    let g;
    if (kind === 'box') g = new THREE.BoxGeometry(...args);
    else if (kind === 'cyl') g = new THREE.CylinderGeometry(...args);
    else if (kind === 'sph') g = new THREE.SphereGeometry(...args);
    else if (kind === 'cap') g = new THREE.CapsuleGeometry(...args);
    _geoCache.set(key, g);
  }
  return _geoCache.get(key);
}

/**
 * Part list: each entry = { bone, mat: 'white'|'black'|'neon'|'suit'|'visor'|'accent', geo: [kind, ...args], pos:[x,y,z], rot:[x,y,z], scale:[x,y,z] }
 * Positions are in the bone's local space (limb bones point down -y).
 */
function soldierParts(style) {
  const P = [];
  const add = (bone, mat, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => P.push({ bone, mat, geo, pos, rot, scale });
  const W = style.plate, B = 'black', S = 'suit', N = 'neon', J = 'joint';
  // ---- torso: segmented mechanical core ----
  add('spine', S, ['cyl', 0.16, 0.19, 0.16, 10], [0, 0.04, 0]);
  add('spine', B, ['box', 0.42, 0.11, 0.28], [0, 0.0, 0]);
  add('spine', W, ['box', 0.12, 0.13, 0.09], [-0.15, -0.02, 0.14]);
  add('spine', W, ['box', 0.12, 0.13, 0.09], [0.15, -0.02, 0.14]);
  add('spine', B, ['box', 0.14, 0.10, 0.08], [0, -0.02, -0.16]);
  add('spine', N, ['box', 0.30, 0.02, 0.02], [0, 0.0, 0.15]);
  add('chest', S, ['box', 0.34, 0.30, 0.26], [0, 0.10, 0]);
  add('chest', W, ['box', 0.38, 0.28, 0.14], [0, 0.12, 0.14]);
  add('chest', W, ['box', 0.30, 0.12, 0.10], [0, -0.04, 0.16], [0.25, 0, 0]);
  add('chest', 'visor', ['cyl', 0.05, 0.05, 0.04, 12], [0, 0.14, 0.215], [Math.PI / 2, 0, 0]);
  add('chest', N, ['box', 0.16, 0.025, 0.02], [0, 0.22, 0.215]);
  add('chest', N, ['box', 0.025, 0.10, 0.02], [-0.14, 0.10, 0.215]);
  add('chest', N, ['box', 0.025, 0.10, 0.02], [0.14, 0.10, 0.215]);
  add('chest', W, ['box', 0.34, 0.32, 0.10], [0, 0.10, -0.14]);
  add('chest', B, ['box', 0.32, 0.36, 0.18], [0, 0.06, -0.26]);
  add('chest', N, ['box', 0.16, 0.03, 0.02], [0, 0.20, -0.36]);
  add('chest', J, ['cyl', 0.05, 0.05, 0.12, 10], [-0.09, -0.08, -0.30]);
  add('chest', J, ['cyl', 0.05, 0.05, 0.12, 10], [0.09, -0.08, -0.30]);
  add('chest', N, ['cyl', 0.03, 0.03, 0.02, 10], [-0.09, -0.15, -0.30]);
  add('chest', N, ['cyl', 0.03, 0.03, 0.02, 10], [0.09, -0.15, -0.30]);
  add('chest', W, ['box', 0.22, 0.12, 0.34], [-0.24, 0.26, 0], [0, 0, 0.35]);
  add('chest', W, ['box', 0.22, 0.12, 0.34], [0.24, 0.26, 0], [0, 0, -0.35]);
  add('chest', N, ['box', 0.03, 0.02, 0.24], [-0.33, 0.30, 0], [0, 0, 0.35]);
  add('chest', N, ['box', 0.03, 0.02, 0.24], [0.33, 0.30, 0], [0, 0, -0.35]);
  add('neck', J, ['cyl', 0.07, 0.09, 0.10, 12], [0, 0.03, 0]);
  add('neck', N, ['cyl', 0.075, 0.075, 0.015, 12], [0, 0.0, 0]);
  // ---- head: angular sensor helmet ----
  add('head', W, ['box', 0.24, 0.24, 0.26], [0, 0.11, 0.0]);
  add('head', W, ['box', 0.20, 0.10, 0.22], [0, 0.245, 0.01], [0.15, 0, 0]);
  add('head', B, ['box', 0.22, 0.09, 0.10], [0, 0.03, 0.10]);
  add('head', 'visor', ['box', 0.22, 0.05, 0.03], [0, 0.12, 0.135]);
  add('head', N, ['box', 0.03, 0.07, 0.015], [-0.09, 0.12, 0.14]);
  add('head', N, ['box', 0.03, 0.07, 0.015], [0.09, 0.12, 0.14]);
  add('head', B, ['box', 0.06, 0.05, 0.08], [0, 0.29, -0.02]);
  add('head', N, ['box', 0.02, 0.02, 0.04], [0, 0.30, 0.03]);
  add('head', B, ['box', 0.26, 0.08, 0.06], [0, 0.10, -0.14]);
  add('head', B, ['box', 0.06, 0.16, 0.10], [-0.14, 0.08, -0.02]);
  add('head', B, ['box', 0.06, 0.16, 0.10], [0.14, 0.08, -0.02]);
  // ---- arms: piston limbs with joint rings ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    add('upperArm' + side, J, ['sph', 0.075, 12, 8], [0, 0.0, 0]);
    add('upperArm' + side, S, ['box', 0.10, 0.28, 0.10], [0, -0.16, 0]);
    add('upperArm' + side, W, ['box', 0.14, 0.17, 0.14], [s * 0.01, -0.12, 0]);
    add('upperArm' + side, N, ['box', 0.02, 0.08, 0.02], [s * 0.075, -0.12, 0.0]);
    add('forearm' + side, J, ['cyl', 0.065, 0.065, 0.10, 10], [0, 0.0, 0], [0, 0, Math.PI / 2]);
    add('forearm' + side, S, ['box', 0.08, 0.26, 0.08], [0, -0.13, 0]);
    add('forearm' + side, W, ['box', 0.12, 0.19, 0.13], [0, -0.14, 0]);
    add('forearm' + side, N, ['box', 0.02, 0.10, 0.02], [s * 0.065, -0.14, 0.0]);
    add('hand' + side, J, ['sph', 0.045, 8, 6], [0, 0.0, 0]);
    add('hand' + side, B, ['box', 0.08, 0.10, 0.05], [0, -0.06, 0.01]);
    add('hand' + side, B, ['box', 0.07, 0.05, 0.07], [0, -0.12, 0.02]);
  }
  // ---- legs: heavy actuators ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    add('thigh' + side, J, ['sph', 0.09, 12, 8], [0, 0.0, 0]);
    add('thigh' + side, S, ['box', 0.14, 0.44, 0.14], [0, -0.23, 0]);
    add('thigh' + side, W, ['box', 0.17, 0.30, 0.12], [0, -0.20, 0.07]);
    add('thigh' + side, W, ['box', 0.08, 0.26, 0.14], [s * 0.10, -0.20, 0.0]);
    add('shin' + side, J, ['cyl', 0.08, 0.08, 0.16, 10], [0, 0.0, 0], [0, 0, Math.PI / 2]);
    add('shin' + side, N, ['cyl', 0.085, 0.085, 0.02, 12], [0, 0.0, 0], [0, 0, Math.PI / 2]);
    add('shin' + side, S, ['box', 0.11, 0.44, 0.11], [0, -0.23, 0]);
    add('shin' + side, W, ['box', 0.14, 0.34, 0.11], [0, -0.22, 0.07]);
    add('shin' + side, N, ['box', 0.02, 0.16, 0.02], [0, -0.22, 0.13]);
    add('foot' + side, B, ['box', 0.15, 0.10, 0.30], [0, -0.05, 0.06]);
    add('foot' + side, W, ['box', 0.16, 0.06, 0.12], [0, -0.02, 0.12]);
    add('foot' + side, N, ['box', 0.10, 0.02, 0.02], [0, -0.09, 0.20]);
  }
  return P;
}

export const STYLES = {
  vanguard: { plate: 'white', neon: COLORS.cyan },
  legion: { plate: 'legion', neon: COLORS.redOrange },
  legionHeavy: { plate: 'legion', neon: COLORS.orange, scale: 1.18 },
  rescued: { plate: 'white', neon: COLORS.green },
};

function materialsFor(style) {
  return {
    white: Mat.armorWhite(), black: Mat.armorBlack(), suit: Mat.underSuit(),
    legion: Mat.legionArmor(),
    neon: Mat.neon(style.neon, 2.6), visor: Mat.visor(), accent: Mat.neon(style.neon, 1.5), joint: Mat.gunMetal(),
  };
}

/**
 * Build a rigged soldier. Returns { root, bones, boneList, skeleton, meshes, limbMeshes(), setLimbVisible(name, bool) }
 */
export function buildSoldier(styleName = 'vanguard', opts = {}) {
  const style = STYLES[styleName] || STYLES.vanguard;
  const mats = materialsFor(style);
  const root = new THREE.Group();
  root.name = 'soldier:' + styleName;
  // bones
  const boneList = [];
  const bones = {};
  for (const [name, parent, pos] of BONES) {
    const b = new THREE.Bone(); b.name = name; b.position.set(...pos);
    boneList.push(b); bones[name] = b;
    if (parent) bones[parent].add(b);
  }
  root.add(bones.root);
  // Compute bone world matrices in rest pose (root at origin) BEFORE creating the skeleton so bone inverses are correct
  bones.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  const parts = soldierParts(style);
  const byMat = new Map();
  const limbGeos = {}; // limbName -> [{mat, geo}] for gib meshes
  for (const p of parts) {
    const bone = bones[p.bone];
    const g = partGeo(...p.geo).clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rot)), new THREE.Vector3(...p.scale));
    // bake into model space: boneWorld * local
    g.applyMatrix4(m);
    // record limb piece in bone-local space (for gibs)
    for (const limb in LIMBS) if (LIMBS[limb].includes(p.bone)) { (limbGeos[limb] ||= []).push({ mat: p.mat, geo: g.clone(), bone: p.bone }); }
    g.applyMatrix4(bone.matrixWorld);
    const n = g.attributes.position.count;
    const bi = BONE_INDEX[p.bone];
    const si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (!byMat.has(p.mat)) byMat.set(p.mat, []);
    byMat.get(p.mat).push(g);
  }
  const meshes = [];
  for (const [matName, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mesh = new THREE.SkinnedMesh(merged, mats[matName]);
    mesh.castShadow = matName !== 'neon'; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'part:' + matName;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    meshes.push(mesh);
  }
  const scale = style.scale || 1;
  root.scale.set(scale, scale, scale);
  // weapon attach point on right hand
  const weaponSocket = new THREE.Object3D(); weaponSocket.name = 'weaponSocket';
  weaponSocket.position.set(0.0, -0.08, 0.05);
  bones.handR.add(weaponSocket);
  const model = {
    root, bones, boneList, skeleton, meshes, mats, style: styleName, weaponSocket, scale,
    hiddenLimbs: new Set(),
    /** Hide a limb by collapsing its bones (used for dismemberment). */
    hideLimb(limb) {
      if (this.hiddenLimbs.has(limb)) return; this.hiddenLimbs.add(limb);
      const first = LIMBS[limb][0]; bones[first].scale.setScalar(0.0001);
    },
    /** Build standalone (non-skinned) meshes for a limb, in that limb's root bone local frame. */
    makeLimbMeshes(limb) {
      const group = new THREE.Group();
      const pieces = limbGeos[limb]; if (!pieces) return group;
      const rootBone = bones[LIMBS[limb][0]];
      const rootInv = new THREE.Matrix4().copy(rootBone.matrixWorld).invert();
      // group bone-local pieces into the limb root frame using rest pose
      const byM = new Map();
      for (const pc of pieces) {
        const g = pc.geo.clone();
        // rest-pose transform of pc.bone relative to limb root
        const rel = new THREE.Matrix4().multiplyMatrices(rootInv, bones[pc.bone].matrixWorld);
        g.applyMatrix4(rel);
        if (!byM.has(pc.mat)) byM.set(pc.mat, []);
        byM.get(pc.mat).push(g);
      }
      for (const [mn, gs] of byM) { const mm = new THREE.Mesh(mergeGeometries(gs, false), mats[mn]); mm.castShadow = true; group.add(mm); }
      return group;
    },
    dispose() { for (const m of meshes) m.geometry.dispose(); },
  };
  // Use rest world matrices computed with root at origin: ensure bones' matrixWorld are rest
  return model;
}

/** Height of the model in metres at rest. */
export const SOLDIER_HEIGHT = 1.86;
export const EYE_HEIGHT = 1.68;
