// Procedural weapon models. Each returns a Group oriented with the barrel pointing +z, grip at origin, and a `muzzle` Object3D.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { mergeGroupByMaterial } from '../world/merge.js';

const B = (w, h, d, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; return x; };
const C = (r1, r2, h, m, seg = 10) => { const x = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); x.rotation.x = Math.PI / 2; x.castShadow = true; return x; };
const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

function finish(g, muzzleZ, muzzleY = 0.04, grips = {}) {
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, muzzleY, muzzleZ); g.add(muzzle);
  const gripR = new THREE.Object3D(); gripR.name = 'gripR'; gripR.position.set(...(grips.r || [0.02, -0.02, 0.04])); g.add(gripR);
  const gripL = new THREE.Object3D(); gripL.name = 'gripL'; gripL.position.set(...(grips.l || [-0.02, 0.0, Math.min(muzzleZ * 0.45, 0.34)])); g.add(gripL);
  g.userData.gripR = gripR; g.userData.gripL = gripL;
  const flash = new THREE.Object3D(); flash.name = 'ejector'; flash.position.set(0.03, 0.05, -0.02); g.add(flash);
  g.userData.muzzle = muzzle; g.userData.ejector = flash;
  return mergeGroupByMaterial(g);
}

export function buildViper(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:viper';
  const gm = Mat.gunMetal(), gw = Mat.gunWhite(), n = Mat.neon(neon, 2.2);
  g.add(at(B(0.05, 0.09, 0.44, gw), 0, 0.06, 0.12));        // receiver
  g.add(at(B(0.055, 0.05, 0.30, gm), 0, 0.03, 0.34));       // handguard
  g.add(at(C(0.012, 0.012, 0.34, gm), 0, 0.055, 0.56));     // barrel
  g.add(at(B(0.03, 0.03, 0.06, gm), 0, 0.055, 0.74));       // muzzle brake
  g.add(at(B(0.04, 0.09, 0.05, gm), 0, -0.03, 0.05));       // grip
  g.add(at(B(0.05, 0.18, 0.05, gm), 0, -0.10, 0.14));       // magazine
  g.add(at(B(0.045, 0.06, 0.24, gw), 0, 0.06, -0.20));      // stock
  g.add(at(B(0.05, 0.08, 0.05, gm), 0, 0.02, -0.33));       // butt
  g.add(at(B(0.03, 0.04, 0.10, gm), 0, 0.13, 0.12));        // optic
  g.add(at(B(0.012, 0.012, 0.16, n), 0.03, 0.09, 0.20));     // neon rail L
  g.add(at(B(0.012, 0.012, 0.16, n), -0.03, 0.09, 0.20));    // neon rail R
  g.add(at(B(0.02, 0.02, 0.02, n), 0, 0.14, 0.17));          // optic glow
  return finish(g, 0.78, 0.055);
}

export function buildHammer(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:hammer';
  const gm = Mat.gunMetal(), gw = Mat.gunWhite(), n = Mat.neon(neon, 2.2);
  g.add(at(B(0.06, 0.10, 0.36, gw), 0, 0.06, 0.08));
  g.add(at(C(0.02, 0.02, 0.56, gm), 0, 0.075, 0.50));       // barrel
  g.add(at(C(0.018, 0.018, 0.40, gm), 0, 0.03, 0.44));      // tube mag
  g.add(at(B(0.06, 0.07, 0.16, gm), 0, 0.03, 0.34));        // pump
  g.add(at(B(0.045, 0.10, 0.06, gm), 0, -0.03, 0.02));      // grip
  g.add(at(B(0.05, 0.07, 0.26, gw), 0, 0.05, -0.20));       // stock
  g.add(at(B(0.05, 0.03, 0.06, gm), 0, 0.12, 0.04));        // sight
  g.add(at(B(0.015, 0.015, 0.22, n), 0.04, 0.08, 0.24));
  g.add(at(B(0.015, 0.015, 0.22, n), -0.04, 0.08, 0.24));
  return finish(g, 0.80, 0.075);
}

