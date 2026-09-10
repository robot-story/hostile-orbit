// Player robot frames: three procedural designs that ride on the standard soldier rig (bones drive rigid parts, so the
// animator, IK, weapon sockets and gore fallbacks are untouched). Each frame has its own locomotion flavour handled by
// `model.motion` (called every frame with the ground velocity):
//   a  OUTRIDER  torso on a single monowheel; spins, banks into turns, counterweights swing
//   b  HALO      legless torso on a ring of thrusters; hovers, tilts into motion, flames scale with speed
//   c  BULWARK   heavy biped; servo walk, amber joint rings pulse on footfalls
// Armour tiles come from OpenAI-generated seamless textures in public/textures/gen/tex_robot_*.jpg.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { damp, clamp } from '../core/mathx.js';

const _loader = new THREE.TextureLoader();
const _base = (import.meta.env.BASE_URL || './') + 'textures/gen/';
const _tex = {};
function tile(id, repeat = 1) {
  const key = id + ':' + repeat;
  if (!_tex[key]) { const t = _loader.load(_base + id + '.jpg'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(repeat, repeat); _tex[key] = t; }
  return _tex[key];
}
const _mats = {};
function armour(kind, tint = '#ffffff') {
  const key = kind + tint;
  if (_mats[key]) return _mats[key];
  const spec = { ceramic: ['tex_robot_ceramic', 0.55, 0.15, 2.2], carbon: ['tex_robot_carbon', 0.6, 0.45, 2.0], gunmetal: ['tex_robot_gunmetal', 0.5, 0.7, 1.8] }[kind];
  const m = new THREE.MeshStandardMaterial({ map: tile(spec[0], spec[3]), roughness: spec[1], metalness: spec[2], color: tint });
  _mats[key] = m; return m;
}
const neon = (c, i = 1.6) => Mat.neon(c, i);
const neonOwn = (c, i = 1.6) => Mat.neon(c, i).clone(); // animated per instance
const glowOwn = (c, o) => Mat.glowAdditive(c, o).clone();
const dark = () => Mat.darkMetal();

// ------------------------------------------------------------------ part helpers (bone-local placement)
function add(bone, mesh, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  mesh.position.set(...pos); mesh.rotation.set(...rot); if (scale !== 1) mesh.scale.setScalar(scale);
  mesh.castShadow = true; mesh.receiveShadow = true; bone.add(mesh); return mesh;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sphere = (r, m, seg = 20) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
const torus = (R, r, m, seg = 40) => new THREE.Mesh(new THREE.TorusGeometry(R, r, 10, seg), m);
const capsule = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m);
/** Chamfered plate: a box with its edges bevelled by scaling a second, slightly smaller box outward. */
function plate(w, h, d, m, bevel = 0.02) { const g = new THREE.Group(); g.add(box(w - bevel * 2, h, d - bevel * 2, m)); g.add(box(w, h - bevel * 2, d - bevel * 2, m)); g.add(box(w - bevel * 2, h - bevel * 2, d, m)); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }
const strip = (len, c, thick = 0.018, i = 1.8) => { const s = box(len, thick, thick * 0.7, neon(c, i)); s.castShadow = false; return s; };

/** Shared arm build: layered upper arm, forearm plate with a light channel, articulated hand block. */
function buildArms(B, P) {
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    // shoulder pauldron
    add(B['shoulder' + side], plate(0.22, 0.14, 0.26, P.primary, 0.025), [sx * 0.05, 0.04, 0]);
    add(B['shoulder' + side], strip(0.16, P.accent), [sx * 0.05, 0.115, 0.06], [0, 0, 0]);
    // upper arm: capsule core + outer plate
    add(B['upperArm' + side], capsule(0.06, 0.16, P.secondary), [0, -0.15, 0]);
    add(B['upperArm' + side], plate(0.11, 0.2, 0.13, P.primary, 0.015), [sx * 0.035, -0.16, 0]);
    // elbow joint ring
    const ring = add(B['forearm' + side], torus(0.055, 0.016, neonOwn(P.joint, 1.4), 24), [0, 0.0, 0], [0, Math.PI / 2, 0]); ring.castShadow = false; P.joints.push(ring);
    // forearm: box + channel light + wrist collar
    add(B['forearm' + side], box(0.1, 0.24, 0.12, P.secondary), [0, -0.14, 0]);
    add(B['forearm' + side], plate(0.12, 0.18, 0.08, P.primary, 0.015), [0, -0.13, 0.05]);
    add(B['forearm' + side], strip(0.16, P.accent, 0.014), [0, -0.13, 0.095], [0, 0, Math.PI / 2]);
    add(B['forearm' + side], cyl(0.05, 0.055, 0.04, dark(), 12), [0, -0.26, 0]);
    // hand
    add(B['hand' + side], box(0.08, 0.1, 0.09, P.secondary), [0, -0.05, 0.01]);
    for (let f = 0; f < 3; f++) add(B['hand' + side], box(0.02, 0.06, 0.02, dark()), [-0.025 + f * 0.025, -0.12, 0.03], [0.5, 0, 0]);
  }
}

