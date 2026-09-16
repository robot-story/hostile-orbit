import * as THREE from 'three';
import { M, plateGeo, box, cyl, shell, sph, torus, add, group, glowMesh, decal, cable, rivets } from './ro-parts.js';
import { buildSidearm, buildGrenade } from './weapons-model.js';

const R = 0.36; // drive-ball radius

/* ---------- build ---------- */
export function buildOutrider() {
  const root = new THREE.Group();
  root.name = 'outrider';

  /* ===== DRIVE BALL + CRADLE ===== */
  const drive = group(root, 'drive_assembly', [0, R, 0]);
  add(drive, 'drive_ball', sph(R, 56, 40), M.rubber);
  add(drive, 'ball_band_x', torus(R - 0.004, 0.018, 56, 12), M.rubber, [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(drive, 'ball_band_z', torus(R - 0.018, 0.013, 56, 12), M.rubber, [0, 0, 0], [0, Math.PI / 2, 0]);
  // moulded tread studs in latitude rows
  const rows = [-0.62, -0.34, -0.06, 0.22, 0.5];
  rows.forEach((lat, ri) => {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.18;
      const ca = Math.cos(lat), sa = Math.sin(lat);
      const p = [Math.cos(a) * ca * R, sa * R, Math.sin(a) * ca * R];
      const stud = add(drive, `tread_stud_${ri}_${i}`, plateGeo(0.062, 0.036, 0.022, 0.01, 0.005), M.rubber, p, [0, 0, 0]);
      stud.lookAt(0, 0, 0);
      stud.rotateZ(lat * 0.6);
      stud.position.multiplyScalar(1.006);
    }
  });
  // segmented stator ring hugging the ball equator
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const seg = group(drive, `stator_seg_${i}`, [Math.cos(a) * (R + 0.03), 0.045, Math.sin(a) * (R + 0.03)], [0, -a, 0]);
    add(seg, `stator_block_${i}`, plateGeo(0.125, 0.08, 0.05, 0.018), M.slate, [0, 0, 0], [0, Math.PI / 2, 0]);
    add(seg, `stator_shoe_${i}`, plateGeo(0.1, 0.05, 0.03, 0.01), M.carbon, [-0.022, -0.03, 0], [0, Math.PI / 2, 0]);
    glowMesh(seg, `stator_slot_${i}`, box(0.012, 0.03, 0.07), [0.026, 0.008, 0]);
    add(seg, `stator_bolt_${i}`, cyl(0.009, 0.009, 0.012, 10), M.metal, [0, 0.042, 0]);
  }
  // three omni drive rollers, tucked under the shroud, pressing on the upper hemisphere
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
    const rr = (R + 0.012) * 0.78, ry = R * 0.58;
    const pod = group(drive, `roller_pod_${i}`, [Math.cos(a) * rr, ry, Math.sin(a) * rr], [0, -a, 0]);
    add(pod, `roller_arm_${i}`, plateGeo(0.07, 0.11, 0.05, 0.018), M.slate, [0, 0.06, 0], [0, Math.PI / 2, 0]);
    add(pod, `roller_wheel_${i}`, cyl(0.05, 0.05, 0.055, 22), M.metal, [0, -0.008, 0], [0, 0, Math.PI / 2]);
    add(pod, `roller_tread_${i}`, torus(0.05, 0.013, 26, 10), M.rubber, [0, -0.008, 0], [0, Math.PI / 2, 0]);
  }
  // suspension yoke: heavy struts from the saddle down to the axle knuckles
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    const strut = group(drive, `strut_${S}`, [s * (R + 0.055), 0.0, 0]);
    add(strut, `axle_knuckle_${S}`, cyl(0.058, 0.072, 0.1, 24), M.slate, [0, 0, 0], [0, 0, Math.PI / 2]);
    add(strut, `axle_cap_${S}`, cyl(0.033, 0.033, 0.035, 20), M.metal, [s * 0.06, 0, 0], [0, 0, Math.PI / 2]);
    glowMesh(strut, `axle_led_${S}`, torus(0.026, 0.007, 20, 8), [s * 0.08, 0, 0], [0, Math.PI / 2, 0]);
    // lower A-arm up to the knee-like elbow, then the shock to the saddle
    add(strut, `shin_strut_${S}`, plateGeo(0.085, 0.3, 0.1, 0.03), M.ceramic, [s * -0.01, 0.17, 0], [0, Math.PI / 2, s * -0.12]);
    add(strut, `shin_strut_inner_${S}`, plateGeo(0.06, 0.26, 0.06, 0.02), M.carbon, [s * -0.045, 0.17, 0], [0, Math.PI / 2, s * -0.12]);
    glowMesh(strut, `strut_rail_${S}`, box(0.012, 0.19, 0.013), [s * 0.045, 0.17, 0.05]);
    add(strut, `strut_knee_${S}`, cyl(0.055, 0.055, 0.11, 24), M.metal, [s * -0.04, 0.33, 0], [0, 0, Math.PI / 2]);
    glowMesh(strut, `strut_knee_ring_${S}`, torus(0.058, 0.008, 24, 8), [s * 0.02, 0.33, 0], [0, Math.PI / 2, 0]);
    add(strut, `strut_knee_cap_${S}`, plateGeo(0.11, 0.12, 0.06, 0.035), M.ceramic, [s * -0.04, 0.335, 0.06]);
    add(strut, `thigh_strut_${S}`, plateGeo(0.1, 0.26, 0.12, 0.035), M.ceramic, [s * -0.09, 0.49, 0], [0, Math.PI / 2, s * 0.16]);
    add(strut, `thigh_strut_back_${S}`, plateGeo(0.075, 0.22, 0.07, 0.024), M.carbon, [s * -0.1, 0.49, -0.065], [0, Math.PI / 2, s * 0.16]);
    add(strut, `shock_body_${S}`, cyl(0.024, 0.024, 0.26, 16), M.slate, [s * -0.02, 0.44, -0.075], [0.0, 0, s * 0.2]);
    add(strut, `shock_rod_${S}`, cyl(0.012, 0.012, 0.16, 12), M.metal, [s * -0.055, 0.22, -0.055], [0.0, 0, s * 0.2]);
    add(strut, `shock_spring_${S}`, torus(0.03, 0.008, 24, 8), M.metal, [s * -0.02, 0.33, -0.07], [Math.PI / 2, 0, 0]);
    add(strut, `caliper_${S}`, plateGeo(0.07, 0.11, 0.12, 0.022), M.carbon, [s * -0.02, 0.1, -0.11], [0, Math.PI / 2, s * 0.2]);
    cable(strut, `brake_line_${S}`, [s * -0.02, 0.14, -0.1], [s * -0.12, 0.5, -0.06], 0.04, 0.008);
  }
  // mudguard shell over the rear of the ball
  const guard = group(drive, 'mudguard', [0, 0, 0], [0, 0, Math.PI / 2]);
  add(guard, 'guard_shell', shell(R + 0.075, 0.34, Math.PI * 0.62, Math.PI * 0.66, 40), M.carbon);
  add(guard, 'guard_lip', shell(R + 0.095, 0.3, Math.PI * 0.62, Math.PI * 0.12, 16), M.slate);
  add(drive, 'guard_spine', plateGeo(0.06, 0.2, 0.03, 0.012), M.slate, [0, R * 0.72, -(R + 0.085)], [0.6, 0, 0]);
  decal(drive, 'guard_hazard', 'hazard', 0.2, 0.05, [0, R * 0.42, -(R + 0.1)], [0.15, Math.PI, 0]);

  /* ===== PELVIS / SADDLE ===== */
  const pelvis = group(root, 'pelvis', [0, 0.99, 0]);
  add(pelvis, 'saddle_core', plateGeo(0.4, 0.19, 0.33, 0.05), M.carbon, [0, -0.01, 0], [Math.PI / 2, 0, 0]);
  add(pelvis, 'saddle_front', plateGeo(0.3, 0.12, 0.07, 0.03), M.carbon, [0, -0.02, 0.165], [-0.25, 0, 0]);
  glowMesh(pelvis, 'saddle_glow', box(0.18, 0.012, 0.012), [0, -0.055, 0.18]);
  add(pelvis, 'belt', cyl(0.17, 0.175, 0.07, 28), M.slate, [0, 0.075, 0], [0, 0, 0], [1.15, 1, 0.92]);
  add(pelvis, 'buckle', plateGeo(0.09, 0.065, 0.05, 0.016), M.metal, [0, 0.075, 0.15]);
  glowMesh(pelvis, 'buckle_glow', box(0.042, 0.009, 0.01), [0, 0.075, 0.178]);
  rivets(pelvis, 'saddle_rivet', 5, [-0.12, 0.02, 0.172], [0.06, 0, 0]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    // hip fairing: canted trapezoid skirting past the ball
    const fair = group(pelvis, `hip_fairing_${S}`, [s * 0.255, -0.1, 0.01], [0, 0, s * -0.14]);
    add(fair, `fairing_shell_${S}`, plateGeo(0.19, 0.34, 0.1, 0.05), M.ceramic, [0, 0, 0], [0, Math.PI / 2, 0]);
    add(fair, `fairing_inner_${S}`, plateGeo(0.15, 0.28, 0.055, 0.03), M.carbon, [s * -0.035, -0.01, 0], [0, Math.PI / 2, 0]);
    glowMesh(fair, `fairing_rail_${S}`, box(0.012, 0.22, 0.013), [s * 0.055, 0.0, 0.045]);
    decal(fair, `fairing_hazard_${S}`, 'hazard', 0.055, 0.14, [s * 0.056, -0.1, -0.02], [0, s * Math.PI / 2, Math.PI / 2]);
    rivets(fair, `fairing_rivet_${S}`, 4, [s * 0.05, 0.12, 0.05], [0, -0.045, 0]);
    add(pelvis, `hip_ball_${S}`, sph(0.075, 22, 16), M.metal, [s * 0.16, -0.04, 0]);
    add(pelvis, `pouch_${S}`, plateGeo(0.095, 0.09, 0.062, 0.018), M.carbon, [s * 0.115, -0.015, 0.135], [0, s * 0.5, 0]);
    add(pelvis, `pouch_strap_${S}`, box(0.072, 0.013, 0.008), M.metal, [s * 0.115, 0.022, 0.168], [0, s * 0.5, 0]);
  }
  // field kit: sidearm holster on the left fairing, spare mags on the right, blade at the small of the back
  const holster = group(pelvis, 'holster', [0.235, -0.16, 0.09], [0.1, 0.35, -0.12]);
  add(holster, 'holster_shell', plateGeo(0.09, 0.17, 0.06, 0.02), M.carbon);
  add(holster, 'holster_flap', plateGeo(0.085, 0.05, 0.05, 0.014), M.tape, [0, 0.075, 0.006]);
  add(holster, 'holster_strap', box(0.014, 0.09, 0.01), M.tape, [0.03, 0.03, 0.032]);
  const pistol = buildSidearm();
  pistol.name = 'sidearm_stowed';
  pistol.scale.setScalar(0.92);
  pistol.position.set(0, -0.02, -0.01);
  pistol.rotation.set(Math.PI / 2, 0, 0);
  holster.add(pistol);
  for (let i = 0; i < 3; i++) {
    const m = group(pelvis, 'spare_mag_' + i, [-0.16 - i * 0.012, -0.075, 0.115 - i * 0.062], [0.12, -0.5, 0.06]);
    add(m, 'mag_pouch_' + i, plateGeo(0.058, 0.11, 0.05, 0.014), M.carbon);
    add(m, 'mag_lip_' + i, plateGeo(0.05, 0.03, 0.045, 0.01), M.slate, [0, 0.062, 0]);
    if (i === 1) glowMesh(m, 'mag_led_' + i, box(0.008, 0.02, 0.01), [0.026, 0.02, 0.02]);
  }
  const blade = group(pelvis, 'combat_blade', [-0.08, -0.05, -0.175], [-0.2, 0, 0.5]);
  add(blade, 'sheath', plateGeo(0.042, 0.18, 0.028, 0.012), M.carbon);
  add(blade, 'sheath_strap', box(0.05, 0.012, 0.032), M.tape, [0, 0.055, 0]);
  add(blade, 'blade_grip', plateGeo(0.026, 0.07, 0.022, 0.008), M.slate, [0, 0.115, 0]);
  add(blade, 'blade_pommel', cyl(0.014, 0.012, 0.02, 14), M.metal, [0, 0.156, 0]);
  for (let i = 0; i < 2; i++) {
    const gr = buildGrenade();
    gr.name = 'grenade_' + i;
    gr.scale.setScalar(0.62);
    gr.position.set(0.055 + i * 0.075, -0.07, -0.14);
    gr.rotation.set(0.3, i * 0.8, 0.2);
    pelvis.add(gr);
  }
  // counterweight arms trailing behind the saddle
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    const cw = group(pelvis, `counterweight_${S}`, [s * 0.16, 0.02, -0.19], [0.18, s * 0.12, 0]);
    add(cw, `cw_boom_${S}`, cyl(0.026, 0.03, 0.24, 16), M.slate, [0, -0.02, -0.1], [Math.PI / 2, 0, 0]);
    add(cw, `cw_pod_${S}`, plateGeo(0.11, 0.12, 0.16, 0.035), M.carbon, [0, -0.03, -0.24]);
    glowMesh(cw, `cw_ring_${S}`, torus(0.045, 0.009, 22, 8), [0, -0.03, -0.32]);
    add(cw, `cw_nozzle_${S}`, cyl(0.032, 0.042, 0.06, 18, true), M.metal, [0, -0.03, -0.33], [Math.PI / 2, 0, 0]);
  }

  /* ===== TORSO ===== */
  const torso = group(root, 'torso', [0, 1.22, 0]);
  add(torso, 'torso_core', cyl(0.16, 0.14, 0.34, 26), M.suit, [0, 0.05, -0.01], [0, 0, 0], [1.2, 1, 0.88]);
  for (let i = 0; i < 3; i++)
    add(torso, 'waist_band_' + i, plateGeo(0.26 + i * 0.02, 0.06, 0.2 + i * 0.012, 0.03), M.slate, [0, -0.07 + i * 0.062, 0], [Math.PI / 2, 0, 0]);
  add(torso, 'collar_yoke', plateGeo(0.33, 0.085, 0.21, 0.04), M.carbon, [0, 0.24, 0.01], [Math.PI / 2, 0, 0]);
  glowMesh(torso, 'collar_glow', box(0.14, 0.01, 0.014), [0, 0.262, 0.08]);
  add(torso, 'cuirass_upper', plateGeo(0.335, 0.17, 0.105, 0.05), M.ceramic, [0, 0.16, 0.085], [0.14, 0, 0]);
  add(torso, 'cuirass_lower', plateGeo(0.29, 0.1, 0.09, 0.038), M.ceramic, [0, 0.05, 0.1], [-0.16, 0, 0]);
  rivets(torso, 'cuirass_rivet_l', 4, [-0.13, 0.225, 0.14], [0, -0.03, 0.006]);
  rivets(torso, 'cuirass_rivet_r', 4, [0.13, 0.225, 0.14], [0, -0.03, 0.006]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    add(torso, `pectoral_${S}`, plateGeo(0.115, 0.12, 0.05, 0.03), M.ceramic, [s * 0.098, 0.17, 0.132], [0.1, s * 0.26, 0]);
    add(torso, `pectoral_trim_${S}`, plateGeo(0.09, 0.035, 0.035, 0.012), M.carbon, [s * 0.1, 0.115, 0.14], [-0.1, s * 0.26, 0]);
    glowMesh(torso, `chest_vent_${S}`, box(0.012, 0.058, 0.01), [s * 0.16, 0.16, 0.148]);
    add(torso, `clavicle_strut_${S}`, cyl(0.02, 0.02, 0.14, 16), M.metal, [s * 0.125, 0.225, 0.05], [0, 0, s * 1.15]);
    for (let i = 0; i < 3; i++)
      add(torso, `rib_${S}_${i}`, plateGeo(0.05, 0.04, 0.145, 0.014), M.slate, [s * 0.162, 0.14 - i * 0.058, 0.005], [0, Math.PI / 2, s * 0.1]);
  }
  add(torso, 'reactor_housing', plateGeo(0.095, 0.095, 0.06, 0.03), M.metal, [0, 0.13, 0.142]);
  glowMesh(torso, 'reactor_core', cyl(0.034, 0.034, 0.026, 26), [0, 0.13, 0.172], [Math.PI / 2, 0, 0]);
  add(torso, 'reactor_ring', torus(0.048, 0.009, 30, 10), M.carbon, [0, 0.13, 0.172]);
  for (let i = 0; i < 3; i++) {
    add(torso, 'ab_segment_' + i, plateGeo(0.2 - i * 0.014, 0.05, 0.075, 0.02), M.carbon, [0, -0.015 - i * 0.058, 0.098 - i * 0.014], [-0.24 - i * 0.05, 0, 0]);
    glowMesh(torso, 'ab_glow_' + i, box(0.055, 0.006, 0.008), [0, -0.015 - i * 0.058, 0.136 - i * 0.016]);
  }
  decal(torso, 'chest_stencil', 'stencil', 0.14, 0.052, [0.075, 0.052, 0.152], [-0.16, 0, 0]);
  decal(torso, 'chest_scuff', 'scuff', 0.2, 0.12, [0, 0.17, 0.139], [0.14, 0, 0]);
  // field-patched right ear pod: taped plate over a cracked sensor housing
  add(torso, 'shoulder_patch', plateGeo(0.1, 0.09, 0.012, 0.02), M.tape, [-0.15, 0.09, 0.118], [0, -0.5, 0.2]);
  // back + pack
  add(torso, 'spine_plate', plateGeo(0.2, 0.34, 0.06, 0.035), M.carbon, [0, 0.07, -0.13], [0, Math.PI, 0]);
  const pack = group(torso, 'backpack', [0, 0.1, -0.2]);
  add(pack, 'pack_shell', plateGeo(0.29, 0.3, 0.13, 0.04, 0.016), M.carbon, [0, 0, -0.02], [0, Math.PI, 0]);
  add(pack, 'pack_face', plateGeo(0.2, 0.22, 0.04, 0.03), M.slate, [0, 0.01, -0.105], [0, Math.PI, 0]);
  add(pack, 'pack_lid', plateGeo(0.25, 0.07, 0.15, 0.028), M.ceramic, [0, 0.13, -0.02], [Math.PI / 2, 0, 0]);
  decal(pack, 'pack_chevron', 'chevron', 0.12, 0.12, [0, 0.0, -0.128], [0, Math.PI, 0]);
  add(pack, 'reactor_pack_housing', cyl(0.058, 0.058, 0.1, 28), M.metal, [0, -0.055, -0.1], [Math.PI / 2, 0, 0]);
  glowMesh(pack, 'reactor_pack_core', cyl(0.04, 0.04, 0.115, 28), [0, -0.055, -0.1], [Math.PI / 2, 0, 0]);
  add(pack, 'reactor_pack_ring', torus(0.066, 0.011, 30, 10), M.carbon, [0, -0.055, -0.148]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    add(pack, `pack_pod_${S}`, plateGeo(0.09, 0.22, 0.12, 0.03), M.carbon, [s * 0.155, 0.01, -0.02], [0, Math.PI / 2, 0]);
    glowMesh(pack, `pack_pod_glow_${S}`, box(0.012, 0.13, 0.012), [s * 0.196, 0.01, -0.02]);
    for (let i = 0; i < 3; i++)
      add(pack, `radiator_fin_${S}_${i}`, plateGeo(0.075, 0.1, 0.012, 0.008, 0.004), M.metal, [s * (0.055 + i * 0.032), 0.15, -0.1], [-0.55, 0, 0]);
    add(pack, `exhaust_${S}`, cyl(0.032, 0.038, 0.075, 20, true), M.carbon, [s * 0.1, -0.175, -0.045], [0.4, 0, 0]);
    add(pack, `exhaust_glow_${S}`, cyl(0.026, 0.026, 0.012, 20), M.amber, [s * 0.1, -0.208, -0.03], [0.4, 0, 0]);
  }
  cable(pack, 'pack_hose_l', [0.115, 0.09, 0.02], [0.17, -0.06, 0.12], 0.05);
  cable(pack, 'pack_hose_r', [-0.115, 0.09, 0.02], [-0.17, -0.06, 0.12], 0.05);

  /* ===== HEAD ===== */
  const head = group(root, 'head', [0, 1.595, 0]);
  add(head, 'neck_column', cyl(0.058, 0.064, 0.12, 20), M.suit, [0, -0.04, -0.005]);
  add(head, 'neck_collar_ring', torus(0.075, 0.014, 28, 10), M.metal, [0, -0.062, -0.005], [Math.PI / 2, 0, 0]);
  add(head, 'helmet_shell', plateGeo(0.2, 0.225, 0.255, 0.058, 0.026), M.ceramic, [0, 0.055, -0.012]);
  add(head, 'helmet_crown', plateGeo(0.15, 0.085, 0.215, 0.035, 0.018), M.carbon, [0, 0.145, -0.02]);
  add(head, 'helmet_rear', plateGeo(0.165, 0.15, 0.055, 0.04, 0.02), M.carbon, [0, 0.045, -0.125], [0, Math.PI, 0]);
  glowMesh(head, 'helmet_rear_glow', box(0.07, 0.009, 0.01), [0, 0.095, -0.152]);
  add(head, 'face_mask', plateGeo(0.163, 0.155, 0.045, 0.05, 0.018), M.carbon, [0, 0.035, 0.098], [0.06, 0, 0]);
  add(head, 'brow_ridge', plateGeo(0.188, 0.032, 0.09, 0.014), M.ceramic, [0, 0.098, 0.084], [0.26, 0, 0]);
  add(head, 'visor_band', plateGeo(0.135, 0.038, 0.03, 0.008), M.visor, [0, 0.05, 0.118], [0.04, 0, 0]);
  glowMesh(head, 'visor_slit', box(0.116, 0.0085, 0.008), [0, 0.049, 0.132], [0.04, 0, 0]);
  add(head, 'breather_housing', plateGeo(0.085, 0.062, 0.045, 0.02), M.carbon, [0, -0.03, 0.09], [-0.16, 0, 0]);
  for (let i = 0; i < 4; i++) add(head, 'breather_slat_' + i, box(0.062, 0.006, 0.012), M.metal, [0, -0.012 - i * 0.014, 0.11 - i * 0.005], [-0.16, 0, 0]);
  add(head, 'chin_guard', plateGeo(0.115, 0.035, 0.06, 0.016), M.ceramic, [0, -0.066, 0.062], [-0.4, 0, 0]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'l' : 'r';
    add(head, `cheek_plate_${S}`, plateGeo(0.13, 0.1, 0.035, 0.03), M.ceramic, [s * 0.095, 0.015, 0.05], [0, s * 1.15, 0]);
    add(head, `ear_pod_${S}`, plateGeo(0.07, 0.095, 0.05, 0.024), M.carbon, [s * 0.11, 0.045, -0.02], [0, Math.PI / 2, 0]);
    add(head, `ear_bolt_${S}`, cyl(0.019, 0.019, 0.024, 16), M.metal, [s * 0.129, 0.045, -0.02], [0, 0, Math.PI / 2]);
    if (s < 0) {
      add(head, 'ear_patch', plateGeo(0.08, 0.07, 0.01, 0.016), M.tape, [-0.126, 0.045, -0.02], [0, Math.PI / 2, 0.1]);
      add(head, 'ear_patch_strap', box(0.008, 0.062, 0.012), M.tape, [-0.128, 0.045, 0.012]);
    }
    glowMesh(head, `temple_light_${S}`, box(0.008, 0.034, 0.012), [s * 0.1, 0.06, 0.045]);
  }
  add(head, 'antenna_base', cyl(0.015, 0.019, 0.024, 14), M.carbon, [-0.075, 0.16, -0.105], [0.25, 0, -0.3]);
  add(head, 'antenna_rod', cyl(0.004, 0.006, 0.13, 10), M.metal, [-0.094, 0.222, -0.121], [0.28, 0, -0.34]);
  add(head, 'antenna_tip', sph(0.008, 14, 10), M.amber, [-0.11, 0.282, -0.138]);
  add(head, 'crest_ridge', plateGeo(0.03, 0.09, 0.16, 0.01), M.carbon, [0, 0.168, -0.03], [Math.PI / 2, 0, 0]);
  add(head, 'crest_stripe', box(0.012, 0.008, 0.1), M.amber, [0, 0.196, -0.03]);
  decal(head, 'helmet_scuff', 'scuff', 0.16, 0.1, [0, 0.115, 0.02], [Math.PI / 2, 0, 0]);

  /* ===== ARMS ===== */
  const limbs = {};
  for (const s of [1, -1]) {
    const L = s > 0 ? 'l' : 'r';
    const arm = group(root, `arm_${L}`, [s * 0.225, 1.46, 0], [0, 0, s * 0.055]);
    const pauldron = group(arm, `pauldron_${L}`, [s * 0.005, 0.025, 0], [0, 0, s * 0.3]);
    add(pauldron, `pauldron_${L}_tier1`, plateGeo(0.165, 0.215, 0.075, 0.05, 0.014), M.ceramic, [s * 0.022, 0.0, 0], [-Math.PI / 2, 0, 0]);
    add(pauldron, `pauldron_${L}_tier2`, plateGeo(0.145, 0.185, 0.065, 0.044, 0.012), M.carbon, [s * 0.04, -0.062, 0], [-Math.PI / 2, 0, 0]);
    add(pauldron, `pauldron_${L}_tier3`, plateGeo(0.118, 0.15, 0.055, 0.036, 0.01), M.ceramic, [s * 0.052, -0.115, 0], [-Math.PI / 2, 0, 0]);
    add(pauldron, `pauldron_trim_${L}`, box(0.014, 0.012, 0.14), M.amber, [s * 0.095, 0.006, 0]);
    add(pauldron, `pauldron_bolt_${L}`, cyl(0.017, 0.017, 0.028, 16), M.metal, [s * 0.086, -0.062, 0.05], [0, 0, Math.PI / 2]);
    decal(pauldron, `pauldron_decal_${L}`, s > 0 ? 'unit' : 'chevron', 0.11, 0.11, [s * 0.098, -0.005, 0.0], [0, s * Math.PI / 2, 0]);
    decal(pauldron, `pauldron_scuff_${L}`, 'scuff', 0.13, 0.1, [s * 0.028, 0.042, 0.0], [Math.PI / 2, 0, 0]);
    if (s < 0) decal(pauldron, 'pauldron_tally', 'tally', 0.07, 0.035, [-0.096, -0.062, 0.03], [0, -Math.PI / 2, 0]);
    add(arm, `deltoid_plate_${L}`, plateGeo(0.1, 0.12, 0.045, 0.032), M.carbon, [s * 0.045, -0.035, 0.08], [0, s * 0.55, 0]);
    add(arm, `shoulder_ball_${L}`, sph(0.072, 24, 18), M.metal, [s * 0.02, -0.025, 0]);
    const upper = group(arm, `upper_arm_${L}`, [s * 0.018, -0.06, 0]);
    add(upper, `bicep_sleeve_${L}`, cyl(0.058, 0.05, 0.24, 20), M.suit, [0, -0.12, 0]);
    add(upper, `bicep_plate_${L}`, plateGeo(0.11, 0.16, 0.11, 0.035), M.ceramic, [0, -0.1, 0.015]);
    add(upper, `bicep_plate_back_${L}`, plateGeo(0.09, 0.12, 0.06, 0.025), M.carbon, [0, -0.11, -0.055]);
    add(upper, `bicep_piston_${L}`, cyl(0.013, 0.013, 0.16, 12), M.metal, [s * 0.062, -0.13, -0.02]);
    glowMesh(upper, `bicep_light_${L}`, box(0.008, 0.05, 0.01), [s * 0.058, -0.08, 0.045]);
    const elbow = group(upper, `elbow_${L}`, [0, -0.26, 0]);
    add(elbow, `elbow_joint_${L}`, cyl(0.052, 0.052, 0.098, 24), M.metal, [0, 0, 0], [0, 0, Math.PI / 2]);
    glowMesh(elbow, `elbow_ring_${L}`, torus(0.055, 0.008, 26, 8), [s * 0.05, 0, 0], [0, Math.PI / 2, 0]);
    add(elbow, `elbow_cap_${L}`, plateGeo(0.1, 0.085, 0.055, 0.03), M.carbon, [0, 0.005, -0.055], [0, Math.PI, 0]);
    const fore = group(elbow, `forearm_${L}`, [0, -0.02, 0]);
    add(fore, `forearm_sleeve_${L}`, cyl(0.048, 0.042, 0.23, 20), M.suit, [0, -0.12, 0]);
    add(fore, `bracer_outer_${L}`, plateGeo(0.115, 0.2, 0.105, 0.03), M.ceramic, [0, -0.11, 0.005]);
    add(fore, `bracer_cuff_${L}`, plateGeo(0.12, 0.05, 0.115, 0.025), M.carbon, [0, -0.215, 0.005]);
    add(fore, `bracer_edge_${L}`, box(0.012, 0.13, 0.012), M.amber, [s * 0.062, -0.11, 0.035]);
    for (let i = 0; i < 3; i++) add(fore, `bracer_slat_${L}_${i}`, box(0.07, 0.01, 0.012), M.metal, [0, -0.06 - i * 0.03, 0.058]);
    if (s > 0) {
      add(fore, 'wrist_screen_housing', plateGeo(0.085, 0.075, 0.03, 0.014), M.carbon, [0, -0.14, 0.062], [0.12, 0, 0]);
      glowMesh(fore, 'wrist_screen', plateGeo(0.062, 0.052, 0.012, 0.008), [0, -0.14, 0.08], [0.12, 0, 0]);
    } else {
      add(fore, 'blade_housing', plateGeo(0.05, 0.14, 0.05, 0.016), M.carbon, [-0.06, -0.12, -0.04], [0, 0, 0.06]);
      add(fore, 'blade', plateGeo(0.022, 0.19, 0.02, 0.006), M.metal, [-0.062, -0.21, -0.045], [0, 0, 0.06]);
    }
    cable(fore, `forearm_hose_${L}`, [s * 0.045, -0.02, -0.03], [s * 0.03, -0.2, -0.04], 0.015, 0.008);
    const hand = group(fore, `hand_${L}`, [0, -0.26, 0]);
    add(hand, `wrist_joint_${L}`, cyl(0.036, 0.036, 0.04, 20), M.metal, [0, 0.01, 0]);
    add(hand, `palm_${L}`, plateGeo(0.086, 0.095, 0.045, 0.022), M.carbon, [0, -0.045, 0.004]);
    add(hand, `knuckle_guard_${L}`, plateGeo(0.09, 0.04, 0.055, 0.016), M.ceramic, [0, -0.088, 0.006]);
    add(hand, `thumb_base_${L}`, cyl(0.016, 0.014, 0.05, 12), M.carbon, [s * 0.05, -0.045, 0.02], [0, 0, s * 0.85]);
    add(hand, `thumb_tip_${L}`, cyl(0.013, 0.011, 0.045, 12), M.suit, [s * 0.072, -0.078, 0.026], [0.3, 0, s * 1.25]);
    for (let f = 0; f < 4; f++) {
      const fx = s * (0.031 - f * 0.021);
      add(hand, `finger_${L}_${f}_a`, cyl(0.012, 0.011, 0.046, 12), M.suit, [fx, -0.126, 0.016], [0.5, 0, 0]);
      add(hand, `finger_${L}_${f}_b`, cyl(0.011, 0.009, 0.038, 12), M.carbon, [fx, -0.158, 0.043], [1.25, 0, 0]);
    }
    limbs['upper_' + L] = upper; limbs['elbow_' + L] = elbow; limbs['hand_' + L] = hand; limbs['arm_' + L] = arm;
  }

  return root;
}