export function buildAtlas(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:atlas';
  const gm = Mat.gunMetal(), gw = Mat.gunWhite(), n = Mat.neon(neon, 2.2);
  g.add(at(B(0.07, 0.11, 0.50, gw), 0, 0.06, 0.12));
  g.add(at(B(0.08, 0.06, 0.32, gm), 0, 0.035, 0.44));
  g.add(at(C(0.016, 0.016, 0.50, gm), 0, 0.07, 0.70));
  g.add(at(B(0.05, 0.05, 0.08, gm), 0, 0.07, 0.96));
  g.add(at(B(0.045, 0.10, 0.06, gm), 0, -0.03, 0.05));
  g.add(at(B(0.14, 0.14, 0.12, gm), -0.08, -0.03, 0.14));   // box mag
  g.add(at(B(0.05, 0.07, 0.26, gw), 0, 0.05, -0.22));
  g.add(at(B(0.02, 0.10, 0.02, gm), 0.05, -0.08, 0.52));    // bipod legs
  g.add(at(B(0.02, 0.10, 0.02, gm), -0.05, -0.08, 0.52));
  g.add(at(B(0.015, 0.015, 0.30, n), 0.045, 0.10, 0.30));
  g.add(at(B(0.015, 0.015, 0.30, n), -0.045, 0.10, 0.30));
  g.add(at(B(0.03, 0.03, 0.02, n), -0.08, 0.02, 0.21));      // ammo counter glow
  return finish(g, 1.0, 0.07);
}

export function buildSidearm(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:sidearm';
  const gm = Mat.gunMetal(), gw = Mat.gunWhite(), n = Mat.neon(neon, 2.2);
  g.add(at(B(0.035, 0.05, 0.20, gw), 0, 0.07, 0.08));       // slide
  g.add(at(B(0.03, 0.03, 0.14, gm), 0, 0.045, 0.08));       // frame
  g.add(at(B(0.03, 0.09, 0.04, gm), 0, -0.01, 0.0));         // grip
  g.add(at(C(0.008, 0.008, 0.06, gm), 0, 0.075, 0.20));
  g.add(at(B(0.01, 0.01, 0.10, n), 0.02, 0.09, 0.08));
  g.add(at(B(0.01, 0.01, 0.10, n), -0.02, 0.09, 0.08));
  return finish(g, 0.24, 0.075, { r: [0.0, -0.02, 0.0], l: [-0.03, -0.03, 0.02] });
}