/** Shared torso core (spine/chest) with per-design plating on top. */
function buildCore(B, P) {
  add(B.spine, box(0.3, 0.2, 0.22, P.secondary), [0, 0.02, 0]);              // abdomen
  add(B.spine, strip(0.2, P.accent, 0.012, 1.2), [0, 0.0, 0.115]);
  add(B.chest, box(0.4, 0.3, 0.28, P.secondary), [0, 0.1, 0]);                // ribcage block
  add(B.chest, plate(0.22, 0.24, 0.14, P.secondary, 0.02), [0, 0.1, -0.16]);  // backpack
  add(B.chest, cyl(0.05, 0.05, 0.16, dark(), 8), [-0.1, 0.12, -0.24], [0.2, 0, 0]);
  add(B.chest, cyl(0.05, 0.05, 0.16, dark(), 8), [0.1, 0.12, -0.24], [0.2, 0, 0]);
  add(B.neck, cyl(0.07, 0.08, 0.1, dark(), 12), [0, 0.0, 0]);
}

// ------------------------------------------------------------------ A. OUTRIDER (monowheel)
function buildOutrider(model) {
  const B = model.bones; const P = { primary: armour('ceramic'), secondary: armour('carbon'), accent: COLORS.cyan, joint: COLORS.cyan, joints: [] };
  buildCore(B, P); buildArms(B, P);
  // chest: two angled ceramic plates over a hex reactor
  add(B.chest, plate(0.46, 0.2, 0.12, P.primary, 0.025), [0, 0.2, 0.14], [0.18, 0, 0]);
  add(B.chest, plate(0.42, 0.16, 0.1, P.primary, 0.025), [0, 0.02, 0.15], [-0.25, 0, 0]);
  const reactor = add(B.chest, cyl(0.06, 0.06, 0.04, neonOwn(P.accent, 2.4), 6), [0, 0.11, 0.2], [Math.PI / 2, 0, 0]); reactor.castShadow = false; model.reactor = reactor;
  add(B.chest, torus(0.075, 0.012, dark(), 6), [0, 0.11, 0.2]);
  // helmet: chamfered shell, visor slit, cheek vents
  add(B.head, plate(0.24, 0.24, 0.27, P.primary, 0.03), [0, 0.12, 0.0]);
  add(B.head, box(0.26, 0.05, 0.02, neon(P.accent, 2.2)), [0, 0.13, 0.135]).castShadow = false;
  add(B.head, box(0.2, 0.08, 0.2, P.secondary), [0, 0.02, 0.0]);
  // monowheel: tyre + hub + spoke lights + rim ring. The wheel spins about its local X (axle) inside a rig that banks.
  model.hideLimb('legL'); model.hideLimb('legR');
  const R = 0.5; model.ballRadius = R; model.ballRootY = R * 2 + 0.06; B.root.position.y = model.ballRootY; model.root.updateWorldMatrix(true, true);
  const wheel = new THREE.Group(); wheel.name = 'wheel';
  const tyre = torus(R - 0.1, 0.11, new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.85, metalness: 0.05 }), 48); tyre.rotation.y = Math.PI / 2; wheel.add(tyre);
  for (let i = 0; i < 12; i++) { const tread = box(0.14, 0.05, 0.03, new THREE.MeshStandardMaterial({ color: '#0d0e11', roughness: 0.9 })); const a = (i / 12) * Math.PI * 2; tread.position.set(0, Math.sin(a) * (R + 0.005), Math.cos(a) * (R + 0.005)); tread.rotation.x = -a; wheel.add(tread); }
  const rim = torus(R - 0.19, 0.012, neon(P.accent, 2.2), 48); rim.rotation.y = Math.PI / 2; rim.castShadow = false; wheel.add(rim);
  const hub = cyl(0.14, 0.14, 0.26, armour('gunmetal'), 20); hub.rotation.z = Math.PI / 2; wheel.add(hub);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const spoke = box(0.05, 0.05, R - 0.24, dark()); spoke.position.set(0, Math.sin(a) * (R - 0.22) * 0.5, Math.cos(a) * (R - 0.22) * 0.5); spoke.rotation.x = -a; wheel.add(spoke); const led = box(0.06, 0.02, 0.06, neon(P.accent, 1.5)); led.position.set(0.14, Math.sin(a) * 0.09, Math.cos(a) * 0.09); led.castShadow = false; wheel.add(led); }
  const hubCap = cyl(0.05, 0.05, 0.3, neon(P.accent, 1.2), 12); hubCap.rotation.z = Math.PI / 2; hubCap.castShadow = false; wheel.add(hubCap);
  const roll = new THREE.Group(); roll.add(wheel); roll.position.y = R;
  const rig = new THREE.Group(); rig.name = 'ballRig'; rig.add(roll);
  // yoke: hangs from the torso (collar), two fork arms reach down around the wheel to the axle, counterweights behind
  const collar = new THREE.Group(); collar.name = 'collar';
  const seat = cyl(0.19, 0.24, 0.16, armour('gunmetal'), 12); seat.position.y = 0.02; collar.add(seat);
  const seatLip = torus(0.2, 0.014, neon(P.accent, 1.4), 24); seatLip.rotation.x = Math.PI / 2; seatLip.position.y = 0.1; seatLip.castShadow = false; collar.add(seatLip);
  for (const sx of [-1, 1]) { const fork = box(0.06, R * 1.15, 0.12, armour('gunmetal')); fork.position.set(sx * 0.2, -R * 0.55, 0); collar.add(fork); const knuckle = cyl(0.07, 0.07, 0.06, dark(), 12); knuckle.rotation.z = Math.PI / 2; knuckle.position.set(sx * 0.2, -R * 1.02 - 0.02, 0); collar.add(knuckle); }
  const cw = []; for (const sx of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(sx * 0.17, -0.02, -0.14); const bar = box(0.05, 0.05, 0.26, dark()); bar.position.z = -0.13; arm.add(bar); const pod = capsule(0.06, 0.1, armour('carbon')); pod.rotation.x = Math.PI / 2; pod.position.z = -0.3; arm.add(pod); const lamp = sphere(0.025, neon(COLORS.redOrange, 2), 10); lamp.position.set(0, 0, -0.39); lamp.castShadow = false; arm.add(lamp); collar.add(arm); cw.push(arm); }
  collar.position.y = R; rig.add(collar);
  model.root.add(rig);
  model.ball = wheel; model.ballRig = rig; model.ballCollar = collar; model.wheel = wheel; model.counterweights = cw; model.robot = 'a';
  let lean = 0, spinV = 0;
  model.motion = (vx, vz, dt, land, rootYaw, crouch) => {
    // forward component spins the wheel; lateral component banks the whole rig and swings the counterweights
    const fx = -Math.sin(rootYaw), fz = -Math.cos(rootYaw); const fwd = vx * fx + vz * fz; const lat = vx * fz * -1 + vz * fx; // right-handed lateral
    spinV = damp(spinV, fwd, 12, dt); wheel.rotation.x -= spinV * dt / R;
    lean = damp(lean, clamp(lat * 0.09, -0.35, 0.35), 6, dt); rig.rotation.z = lean; rig.rotation.x = clamp(-fwd * 0.012, -0.08, 0.08);
    for (let i = 0; i < 2; i++) cw[i].rotation.y = lean * (i ? -1.6 : 1.6) + Math.sin(performance.now() * 0.002 + i) * 0.04;
    if (model.reactor) model.reactor.material.emissiveIntensity = 2 + Math.sin(performance.now() * 0.006) * 0.4 + Math.abs(fwd) * 0.08;
    void land; void crouch;
  };
  return model;
}

