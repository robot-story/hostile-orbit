import * as THREE from 'three';
import { M, plateGeo, box, cyl, shell, sph, torus, add, group, glowMesh, decal, cable } from './ro-parts.js';
import { buildViper } from './viper-model.js';

/**
 * The Commonwealth / Null Legion armoury. Every weapon keeps the game's
 * convention: barrel along +z, pistol grip near the origin, `muzzle`,
 * `socket_grip` and `socket_support` markers for hand placement.
 * Each piece carries field quirks — taped mags, bent sights, zip-tied
 * cable, kill tallies, chipped paint — so no two read the same.
 */

/* ---------- shared sub-assemblies ---------- */
function pistolGrip(g, name, pos, rake = -0.3, mat = M.carbon) {
  const gr = group(g, name, pos, [rake, 0, 0]);
  add(gr, name + '_body', plateGeo(0.042, 0.12, 0.058, 0.02, 0.008), mat);
  add(gr, name + '_swell', plateGeo(0.03, 0.07, 0.05, 0.018), M.slate, [0, -0.01, -0.024]);
  for (let i = 0; i < 4; i++) add(gr, `${name}_groove_${i}`, box(0.046, 0.006, 0.03), M.metal, [0, 0.02 - i * 0.022, 0.026]);
  return gr;
}
function triggerGroup(g, z = 0.055, y = -0.008) {
  add(g, 'trigger_guard', torus(0.036, 0.008, 24, 8, Math.PI * 1.15), M.metal, [0, y, z], [0, Math.PI / 2, -0.5]);
  add(g, 'trigger', plateGeo(0.012, 0.032, 0.012, 0.005), M.metal, [0, y - 0.004, z], [0.2, 0, 0]);
}
function stockAssembly(g, z, len = 0.2, mat = M.ceramic) {
  const st = group(g, 'stock', [0, 0.062, z]);
  add(st, 'stock_tube', cyl(0.018, 0.018, len, 16), M.metal, [0, 0, 0.02], [Math.PI / 2, 0, 0]);
  add(st, 'stock_body', plateGeo(0.048, 0.075, len, 0.022, 0.008), mat);
  add(st, 'cheek_riser', plateGeo(0.034, 0.026, len * 0.65, 0.01), M.carbon, [0, 0.048, 0]);
  add(st, 'butt_plate', plateGeo(0.05, 0.1, 0.03, 0.014), M.carbon, [0, -0.012, -len / 2 - 0.015], [-0.1, 0, 0]);
  add(st, 'butt_pad', plateGeo(0.044, 0.09, 0.016, 0.01), M.slate, [0, -0.012, -len / 2 - 0.035], [-0.1, 0, 0]);
  add(st, 'sling_loop', torus(0.015, 0.005, 18, 8), M.metal, [0.03, -0.03, -len / 2 + 0.01], [0, 0.4, 0]);
  return st;
}
function railTeeth(g, n, y, z0, step = 0.036, w = 0.044) {
  for (let i = 0; i < n; i++) add(g, 'rail_tooth_' + i, box(w, 0.008, 0.014), M.slate, [0, y, z0 + i * step]);
}
/** Field repair: tape wrap of three offset rings. */
function tapeWrap(g, name, pos, r = 0.03, rot = [Math.PI / 2, 0, 0]) {
  for (let i = 0; i < 3; i++)
    add(g, `${name}_${i}`, cyl(r + 0.004 - i * 0.001, r + 0.004 - i * 0.001, 0.018, 18), M.tape,
      [pos[0], pos[1], pos[2] + (i - 1) * 0.019], rot);
}
function sockets(g, gripZ, supportZ, muzzleZ, muzzleY = 0.062) {
  const grip = group(g, 'socket_grip', [0, -0.012, gripZ]);
  const sup = group(g, 'socket_support', [0, -0.02, supportZ]);
  const mz = group(g, 'muzzle', [0, muzzleY, muzzleZ]);
  g.userData.gripSocket = grip; g.userData.supportSocket = sup; g.userData.muzzle = mz;
  return g;
}

/* ---------- 02 REAPER — SMG, side-fed, taped mag, folding stock ---------- */
function buildReaper() {
  const g = new THREE.Group(); g.name = 'reaper';
  add(g, 'receiver', plateGeo(0.07, 0.105, 0.32, 0.022, 0.008), M.slate, [0, 0.055, 0.06]);
  add(g, 'top_cover', plateGeo(0.056, 0.032, 0.26, 0.012), M.ceramic, [0, 0.108, 0.08]);
  add(g, 'shroud', cyl(0.026, 0.026, 0.22, 20), M.metal, [0, 0.058, 0.32], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) add(g, 'shroud_ring_' + i, torus(0.031, 0.006, 22, 8), M.carbon, [0, 0.058, 0.245 + i * 0.042]);
  add(g, 'barrel_tip', cyl(0.014, 0.016, 0.05, 16), M.carbon, [0, 0.058, 0.45], [Math.PI / 2, 0, 0]);
  // side magazine, taped to the housing
  const mag = group(g, 'magazine', [-0.075, 0.04, 0.04], [0, 0, 0.08]);
  add(mag, 'mag_body', plateGeo(0.13, 0.055, 0.075, 0.014), M.carbon, [0, 0, 0], [0, Math.PI / 2, 0]);
  glowMesh(mag, 'mag_window', box(0.008, 0.014, 0.05), [0, 0.026, 0]);
  tapeWrap(mag, 'mag_tape', [0.02, 0, 0], 0.046, [0, 0, Math.PI / 2]);
  pistolGrip(g, 'grip', [0, -0.045, -0.01], -0.22);
  triggerGroup(g, 0.045, -0.006);
  // folding stock, stowed folded to the right
  const fold = group(g, 'folding_stock', [0.028, 0.075, -0.1], [0, 0.32, 0]);
  add(fold, 'fold_rail_a', cyl(0.011, 0.011, 0.2, 12), M.metal, [0.012, 0.02, -0.08], [Math.PI / 2, 0, 0]);
  add(fold, 'fold_rail_b', cyl(0.011, 0.011, 0.2, 12), M.metal, [0.012, -0.02, -0.08], [Math.PI / 2, 0, 0]);
  add(fold, 'fold_pad', plateGeo(0.03, 0.08, 0.02, 0.008), M.carbon, [0.012, 0, -0.185]);
  add(g, 'iron_sight', plateGeo(0.03, 0.035, 0.014, 0.006), M.metal, [0, 0.138, 0.03], [0, 0, 0.14]); // knocked crooked
  glowMesh(g, 'rail_l', box(0.008, 0.012, 0.18), [0.037, 0.052, 0.08]);
  glowMesh(g, 'rail_r', box(0.008, 0.012, 0.18), [-0.037, 0.052, 0.08]);
  decal(g, 'tally', 'tally', 0.06, 0.03, [0.037, 0.09, 0.02], [0, Math.PI / 2, 0]);
  return sockets(g, -0.01, 0.24, 0.49, 0.058);
}

