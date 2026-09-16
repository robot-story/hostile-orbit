import { applyHollow, hollowReady } from './hollow.js';
// Legion enemy frames: procedural rigid-part bodies on the soldier rig, built with the same kit as the OUTRIDER so the
// enemies read as the same generation of machine (bevelled plates, inset light channels, real joints) in the Legion
// palette: matte carbon, oxide-red plating, gunmetal, red-orange glow.
//   rifleman   SENTINEL   lean line trooper, wide visor bar, comms mast
//   breacher   BREACHER   squat and wide, riot shield on the left forearm, ram wedges on the shoulders
//   suppressor SUPPRESSOR heavy: ammo pack with feed line, triple eyes, knee plates
//   grenadier  GRENADIER  launcher tube on the back, bandolier, rangefinder monocle
import * as THREE from 'three';
import { KIT, compactRigid } from './robots.js';
import { COLORS } from '../render/materials.js';
import { damp } from '../core/mathx.js';

const { armour, neon, neonOwn, dark, add, box, cyl, sphere, torus, capsule, channel, bevelBox, hexPlate, lathe, tube, decal } = KIT;
const RED = '#ff3b1f';

function palette(kind) {
  // readable in the orange light: oxide-red plates over a graphite core, light gunmetal joints
  const oxide = armour('ceramic', kind === 'suppressor' ? '#a8402c' : '#b84a34'), carbon = armour('gunmetal', '#6a707c'), gun = armour('gunmetal', '#9aa0ac'), gunLight = armour('gunmetal', '#c8ced8');
  const N = { rifleman: RED, breacher: '#ff6a3a', suppressor: '#ffa030', grenadier: '#d04cff' }[kind] || RED;
  return { oxide, carbon, gun, gunLight, N, joints: [] };
}

/** Legs shared by all bipeds; `bulk` widens plates, `plateMat` is the outer armour. */
function legs(B, P, bulk = 1, kneeGlow = 1.2) {
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    add(B['thigh' + side], lathe([[0.02, 0], [0.11 * bulk, 0], [0.12 * bulk, -0.12], [0.09 * bulk, -0.36], [0.06 * bulk, -0.44], [0.02, -0.44]], P.carbon, 12), [0, -0.02, 0]);
    add(B['thigh' + side], bevelBox(0.2 * bulk, 0.26, 0.09, P.oxide, 0.015, 0.03), [0, -0.2, 0.11]);
    add(B['thigh' + side], bevelBox(0.07, 0.26, 0.18 * bulk, P.oxide, 0.012, 0.03), [sx * 0.11 * bulk, -0.2, 0]);
    add(B['thigh' + side], cyl(0.02, 0.02, 0.28, P.gunLight, 8), [sx * -0.06, -0.28, -0.08], [0.15, 0, 0]);
    const knee = add(B['shin' + side], torus(0.065, 0.016, neonOwn(P.N, kneeGlow), 20), [0, 0, 0], [0, Math.PI / 2, 0]); knee.castShadow = false; P.joints.push(knee);
    add(B['shin' + side], cyl(0.06, 0.06, 0.12 * bulk, P.gun, 12), [0, 0, 0], [0, 0, Math.PI / 2]);
    add(B['shin' + side], lathe([[0.02, 0], [0.075 * bulk, -0.02], [0.085 * bulk, -0.16], [0.06 * bulk, -0.36], [0.05 * bulk, -0.44], [0.02, -0.44]], P.carbon, 12), [0, 0, 0]);
    add(B['shin' + side], bevelBox(0.15 * bulk, 0.28, 0.06, P.oxide, 0.015, 0.03), [0, -0.2, 0.09], [0.08, 0, 0]);
    add(B['shin' + side], cyl(0.018, 0.018, 0.26, P.gunLight, 8), [sx * 0.07, -0.2, -0.07]);
    add(B['foot' + side], box(0.18 * bulk, 0.09, 0.3, P.carbon), [0, -0.045, 0.05]);
    add(B['foot' + side], bevelBox(0.16 * bulk, 0.05, 0.14, P.oxide, 0.01, 0.02), [0, 0.0, 0.14]);
    add(B['foot' + side], channel(0.12, P.N, 1.4, 0.014), [0, -0.06, 0.2]);
  }
}