// ------------------------------------------------------------------ B. HALO (hover ring)
function buildHalo(model) {
  const B = model.bones; const P = { primary: armour('carbon'), secondary: armour('gunmetal', '#9aa0aa'), accent: COLORS.cyan, joint: COLORS.cyan, joints: [] };
  buildCore(B, P); buildArms(B, P);
  // layered chest: three stepped carbon plates with cyan seam lines, orange chevrons on the pauldrons
  for (let i = 0; i < 3; i++) add(B.chest, plate(0.44 - i * 0.06, 0.09, 0.1, P.primary, 0.02), [0, 0.02 + i * 0.09, 0.15 + i * 0.01], [0.1, 0, 0]);
  add(B.chest, strip(0.3, P.accent, 0.012), [0, 0.07, 0.215]); add(B.chest, strip(0.22, P.accent, 0.012), [0, 0.16, 0.22]);
  for (const sx of [-1, 1]) { const chev = box(0.08, 0.03, 0.02, neon('#ff8a1f', 1.6)); chev.position.set(sx * 0.29, 0.29, 0.08); chev.rotation.z = sx * 0.6; chev.castShadow = false; B.chest.add(chev); }
  // dome helmet with a wide visor band
  add(B.head, sphere(0.15, P.primary, 24), [0, 0.1, 0]);
  const band = add(B.head, torus(0.135, 0.02, neon(P.accent, 2.4), 32), [0, 0.11, 0.02], [Math.PI / 2, 0, 0]); band.castShadow = false; band.scale.set(1, 1, 0.55); band.position.z = 0.03;
  add(B.head, box(0.22, 0.06, 0.16, P.secondary), [0, -0.01, -0.02]);
  // hover skirt: ring + six thruster pods with flames, hung from the pelvis so it floats with the torso
  model.hideLimb('legL'); model.hideLimb('legR');
  model.ballRadius = 0.42; model.ballRootY = 0.98; B.root.position.y = model.ballRootY; model.root.updateWorldMatrix(true, true);
  const skirt = new THREE.Group(); skirt.name = 'skirt'; skirt.position.y = -0.2;
  const ring = torus(0.4, 0.12, P.primary, 40); ring.rotation.x = Math.PI / 2; skirt.add(ring);
  const top = cyl(0.42, 0.34, 0.1, P.secondary, 24); top.position.y = 0.09; skirt.add(top);
  const lip = torus(0.47, 0.012, neon(P.accent, 1.8), 40); lip.rotation.x = Math.PI / 2; lip.position.y = 0.05; lip.castShadow = false; skirt.add(lip);
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2; const pod = new THREE.Group(); pod.position.set(Math.cos(a) * 0.34, -0.12, Math.sin(a) * 0.34); pod.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    const bell = cyl(0.07, 0.1, 0.22, P.secondary, 12); bell.position.y = -0.02; pod.add(bell);
    const throat = cyl(0.06, 0.06, 0.02, neon(P.accent, 2.5), 12); throat.position.y = -0.14; throat.castShadow = false; pod.add(throat);
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.085, 0.42, 10, 1, true), glowOwn(P.accent, 0.55)); flame.position.y = -0.36; flame.castShadow = false; pod.add(flame);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.04, 0.3, 8, 1, true), glowOwn('#ffffff', 0.5)); core.position.y = -0.3; core.castShadow = false; pod.add(core);
    skirt.add(pod); flames.push({ flame, core, a });
  }
  B.root.add(skirt);
  model.skirt = skirt; model.flames = flames; model.robot = 'b';
  let tiltX = 0, tiltZ = 0, thrust = 0;
  model.motion = (vx, vz, dt, land, rootYaw, crouch) => {
    const c = Math.cos(rootYaw), s = Math.sin(rootYaw); const lx = vx * c - vz * s, lz = vx * s + vz * c; // into root-local
    const sp = Math.hypot(vx, vz);
    tiltX = damp(tiltX, clamp(-lz * 0.05, -0.28, 0.28), 5, dt); tiltZ = damp(tiltZ, clamp(lx * 0.05, -0.28, 0.28), 5, dt);
    skirt.rotation.set(tiltX, 0, tiltZ);
    thrust = damp(thrust, 0.55 + sp * 0.12 + (land || 0) * 0.8 - crouch * 0.3, 8, dt);
    const t = performance.now() * 0.001;
    for (const f of flames) { const flick = 0.85 + Math.sin(t * 37 + f.a * 9) * 0.1 + Math.sin(t * 61 + f.a * 3) * 0.05; const k = thrust * flick; f.flame.scale.set(k * 0.9, k, k * 0.9); f.core.scale.set(k, k * 1.1, k); f.flame.material.opacity = clamp(0.3 + k * 0.3, 0, 0.9); }
  };
  return model;
}

