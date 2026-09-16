import * as THREE from 'three';
import { WEAPONS } from './weapons-model.js';
import { recolor } from './rig.js';
import { compactRigid } from '../robots.js';

// Preserve named mechanical subassemblies when batching the static receiver.
export function buildMk3Weapon(id, neon = '#00e5ff') {
  const g = WEAPONS[id].build(); g.name = 'weapon:' + id;
  const data = g.userData;
  data.gripR = data.gripSocket; data.gripL = data.supportSocket;
  for (const o of [data.gripR, data.gripL, data.muzzle]) if (o) o.userData.dynamic = true;
  const ejector = new THREE.Object3D(); ejector.name = 'ejector'; ejector.position.set(0.04, 0.075, 0.04); ejector.userData.dynamic = true; g.add(ejector); data.ejector = ejector;
  if (!id.startsWith('legion')) recolor(g, neon);
  // The pistol support hand cups the firing hand, rather than its muzzle.
  if (id === 'sidearm') data.gripL.position.set(0.025, -0.05, -0.01);
  const moving = [];
  const energyByMaterial = new Map();
  g.traverse(o => { if (o.isMesh && ['neon_violet', 'neon_green', 'neon_cyan'].includes(o.material.name)) { if (!energyByMaterial.has(o.material)) energyByMaterial.set(o.material, o.material.clone()); o.material = energyByMaterial.get(o.material); } });
  const energy = [...energyByMaterial.values()];
  const pattern = /^(magazine|ammo_box|drum|feed_drum|venturi|pump|slide|slide_rib|bolt_handle|bolt_knob|charging_handle|trigger|capacitor|cell|breech|barrel_cluster)$/;
  g.traverse(o => { if (pattern.test(o.name)) { o.userData.dynamic = true; moving.push({ o, p: o.position.clone(), r: o.rotation.clone() }); } });
  // All weapon types expose a service cell / magazine target for reload IK.
  const mag = moving.find(v => /magazine|ammo_box|drum|cell|capacitor/.test(v.o.name));
  const reloadGrip = new THREE.Object3D(); reloadGrip.name = 'reloadGrip'; reloadGrip.userData.dynamic = true;
  if (mag) { mag.o.add(reloadGrip); reloadGrip.position.set(0, -0.05, 0); }
  else { g.add(reloadGrip); reloadGrip.position.set(0, -0.08, 0.16); }
  data.reloadGrip = reloadGrip;
  let kick = 0, age = 10;
  data.fire = (amount = 1) => { kick = Math.min(1.5, amount); age = 0; };
  data.animate = (dt, state) => {
    age += dt; kick *= Math.exp(-dt * 18);
    const reload = state.reload == null ? 0 : Math.sin(Math.min(1, state.reload) * Math.PI);
    for (const m of energy) m.emissiveIntensity = 0.8 + kick * 1.8 + (id === 'arc' || id === 'lancer' ? reload * 0.6 : 0);
    for (const { o, p, r } of moving) {
      o.position.copy(p); o.rotation.copy(r);
      if (/magazine|ammo_box|drum|cell|capacitor/.test(o.name)) { o.position.y -= reload * 0.17; o.rotation.z += reload * 0.16; }
      if (o.name === 'venturi') { o.position.z -= reload * 0.08; o.rotation.z += reload * 0.3; }
      if (/^slide|^bolt|charging_handle/.test(o.name)) o.position.z -= kick * 0.055;
      if (o.name === 'pump') o.position.z -= Math.sin(Math.min(1, age / 0.45) * Math.PI) * 0.10;
      if (o.name === 'trigger') o.rotation.x -= kick * 0.18;
      if (o.name === 'barrel_cluster') o.rotation.z += age * Math.max(0, 1 - age) * 12;
    }
  };
  compactRigid(g);
  data.dispose = () => { g.traverse(o => { if (o.userData.merged) o.geometry?.dispose(); }); energy.forEach(m => m.dispose()); };
  return g;
}

export function buildMk3Prop(id) { const g = WEAPONS[id].build(); compactRigid(g); return g; }

export const MK3_WEAPON_BUILDERS = Object.fromEntries(Object.keys(WEAPONS)
  .filter(id => !['grenade', 'injector'].includes(id)).map(id => [id, neon => buildMk3Weapon(id, neon)]));
