import * as THREE from 'three';
import { M, plateGeo, box, cyl, torus, add, group, glowMesh } from './ro-parts.js';

/**
 * VIPER — Commonwealth standard-issue assault rifle.
 * Barrel points +z, pistol grip at the origin, muzzle at z≈0.80 (same
 * convention as the game's procedural weapons), with named sockets for
 * the right hand (grip) and left hand (handguard).
 */
export function buildViper() {
  const g = new THREE.Group();
  g.name = 'viper';

  /* ---- receiver ---- */
  const rec = group(g, 'receiver', [0, 0.062, 0.12]);
  add(rec, 'receiver_body', plateGeo(0.062, 0.105, 0.42, 0.022, 0.008), M.ceramic);
  add(rec, 'receiver_spine', plateGeo(0.05, 0.03, 0.44, 0.01, 0.005), M.carbon, [0, 0.055, 0]);
  add(rec, 'ejection_port', plateGeo(0.11, 0.05, 0.018, 0.008), M.carbon, [0.032, 0.02, 0.09], [0, Math.PI / 2, 0]);
  add(rec, 'shell_deflector', plateGeo(0.05, 0.03, 0.03, 0.008), M.slate, [0.036, 0.046, 0.05], [0, Math.PI / 2, -0.4]);
  add(rec, 'charging_handle', cyl(0.009, 0.009, 0.07, 12), M.metal, [0.04, 0.042, 0.14], [0, 0, Math.PI / 2]);
  add(rec, 'bolt_catch', plateGeo(0.014, 0.026, 0.03, 0.006), M.metal, [-0.035, 0.01, 0.1], [0, Math.PI / 2, 0]);
  add(rec, 'safety_lever', cyl(0.012, 0.012, 0.016, 10), M.carbon, [-0.034, -0.022, -0.1], [0, 0, Math.PI / 2]);
  add(rec, 'selector_dot', cyl(0.004, 0.004, 0.02, 8), M.amber, [-0.04, -0.022, -0.1], [0, 0, Math.PI / 2]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    glowMesh(rec, `receiver_rail_${S}`, box(0.008, 0.014, 0.17), [s * 0.033, -0.026, 0.06]);
    add(rec, `receiver_panel_${S}`, plateGeo(0.2, 0.05, 0.014, 0.012), M.slate, [s * 0.03, 0.008, -0.09], [0, Math.PI / 2, 0]);
  }
  // top rail teeth
  for (let i = 0; i < 5; i++) add(rec, 'rail_tooth_' + i, box(0.044, 0.008, 0.014), M.slate, [0, 0.072, -0.19 + i * 0.036]);

  /* ---- handguard + barrel ---- */
  const fore = group(g, 'handguard', [0, 0.034, 0.35]);
  add(fore, 'handguard_shell', plateGeo(0.058, 0.07, 0.3, 0.022, 0.008), M.carbon);
  add(fore, 'handguard_top', plateGeo(0.05, 0.024, 0.3, 0.01, 0.005), M.slate, [0, 0.045, 0]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    for (let i = 0; i < 4; i++) add(fore, `vent_${S}_${i}`, plateGeo(0.036, 0.03, 0.016, 0.008), M.metal, [s * 0.026, 0.004, -0.1 + i * 0.062], [0, Math.PI / 2, 0]);
    glowMesh(fore, `handguard_rail_${S}`, box(0.008, 0.01, 0.2), [s * 0.03, -0.03, 0]);
  }
  add(fore, 'gas_block', plateGeo(0.042, 0.052, 0.05, 0.012), M.metal, [0, 0.028, 0.16]);
  add(g, 'barrel', cyl(0.0125, 0.0135, 0.3, 20), M.metal, [0, 0.062, 0.6], [Math.PI / 2, 0, 0]);
  add(g, 'barrel_ring', torus(0.019, 0.006, 20, 8), M.carbon, [0, 0.062, 0.63]);
  const brake = group(g, 'muzzle_brake', [0, 0.062, 0.77]);
  add(brake, 'brake_body', cyl(0.023, 0.02, 0.075, 18), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) add(brake, 'brake_slot_' + i, box(0.048, 0.006, 0.014), M.metal, [0, 0, -0.012 + i * 0.016], [0, 0, i % 2 ? 0.6 : -0.6]);
  add(brake, 'brake_crown', cyl(0.02, 0.024, 0.014, 18), M.metal, [0, 0, 0.043], [Math.PI / 2, 0, 0]);
  const muzzle = group(g, 'muzzle', [0, 0.062, 0.82]);

  /* ---- optic ---- */
  const optic = group(g, 'optic', [0, 0.15, 0.12]);
  add(optic, 'optic_body', plateGeo(0.052, 0.062, 0.17, 0.02, 0.008), M.carbon);
  add(optic, 'optic_hood', plateGeo(0.062, 0.04, 0.06, 0.016), M.slate, [0, 0.028, 0.07]);
  add(optic, 'optic_objective', cyl(0.028, 0.028, 0.045, 24), M.slate, [0, 0.0, 0.095], [Math.PI / 2, 0, 0]);
  add(optic, 'optic_eyepiece', cyl(0.026, 0.03, 0.04, 24), M.carbon, [0, 0.0, -0.095], [Math.PI / 2, 0, 0]);
  add(optic, 'optic_mount_f', plateGeo(0.036, 0.04, 0.026, 0.008), M.metal, [0, -0.045, 0.055]);
  add(optic, 'optic_mount_r', plateGeo(0.036, 0.04, 0.026, 0.008), M.metal, [0, -0.045, -0.055]);
  add(optic, 'optic_turret', cyl(0.016, 0.018, 0.026, 16), M.metal, [0, 0.04, 0.0]);
  glowMesh(optic, 'optic_lens_front', cyl(0.023, 0.023, 0.008, 22), [0, 0.0, 0.118], [Math.PI / 2, 0, 0]);
  add(optic, 'optic_lens_rear', cyl(0.021, 0.021, 0.008, 22), M.visor, [0, 0.0, -0.116], [Math.PI / 2, 0, 0]);
  glowMesh(optic, 'optic_readout', box(0.02, 0.007, 0.014), [0.024, 0.022, -0.05]);

  /* ---- grip, trigger, magazine ---- */
  const grip = group(g, 'grip', [0, -0.04, 0.005], [-0.3, 0, 0]);
  add(grip, 'grip_body', plateGeo(0.042, 0.12, 0.058, 0.02, 0.008), M.carbon);
  add(grip, 'grip_palm_swell', plateGeo(0.03, 0.07, 0.05, 0.018), M.slate, [0, -0.01, -0.024]);
  for (let i = 0; i < 4; i++) add(grip, 'grip_groove_' + i, box(0.046, 0.006, 0.03), M.metal, [0, 0.02 - i * 0.022, 0.026]);
  add(g, 'trigger_guard', torus(0.036, 0.008, 24, 8, Math.PI * 1.15), M.metal, [0, -0.008, 0.052], [0, Math.PI / 2, -0.5]);
  add(g, 'trigger', plateGeo(0.012, 0.032, 0.012, 0.005), M.metal, [0, -0.012, 0.055], [0.2, 0, 0]);
  const mag = group(g, 'magazine', [0, -0.108, 0.135], [0.16, 0, 0]);
  add(mag, 'mag_body', plateGeo(0.05, 0.2, 0.062, 0.016, 0.006), M.carbon);
  add(mag, 'mag_floor', plateGeo(0.056, 0.022, 0.07, 0.01), M.slate, [0, -0.1, 0]);
  glowMesh(mag, 'mag_window', box(0.01, 0.09, 0.02), [0.026, -0.02, 0]);
  for (let i = 0; i < 3; i++) add(mag, 'mag_rib_' + i, box(0.052, 0.008, 0.066), M.slate, [0, 0.05 - i * 0.045, 0]);

  /* ---- stock ---- */
  const stock = group(g, 'stock', [0, 0.062, -0.2]);
  add(stock, 'stock_tube', cyl(0.018, 0.018, 0.2, 16), M.metal, [0, 0, 0.02], [Math.PI / 2, 0, 0]);
  add(stock, 'stock_body', plateGeo(0.048, 0.075, 0.2, 0.022, 0.008), M.ceramic, [0, -0.004, 0]);
  add(stock, 'cheek_riser', plateGeo(0.034, 0.026, 0.13, 0.01), M.carbon, [0, 0.048, 0.0]);
  add(stock, 'butt_plate', plateGeo(0.05, 0.1, 0.03, 0.014), M.carbon, [0, -0.012, -0.115], [-0.1, 0, 0]);
  add(stock, 'butt_pad', plateGeo(0.044, 0.09, 0.016, 0.01), M.slate, [0, -0.012, -0.135], [-0.1, 0, 0]);
  glowMesh(stock, 'stock_rail', box(0.008, 0.01, 0.1), [0.026, 0.02, -0.01]);
  add(stock, 'sling_loop', torus(0.015, 0.005, 18, 8), M.metal, [0.03, -0.03, -0.09], [0, 0.4, 0]);

  /* ---- angled foregrip ---- */
  const fg = group(g, 'foregrip', [0, -0.018, 0.395], [0.5, 0, 0]);
  add(fg, 'foregrip_body', plateGeo(0.042, 0.11, 0.05, 0.016), M.carbon);
  add(fg, 'foregrip_stop', plateGeo(0.05, 0.03, 0.06, 0.012), M.slate, [0, 0.05, 0.0]);
  for (let i = 0; i < 3; i++) add(fg, 'foregrip_groove_' + i, box(0.046, 0.006, 0.026), M.metal, [0, 0.01 - i * 0.026, 0.022]);

  /* ---- hand sockets ---- */
  const gripSocket = group(g, 'socket_grip', [0, -0.012, 0.03]);
  const foreSocket = group(g, 'socket_foregrip', [0, -0.01, 0.4]);
  const supportSocket = group(g, 'socket_support', [0, -0.02, 0.27]);
  g.userData.muzzle = muzzle;
  g.userData.gripSocket = gripSocket;
  g.userData.foreSocket = foreSocket;
  g.userData.supportSocket = supportSocket;
  return g;
}

/** Standalone presentation: the rifle laid out horizontally, resting on y=0. */
export function buildViperDisplay() {
  const wrap = new THREE.Group();
  wrap.name = 'viper_rifle';
  const rifle = buildViper();
  wrap.add(rifle);
  const bb = new THREE.Box3().setFromObject(wrap);
  rifle.position.y -= bb.min.y;
  rifle.position.x -= (bb.min.x + bb.max.x) / 2;
  rifle.position.z -= (bb.min.z + bb.max.z) / 2;
  return wrap;
}