// ------------------------------------------------------------------ C. BULWARK (heavy walker)
function buildBulwark(model) {
  const B = model.bones; const P = { primary: armour('ceramic', '#d8d4c8'), secondary: armour('gunmetal'), accent: COLORS.cyan, joint: '#ff8a1f', joints: [] };
  buildCore(B, P); buildArms(B, P);
  // tank chest: wide ceramic plates, grille, thick pauldrons
  add(B.chest, plate(0.56, 0.26, 0.16, P.primary, 0.03), [0, 0.14, 0.12], [0.12, 0, 0]);
  add(B.chest, plate(0.5, 0.14, 0.12, P.primary, 0.03), [0, -0.04, 0.14]);
  for (let i = 0; i < 3; i++) add(B.chest, strip(0.16 - i * 0.03, P.accent, 0.014, 2), [0, 0.02 + i * 0.035, 0.21]);
  for (const sx of [-1, 1]) { add(B['shoulder' + (sx > 0 ? 'L' : 'R')], plate(0.3, 0.2, 0.32, P.primary, 0.035), [sx * 0.09, 0.08, 0]); }
  // squat sensor head with three eyes, no visible neck
  add(B.head, plate(0.26, 0.18, 0.24, P.primary, 0.03), [0, 0.07, 0.02]);
  for (let i = 0; i < 3; i++) { const eye = sphere(0.02, neon(P.accent, 2.6), 8); eye.position.set(-0.05 + i * 0.05, 0.08, 0.145); eye.castShadow = false; B.head.add(eye); }
  add(B.head, box(0.2, 0.06, 0.1, P.secondary), [0, -0.03, 0.06]);
  // heavy legs: thigh block + knee cap, shin with pistons, wide foot; amber joint rings that pulse on footfalls
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    add(B['thigh' + side], box(0.2, 0.36, 0.24, P.secondary), [0, -0.22, 0]);
    add(B['thigh' + side], plate(0.22, 0.24, 0.1, P.primary, 0.02), [0, -0.2, 0.13]);
    add(B['thigh' + side], cyl(0.03, 0.03, 0.3, dark(), 8), [sx * 0.11, -0.28, -0.06], [0.2, 0, 0]);
    const knee = add(B['shin' + side], torus(0.08, 0.02, neonOwn(P.joint, 1.3), 24), [0, 0.0, 0], [0, Math.PI / 2, 0]); knee.castShadow = false; P.joints.push(knee);
    add(B['shin' + side], cyl(0.08, 0.08, 0.1, dark(), 12), [0, 0, 0], [0, 0, Math.PI / 2]);
    add(B['shin' + side], box(0.16, 0.34, 0.18, P.secondary), [0, -0.24, 0]);
    add(B['shin' + side], plate(0.18, 0.28, 0.08, P.primary, 0.02), [0, -0.22, 0.11]);
    for (const px of [-0.09, 0.09]) add(B['shin' + side], cyl(0.022, 0.022, 0.3, armour('gunmetal', '#c0c4cc'), 8), [px, -0.2, -0.08]);
    add(B['foot' + side], box(0.22, 0.1, 0.34, P.secondary), [0, -0.05, 0.05]);
    add(B['foot' + side], plate(0.2, 0.06, 0.16, P.primary, 0.015), [0, 0.0, 0.14]);
    add(B['foot' + side], strip(0.18, P.accent, 0.012, 1.2), [0, -0.07, 0.22]);
  }
  model.robot = 'c'; model.joints = P.joints;
  let pulse = 0, lastPhase = 0;
  model.motion = (vx, vz, dt, land, rootYaw, crouch) => {
    const sp = Math.hypot(vx, vz);
    // joint rings pulse on each footfall (animator phase crosses a half-turn) and glow harder under load
    const ph = model.animator ? Math.floor(model.animator.phase / Math.PI) : 0; if (ph !== lastPhase && sp > 0.5) { lastPhase = ph; pulse = 1; }
    pulse = damp(pulse, 0, 6, dt);
    const it = 1.1 + pulse * 1.6 + sp * 0.05 + (land || 0) * 1.5;
    for (const j of P.joints) j.material.emissiveIntensity = it;
    void rootYaw; void crouch;
  };
  return model;
}