export function buildLegionRifle() {
  const g = new THREE.Group(); g.name = 'weapon:legion_rifle';
  const gm = Mat.gunMetal(), lm = Mat.legionArmor(), n = Mat.neon(COLORS.redOrange, 2.4);
  g.add(at(B(0.055, 0.10, 0.46, lm), 0, 0.06, 0.12));
  g.add(at(C(0.014, 0.014, 0.40, gm), 0, 0.06, 0.55));
  g.add(at(B(0.04, 0.09, 0.05, gm), 0, -0.03, 0.05));
  g.add(at(B(0.05, 0.16, 0.06, gm), 0, -0.09, 0.16));
  g.add(at(B(0.045, 0.06, 0.22, lm), 0, 0.06, -0.20));
  g.add(at(B(0.015, 0.015, 0.30, n), 0, 0.115, 0.20));
  g.add(at(B(0.02, 0.03, 0.03, n), 0, 0.06, 0.74));           // glowing muzzle
  return finish(g, 0.76, 0.06);
}
export function buildLegionShotgun() {
  const g = new THREE.Group(); g.name = 'weapon:legion_shotgun';
  const gm = Mat.gunMetal(), lm = Mat.legionArmor(), n = Mat.neon(COLORS.redOrange, 2.4);
  g.add(at(B(0.07, 0.11, 0.34, lm), 0, 0.06, 0.06));
  g.add(at(C(0.024, 0.024, 0.40, gm), 0, 0.07, 0.42));
  g.add(at(C(0.024, 0.024, 0.40, gm), 0, 0.03, 0.42));
  g.add(at(B(0.045, 0.10, 0.06, gm), 0, -0.03, 0.0));
  g.add(at(B(0.05, 0.07, 0.22, lm), 0, 0.05, -0.18));
  g.add(at(B(0.02, 0.02, 0.24, n), 0.05, 0.07, 0.30));
  g.add(at(B(0.02, 0.02, 0.24, n), -0.05, 0.07, 0.30));
  return finish(g, 0.64, 0.05);
}
export function buildLegionHeavy() {
  const g = new THREE.Group(); g.name = 'weapon:legion_heavy';
  const gm = Mat.gunMetal(), lm = Mat.legionArmor(), n = Mat.neon(COLORS.redOrange, 2.4);
  g.add(at(B(0.10, 0.14, 0.56, lm), 0, 0.06, 0.14));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(at(C(0.016, 0.016, 0.42, gm), Math.cos(a) * 0.035, 0.07 + Math.sin(a) * 0.035, 0.6)); }
  g.add(at(C(0.07, 0.06, 0.12, gm), 0, 0.07, 0.78)); // muzzle shroud
  g.add(at(B(0.05, 0.12, 0.07, gm), 0, -0.04, 0.05));
  g.add(at(B(0.18, 0.16, 0.16, gm), -0.12, -0.02, 0.10));
  g.add(at(B(0.06, 0.08, 0.20, lm), 0, 0.05, -0.24));
  g.add(at(B(0.02, 0.02, 0.40, n), 0, 0.15, 0.30));
  g.add(at(B(0.05, 0.05, 0.02, n), -0.12, 0.02, 0.19));
  return finish(g, 0.86, 0.07);
}

export function buildLongshot(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:longshot';
  const gm = Mat.gunMetal(), gw = Mat.gunWhite(), n = Mat.neon(neon, 2.2);
  g.add(at(B(0.05, 0.09, 0.50, gw), 0, 0.06, 0.14));
  g.add(at(B(0.05, 0.05, 0.40, gm), 0, 0.03, 0.44));
  g.add(at(C(0.013, 0.013, 0.62, gm), 0, 0.06, 0.82));
  g.add(at(B(0.035, 0.035, 0.10, gm), 0, 0.06, 1.16));
  g.add(at(B(0.04, 0.09, 0.05, gm), 0, -0.03, 0.06));
  g.add(at(B(0.05, 0.16, 0.05, gm), 0, -0.09, 0.16));
  g.add(at(B(0.045, 0.07, 0.30, gw), 0, 0.055, -0.24));
  g.add(at(B(0.05, 0.10, 0.05, gm), 0, 0.01, -0.40));
  g.add(at(C(0.028, 0.028, 0.26, gm), 0, 0.15, 0.10));
  g.add(at(C(0.034, 0.034, 0.05, gm), 0, 0.15, 0.24));
  g.add(at(C(0.02, 0.02, 0.01, n), 0, 0.15, 0.27));
  g.add(at(B(0.014, 0.014, 0.28, n), 0.03, 0.09, 0.30));
  g.add(at(B(0.014, 0.014, 0.28, n), -0.03, 0.09, 0.30));
  g.add(at(B(0.02, 0.10, 0.02, gm), 0.05, -0.07, 0.62));
  g.add(at(B(0.02, 0.10, 0.02, gm), -0.05, -0.07, 0.62));
  return finish(g, 1.22, 0.06, { r: [0.02, -0.02, 0.05], l: [-0.02, 0.0, 0.42] });
}

import { CUSTOM, buildCustomWeapon } from './glbSoldier.js';
const withCustom = (id, fn) => (neon) => (CUSTOM.weapon[id] ? buildCustomWeapon(CUSTOM.weapon[id], id, neon) : fn(neon));
export const WEAPON_BUILDERS = { reaper: buildReaper, breaker: buildBreaker, javelin: buildJavelin, lancer: buildLancer, arc: buildArc, viper: withCustom('viper', buildViper), hammer: buildHammer, atlas: buildAtlas, sidearm: buildSidearm, longshot: withCustom('longshot', buildLongshot), legion_rifle: withCustom('legion_rifle', buildLegionRifle), legion_shotgun: buildLegionShotgun, legion_heavy: buildLegionHeavy };