/* ---------- 03 HAMMER — pump shotgun, wooden-feel stock, shell loops ---------- */
function buildHammer() {
  const g = new THREE.Group(); g.name = 'hammer';
  add(g, 'receiver', plateGeo(0.062, 0.112, 0.34, 0.024, 0.01), M.ceramic, [0, 0.062, 0.06]);
  add(g, 'ejection_port', plateGeo(0.1, 0.05, 0.016, 0.008), M.carbon, [0.032, 0.05, 0.08], [0, Math.PI / 2, 0]);
  add(g, 'barrel', cyl(0.021, 0.022, 0.56, 22), M.metal, [0, 0.082, 0.45], [Math.PI / 2, 0, 0]);
  add(g, 'mag_tube', cyl(0.017, 0.017, 0.44, 18), M.metal, [0, 0.035, 0.4], [Math.PI / 2, 0, 0]);
  add(g, 'tube_cap', cyl(0.021, 0.019, 0.03, 18), M.carbon, [0, 0.035, 0.63], [Math.PI / 2, 0, 0]);
  const pump = group(g, 'pump', [0, 0.045, 0.33]);
  add(pump, 'pump_body', plateGeo(0.064, 0.075, 0.16, 0.024), M.carbon);
  for (let i = 0; i < 5; i++) add(pump, 'pump_groove_' + i, box(0.07, 0.007, 0.022), M.metal, [0, -0.036, -0.055 + i * 0.028]);
  add(g, 'bead_sight', sph(0.008, 14, 10), M.amber, [0, 0.108, 0.68]);
  add(g, 'rear_notch', plateGeo(0.04, 0.02, 0.016, 0.005), M.metal, [0, 0.126, 0.04]);
  pistolGrip(g, 'grip', [0, -0.042, 0.0], -0.34);
  triggerGroup(g, 0.05, -0.004);
  const st = stockAssembly(g, -0.19, 0.24, M.ceramic);
  // shell holder on the stock — three live shells, one empty loop
  for (let i = 0; i < 3; i++) add(st, 'shell_' + i, cyl(0.012, 0.012, 0.055, 14), M.amber, [0.032, 0.03 - i * 0.03, -0.02], [0, 0, Math.PI / 2]);
  add(st, 'shell_loops', plateGeo(0.04, 0.11, 0.01, 0.006), M.tape, [0.038, 0.0, -0.02], [0, Math.PI / 2, 0]);
  tapeWrap(g, 'grip_tape', [0, -0.02, 0.0], 0.036, [Math.PI / 2, 0, 0]);
  decal(g, 'serial', 'serial', 0.1, 0.038, [-0.033, 0.05, 0.04], [0, -Math.PI / 2, 0]);
  return sockets(g, 0.0, 0.33, 0.74, 0.082);
}