function arms(B, P, bulk = 1) {
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1; const sh = B['shoulder' + side], ua = B['upperArm' + side], fa = B['forearm' + side], ha = B['hand' + side];
    add(sh, sphere(0.065, P.gun, 14), [sx * 0.02, 0, 0]);
    add(sh, bevelBox(0.24 * bulk, 0.13, 0.26 * bulk, P.oxide, 0.025, 0.04), [sx * 0.08, 0.06, 0], [0, 0, sx * 0.2]);
    add(sh, channel(0.16, P.N, 1.7), [sx * 0.08, 0.13, 0.02], [Math.PI / 2, 0, sx * 0.2]);
    add(ua, lathe([[0.02, 0], [0.07, -0.02], [0.075, -0.12], [0.055, -0.28], [0.02, -0.3]], P.carbon, 12), [0, 0, 0]);
    add(ua, bevelBox(0.1, 0.18, 0.12, P.oxide, 0.012, 0.02), [sx * 0.03, -0.16, 0]);
    const ring = add(fa, torus(0.05, 0.012, neonOwn(P.N, 1.1), 20), [0, 0, 0], [0, Math.PI / 2, 0]); ring.castShadow = false; P.joints.push(ring);
    add(fa, cyl(0.045, 0.045, 0.12, P.gun, 12), [0, 0, 0], [0, 0, Math.PI / 2]);
    add(fa, lathe([[0.02, -0.02], [0.062, -0.04], [0.058, -0.16], [0.045, -0.26], [0.02, -0.27]], P.carbon, 12), [0, 0, 0]);
    add(fa, bevelBox(0.11, 0.18, 0.05, P.oxide, 0.012, 0.02), [0, -0.13, 0.065]);
    add(fa, channel(0.14, P.N, 1.6, 0.012), [sx * 0.058, -0.13, 0.02], [0, 0, Math.PI / 2]);
    add(ha, bevelBox(0.085, 0.09, 0.09, P.carbon, 0.01, 0.02), [0, -0.045, 0.01]);
    for (let f = 0; f < 3; f++) add(ha, box(0.022, 0.055, 0.022, P.gun), [-0.026 + f * 0.026, -0.11, 0.035], [0.5, 0, 0]);
    add(ha, box(0.024, 0.05, 0.024, P.gun), [sx * 0.05, -0.06, 0.04], [0.7, 0, sx * 0.6]);
  }
}

function core(B, P, bulk = 1) {
  add(B.root, bevelBox(0.36 * bulk, 0.18, 0.28, P.carbon, 0.02, 0.03), [0, -0.05, 0]);
  add(B.root, bevelBox(0.28, 0.1, 0.06, P.oxide, 0.012, 0.02), [0, -0.03, 0.15]);
  for (const sx of [-1, 1]) { const hip = cyl(0.06, 0.06, 0.08, P.gun, 12); hip.rotation.z = Math.PI / 2; hip.position.set(sx * 0.16 * bulk, -0.07, 0); add(B.root, hip); }
  for (let i = 0; i < 3; i++) add(B.spine, bevelBox(0.22 + i * 0.07, 0.065, 0.18 + i * 0.04, i % 2 ? P.gun : P.carbon, 0.01), [0, -0.03 + i * 0.07, 0]);
  add(B.root, bevelBox(0.3, 0.05, 0.22, P.gun, 0.01), [0, 0.06, 0]); // waist seam undercut
  add(B.spine, channel(0.12, P.N, 1.5), [0, 0.02, 0.135], [0, 0, Math.PI / 2]);
  add(B.chest, bevelBox(0.46 * bulk, 0.2, 0.28, P.carbon, 0.025), [0, 0.16, 0]); add(B.chest, bevelBox(0.36 * bulk, 0.16, 0.24, P.carbon, 0.02), [0, -0.02, 0]);
  add(B.chest, bevelBox(0.42 * bulk, 0.16, 0.08, P.oxide, 0.02, 0.03), [0, 0.22, 0.14], [0.2, 0, 0]);
  add(B.chest, bevelBox(0.36 * bulk, 0.14, 0.07, P.oxide, 0.02, 0.03), [0, 0.02, 0.15], [-0.15, 0, 0]);
  add(B.chest, channel(0.24 * bulk, P.N, 1.7), [0, 0.13, 0.19]);
  add(B.chest, bevelBox(0.24, 0.28, 0.12, P.carbon, 0.02), [0, 0.1, -0.18]);            // backpack
  add(B.chest, channel(0.2, P.N, 1.4), [0, 0.1, -0.245], [0, 0, Math.PI / 2]);
  add(B.chest, bevelBox(0.2, 0.04, 0.16, P.gun, 0.01), [0, 0.28, 0]);                   // collar
  add(B.chest, bevelBox(0.32, 0.08, 0.05, P.oxide, 0.012, 0.02), [0.06, -0.09, 0.14], [0, 0, 0.5]); // diagonal plate across the waist seam
  add(B.spine, bevelBox(0.26, 0.07, 0.05, P.gun, 0.01), [-0.05, 0.06, 0.13], [0, 0, -0.4]);
  add(B.neck, cyl(0.055, 0.07, 0.14, P.carbon, 12), [0, 0.02, 0]);
}

