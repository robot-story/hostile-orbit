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
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(at(C(0.016, 0.016, 0.60, gm), Math.cos(a) * 0.035, 0.07 + Math.sin(a) * 0.035, 0.72)); }
  g.add(at(B(0.05, 0.12, 0.07, gm), 0, -0.04, 0.05));
  g.add(at(B(0.18, 0.16, 0.16, gm), -0.12, -0.02, 0.10));
  g.add(at(B(0.06, 0.08, 0.20, lm), 0, 0.05, -0.24));
  g.add(at(B(0.02, 0.02, 0.40, n), 0, 0.15, 0.30));
  g.add(at(B(0.05, 0.05, 0.02, n), -0.12, 0.02, 0.19));
  return finish(g, 1.04, 0.07);
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

export const WEAPON_BUILDERS = { viper: buildViper, hammer: buildHammer, atlas: buildAtlas, sidearm: buildSidearm, longshot: buildLongshot, legion_rifle: buildLegionRifle, legion_shotgun: buildLegionShotgun, legion_heavy: buildLegionHeavy };

/** Frag grenade model */
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