/** Frag grenade model */
/** REAPER SMG: stubby receiver, side-fed magazine, ventilated shroud, folding stock. */
export function buildReaper(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:reaper';
  const gm = Mat.gunMetal(), wm = Mat.gunWhite(), n = Mat.neon(neon, 2.2);
  g.add(at(B(0.07, 0.11, 0.34, gm), 0, 0.03, 0.06));
  g.add(at(B(0.06, 0.05, 0.26, wm), 0, 0.1, 0.1));
  g.add(at(C(0.022, 0.022, 0.22, gm, 12), 0, 0.05, 0.36));
  for (let i = 0; i < 4; i++) g.add(at(C(0.03, 0.03, 0.012, wm, 8), 0, 0.05, 0.28 + i * 0.045));
  g.add(at(B(0.09, 0.05, 0.12, gm), -0.06, 0.02, 0.04));            // side magazine
  g.add(at(B(0.03, 0.14, 0.05, gm), 0, -0.09, -0.02));                // grip
  g.add(at(B(0.025, 0.03, 0.2, gm), 0, 0.02, -0.2));                  // folding stock
  g.add(at(B(0.012, 0.012, 0.26, n), 0.036, 0.06, 0.1));
  g.add(at(B(0.012, 0.012, 0.26, n), -0.036, 0.06, 0.1));
  return finish(g, 0.48, 0.05, { l: [-0.02, 0.0, 0.22] });
}
/** BREAKER auto-shotgun: fat drum under the receiver, wide shrouded barrel with heat rings. */
export function buildBreaker(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:breaker';
  const gm = Mat.gunMetal(), wm = Mat.gunWhite(), n = Mat.neon(COLORS.amber, 2.2);
  g.add(at(B(0.09, 0.13, 0.46, wm), 0, 0.04, 0.1));
  g.add(at(C(0.036, 0.036, 0.5, gm, 12), 0, 0.09, 0.5));
  g.add(at(C(0.05, 0.05, 0.3, wm, 12), 0, 0.09, 0.42));
  for (let i = 0; i < 5; i++) g.add(at(C(0.058, 0.058, 0.014, gm, 12), 0, 0.09, 0.3 + i * 0.06));
  const drum = C(0.09, 0.09, 0.1, gm, 16); drum.rotation.set(0, 0, Math.PI / 2); g.add(at(drum, 0, -0.06, 0.1));
  g.add(at(C(0.07, 0.07, 0.02, n, 16), 0.06, -0.06, 0.1));
  g.add(at(B(0.035, 0.16, 0.06, gm), 0, -0.1, -0.08));
  g.add(at(B(0.06, 0.08, 0.26, gm), 0, 0.02, -0.3));
  g.add(at(B(0.014, 0.014, 0.4, n), 0.046, 0.07, 0.12));
  return finish(g, 0.76, 0.09, { l: [-0.02, 0.02, 0.36] });
}
/** JAVELIN launcher: big tube on a shoulder rest, front cone, blast shield, warhead lights. */
export function buildJavelin(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:javelin';
  const gm = Mat.gunMetal(), wm = Mat.gunWhite(), n = Mat.neon(COLORS.amber, 2.4);
  g.add(at(C(0.075, 0.075, 0.9, wm, 16), 0, 0.12, 0.2));
  g.add(at(C(0.09, 0.075, 0.16, gm, 16), 0, 0.12, 0.7));
  g.add(at(C(0.07, 0.09, 0.14, gm, 16), 0, 0.12, -0.3));
  g.add(at(B(0.05, 0.1, 0.36, gm), 0, 0.02, 0.06));
  g.add(at(B(0.035, 0.15, 0.06, gm), 0, -0.08, -0.02));
  g.add(at(B(0.04, 0.06, 0.16, gm), 0, 0.0, 0.3));                    // foregrip
  g.add(at(B(0.12, 0.16, 0.02, gm), 0, 0.2, 0.34));                   // blast shield
  for (let i = 0; i < 3; i++) g.add(at(C(0.08, 0.08, 0.012, n, 16), 0, 0.12, 0.05 + i * 0.18));
  g.add(at(B(0.05, 0.04, 0.1, wm), 0, 0.22, -0.05));                  // sight
  return finish(g, 0.8, 0.12, { l: [-0.02, 0.0, 0.3] });
}
/** LANCER rail: long thin rail with acceleration coils, slim receiver, scope. */
export function buildLancer(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:lancer';
  const gm = Mat.gunMetal(), wm = Mat.gunWhite(), n = Mat.neon('#d8b4ff', 2.4);
  g.add(at(B(0.05, 0.1, 0.4, wm), 0, 0.04, 0.02));
  g.add(at(B(0.02, 0.03, 0.8, gm), 0, 0.09, 0.5));
  g.add(at(B(0.02, 0.03, 0.8, gm), 0, 0.03, 0.5));
  for (let i = 0; i < 6; i++) { const ring = C(0.045, 0.045, 0.02, i % 2 ? n : gm, 12); g.add(at(ring, 0, 0.06, 0.24 + i * 0.11)); }
  g.add(at(B(0.03, 0.05, 0.16, gm), 0, 0.14, 0.04));                  // scope
  g.add(at(C(0.02, 0.02, 0.02, n, 10), 0, 0.14, 0.13));
  g.add(at(B(0.03, 0.14, 0.05, gm), 0, -0.08, -0.06));
  g.add(at(B(0.04, 0.07, 0.28, gm), 0, 0.02, -0.3));
  g.add(at(B(0.05, 0.08, 0.08, gm), 0, 0.0, 0.14));                   // magazine block
  return finish(g, 0.92, 0.06, { l: [-0.02, 0.0, 0.32] });
}
/** ARC projector: squat emitter with tesla prongs and a glowing capacitor drum. */
export function buildArc(neon = COLORS.cyan) {
  const g = new THREE.Group(); g.name = 'weapon:arc';
  const gm = Mat.gunMetal(), wm = Mat.gunWhite(), n = Mat.neon(neon, 2.6);
  g.add(at(B(0.08, 0.12, 0.3, wm), 0, 0.03, 0.04));
  const cap = C(0.06, 0.06, 0.14, gm, 14); cap.rotation.set(0, 0, Math.PI / 2); g.add(at(cap, 0, 0.1, 0.0));
  g.add(at(C(0.045, 0.045, 0.15, n, 14), 0, 0.1, 0.0)).rotation.set(0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) { g.add(at(B(0.012, 0.012, 0.26, gm), sx * 0.035, 0.05, 0.3)); g.add(at(C(0.012, 0.004, 0.06, n, 8), sx * 0.035, 0.05, 0.45)); }
  g.add(at(C(0.03, 0.03, 0.02, n, 12), 0, 0.05, 0.36));
  g.add(at(B(0.035, 0.14, 0.05, gm), 0, -0.08, -0.04));
  return finish(g, 0.46, 0.05, { l: [-0.02, 0.0, 0.2] });
}

export function buildGrenade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), Mat.gunWhite()); body.scale.y = 1.25; body.castShadow = true; g.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16), Mat.neon(COLORS.amber, 2)); band.rotation.x = Math.PI / 2; g.add(band);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.05, 8), Mat.gunMetal()); top.position.y = 0.09; g.add(top);
  return g;
}
/** Wellness injector */
export function buildInjector() {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 10), Mat.glass()); g.add(tube);
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), Mat.neon(COLORS.green, 2.5)); g.add(fluid);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), Mat.gunMetal()); cap.position.y = 0.09; g.add(cap);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 6), Mat.gunMetal()); needle.position.y = -0.1; g.add(needle);
  return g;
}