export const ROBOTS = { a: { id: 'a', name: 'OUTRIDER', build: buildOutrider, blurb: 'Monowheel frame. Fast, banks into turns, counterweight arms.' }, b: { id: 'b', name: 'HALO', build: buildHalo, blurb: 'Hover frame. Six-pod thruster skirt, tilts into motion.' }, c: { id: 'c', name: 'BULWARK', build: buildBulwark, blurb: 'Heavy walker. Servo stride, amber load rings.' } };

/** Decorate a freshly built procedural soldier model (zero pose) with one of the robot frames. */
export function applyRobot(model, kind) {
  const def = ROBOTS[kind]; if (!def || model.custom) return model;
  for (const n in model.bones) model.bones[n].rotation.set(0, 0, 0);
  for (const m of model.meshes) m.visible = false;
  def.build(model);
  // player code toggles `model.custom.visible` for the scope; collect every rigid part so that still works
  const parts = []; model.root.traverse((o) => { if (o.isMesh && !model.meshes.includes(o)) parts.push(o); });
  model.custom = { get visible() { return parts[0]?.visible ?? true; }, set visible(v) { for (const p of parts) p.visible = v; } };
  model.customMeshes = parts; model.robotName = def.name;
  return model;
}

/** Which robot frame the player uses: URL `?robot=a|b|c` wins, then the saved choice, else null (Meshy vanguard body). */
export function selectedRobot() {
  try { const q = new URLSearchParams(location.search).get('robot'); if (q && ROBOTS[q]) return q; } catch { /* ignore */ }
  try { const s = localStorage.getItem('hostile-orbit.robot'); if (s && ROBOTS[s]) return s; } catch { /* ignore */ }
  return null;
}
