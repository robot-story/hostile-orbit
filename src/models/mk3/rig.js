// Runtime articulation of the supplied OUTRIDER Mk III source. No baked presentation pose.
import * as THREE from 'three';
import { buildOutrider } from './outrider-model.js';
import { M, add, box, cyl, torus, plateGeo } from './ro-parts.js';
import { damp, clamp } from '../../core/mathx.js';

const FACES = { '#00e5ff': 'kestrel', '#ffb020': 'bastion', '#c44dff': 'wraith', '#7dff5a': 'jolt' };
export function recolor(root, color) {
  const materials = new Map();
  root.traverse(o => {
    if (!o.isMesh || !['neon_cyan', 'visor_glass', 'accent_amber'].includes(o.material.name)) return;
    const src = o.material;
    if (!materials.has(src)) {
      const m = src.clone(); m.color.set(color); m.emissive.set(color);
      m.emissiveIntensity = src.name === 'visor_glass' ? 0.65 : 1.1;
      materials.set(src, m);
    }
    o.material = materials.get(src);
  });
  return [...materials.values()];
}

export function buildMk3(model, opts = {}) {
  const source = buildOutrider(), B = model.bones, N = opts.neon || '#00e5ff';
  const nodes = new Map(); source.traverse(o => nodes.set(o.name, o));
  const get = name => nodes.get(name);
  model.robot = 'a'; model.mk3 = true; model.neonColor = N;
  model.face = opts.face || FACES[N.toLowerCase()] || 'kestrel';
  model.ballRadius = 0.36; model.ballRootY = 0.99;
  B.root.position.y = 0.99; B.spine.position.y = 0.10; B.chest.position.y = 0.13;
  B.neck.position.y = 0.30; B.head.position.y = 0.075;
  // Match the supplied articulated chain exactly; the IK reads these bone lengths.
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    B['shoulder' + side].position.set(sign * 0.225, 0.24, 0);
    B['upperArm' + side].position.set(sign * 0.018, -0.06, 0);
    B['forearm' + side].position.set(0, -0.26, 0);
    B['hand' + side].position.set(0, -0.28, 0);
  }
  const mount = (node, bone, offset = [0, 0, 0]) => {
    node.removeFromParent(); node.position.set(...offset); node.rotation.set(0, 0, 0); bone.add(node);
  };
  const head = get('head'), torso = get('torso'), pelvis = get('pelvis'), drive = get('drive_assembly');
  // Separate the ball from stator and suspension so only the tyre rolls.
  const ball = new THREE.Group(); ball.name = 'mk3_rolling_ball'; ball.userData.dynamic = true;
  for (const o of [...drive.children]) if (/^(drive_ball|ball_band|tread_stud)/.test(o.name)) ball.add(o);
  drive.add(ball); drive.userData.dynamic = true;
  model.root.add(drive); model.ball = ball; model.wheel = ball;
  model.ballRig = drive; // position is reset after the legacy squash layer
  const struts = ['l', 'r'].map(s => get('strut_' + s));
  const counterweights = ['l', 'r'].map(s => get('counterweight_' + s));
  const rollers = [];
  for (let i = 0; i < 3; i++) {
    const pod = get('roller_pod_' + i), pivot = new THREE.Group();
    pivot.name = 'roller_spin_' + i; pivot.position.y = -0.008; pivot.userData.dynamic = true; pod.add(pivot);
    for (const name of ['roller_wheel_', 'roller_tread_']) { const o = get(name + i); pivot.add(o); o.position.y = 0; }
    rollers.push(pivot);
  }
  [...struts, ...counterweights].forEach(o => { o.userData.dynamic = true; });
  const fingers = [];
  for (const side of ['L', 'R']) {
    const s = side.toLowerCase(), arm = get('arm_' + s), upper = get('upper_arm_' + s), elbow = get('elbow_' + s), hand = get('hand_' + s);
    // Extract distal groups first; retain the 2 cm elbow-to-bracer offset.
    mount(hand, B['hand' + side]); mount(elbow, B['forearm' + side]); mount(upper, B['upperArm' + side]); mount(arm, B['shoulder' + side]);
    for (let f = 0; f < 4; f++) {
      const a = hand.getObjectByName(`finger_${s}_${f}_a`), b = hand.getObjectByName(`finger_${s}_${f}_b`);
      const pivot = new THREE.Group(); pivot.position.set(a.position.x, -0.102, 0.007); pivot.userData.dynamic = true; pivot.name = `finger_hinge_${s}_${f}`; hand.add(pivot);
      for (const o of [a, b]) { o.position.sub(pivot.position); pivot.add(o); }
      fingers.push({ pivot, side, f });
    }
  }
  mount(pelvis, B.root); mount(torso, B.chest); mount(head, B.head);
  // Abdominal plates follow the waist independently of the aiming chest.
  model.root.updateMatrixWorld(true);
  for (const o of [...torso.children]) if (/^(waist_band|ab_segment|ab_glow)/.test(o.name)) B.spine.attach(o);
  for (const o of [...head.children]) if (o.name.startsWith('neck_')) B.neck.attach(o);
  if (model.face !== 'kestrel') {
    for (const n of ['visor_band', 'visor_slit']) head.getObjectByName(n)?.removeFromParent();
    const eye = (name, x, y, r) => {
      add(head, name + '_rim', torus(r + 0.006, 0.006, 24, 8), M.metal, [x, y, 0.137]);
      return add(head, name, cyl(r, r, 0.015, 24), M.glow, [x, y, 0.144], [Math.PI / 2, 0, 0]);
    };
    if (model.face === 'bastion') {
      add(head, 'welder_frame', plateGeo(0.19, 0.075, 0.045, 0.012), M.metal, [0, 0.045, 0.13]);
      add(head, 'welder_bar', box(0.156, 0.017, 0.013), M.glow, [0, 0.05, 0.158]);
      for (const x of [-0.052, 0, 0.052]) add(head, 'welder_divider', box(0.006, 0.028, 0.014), M.carbon, [x, 0.05, 0.163]);
    } else if (model.face === 'wraith') {
      eye('tri_eye_top', 0, 0.072, 0.017); eye('tri_eye_l', -0.044, 0.026, 0.013); eye('tri_eye_r', 0.044, 0.026, 0.013);
    } else { eye('cyclops_lens', 0, 0.045, 0.041); add(head, 'cyclops_pupil', cyl(0.014, 0.014, 0.018, 24), M.visor, [0, 0.045, 0.155], [Math.PI / 2, 0, 0]); }
  }
  const glows = recolor(model.root, N);
  const originalDispose = model.dispose.bind(model);
  model.dispose = () => { originalDispose(); model.root.traverse(o => { if (o.userData.merged) o.geometry?.dispose(); }); glows.forEach(m => m.dispose()); };
  // Preserve the reference's exposed rubber drive sphere in every mode.
  const stators = Array.from({ length: 8 }, (_, i) => get('stator_seg_' + i));
  stators.forEach(o => { o.userData.dynamic = true; });
  const statorRest = stators.map(o => o.position.clone());
  model.counterweights = counterweights;
  let time = 0, fold = 0, closed = 0, previousYaw = null;
  const axis = new THREE.Vector3(), q = new THREE.Quaternion(), weaponPos = new THREE.Vector3(), weaponQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
  model.motion = (vx, vz, dt, land = 0, yaw = 0, crouch = 0) => {
    time += dt;
    const state = model.animState || {}, sp = Math.hypot(vx, vz);
    const x = vx * Math.cos(yaw) - vz * Math.sin(yaw), z = vx * Math.sin(yaw) + vz * Math.cos(yaw);
    // Preserve world-space ball orientation through body turns; integrate travel in both axes.
    if (previousYaw != null) ball.quaternion.premultiply(q.setFromAxisAngle(axis.set(0, 1, 0), previousYaw - yaw));
    previousYaw = yaw;
    if (sp > 0.001) ball.quaternion.premultiply(q.setFromAxisAngle(axis.set(z, 0, -x).normalize(), sp * dt / 0.36));
    ball.scale.setScalar(1); drive.position.set(0, 0.36, 0); drive.rotation.set(0, 0, 0);
    const firing = state.aim > 0.5 || state.cover?.blind || (model.animator?.recoil || 0) > 0.08;
    const rolling = !state.dead && !state.grind && (model.sprintBall || state.roll != null);
    const target = state.dead ? 0.5 : rolling ? 1 : state.cover && !firing ? 0.65 : 0;
    fold = damp(fold, target, target ? 12 : 18, dt); model.fold = fold;
    B.root.position.y -= fold * 0.22;
    B.spine.rotation.x += fold * 0.55; B.chest.rotation.x += fold * 0.75; B.head.rotation.x -= fold * 0.25;
    B.spine.rotation.z -= clamp(x * 0.025, -0.16, 0.16);
    if (rolling || (state.cover && !firing)) {
      for (const s of ['L', 'R']) { B['upperArm' + s].rotation.x += fold * 0.6; B['forearm' + s].rotation.x -= fold * 0.5; }
    }
    closed = damp(closed, rolling ? 1 : 0, rolling ? 10 : 18, dt);
    // Transformer tuck: the pelvis drops behind the wheel, the chest folds over
    // its crown and the head nests at the front. All original armour stays visible.
    if (closed > 0.001) {
      B.root.rotation.x = THREE.MathUtils.lerp(B.root.rotation.x, 0, closed);
      B.root.position.y = THREE.MathUtils.lerp(B.root.position.y, 0.48, closed);
      B.root.scale.setScalar(1);
      B.spine.rotation.x = THREE.MathUtils.lerp(B.spine.rotation.x, 0.95, closed);
      B.chest.rotation.x = THREE.MathUtils.lerp(B.chest.rotation.x, 1.3, closed);
      B.neck.rotation.x *= 1 - closed;
      B.head.rotation.x = THREE.MathUtils.lerp(B.head.rotation.x, -2.25, closed);
      for (const s of ['L', 'R']) { B['upperArm' + s].rotation.set(-0.3 * closed, 0, (s === 'L' ? -1 : 1) * closed * 0.4); B['forearm' + s].rotation.x = -2.2 * closed; }
    }
    const ws = model.animator?.weaponSocket;
    if (ws) {
      ws.scale.setScalar(1);
      if (closed > 0.001) {
        model.root.updateMatrixWorld(true);
        weaponPos.set(-0.19, 0.56, 0.36 - (model.animator.recoil || 0) * 0.06); model.root.localToWorld(weaponPos); ws.parent.worldToLocal(weaponPos); ws.position.lerp(weaponPos, closed);
        model.root.getWorldQuaternion(weaponQ); weaponQ.multiply(q.setFromAxisAngle(axis.set(1,0,0), -(model.animator.aimPitch || 0) * 0.55 - (model.animator.recoil || 0) * 0.16));
        ws.parent.getWorldQuaternion(parentQ).invert(); weaponQ.premultiply(parentQ); ws.quaternion.slerp(weaponQ, closed);
        let grips; ws.traverse(o => { if (o.userData.gripR) grips = o.userData; });
        if (grips) { model.root.updateMatrixWorld(true); model.animator._ikArm('R', grips.gripR, closed); model.animator._ikArm('L', state.reload != null ? grips.reloadGrip || grips.gripL : grips.gripL, closed); }
      }
    }
    ball.scale.setScalar(1); drive.position.y = 0.36;
    stators.forEach((o, i) => { o.position.copy(statorRest[i]); });
    // Upright rail surfing keeps hands on the weapon and extends the balancing pods.
    if (state.grind) { B.spine.rotation.z += Math.sin(time * 5) * 0.055; B.root.position.y -= 0.08; }
    // Telescoping yokes track the saddle; the tyre stays in contact with the floor.
    const compression = clamp((B.root.position.y - 0.36) / 0.63, 0.4, 1.25);
    struts.forEach(o => { o.scale.y = compression; });
    rollers.forEach((o, i) => { o.rotation.x += (z * Math.cos(i * Math.PI * 2 / 3) + x * Math.sin(i * Math.PI * 2 / 3)) * dt / 0.05; });
    counterweights.forEach((o, i) => { o.rotation.y = (i ? -1 : 1) * (0.12 + fold * 0.6 + (state.grind ? 0.45 : 0)) + clamp(x * 0.035, -0.3, 0.3); o.rotation.x = 0.18 + Math.sin(time * 2 + i) * 0.025 + land * 0.12; });
    for (const { pivot, side, f } of fingers) {
      const open = state.interact || state.dead || (side === 'L' && state.reload != null);
      pivot.rotation.x = damp(pivot.rotation.x, open ? -0.4 : 0.18 + (side === 'R' && f === 0 ? (model.animator?.recoil || 0) * 0.18 : 0), 16, dt);
    }
    for (const m of glows) m.emissiveIntensity = state.dead ? 0.15 : 0.95 + Math.sin(time * 3) * 0.08 + Math.min(sp, 12) * 0.025 + land * 0.15;
  };
  return model;
}