/* ---------- 04 BREAKER — auto-shotgun, drum mag, heat-ringed shroud ---------- */
function buildBreaker() {
  const g = new THREE.Group(); g.name = 'breaker';
  add(g, 'receiver', plateGeo(0.09, 0.13, 0.44, 0.03, 0.012), M.ceramic, [0, 0.055, 0.1]);
  add(g, 'receiver_top', plateGeo(0.06, 0.03, 0.3, 0.012), M.carbon, [0, 0.12, 0.12]);
  add(g, 'shroud', cyl(0.05, 0.05, 0.3, 24), M.ceramic, [0, 0.095, 0.42], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) add(g, 'heat_ring_' + i, torus(0.055, 0.009, 26, 8), M.metal, [0, 0.095, 0.3 + i * 0.058]);
  add(g, 'barrel', cyl(0.03, 0.032, 0.5, 22), M.metal, [0, 0.095, 0.5], [Math.PI / 2, 0, 0]);
  add(g, 'brake', cyl(0.04, 0.034, 0.07, 20), M.carbon, [0, 0.095, 0.76], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) add(g, 'brake_port_' + i, box(0.09, 0.008, 0.016), M.metal, [0, 0.095, 0.745 + i * 0.02], [0, 0, i % 2 ? 0.7 : -0.7]);
  // drum
  const drum = group(g, 'drum', [0, -0.055, 0.11]);
  add(drum, 'drum_body', cyl(0.09, 0.09, 0.1, 32), M.carbon, [0, 0, 0], [0, 0, Math.PI / 2]);
  add(drum, 'drum_face', cyl(0.072, 0.072, 0.104, 32), M.slate, [0, 0, 0], [0, 0, Math.PI / 2]);
  glowMesh(drum, 'drum_ring', torus(0.055, 0.01, 30, 8), [0.053, 0, 0], [0, Math.PI / 2, 0]);
  add(drum, 'drum_hub', cyl(0.018, 0.018, 0.12, 16), M.metal, [0, 0, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(drum, 'drum_bolt_' + i, cyl(0.007, 0.007, 0.108, 10), M.metal, [0, Math.cos(a) * 0.062, Math.sin(a) * 0.062], [0, 0, Math.PI / 2]); }
  pistolGrip(g, 'grip', [0, -0.05, -0.06], -0.3);
  triggerGroup(g, -0.01, -0.012);
  stockAssembly(g, -0.28, 0.24, M.carbon);
  add(g, 'foregrip', plateGeo(0.05, 0.11, 0.05, 0.016), M.carbon, [0, -0.005, 0.34], [0.45, 0, 0]);
  glowMesh(g, 'ammo_bar', box(0.01, 0.05, 0.012), [0.047, 0.08, 0.02]);
  decal(g, 'scuff', 'scuff', 0.16, 0.1, [-0.047, 0.06, 0.14], [0, -Math.PI / 2, 0]);
  return sockets(g, -0.06, 0.34, 0.8, 0.095);
}

/* ---------- 05 ATLAS — LMG, box mag, bipod, ammo counter ---------- */
function buildAtlas() {
  const g = new THREE.Group(); g.name = 'atlas';
  add(g, 'receiver', plateGeo(0.075, 0.115, 0.48, 0.03, 0.012), M.ceramic, [0, 0.062, 0.12]);
  add(g, 'feed_cover', plateGeo(0.07, 0.035, 0.24, 0.014), M.carbon, [0, 0.122, 0.1]);
  railTeeth(g, 6, 0.146, -0.02, 0.04, 0.05);
  add(g, 'handguard', plateGeo(0.08, 0.065, 0.32, 0.024), M.carbon, [0, 0.036, 0.44]);
  for (const s of [1, -1]) for (let i = 0; i < 5; i++)
    add(g, `hg_vent_${s > 0 ? 'l' : 'r'}_${i}`, plateGeo(0.034, 0.028, 0.014, 0.008), M.metal, [s * 0.037, 0.036, 0.32 + i * 0.06], [0, Math.PI / 2, 0]);
  add(g, 'barrel', cyl(0.018, 0.02, 0.5, 22), M.metal, [0, 0.072, 0.7], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 7; i++) add(g, 'barrel_fin_' + i, torus(0.026, 0.006, 22, 8), M.slate, [0, 0.072, 0.52 + i * 0.05]);
  add(g, 'muzzle_cone', cyl(0.034, 0.024, 0.08, 20), M.carbon, [0, 0.072, 0.97], [Math.PI / 2, 0, 0]);
  add(g, 'carry_handle', plateGeo(0.03, 0.05, 0.14, 0.014), M.carbon, [0, 0.175, 0.16]);
  // box magazine slung left, with the counter window
  const mag = group(g, 'ammo_box', [-0.085, -0.035, 0.14], [0, 0.1, 0]);
  add(mag, 'box_body', plateGeo(0.14, 0.15, 0.13, 0.022), M.carbon);
  add(mag, 'box_lid', plateGeo(0.13, 0.03, 0.12, 0.01), M.slate, [0, 0.082, 0]);
  glowMesh(mag, 'counter', box(0.05, 0.026, 0.01), [0, 0.02, 0.068]);
  add(mag, 'box_latch', plateGeo(0.03, 0.05, 0.02, 0.006), M.metal, [0.05, -0.04, 0.062]);
  cable(mag, 'feed_chute', [0.05, 0.07, -0.02], [0.09, 0.11, 0.02], 0.01, 0.014);
  pistolGrip(g, 'grip', [0, -0.05, 0.02], -0.3);
  triggerGroup(g, 0.07, -0.012);
  stockAssembly(g, -0.24, 0.24, M.ceramic);
  // bipod, deployed forward and slightly splayed
  for (const s of [1, -1]) {
    const leg = group(g, `bipod_${s > 0 ? 'l' : 'r'}`, [s * 0.03, -0.01, 0.56], [0.35, 0, s * 0.4]);
    add(leg, 'leg_upper', cyl(0.009, 0.009, 0.14, 12), M.metal, [0, -0.07, 0]);
    add(leg, 'leg_lower', cyl(0.007, 0.007, 0.1, 12), M.slate, [0, -0.17, 0.02], [0.2, 0, 0]);
    add(leg, 'leg_foot', plateGeo(0.03, 0.016, 0.03, 0.006), M.carbon, [0, -0.22, 0.03]);
  }
  decal(g, 'tally', 'tally', 0.09, 0.045, [0.039, 0.09, 0.18], [0, Math.PI / 2, 0]);
  return sockets(g, 0.02, 0.44, 1.02, 0.072);
}

/* ---------- 06 LONGSHOT — anti-materiel rifle, big scope, muzzle brake ---------- */
function buildLongshot() {
  const g = new THREE.Group(); g.name = 'longshot';
  add(g, 'receiver', plateGeo(0.055, 0.1, 0.5, 0.024, 0.01), M.ceramic, [0, 0.062, 0.14]);
  add(g, 'bolt_handle', cyl(0.009, 0.009, 0.08, 12), M.metal, [0.04, 0.07, 0.0], [0, 0, Math.PI / 2.4]);
  add(g, 'bolt_knob', sph(0.015, 16, 12), M.carbon, [0.072, 0.055, 0.0]);
  add(g, 'chassis', plateGeo(0.056, 0.055, 0.4, 0.018), M.carbon, [0, 0.032, 0.45]);
  add(g, 'barrel', cyl(0.015, 0.017, 0.62, 22), M.metal, [0, 0.062, 0.82], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) add(g, 'flute_' + i, box(0.036, 0.006, 0.3), M.slate, [0, 0.062, 0.7], [0, 0, (i / 5) * Math.PI]);
  const brake = group(g, 'muzzle_brake', [0, 0.062, 1.16]);
  add(brake, 'brake_body', cyl(0.028, 0.024, 0.1, 20), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) add(brake, 'brake_slot_' + i, box(0.062, 0.007, 0.016), M.metal, [0, 0, -0.02 + i * 0.02]);
  // scope: long tube, sunshade, elevation turret, dialled-in tape marks
  const sc = group(g, 'scope', [0, 0.158, 0.12]);
  add(sc, 'scope_tube', cyl(0.026, 0.026, 0.3, 26), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(sc, 'scope_bell', cyl(0.036, 0.03, 0.09, 26), M.carbon, [0, 0, 0.185], [Math.PI / 2, 0, 0]);
  add(sc, 'sunshade', cyl(0.034, 0.034, 0.07, 26, true), M.slate, [0, 0, 0.26], [Math.PI / 2, 0, 0]);
  add(sc, 'objective_lens', cyl(0.028, 0.028, 0.008, 26), M.glass, [0, 0, 0.222], [Math.PI / 2, 0, 0]);
  add(sc, 'eyepiece', cyl(0.03, 0.034, 0.06, 26), M.carbon, [0, 0, -0.18], [Math.PI / 2, 0, 0]);
  glowMesh(sc, 'reticle', cyl(0.02, 0.02, 0.006, 22), [0, 0, -0.208], [Math.PI / 2, 0, 0]);
  add(sc, 'turret_top', cyl(0.019, 0.021, 0.03, 18), M.metal, [0, 0.035, 0.02]);
  add(sc, 'turret_side', cyl(0.017, 0.019, 0.026, 18), M.metal, [0.032, 0.0, 0.02], [0, 0, Math.PI / 2]);
  for (const z of [-0.06, 0.08]) add(sc, 'ring_mount_' + z, plateGeo(0.034, 0.05, 0.03, 0.008), M.metal, [0, -0.048, z]);
  tapeWrap(sc, 'scope_tape', [0, 0, -0.08], 0.028);
  pistolGrip(g, 'grip', [0, -0.045, 0.06], -0.34);
  triggerGroup(g, 0.105, -0.006);
  const mag = group(g, 'magazine', [0, -0.11, 0.18], [0.1, 0, 0]);
  add(mag, 'mag_body', plateGeo(0.05, 0.18, 0.062, 0.014), M.carbon);
  glowMesh(mag, 'mag_window', box(0.009, 0.07, 0.02), [0.026, -0.01, 0]);
  const st = stockAssembly(g, -0.26, 0.3, M.ceramic);
  add(st, 'monopod', cyl(0.011, 0.011, 0.1, 12), M.metal, [0, -0.06, -0.13], [0.2, 0, 0]);
  add(st, 'cheek_wheel', cyl(0.014, 0.014, 0.016, 14), M.metal, [0.03, 0.05, -0.06], [0, 0, Math.PI / 2]);
  for (const s of [1, -1]) {
    const leg = group(g, `bipod_${s > 0 ? 'l' : 'r'}`, [s * 0.028, -0.005, 0.62], [0.3, 0, s * 0.42]);
    add(leg, 'leg', cyl(0.008, 0.008, 0.16, 12), M.metal, [0, -0.08, 0]);
    add(leg, 'foot', plateGeo(0.026, 0.014, 0.026, 0.005), M.carbon, [0, -0.162, 0.01]);
  }
  decal(g, 'tally', 'tally', 0.1, 0.05, [0.029, 0.095, 0.22], [0, Math.PI / 2, 0]);
  return sockets(g, 0.06, 0.46, 1.24, 0.062);
}

/* ---------- 07 JAVELIN — shoulder launcher, blast shield, warhead ring ---------- */
function buildJavelin() {
  const g = new THREE.Group(); g.name = 'javelin';
  add(g, 'tube', cyl(0.078, 0.078, 0.88, 32), M.ceramic, [0, 0.13, 0.2], [Math.PI / 2, 0, 0]);
  add(g, 'tube_front_ring', cyl(0.094, 0.078, 0.16, 32), M.carbon, [0, 0.13, 0.7], [Math.PI / 2, 0, 0]);
  add(g, 'venturi', cyl(0.072, 0.096, 0.16, 32, true), M.carbon, [0, 0.13, -0.3], [Math.PI / 2, 0, 0]);
  // clamp collars break up the tube run
  for (const z of [-0.16, 0.02, 0.24, 0.46]) {
    add(g, 'collar_' + z, cyl(0.086, 0.086, 0.035, 32), M.slate, [0, 0.13, z], [Math.PI / 2, 0, 0]);
    add(g, 'collar_boss_' + z, plateGeo(0.03, 0.03, 0.03, 0.008), M.carbon, [0.086, 0.13, z], [0, Math.PI / 2, 0]);
  }
  // recessed status lamps: three short segments, not full rings
  for (let i = 0; i < 3; i++) {
    add(g, 'lamp_housing_' + i, plateGeo(0.05, 0.03, 0.04, 0.008), M.carbon, [0.062, 0.164, 0.1 + i * 0.16], [0, 0, -0.9]);
    glowMesh(g, 'lamp_' + i, box(0.032, 0.01, 0.022), [0.07, 0.176, 0.1 + i * 0.16], [0, 0, -0.9]);
  }
  add(g, 'spine_rail', plateGeo(0.04, 0.03, 0.7, 0.01), M.slate, [0, 0.214, 0.2]);
  for (let i = 0; i < 8; i++) add(g, 'spine_tooth_' + i, box(0.046, 0.008, 0.016), M.carbon, [0, 0.23, -0.1 + i * 0.086]);
  add(g, 'warhead_bulge', cyl(0.086, 0.09, 0.12, 32), M.slate, [0, 0.13, 0.56], [Math.PI / 2, 0, 0]);
  add(g, 'fire_housing', plateGeo(0.052, 0.1, 0.34, 0.02), M.carbon, [0, 0.035, 0.06]);
  pistolGrip(g, 'grip', [0, -0.045, -0.02], -0.26);
  triggerGroup(g, 0.02, -0.008);
  add(g, 'foregrip', plateGeo(0.046, 0.12, 0.055, 0.018), M.carbon, [0, 0.005, 0.3], [0.5, 0, 0]);
  add(g, 'blast_shield', plateGeo(0.14, 0.17, 0.014, 0.03), M.slate, [0, 0.215, 0.34], [-0.3, 0, 0]);
  add(g, 'shield_window', plateGeo(0.08, 0.05, 0.006, 0.012), M.glass, [0, 0.225, 0.352], [-0.3, 0, 0]);
  add(g, 'sight_unit', plateGeo(0.06, 0.05, 0.12, 0.014), M.carbon, [0.055, 0.225, -0.02]);
  glowMesh(g, 'sight_screen', plateGeo(0.04, 0.032, 0.008, 0.006), [0.055, 0.228, -0.082]);
  add(g, 'shoulder_rest', plateGeo(0.1, 0.06, 0.16, 0.024), M.carbon, [0, 0.05, -0.24], [-0.35, 0, 0]);
  add(g, 'shoulder_pad', plateGeo(0.12, 0.07, 0.03, 0.02), M.tape, [0, 0.04, -0.31], [-0.35, 0, 0]);
  add(g, 'carry_handle', plateGeo(0.034, 0.06, 0.16, 0.014), M.carbon, [0, 0.255, 0.12]);
  add(g, 'handle_grip', cyl(0.016, 0.016, 0.13, 16), M.tape, [0, 0.285, 0.12], [Math.PI / 2, 0, 0]);
  add(g, 'carry_strap_anchor', torus(0.018, 0.006, 18, 8), M.metal, [0, 0.216, -0.12], [0, Math.PI / 2, 0]);
  cable(g, 'fire_cable', [0.04, 0.06, 0.0], [0.055, 0.2, -0.04], 0.04, 0.008);
  decal(g, 'hazard', 'hazard', 0.18, 0.05, [0, 0.132, 0.64], [0.2, 0, 0]);
  decal(g, 'stencil', 'stencil', 0.2, 0.075, [0.0, 0.19, 0.32], [-1.3, 0, 0]);
  return sockets(g, -0.02, 0.3, 0.82, 0.13);
}

/* ---------- 08 LANCER — rail gun, coil stack, violet arc ---------- */
function buildLancer() {
  const g = new THREE.Group(); g.name = 'lancer';
  add(g, 'receiver', plateGeo(0.055, 0.11, 0.4, 0.026, 0.01), M.ceramic, [0, 0.05, 0.02]);
  add(g, 'capacitor', plateGeo(0.06, 0.07, 0.16, 0.018), M.carbon, [0, 0.0, 0.16]);
  glowMesh(g, 'cap_window', box(0.01, 0.04, 0.11), [0.032, 0.0, 0.16]).material = M.violet;
  for (const y of [0.092, 0.032]) add(g, 'rail_' + y, plateGeo(0.022, 0.028, 0.8, 0.006), M.metal, [0, y, 0.5]);
  for (let i = 0; i < 6; i++) {
    add(g, 'coil_' + i, torus(0.05, 0.013, 26, 10), M.carbon, [0, 0.062, 0.24 + i * 0.11], [Math.PI / 2, 0, 0]);
    const glowRing = add(g, 'coil_glow_' + i, torus(0.05, 0.006, 26, 8), M.violet, [0, 0.062, 0.28 + i * 0.11], [Math.PI / 2, 0, 0]);
    glowRing.castShadow = false;
  }
  add(g, 'scope', plateGeo(0.034, 0.05, 0.17, 0.012), M.carbon, [0, 0.152, 0.04]);
  glowMesh(g, 'scope_lens', cyl(0.018, 0.018, 0.008, 20), [0, 0.152, -0.05], [Math.PI / 2, 0, 0]).material = M.violet;
  add(g, 'mag_block', plateGeo(0.056, 0.085, 0.085, 0.016), M.slate, [0, -0.035, 0.13]);
  pistolGrip(g, 'grip', [0, -0.05, -0.04], -0.3);
  triggerGroup(g, 0.01, -0.012);
  stockAssembly(g, -0.3, 0.26, M.ceramic);
  cable(g, 'coil_cable', [0.03, 0.02, 0.24], [0.03, 0.06, 0.68], 0.0, 0.007);
  tapeWrap(g, 'rail_tape', [0, 0.062, 0.36], 0.052);
  decal(g, 'serial', 'serial', 0.11, 0.04, [-0.03, 0.05, 0.02], [0, -Math.PI / 2, 0]);
  return sockets(g, -0.04, 0.34, 0.94, 0.062);
}

/* ---------- 09 ARC — tesla projector, prongs, capacitor drum ---------- */
function buildArc() {
  const g = new THREE.Group(); g.name = 'arc';
  add(g, 'body', plateGeo(0.085, 0.125, 0.28, 0.03, 0.012), M.ceramic, [0, 0.045, 0.03]);
  const cap = group(g, 'capacitor', [0, 0.12, 0.0]);
  add(cap, 'cap_drum', cyl(0.062, 0.062, 0.15, 28), M.carbon, [0, 0, 0], [0, 0, Math.PI / 2]);
  glowMesh(cap, 'cap_core', cyl(0.05, 0.05, 0.155, 28), [0, 0, 0], [0, 0, Math.PI / 2]);
  add(cap, 'cap_cage_a', torus(0.066, 0.008, 28, 8), M.metal, [0.045, 0, 0], [0, Math.PI / 2, 0]);
  add(cap, 'cap_cage_b', torus(0.066, 0.008, 28, 8), M.metal, [-0.045, 0, 0], [0, Math.PI / 2, 0]);
  add(g, 'emitter_housing', plateGeo(0.08, 0.07, 0.12, 0.022), M.carbon, [0, 0.06, 0.24]);
  for (const s of [1, -1]) {
    add(g, `prong_${s > 0 ? 'l' : 'r'}`, cyl(0.009, 0.006, 0.26, 14), M.metal, [s * 0.038, 0.062, 0.38], [Math.PI / 2, 0, 0]);
    add(g, `prong_tip_${s > 0 ? 'l' : 'r'}`, sph(0.014, 16, 12), M.glow, [s * 0.038, 0.062, 0.51]).castShadow = false;
    add(g, `prong_coil_${s > 0 ? 'l' : 'r'}`, torus(0.016, 0.005, 18, 8), M.carbon, [s * 0.038, 0.062, 0.34]);
  }
  glowMesh(g, 'emitter_eye', cyl(0.022, 0.022, 0.012, 22), [0, 0.062, 0.3], [Math.PI / 2, 0, 0]);
  cable(g, 'cap_lead_l', [0.05, 0.1, 0.02], [0.038, 0.07, 0.24], 0.02, 0.008);
  cable(g, 'cap_lead_r', [-0.05, 0.1, 0.02], [-0.038, 0.07, 0.24], 0.02, 0.008);
  pistolGrip(g, 'grip', [0, -0.05, -0.03], -0.28);
  triggerGroup(g, 0.01, -0.012);
  add(g, 'brace', plateGeo(0.05, 0.09, 0.18, 0.02), M.carbon, [0, 0.02, -0.19], [-0.2, 0, 0]);
  add(g, 'heat_vent', plateGeo(0.06, 0.04, 0.05, 0.012), M.slate, [0, 0.1, -0.14]);
  decal(g, 'hazard', 'hazard', 0.1, 0.03, [0, 0.115, 0.19], [0.4, 0, 0]);
  return sockets(g, -0.03, 0.2, 0.53, 0.062);
}

/* ---------- 10 SIDEARM — service pistol, chipped slide ---------- */
function buildSidearm() {
  const g = new THREE.Group(); g.name = 'sidearm';
  // slide sits high and narrow; dust cover steps down to the muzzle
  add(g, 'slide', plateGeo(0.03, 0.034, 0.19, 0.004, 0.002), M.ceramic, [0, 0.088, 0.055]);
  add(g, 'slide_rib', plateGeo(0.018, 0.01, 0.185, 0.002, 0.001), M.carbon, [0, 0.104, 0.055]);
  for (let i = 0; i < 7; i++) add(g, 'serration_' + i, box(0.032, 0.004, 0.005), M.carbon, [0, 0.088, 0.0 - i * 0.011]);
  add(g, 'breech_face', plateGeo(0.03, 0.03, 0.012, 0.003), M.metal, [0, 0.088, -0.038]);
  add(g, 'dust_cover', plateGeo(0.026, 0.022, 0.1, 0.003), M.carbon, [0, 0.062, 0.1]);
  add(g, 'barrel_bushing', cyl(0.011, 0.011, 0.016, 16), M.metal, [0, 0.088, 0.153], [Math.PI / 2, 0, 0]);
  add(g, 'barrel_crown', cyl(0.008, 0.008, 0.01, 14), M.carbon, [0, 0.088, 0.162], [Math.PI / 2, 0, 0]);
  add(g, 'recoil_plug', cyl(0.007, 0.007, 0.012, 12), M.metal, [0, 0.068, 0.152], [Math.PI / 2, 0, 0]);
  add(g, 'accessory_rail', plateGeo(0.024, 0.01, 0.05, 0.002), M.slate, [0, 0.046, 0.105]);
  for (let i = 0; i < 3; i++) add(g, 'rail_notch_' + i, box(0.026, 0.005, 0.004), M.carbon, [0, 0.041, 0.09 + i * 0.014]);
  // frame: trigger bay, beavertail, magwell
  add(g, 'frame', plateGeo(0.026, 0.03, 0.13, 0.004), M.carbon, [0, 0.062, 0.025]);
  add(g, 'beavertail', plateGeo(0.026, 0.026, 0.04, 0.008), M.carbon, [0, 0.072, -0.05], [0.5, 0, 0]);
  add(g, 'front_sight', plateGeo(0.007, 0.012, 0.007, 0.002), M.metal, [0, 0.112, 0.13]);
  add(g, 'rear_sight', plateGeo(0.022, 0.012, 0.009, 0.002), M.metal, [0, 0.112, -0.028]);
  glowMesh(g, 'sight_dot', box(0.0035, 0.0035, 0.004), [0, 0.116, 0.133]);
  const gr = group(g, 'grip', [0, 0.0, -0.028], [-0.3, 0, 0]);
  add(gr, 'grip_frame', plateGeo(0.028, 0.115, 0.042, 0.005), M.carbon, [0, -0.01, 0]);
  add(gr, 'grip_panel_l', plateGeo(0.012, 0.08, 0.03, 0.004), M.slate, [0.015, -0.014, 0], [0, Math.PI / 2, 0]);
  add(gr, 'grip_panel_r', plateGeo(0.012, 0.08, 0.03, 0.004), M.slate, [-0.015, -0.014, 0], [0, Math.PI / 2, 0]);
  for (let i = 0; i < 6; i++) {
    add(gr, 'check_l_' + i, box(0.004, 0.004, 0.026), M.metal, [0.019, 0.018 - i * 0.014, 0]);
    add(gr, 'check_r_' + i, box(0.004, 0.004, 0.026), M.metal, [-0.019, 0.018 - i * 0.014, 0]);
  }
  add(gr, 'magwell_flare', plateGeo(0.034, 0.016, 0.048, 0.006), M.slate, [0, -0.07, 0]);
  add(gr, 'mag_floor', plateGeo(0.026, 0.012, 0.04, 0.004), M.metal, [0, -0.082, 0]);
  glowMesh(gr, 'mag_dot', box(0.005, 0.005, 0.006), [0.016, -0.055, 0.016]);
  add(g, 'trigger_guard', torus(0.024, 0.005, 24, 8, Math.PI * 1.25), M.carbon, [0, 0.03, 0.032], [0, Math.PI / 2, -0.6]);
  add(g, 'trigger', plateGeo(0.008, 0.026, 0.009, 0.003), M.metal, [0, 0.036, 0.032], [0.25, 0, 0]);
  add(g, 'mag_release', cyl(0.006, 0.006, 0.008, 10), M.metal, [0.016, 0.05, 0.01], [0, 0, Math.PI / 2]);
  add(g, 'slide_stop', plateGeo(0.022, 0.008, 0.008, 0.002), M.metal, [0.015, 0.062, 0.03], [0, Math.PI / 2, 0]);
  add(g, 'hammer', plateGeo(0.01, 0.02, 0.008, 0.003), M.metal, [0, 0.096, -0.058], [0.45, 0, 0]);
  decal(g, 'scuff', 'scuff', 0.08, 0.032, [0.016, 0.088, 0.055], [0, Math.PI / 2, 0]);
  return sockets(g, -0.028, 0.09, 0.175, 0.088);
}

/* ---------- 11 LEGION RIFLE — Null Legion chassis, red-orange glow ---------- */
function buildLegionRifle() {
  const g = new THREE.Group(); g.name = 'legion_rifle';
  add(g, 'receiver', plateGeo(0.058, 0.1, 0.46, 0.02, 0.008), M.legion, [0, 0.062, 0.12]);
  add(g, 'spine', plateGeo(0.03, 0.045, 0.4, 0.01), M.carbon, [0, 0.11, 0.1], [0, 0, 0]);
  for (let i = 0; i < 6; i++) add(g, 'spine_tooth_' + i, plateGeo(0.016, 0.03, 0.02, 0.004), M.legion, [0, 0.14, -0.04 + i * 0.06], [0.4, 0, 0]);
  add(g, 'barrel', cyl(0.014, 0.016, 0.4, 20), M.metal, [0, 0.062, 0.55], [Math.PI / 2, 0, 0]);
  add(g, 'barrel_sheath', plateGeo(0.046, 0.05, 0.24, 0.014), M.legion, [0, 0.062, 0.44]);
  const glowBar = add(g, 'coil_glow', box(0.012, 0.012, 0.3), M.red, [0, 0.115, 0.2]); glowBar.castShadow = false;
  const mz = add(g, 'muzzle_glow', cyl(0.02, 0.024, 0.03, 18), M.red, [0, 0.062, 0.76], [Math.PI / 2, 0, 0]); mz.castShadow = false;
  add(g, 'muzzle_claw_l', plateGeo(0.012, 0.05, 0.014, 0.004), M.legion, [0.026, 0.062, 0.75], [0, 0, -0.5]);
  add(g, 'muzzle_claw_r', plateGeo(0.012, 0.05, 0.014, 0.004), M.legion, [-0.026, 0.062, 0.75], [0, 0, 0.5]);
  pistolGrip(g, 'grip', [0, -0.045, 0.05], -0.3, M.legion);
  triggerGroup(g, 0.095, -0.006);
  const mag = group(g, 'cell', [0, -0.1, 0.16], [0.12, 0, 0]);
  add(mag, 'cell_body', plateGeo(0.052, 0.17, 0.062, 0.012), M.carbon);
  const cw = add(mag, 'cell_glow', box(0.01, 0.08, 0.02), M.red, [0.027, -0.01, 0]); cw.castShadow = false;
  add(g, 'stock_arm', plateGeo(0.04, 0.06, 0.24, 0.016), M.legion, [0, 0.065, -0.2]);
  add(g, 'stock_hook', plateGeo(0.036, 0.11, 0.03, 0.01), M.carbon, [0, 0.03, -0.32], [-0.3, 0, 0]);
  add(g, 'scavenged_optic', plateGeo(0.03, 0.04, 0.1, 0.01), M.slate, [0, 0.15, 0.24]);
  tapeWrap(g, 'optic_tape', [0, 0.13, 0.24], 0.03);
  return sockets(g, 0.05, 0.42, 0.78, 0.062);
}

/* ---------- 12 LEGION SHOTGUN — double tube, bone-hook stock ---------- */
function buildLegionShotgun() {
  const g = new THREE.Group(); g.name = 'legion_shotgun';
  add(g, 'receiver', plateGeo(0.075, 0.115, 0.34, 0.024, 0.01), M.legion, [0, 0.06, 0.06]);
  for (const y of [0.09, 0.042]) {
    add(g, 'tube_' + y, cyl(0.026, 0.026, 0.4, 22), M.metal, [0, y, 0.42], [Math.PI / 2, 0, 0]);
    const t = add(g, 'tube_glow_' + y, cyl(0.02, 0.02, 0.03, 18), M.red, [0, y, 0.62], [Math.PI / 2, 0, 0]); t.castShadow = false;
  }
  add(g, 'clamp_front', plateGeo(0.06, 0.11, 0.03, 0.012), M.carbon, [0, 0.066, 0.56]);
  add(g, 'clamp_mid', plateGeo(0.06, 0.11, 0.03, 0.012), M.carbon, [0, 0.066, 0.34]);
  add(g, 'breech_lever', cyl(0.008, 0.008, 0.1, 12), M.metal, [0.036, 0.05, 0.02], [0, 0, 0.5]);
  pistolGrip(g, 'grip', [0, -0.045, -0.02], -0.36, M.legion);
  triggerGroup(g, 0.035, -0.008);
  add(g, 'stock_arm', plateGeo(0.05, 0.07, 0.22, 0.02), M.legion, [0, 0.055, -0.18]);
  add(g, 'stock_hook', plateGeo(0.04, 0.14, 0.03, 0.012), M.carbon, [0, 0.02, -0.3], [-0.35, 0, 0]);
  for (let i = 0; i < 4; i++) add(g, 'shell_loop_' + i, cyl(0.014, 0.014, 0.05, 14), M.red, [0.038, 0.03 - i * 0.032, -0.16], [0, 0, Math.PI / 2]);
  tapeWrap(g, 'clamp_tape', [0, 0.066, 0.45], 0.062);
  return sockets(g, -0.02, 0.34, 0.66, 0.066);
}

/* ---------- 13 LEGION HEAVY — tri-barrel cannon, drum feed ---------- */
function buildLegionHeavy() {
  const g = new THREE.Group(); g.name = 'legion_heavy';
  add(g, 'receiver', plateGeo(0.11, 0.145, 0.54, 0.032, 0.012), M.legion, [0, 0.06, 0.14]);
  add(g, 'receiver_ridge', plateGeo(0.05, 0.05, 0.44, 0.014), M.carbon, [0, 0.14, 0.12]);
  const bar = add(g, 'ridge_glow', box(0.014, 0.014, 0.38), M.red, [0, 0.168, 0.12]); bar.castShadow = false;
  const cluster = group(g, 'barrel_cluster', [0, 0.072, 0.6]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(cluster, 'barrel_' + i, cyl(0.019, 0.019, 0.42, 20), M.metal, [Math.cos(a) * 0.038, Math.sin(a) * 0.038, 0], [Math.PI / 2, 0, 0]);
    add(cluster, 'barrel_ring_' + i, torus(0.026, 0.006, 20, 8), M.carbon, [Math.cos(a) * 0.038, Math.sin(a) * 0.038, 0.12]);
  }
  add(cluster, 'cluster_hub', cyl(0.03, 0.03, 0.4, 18), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(g, 'muzzle_shroud', cyl(0.075, 0.062, 0.14, 26, true), M.legion, [0, 0.072, 0.8], [Math.PI / 2, 0, 0]);
  const sg = add(g, 'shroud_glow', torus(0.06, 0.008, 26, 8), M.red, [0, 0.072, 0.84]); sg.castShadow = false;
  const drum = group(g, 'feed_drum', [-0.125, -0.01, 0.1], [0, 0.12, 0]);
  add(drum, 'drum_body', cyl(0.095, 0.095, 0.16, 30), M.carbon, [0, 0, 0], [0, 0, Math.PI / 2]);
  add(drum, 'drum_plate', cyl(0.075, 0.075, 0.166, 30), M.legion, [0, 0, 0], [0, 0, Math.PI / 2]);
  const dg = add(drum, 'drum_glow', torus(0.055, 0.01, 28, 8), M.red, [-0.085, 0, 0], [0, Math.PI / 2, 0]); dg.castShadow = false;
  cable(drum, 'feed_belt', [0.07, 0.06, 0.0], [0.13, 0.1, 0.04], 0.015, 0.016);
  pistolGrip(g, 'grip', [0, -0.055, 0.03], -0.28, M.legion);
  triggerGroup(g, 0.08, -0.018);
  add(g, 'fore_handle', plateGeo(0.05, 0.13, 0.055, 0.018), M.carbon, [0, -0.02, 0.42], [0.4, 0, 0]);
  add(g, 'shoulder_brace', plateGeo(0.075, 0.1, 0.22, 0.024), M.legion, [0, 0.06, -0.24]);
  add(g, 'brace_hook', plateGeo(0.05, 0.14, 0.03, 0.012), M.carbon, [0, 0.02, -0.36], [-0.32, 0, 0]);
  tapeWrap(g, 'handle_tape', [0, -0.02, 0.42], 0.04);
  return sockets(g, 0.03, 0.44, 0.88, 0.072);
}

/* ---------- gear ---------- */
function buildGrenade() {
  const g = new THREE.Group(); g.name = 'frag_grenade';
  add(g, 'body', sph(0.062, 32, 24), M.ceramic, [0, 0, 0], [0, 0, 0], [1, 1.22, 1]);
  for (let i = 0; i < 3; i++) glowMesh(g, 'band_' + i, torus(0.06, 0.007, 30, 8), [0, -0.02 + i * 0.02, 0], [Math.PI / 2, 0, 0]);
  add(g, 'fuse_cap', cyl(0.021, 0.026, 0.05, 20), M.metal, [0, 0.09, 0]);
  add(g, 'safety_lever', plateGeo(0.014, 0.07, 0.012, 0.004), M.slate, [0.024, 0.07, 0], [0, 0, 0.12]);
  add(g, 'pin_ring', torus(0.014, 0.004, 18, 8), M.amber, [0.03, 0.1, 0], [0, 0, 0.4]);
  decal(g, 'hazard', 'hazard', 0.09, 0.026, [0, 0.03, 0.062], [0, 0, 0]);
  return g;
}
function buildInjector() {
  const g = new THREE.Group(); g.name = 'wellness_injector';
  add(g, 'tube', cyl(0.022, 0.022, 0.16, 24), M.glass);
  const fl = add(g, 'fluid', cyl(0.016, 0.016, 0.125, 20), M.green); fl.castShadow = false;
  add(g, 'cap', cyl(0.027, 0.027, 0.03, 22), M.metal, [0, 0.092, 0]);
  add(g, 'thumb_plate', plateGeo(0.05, 0.05, 0.012, 0.014), M.carbon, [0, 0.112, 0]);
  add(g, 'collar', torus(0.024, 0.006, 22, 8), M.carbon, [0, -0.07, 0], [Math.PI / 2, 0, 0]);
  add(g, 'needle_guard', cyl(0.012, 0.01, 0.05, 16), M.slate, [0, -0.105, 0]);
  add(g, 'needle', cyl(0.0025, 0.0025, 0.04, 8), M.metal, [0, -0.14, 0]);
  add(g, 'grip_tape', cyl(0.024, 0.024, 0.04, 20), M.tape, [0, -0.02, 0]);
  return g;
}

export const WEAPONS = {
  viper: { label: 'VIPER · assault rifle', build: buildViper },
  reaper: { label: 'REAPER · SMG', build: buildReaper },
  hammer: { label: 'HAMMER · pump shotgun', build: buildHammer },
  breaker: { label: 'BREAKER · auto shotgun', build: buildBreaker },
  atlas: { label: 'ATLAS · LMG', build: buildAtlas },
  longshot: { label: 'LONGSHOT · anti-materiel', build: buildLongshot },
  lancer: { label: 'LANCER · rail', build: buildLancer },
  javelin: { label: 'JAVELIN · launcher', build: buildJavelin },
  arc: { label: 'ARC · projector', build: buildArc },
  sidearm: { label: 'SIDEARM · pistol', build: buildSidearm },
  legion_rifle: { label: 'LEGION rifle', build: buildLegionRifle },
  legion_shotgun: { label: 'LEGION shotgun', build: buildLegionShotgun },
  legion_heavy: { label: 'LEGION heavy', build: buildLegionHeavy },
  grenade: { label: 'FRAG grenade', build: buildGrenade },
  injector: { label: 'WELLNESS injector', build: buildInjector },
};

/** One weapon, centred and resting on y=0 for the viewer. */
export function buildWeaponDisplay(id) {
  const wrap = new THREE.Group();
  wrap.name = (id || 'weapon') + '_display';
  const w = (WEAPONS[id] || WEAPONS.viper).build();
  wrap.add(w);
  const bb = new THREE.Box3().setFromObject(wrap);
  w.position.y -= bb.min.y;
  w.position.x -= (bb.min.x + bb.max.x) / 2;
  w.position.z -= (bb.min.z + bb.max.z) / 2;
  return wrap;
}

export { buildSidearm, buildGrenade };