/** Angular Legion head: wedge crown, raked face plate, visor treatment per type. */
function head(B, P, kind) {
  add(B.head, bevelBox(0.23, 0.14, 0.24, P.oxide, 0.025, 0.05), [0, 0.16, -0.01]);
  add(B.head, bevelBox(0.21, 0.12, 0.2, P.carbon, 0.02, 0.04), [0, 0.07, -0.02]);
  add(B.head, bevelBox(0.2, 0.15, 0.05, P.oxide, 0.02, 0.03), [0, 0.11, 0.11], [-0.28, 0, 0]);
  add(B.head, bevelBox(0.25, 0.04, 0.12, P.oxide, 0.012, 0.03), [0, 0.19, 0.09], [0.25, 0, 0]);
  if (kind === 'suppressor') { for (let i = 0; i < 3; i++) { const eye = sphere(0.016, neon(P.N, 2.2), 8); eye.position.set(-0.05 + i * 0.05, 0.12, 0.14); eye.castShadow = false; B.head.add(eye); } }
  else if (kind === 'breacher') { add(B.head, channel(0.1, P.N, 1.8, 0.02), [0, 0.11, 0.14], [-0.28, 0, Math.PI / 2]); }
  else { add(B.head, channel(0.17, P.N, 1.8, 0.02), [0, 0.12, 0.14], [-0.28, 0, 0]); }
  if (kind === 'grenadier') { add(B.head, bevelBox(0.11, 0.1, 0.09, P.oxide, 0.012, 0.02), [0.09, 0.13, 0.15]); const mono = cyl(0.04, 0.045, 0.06, P.gun, 12); mono.rotation.x = Math.PI / 2; mono.position.set(0.09, 0.13, 0.2); add(B.head, mono); const lens = cyl(0.03, 0.03, 0.008, neon(P.N, 2), 12); lens.rotation.x = Math.PI / 2; lens.position.set(0.09, 0.13, 0.235); lens.castShadow = false; B.head.add(lens); }
  for (const sx of [-1, 1]) add(B.head, bevelBox(0.05, 0.1, 0.12, P.carbon, 0.01), [sx * 0.13, 0.09, 0.02]);
  if (kind === 'rifleman') { add(B.head, bevelBox(0.04, 0.03, 0.04, P.gun, 0.006), [0.09, 0.26, -0.06]); add(B.head, cyl(0.012, 0.015, 0.18, P.gun, 6), [0.09, 0.35, -0.07], [0.2, 0, 0]); add(B.head, sphere(0.024, neon(P.N, 2), 8), [0.09, 0.45, -0.09]).castShadow = false; }
}

const FRAMES = {
  rifleman(B, P) { core(B, P, 1); arms(B, P, 1); legs(B, P, 1); head(B, P, 'rifleman'); add(B.chest, decal('tech', P.N, 0.1, 0.04), [0.16, 0.05, 0.16]); },
  breacher(B, P) {
    core(B, P, 1.15); arms(B, P, 1.15); legs(B, P, 1.15, 1.4); head(B, P, 'breacher');
    // riot shield on the left forearm, ram wedges on the shoulders
    add(B.forearmL, bevelBox(0.5, 0.76, 0.04, P.oxide, 0.025, 0.06), [0.16, -0.1, 0.12], [0, 0.6, 0]);
    add(B.forearmL, bevelBox(0.36, 0.5, 0.03, P.carbon, 0.015, 0.04), [0.16, -0.08, 0.15], [0, 0.6, 0]);
    add(B.forearmL, channel(0.62, P.N, 1.4, 0.024), [0.16, -0.1, 0.17], [0, 0.6, Math.PI / 2]);
    add(B.forearmL, decal('hazard', P.N, 0.3, 0.05), [0.16, 0.22, 0.17], [0, 0.6, 0]);
    add(B.forearmL, channel(0.2, P.N, 1.2, 0.02), [0.16, -0.44, 0.17], [0, 0.6, 0]);
    for (const sx of [-1, 1]) add(B['shoulder' + (sx > 0 ? 'L' : 'R')], bevelBox(0.14, 0.16, 0.3, P.gun, 0.02, 0.03), [sx * 0.2, 0.1, 0.04], [0, 0, sx * 0.4]);
  },
  suppressor(B, P) {
    core(B, P, 1.25); arms(B, P, 1.2); legs(B, P, 1.3, 1.6); head(B, P, 'suppressor');
    // ammo pack with a feed line toward the right hand, knee plates, big pauldrons
    add(B.chest, bevelBox(0.5, 0.36, 0.22, P.carbon, 0.02, 0.04), [0.1, 0.1, -0.27]);
    const drum = cyl(0.13, 0.13, 0.16, P.oxide, 16); drum.rotation.z = Math.PI / 2; drum.position.set(0.3, -0.04, -0.02); add(B.root, drum); add(B.root, torus(0.13, 0.012, neon(P.N, 1.2), 16), [0.39, -0.04, -0.02], [0, Math.PI / 2, 0]).castShadow = false; // hip ammo drum
    for (let i = 0; i < 3; i++) add(B.chest, cyl(0.055, 0.055, 0.34, P.gun, 10), [-0.04 + i * 0.12, 0.28, -0.3], [0.2, 0, 0]);
    add(B.chest, tube([[0.16, 0.1, -0.24], [0.36, -0.05, -0.1], [0.32, -0.28, 0.12]], 0.025, P.gun, 12));
    for (const sx of [-1, 1]) { add(B['shoulder' + (sx > 0 ? 'L' : 'R')], bevelBox(0.3, 0.2, 0.34, P.oxide, 0.03, 0.05), [sx * 0.1, 0.1, 0], [0, 0, sx * 0.15]); add(B['shin' + (sx > 0 ? 'L' : 'R')], bevelBox(0.16, 0.14, 0.08, P.oxide, 0.015, 0.03), [0, 0.02, 0.1]); }
    add(B.chest, decal('chevron', P.N, 0.12, 0.1), [0, 0.02, 0.2]);
  },
  grenadier(B, P) {
    core(B, P, 1); arms(B, P, 1); legs(B, P, 1); head(B, P, 'grenadier');
    // launcher tube on the back, bandolier across the chest
    const tubeM = cyl(0.075, 0.07, 0.56, P.gun, 14); tubeM.position.set(-0.34, 0.3, 0.0); tubeM.rotation.set(Math.PI / 2 - 0.35, 0, 0); add(B.chest, tubeM); // launcher outboard of the left shoulder, muzzle forward and up
    add(B.chest, bevelBox(0.12, 0.14, 0.24, P.oxide, 0.012, 0.03), [-0.34, 0.2, -0.06]);
    add(B.chest, bevelBox(0.08, 0.1, 0.1, P.gun, 0.01), [-0.28, 0.24, -0.02]); // mount bracket to the pauldron
    add(B.chest, torus(0.08, 0.012, neon(P.N, 1.8), 18), [-0.34, 0.3 + 0.28 * 0.343, 0.28 * 0.94], [Math.PI / 2 - 0.35, 0, 0]).castShadow = false;
    for (let i = 0; i < 4; i++) { const g = cyl(0.04, 0.04, 0.11, P.carbon, 10); g.position.set(-0.14 + i * 0.1, 0.18 - i * 0.06, 0.2); g.rotation.z = -0.5; add(B.chest, g); const cap = cyl(0.035, 0.035, 0.014, neon(P.N, 1.4), 10); cap.position.set(-0.14 + i * 0.1 + 0.03, 0.18 - i * 0.06 + 0.055, 0.2); cap.rotation.z = -0.5; cap.castShadow = false; B.chest.add(cap); }
    add(B.chest, decal('unit', P.N, 0.1, 0.1), [0.15, 0.08, 0.16]);
  },
};

export function applyLegionFrame(model, kind, opts = {}) {
  if (kind === 'rifleman' && hollowReady() && new URLSearchParams(location.search).get('characters') !== 'legacy') return applyHollow(model);
  const build = FRAMES[kind]; if (!build) return model;
  for (const n in model.bones) model.bones[n].rotation.set(0, 0, 0);
  for (const m of model.meshes) m.visible = false;
  const P = palette(kind);
  build(model.bones, P);
  compactRigid(model.root);
  model.robot = 'legion:' + kind; model.legion = kind; model.joints = P.joints;
  model.root.scale.multiplyScalar(kind === 'suppressor' ? 1.06 : 1.02);
  let pulse = 0, lastPhase = 0;
  model.motion = (vx, vz, dt, land) => {
    const sp = Math.hypot(vx, vz); const ph = model.animator ? Math.floor(model.animator.phase / Math.PI) : 0;
    if (ph !== lastPhase && sp > 0.5) { lastPhase = ph; pulse = 1; }
    pulse = damp(pulse, 0, 6, dt);
    const it = 1.4 + pulse * 1.6 + sp * 0.05 + (land || 0) * 1.2;
    for (const j of P.joints) j.material.emissiveIntensity = it;
  };
  return model;
}
export const LEGION_FRAMES = Object.keys(FRAMES);
