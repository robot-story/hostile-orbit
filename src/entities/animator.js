// Procedural character animation: pose targets per state, damped blending, additive gait/aim/recoil layers.
import * as THREE from 'three';
import { clamp, lerp, damp } from '../core/mathx.js';

const _e = new THREE.Euler();
const ZERO = [0, 0, 0];
const _ikT = new THREE.Vector3(), _ikH = new THREE.Vector3(), _ikM = new THREE.Matrix4(), _ikQ = new THREE.Quaternion(), _ikQ2 = new THREE.Quaternion(), _ikQb = new THREE.Quaternion(), _ikE = new THREE.Euler();

// Static poses: bone -> [rx, ry, rz]. Limb bones point down -y; negative x swings forward for the character facing +z.
const POSE = {
  idle: {
    spine: [0.02, 0, 0], chest: [0.02, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    upperArmL: [-1.15, 0.55, 0.25], forearmL: [-1.15, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-0.95, -0.35, -0.15], forearmR: [-1.35, 0.15, 0.0], handR: [0, 0, 0],
    thighL: [0.02, 0.06, 0.03], shinL: [0.04, 0, 0], footL: [0, 0, 0],
    thighR: [-0.02, -0.06, -0.03], shinR: [0.04, 0, 0], footR: [0, 0, 0],
  },
  aim: {
    spine: [0.0, 0.0, 0], chest: [0.0, -0.15, 0], neck: [0, 0.1, 0], head: [-0.1, 0.05, 0],
    upperArmL: [-1.35, 0.75, 0.15], forearmL: [-1.05, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-1.35, -0.25, -0.10], forearmR: [-1.15, 0.2, 0.0], handR: [0, 0, 0],
    thighL: [0.05, 0.05, 0.05], shinL: [0.1, 0, 0], footL: [0, 0, 0],
    thighR: [-0.1, -0.05, -0.05], shinR: [0.15, 0, 0], footR: [0, 0, 0],
  },
  sprint: {
    spine: [-0.38, 0, 0], chest: [-0.12, 0, 0], neck: [0.15, 0, 0], head: [0.2, 0, 0],
    upperArmL: [-0.38, 0.3, 0.3], forearmL: [-1.5, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-0.5, -0.25, -0.25], forearmR: [-1.3, 0.1, 0.0], handR: [0, 0, 0],
    thighL: [0, 0, 0.02], shinL: [0.2, 0, 0], footL: [0, 0, 0],
    thighR: [0, 0, -0.02], shinR: [0.2, 0, 0], footR: [0, 0, 0],
  },
  crouch: {
    spine: [-0.28, 0, 0], chest: [-0.05, 0, 0], neck: [0.18, 0, 0], head: [0.1, 0, 0],
    upperArmL: [-1.1, 0.6, 0.3], forearmL: [-1.2, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-0.9, -0.35, -0.15], forearmR: [-1.4, 0.15, 0.0], handR: [0, 0, 0],
    thighL: [-1.35, 0.2, 0.15], shinL: [1.95, 0, 0], footL: [-0.55, 0, 0],
    thighR: [-1.05, -0.25, -0.15], shinR: [1.95, 0, 0], footR: [-0.85, 0, 0],
  },
  coverHigh: { // standing, pressed against cover, weapon held up close to the chest
    spine: [0.05, 0, 0], chest: [0.05, 0.1, 0], neck: [0, -0.2, 0], head: [0, -0.3, 0],
    upperArmL: [-1.5, 0.9, 0.2], forearmL: [-1.6, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-1.6, -0.5, -0.3], forearmR: [-1.9, 0.2, 0.0], handR: [0, 0, 0],
    thighL: [0.05, 0.1, 0.05], shinL: [0.05, 0, 0], footL: [0, 0, 0],
    thighR: [-0.05, -0.1, -0.05], shinR: [0.05, 0, 0], footR: [0, 0, 0],
  },
  roll: {
    spine: [-0.9, 0, 0], chest: [-0.5, 0, 0], neck: [0.3, 0, 0], head: [0.2, 0, 0],
    upperArmL: [-1.9, 0.5, 0.4], forearmL: [-2.0, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-1.9, -0.5, -0.4], forearmR: [-2.0, 0.0, 0.0], handR: [0, 0, 0],
    thighL: [-2.0, 0.1, 0.1], shinL: [2.3, 0, 0], footL: [-0.5, 0, 0],
    thighR: [-2.0, -0.1, -0.1], shinR: [2.3, 0, 0], footR: [-0.5, 0, 0],
  },
  vault: {
    spine: [-0.6, 0, 0], chest: [-0.3, 0, 0], neck: [0.3, 0, 0], head: [0.2, 0, 0],
    upperArmL: [-2.2, 0.2, 0.9], forearmL: [-0.6, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-2.2, -0.2, -0.9], forearmR: [-0.6, 0.0, 0.0], handR: [0, 0, 0],
    thighL: [-1.7, 0.3, 0.3], shinL: [1.8, 0, 0], footL: [-0.4, 0, 0],
    thighR: [-0.6, -0.2, -0.2], shinR: [1.3, 0, 0], footR: [-0.2, 0, 0],
  },
  dead: {
    spine: [0.2, 0.3, 0.2], chest: [0.1, 0, 0], neck: [0.4, 0.3, 0], head: [0.3, 0, 0],
    upperArmL: [0.4, 0.2, 1.2], forearmL: [-0.4, 0, 0], handL: [0, 0, 0],
    upperArmR: [-1.8, -0.3, -1.0], forearmR: [-0.3, 0, 0], handR: [0, 0, 0],
    thighL: [-0.3, 0.3, 0.2], shinL: [0.9, 0, 0], footL: [0, 0, 0],
    thighR: [0.2, -0.3, -0.4], shinR: [0.3, 0, 0], footR: [0, 0, 0],
  },
  interact: {
    spine: [-0.15, 0, 0], chest: [-0.05, 0, 0], neck: [0.1, 0, 0], head: [0.1, 0, 0],
    upperArmL: [-1.6, 0.2, 0.2], forearmL: [-0.6, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-1.6, -0.2, -0.2], forearmR: [-0.6, 0.0, 0.0], handR: [0, 0, 0],
    thighL: [0.02, 0.06, 0.03], shinL: [0.04, 0, 0], footL: [0, 0, 0],
    thighR: [-0.02, -0.06, -0.03], shinR: [0.04, 0, 0], footR: [0, 0, 0],
  },
  weaponLow: { // relaxed hip carry (patrol)
    spine: [0.02, 0, 0], chest: [0.02, 0.1, 0], neck: [0, 0, 0], head: [0, 0, 0],
    upperArmL: [-0.7, 0.5, 0.35], forearmL: [-1.3, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-0.4, -0.3, -0.2], forearmR: [-1.1, 0.1, 0.0], handR: [0, 0, 0],
    thighL: [0.02, 0.06, 0.03], shinL: [0.04, 0, 0], footL: [0, 0, 0],
    thighR: [-0.02, -0.06, -0.03], shinR: [0.04, 0, 0], footR: [0, 0, 0],
  },
};
const BONE_NAMES = Object.keys(POSE.idle);
// The rig is right-handed with the figure's right at -x; poses were authored mirrored, so flip y/z rotations.
for (const pose of Object.values(POSE)) for (const k in pose) { pose[k] = [pose[k][0], -pose[k][1], -pose[k][2]]; }

export class CharacterAnimator {
  constructor(model) {
    this.model = model;
    this.bones = model.bones;
    this.cur = {}; for (const b of BONE_NAMES) this.cur[b] = [0, 0, 0];
    this.target = {}; for (const b of BONE_NAMES) this.target[b] = [0, 0, 0];
    this.phase = 0;       // gait phase (radians)
    this.rootY = 0; this.rootYTarget = 0;
    this.rootPitch = 0;   // roll animation spin
    this.lean = 0; this.leanTarget = 0;   // peek lean (z)
    this.aimPitch = 0;    // -1..1 (up positive)
    this.recoil = 0;      // additive kick
    this.hit = 0;         // hit reaction impulse
    this.hitDir = 0;
    this.breath = 0;
    this.speed = 0;       // 0..1 normalised locomotion speed
    this.strafe = 0;      // -1..1
    this.forward = 1;     // -1..1 (backpedal negative)
    this.bobAmp = 0;
    this.weaponSocket = new THREE.Object3D();
    this.weaponSocket.name = 'weaponHold';
    this.bones.chest.add(this.weaponSocket);
    this.weaponSocket.position.set(-0.17, 0.02, 0.22);
    if (model.torsoScale) this.weaponSocket.scale.setScalar(1 / model.torsoScale);
    this.weaponPose = { pos: new THREE.Vector3(-0.17, 0.02, 0.22), rot: new THREE.Euler(0, 0, 0) };
    this.weaponPoseTarget = { pos: new THREE.Vector3(-0.17, 0.02, 0.22), rot: new THREE.Euler(0, 0, 0) };
    this.blendRate = 12;
    this.footPhaseLast = 0;
    this.onFootstep = null;
  }
  /** Blend two poses by t into out */
  static mix(a, b, t, out) {
    for (const n of BONE_NAMES) { const pa = a[n] || ZERO, pb = b[n] || ZERO; const o = out[n]; o[0] = lerp(pa[0], pb[0], t); o[1] = lerp(pa[1], pb[1], t); o[2] = lerp(pa[2], pb[2], t); }
    return out;
  }
  /**
   * Update from a state descriptor:
   * { speed(0..1), strafe(-1..1), forward(-1..1), sprint(0..1), crouch(0..1), aim(0..1), cover:{high,peek(-1,0,1),over,blind}|null,
   *   roll(0..1 progress)|null, vault(progress)|null, dead:bool, interact:bool, aimPitch(-1..1), weaponLow(0..1), reload(0..1)|null }
   */
  update(dt, s) {
    const T = this.target;
    // Base locomotion pose: blend idle/aim/sprint/crouch
    let base = POSE.idle;
    const tmp = {}; for (const b of BONE_NAMES) tmp[b] = [0, 0, 0];
    CharacterAnimator.mix(POSE.idle, POSE.weaponLow, s.weaponLow || 0, tmp);
    CharacterAnimator.mix(tmp, POSE.aim, s.aim, T);
    if (s.sprint > 0) CharacterAnimator.mix(T, POSE.sprint, s.sprint, T);
    if (s.crouch > 0) CharacterAnimator.mix(T, POSE.crouch, s.crouch, T);
    let rootTarget = -0.46 * s.crouch;
    let leanTarget = 0;
    let blend = this.blendRate;
    if (s.cover) {
      const c = s.cover;
      if (c.high) { CharacterAnimator.mix(T, POSE.coverHigh, 1 - s.aim * 0.9, T); rootTarget = 0; }
      else { CharacterAnimator.mix(T, POSE.crouch, 1 - (c.over ? 0.85 : 0) * s.aim, T); rootTarget = -0.46 * (1 - (c.over ? 0.8 : 0) * s.aim); }
      if (c.peek) leanTarget = -c.peek * 0.35 * s.aim; // lean toward the side being peeked
      if (c.blind) {
        // arm raised over/around cover
        const arm = c.high ? [-2.6, -0.3, 0.2] : [-2.2, -0.2, -0.1];
        T.upperArmR = arm; T.forearmR = [-0.4, 0, 0]; T.upperArmL = [-1.3, 0.8, 0.3]; T.forearmL = [-1.5, 0, 0];
        T.head = [0.2, c.peek ? -c.peek * 0.6 : 0.1, 0];
      }
    }
    if (s.interact) { CharacterAnimator.mix(T, POSE.interact, 1, T); }
    if (s.roll != null) { CharacterAnimator.mix(T, POSE.roll, Math.sin(Math.min(1, s.roll) * Math.PI) ** 0.5, T); rootTarget = -0.5; blend = 20; }
    if (s.transform != null) { const k = Math.min(1, s.transform); CharacterAnimator.mix(T, POSE.roll, Math.sin(k * Math.PI) ** 0.4, T); rootTarget = -0.55 * Math.sin(k * Math.PI); blend = 26; }
    if (s.vault != null) { const t = s.vault; CharacterAnimator.mix(T, POSE.vault, Math.sin(Math.min(1, t) * Math.PI) ** 0.7, T); rootTarget = 0.15 * Math.sin(t * Math.PI); blend = 18; }
    if (s.jet) { const k = s.jet; // flight: legs tucked and trailing, torso leaning back, weapon still aimed
      T.thighL = [lerp(T.thighL[0], 0.55, k), T.thighL[1], T.thighL[2]]; T.thighR = [lerp(T.thighR[0], 0.45, k), T.thighR[1], T.thighR[2]];
      T.shinL = [lerp(T.shinL[0], 1.1, k), 0, 0]; T.shinR = [lerp(T.shinR[0], 1.2, k), 0, 0]; T.footL = [-0.4 * k, 0, 0]; T.footR = [-0.4 * k, 0, 0];
      T.spine = [lerp(T.spine[0], 0.22, k), T.spine[1], T.spine[2]]; rootTarget += 0.05 * k; }
    if (this.model?.ballRadius && s.crouch > 0.5 && !s.dead) { T.spine = [T.spine[0] + 0.28, T.spine[1], T.spine[2]]; T.chest = [T.chest[0] + 0.12, T.chest[1], T.chest[2]]; T.head = [T.head[0] - 0.2, T.head[1], T.head[2]]; }
    if (s.dead) { CharacterAnimator.mix(T, POSE.dead, 1, T); rootTarget = -0.85; blend = 6; }
    if (s.reload != null) {
      // left hand goes to magazine and back
      const t = s.reload; const k = Math.sin(Math.min(1, t) * Math.PI);
      T.upperArmL = [lerp(T.upperArmL[0], -0.9, k), lerp(T.upperArmL[1], 0.3, k), lerp(T.upperArmL[2], 0.4, k)];
      T.forearmL = [lerp(T.forearmL[0], -1.9, k), 0, 0];
      T.head = [lerp(T.head[0], 0.35, k), T.head[1], T.head[2]];
    }
    // damp current toward target
    const robotic = !!s.robotic;
    const k = 1 - Math.exp(-blend * (robotic ? 1.7 : 1) * dt);
    if (!this.vel) { this.vel = {}; for (const n of BONE_NAMES) this.vel[n] = [0, 0, 0]; }
    for (const n of BONE_NAMES) {
      const c = this.cur[n], t = T[n];
      if (!robotic) { c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k; continue; }
      // servo feel without jank: quicker approach with a critically-damped settle (no detents, no visible overshoot)
      for (let i = 0; i < 3; i++) { const d = t[i] - c[i]; c[i] += d * k; }
    }
    if (this.model?.ballRadius) rootTarget = Math.max(rootTarget, -0.24); // ball mode: torso cannot sink into the housing
    this.rootY = damp(this.rootY, rootTarget - (this.land || 0) * 0.22, 10, dt);
    this.lean = damp(this.lean, leanTarget, 10, dt);
    // gait
    this.speed = damp(this.speed, s.speed, 10, dt);
    this.strafe = damp(this.strafe, s.strafe || 0, 10, dt);
    this.forward = damp(this.forward, s.forward ?? 1, 10, dt);
    // continuous move direction in body space (x = right, z = forward), so legs step where the body is going
    this.mdx = damp(this.mdx ?? 0, s.moveDir?.x ?? 0, 9, dt);
    this.mdz = damp(this.mdz ?? 1, s.moveDir?.z ?? 1, 9, dt);
    const ballK = this.model?.ballRadius ? 1.7 : 1;
    this.accelLean = damp(this.accelLean ?? 0, (s.accel || 0) * ballK, 8, dt);
    this.turnLean = damp(this.turnLean ?? 0, (s.turn || 0) * ballK, 8, dt);
    this.land = damp(this.land ?? 0, (s.land || 0) * (s.robotic ? 1.4 : 1), s.land ? 30 : 6, dt);
    this.turnShuffle = damp(this.turnShuffle ?? 0, s.turning ? 1 : 0, 10, dt);
    const stride = s.sprint > 0.8 ? 1.6 : (s.sprint > 0.3 ? 1.4 : (s.crouch > 0.5 ? 1.0 : 1.25));
    // step length per state (metres per footfall); the phase advances with the real ground speed so feet stop sliding
    const stepLen = s.sprint > 0.8 ? 2.4 : (s.sprint > 0.3 ? 1.85 : (s.crouch > 0.5 ? 1.1 : 1.5));
    const groundSpeed = s.velocity != null ? s.velocity : this.speed * 9.4;
    const freq = groundSpeed > 0.05 ? Math.PI * groundSpeed / stepLen : (s.sprint > 0.8 ? 11.5 : s.sprint > 0.3 ? 9.8 : 8.5) * (s.crouch > 0.5 ? 0.85 : 1);
    if (s.phaseLock != null) this.phase = s.phaseLock;
    else if ((this.speed > 0.02 || this.turnShuffle > 0.2) && !s.dead && s.roll == null && s.vault == null) this.phase += dt * (this.speed > 0.02 ? (s.velocity != null ? freq : freq * clamp(this.speed, 0.35, 1)) : 6 * this.turnShuffle);
    // servo gait: sharpened sine so legs snap between poses like actuators, with a short dwell
    const rawSw = Math.sin(this.phase);
    const sw = Math.sign(rawSw) * Math.pow(Math.abs(rawSw), 0.55), sw2 = Math.sin(this.phase * 2);
    const amp = this.speed * stride * (s.cover ? 0.45 : 1) * 0.9;
    // fore/aft swing follows the forward component; sideways stepping follows the strafe component
    const legSwing = amp * 0.55 * (Math.abs(this.mdz) < 0.15 ? 0.15 * Math.sign(this.mdz || 1) : this.mdz);
    const sideStep = amp * 0.32 * this.mdx;
    const shuffle = this.turnShuffle * 0.12;
    const thighL = this.cur.thighL, thighR = this.cur.thighR, shinL = this.cur.shinL, shinR = this.cur.shinR;
    const bendL = Math.max(0, -sw) * amp * 0.9, bendR = Math.max(0, sw) * amp * 0.9;
    const strafeSpread = this.strafe * amp * 0.15;
    // arms counter-swing slightly (weapon held, so subtle) + torso twist
    const armSwing = amp * 0.12;
    this.bobAmp = damp(this.bobAmp, amp, 8, dt);
    const bob = Math.abs(sw2) * this.bobAmp * 0.02; // machines do not bounce much
    this.breath += dt;
    const breathe = Math.sin(this.breath * 1.1) * 0.005 * (1 - this.speed); // faint idle servo hum, not breathing
    // Hit reaction & recoil decay
    this.recoil = damp(this.recoil, 0, 18, dt);
    this.hit = damp(this.hit, 0, 9, dt);
    // Write bones
    const B = this.bones;
    const set = (name, x, y, z) => { B[name].rotation.set(x, y, z); };
    const c = this.cur;
    const sway = Math.sin(this.breath * 0.6) * 0.012 * (1 - this.speed); // idle weight shift
    const fz = -this.mdz; // body-space forward is -z
    const ballLean = this.model?.ballRadius ? 3.0 : 1;
    const fwdLean = -this.speed * (s.sprint > 0.8 ? 0.14 : 0.09) * ballLean * Math.max(0, fz) + this.speed * 0.05 * Math.max(0, -fz) - this.accelLean * 0.14 + this.land * 0.22;
    set('spine', c.spine[0] + this.hit * 0.25 + breathe + fwdLean, c.spine[1] + sw * amp * 0.06 + this.hit * this.hitDir * 0.2 + this.mdx * this.speed * 0.2, c.spine[2] + this.lean * 0.5 + this.strafe * amp * 0.05 - this.mdx * this.speed * 0.09 - this.turnLean * 0.16 * this.speed + sway);
    set('chest', c.chest[0] - this.aimPitch * 0.55 * (s.aim > 0 || s.cover ? 1 : 0.5) + this.recoil * 0.4 + breathe, c.chest[1] - sw * amp * 0.08, c.chest[2] + this.lean * 0.5);
    set('neck', c.neck[0], c.neck[1], c.neck[2]);
    // head is gyro-stabilised: counter the torso sway instead of following it
    set('head', c.head[0] - this.aimPitch * 0.25 + this.hit * 0.3 - fwdLean * 0.6, c.head[1] - sw * amp * 0.06 - this.mdx * this.speed * 0.2, c.head[2] - this.lean * 0.4 - this.lean * 0.5 + this.mdx * this.speed * 0.09 + this.turnLean * 0.12 * this.speed);
    set('upperArmL', c.upperArmL[0] - this.recoil * 0.6 + armSwing * sw, c.upperArmL[1], c.upperArmL[2]);
    set('forearmL', c.forearmL[0] - this.recoil * 0.5, c.forearmL[1], c.forearmL[2]);
    set('handL', c.handL[0], c.handL[1], c.handL[2]);
    set('upperArmR', c.upperArmR[0] - this.recoil * 0.8 - armSwing * sw, c.upperArmR[1], c.upperArmR[2]);
    set('forearmR', c.forearmR[0] - this.recoil * 0.4, c.forearmR[1], c.forearmR[2]);
    set('handR', c.handR[0], c.handR[1], c.handR[2]);
    set('thighL', thighL[0] - sw * legSwing + this.land * 0.55 + Math.max(0, sw) * shuffle, thighL[1], thighL[2] - strafeSpread - sw * sideStep);
    set('shinL', shinL[0] + bendL + this.land * 0.9 + Math.max(0, sw) * shuffle * 1.6, shinL[1], shinL[2]);
    set('footL', c.footL[0] + Math.max(0, -sw) * amp * -0.3, c.footL[1], c.footL[2]);
    set('thighR', thighR[0] + sw * legSwing + this.land * 0.55 + Math.max(0, -sw) * shuffle, thighR[1], thighR[2] + strafeSpread - sw * sideStep);
    set('shinR', shinR[0] + bendR + this.land * 0.9 + Math.max(0, -sw) * shuffle * 1.6, shinR[1], shinR[2]);
    set('footR', c.footR[0] + Math.max(0, sw) * amp * -0.3, c.footR[1], c.footR[2]);
    // slope foot planting: drop the pelvis to the lower foot, bend the knee of the higher foot (2-bone leg 0.46 + 0.46)
    let plant = 0;
    if (s.groundAt && !this.model?.ballRadius && !s.dead && s.roll == null && s.vault == null && s.transform == null && !s.jet) {
      const yaw = B.root.parent ? B.root.parent.rotation.y : 0; // model root yaw (facing = yaw + PI convention handled by caller)
      const sx = Math.cos(yaw), sz = -Math.sin(yaw);
      const hipOff = 0.14, base = s.groundAt(0, 0);
      const gL = s.groundAt(hipOff * sx, hipOff * sz) - base, gR = s.groundAt(-hipOff * sx, -hipOff * sz) - base;
      const lo = Math.min(gL, gR, 0), hi = Math.max(gL, gR);
      plant = clamp(lo, -0.35, 0);
      const liftL = clamp(gL - lo, 0, 0.45), liftR = clamp(gR - lo, 0, 0.45);
      this.plantL = damp(this.plantL ?? 0, liftL, 12, dt); this.plantR = damp(this.plantR ?? 0, liftR, 12, dt); this.plantY = damp(this.plantY ?? 0, plant, 12, dt);
      // knee bend that shortens the leg by `lift`: law of cosines on the 0.46/0.46 chain
      const kneeFor = (lift) => { const L = 0.92 - lift; const cosK = clamp((0.46 * 0.46 + 0.46 * 0.46 - L * L) / (2 * 0.46 * 0.46), -1, 1); return Math.PI - Math.acos(cosK); };
      const kL = kneeFor(this.plantL), kR = kneeFor(this.plantR);
      B.thighL.rotation.x -= kL * 0.5; B.shinL.rotation.x += kL; B.footL.rotation.x -= kL * 0.5;
      B.thighR.rotation.x -= kR * 0.5; B.shinR.rotation.x += kR; B.footR.rotation.x -= kR * 0.5;
    } else { this.plantY = damp(this.plantY ?? 0, 0, 12, dt); this.plantL = damp(this.plantL ?? 0, 0, 12, dt); this.plantR = damp(this.plantR ?? 0, 0, 12, dt); }
    const hover = this.model?.ballRadius ? 0.13 + Math.sin(this.breath * 2.3) * 0.015 + Math.sin(this.breath * 3.7) * 0.006 : 0;
    B.root.position.y = (this.model?.ballRadius ? this.model.ballRootY + hover : 0.98) + this.rootY + bob + (this.model?.ballRadius ? 0 : (this.plantY || 0));
    if (this.model?.ballCollar) this.model.ballCollar.position.y = this.model.ballRadius + hover + this.rootY * 0.6;
    if (this.model?.ball) { const cr = s.crouch > 0.5 ? 1 : 0; this.ballSquash = damp(this.ballSquash ?? 0, cr * 0.22 + (this.land || 0) * 0.14, 10, dt); const sq = this.ballSquash; this.model.ball.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5); if (this.model.ballRig) this.model.ballRig.position.y = -sq * this.model.ballRadius * 0.95; }
    if (s.roll != null) { const k = Math.min(1, s.roll); B.root.rotation.set(-k * Math.PI * 2, 0, 0); B.root.scale.setScalar(1); }
    else if (s.transform != null) {
      // transformer tuck: the frame folds into a compact block, spins once, and unfolds
      const k = Math.min(1, s.transform), c = Math.sin(k * Math.PI);
      B.root.rotation.set(-k * Math.PI * 2, c * 0.6, 0);
      B.root.scale.set(1 - 0.18 * c, 1 - 0.42 * c, 1 - 0.18 * c);
    }
    else { B.root.rotation.set(0, 0, 0); B.root.scale.setScalar(1); }
    if (s.dead) B.root.rotation.set(0, 0, 0);
    // footsteps
    const fp = Math.floor(this.phase / Math.PI);
    if (fp !== this.footPhaseLast) { this.footPhaseLast = fp; if (this.speed > 0.15 && this.onFootstep) this.onFootstep(this.speed); }
    // weapon socket: hip vs shoulder
    const wp = this.weaponPoseTarget;
    if (s.dead) { wp.pos.set(-0.2, -0.1, 0.1); wp.rot.set(0.6, -0.3, -0.8); }
    else if (s.cover?.blind) { wp.pos.set(s.cover.high ? -0.25 : -0.2, s.cover.high ? 0.55 : 0.5, 0.15); wp.rot.set(-0.15, s.cover.peek ? s.cover.peek * 0.7 : 0, 0); }
    else if (s.cover && s.aim < 0.5) { wp.pos.set(-0.14, 0.12, 0.18); wp.rot.set(-0.6, 0.9, -0.1); }
    else if (s.sprint > 0.5) { wp.pos.set(-0.15, -0.04, 0.24); wp.rot.set(-0.2, -0.22, 0); }
    else if (s.roll != null || s.vault != null) { wp.pos.set(-0.16, 0.05, 0.16); wp.rot.set(-0.5, -0.4, -0.2); }
    else if (s.reload != null) { wp.pos.set(-0.15, 0.02, 0.22); wp.rot.set(0.25, -0.35, -0.35); }
    else if (s.aim > 0.5) { wp.pos.set(-0.115, 0.145, 0.20); wp.rot.set(0, 0, 0); }
    else if (s.weaponLow > 0.5) { wp.pos.set(-0.17, -0.12, 0.2); wp.rot.set(-0.45, -0.35, -0.05); }
    else { wp.pos.set(-0.16, 0.03, 0.22); wp.rot.set(-0.06, -0.08, -0.02); }
    const ws = this.weaponSocket, cur = this.weaponPose;
    cur.pos.lerp(wp.pos, k); cur.rot.x = lerp(cur.rot.x, wp.rot.x, k); cur.rot.y = lerp(cur.rot.y, wp.rot.y, k); cur.rot.z = lerp(cur.rot.z, wp.rot.z, k);
    ws.position.copy(cur.pos); ws.rotation.set(cur.rot.x - this.recoil * 0.25, cur.rot.y, cur.rot.z);
    // muzzle climb via recoil kicks weapon up slightly
    ws.position.z -= this.recoil * 0.08;
    // Arm IK: plant hands on the weapon grips whenever a weapon is held and the arms are not doing something else
    // grip sockets may live on the weapon group itself or on a wrapper child; search the held object
    let grips = null; const held = ws.children[0];
    if (held) { if (held.userData?.gripR) grips = held.userData; else held.traverse((o) => { if (!grips && o.userData?.gripR) grips = o.userData; }); }
    const armsFree = s.dead || s.roll != null || s.transform != null || s.vault != null || s.interact || s.cover?.blind;
    if (grips && !armsFree) {
      this.bones.root.updateMatrixWorld(true);
      this._ikArm('R', grips.gripR, s.reload != null ? 0 : 1);
      this._ikArm('L', grips.gripL, s.reload != null ? 1 - Math.sin(Math.min(1, s.reload) * Math.PI) : 1);
    }
  }
  /** Two-bone analytic IK in the upper-arm parent frame. blend 0..1 mixes with the posed arm. */
  _ikArm(side, gripObj, blend) {
    if (blend <= 0) return;
    const B = this.bones; const up = B['upperArm' + side], fo = B['forearm' + side], ha = B['hand' + side];
    const a = Math.abs(fo.position.y) || 0.30, b = Math.abs(ha.position.y) || 0.27, handLen = 0.09 * (b / 0.27);
    const target = _ikT; gripObj.getWorldPosition(target);
    // into the upper arm's parent (shoulder) frame, then relative to the upper arm origin
    _ikM.copy(up.parent.matrixWorld).invert(); target.applyMatrix4(_ikM).sub(up.position);
    let d = target.length(); const reach = a + b + handLen - 0.02; if (d > reach) { target.multiplyScalar(reach / d); d = reach; }
    d = Math.max(0.12, d);
    const cosE = clamp((a * a + (b + handLen) * (b + handLen) - d * d) / (2 * a * (b + handLen)), -1, 1);
    const elbow = Math.acos(cosE);              // interior angle
    const bend = -(Math.PI - elbow);            // forearm rotation about x (negative = hands forward)
    // hand vector in upper-arm local before orienting
    const bb = b + handLen;
    _ikH.set(0, -a - bb * Math.cos(bend), -bb * Math.sin(bend));
    _ikQ.setFromUnitVectors(_ikH.clone().normalize(), target.clone().normalize());
    // roll elbows outward/down around the target axis for a natural hold
    _ikQ2.setFromAxisAngle(target.clone().normalize(), (side === 'R' ? 0.95 : -0.85));
    _ikQ.premultiply(_ikQ2);
    _ikQb.setFromEuler(up.rotation);
    up.quaternion.copy(_ikQb.slerp(_ikQ, blend));
    _ikE.set(bend, 0, 0); _ikQ.setFromEuler(_ikE); _ikQb.setFromEuler(fo.rotation);
    fo.quaternion.copy(_ikQb.slerp(_ikQ, blend));
    if (side === 'L') ha.rotation.set(0.35, 0.2, -0.9); else ha.rotation.set(0.3, -0.1, 0.45); // wrap the foregrip / pistol grip
  }
  kick(amount = 1) { this.recoil = Math.min(1.5, this.recoil + amount); }
  hitReact(dir = 0, amount = 1) { this.hit = Math.min(1.2, this.hit + amount); this.hitDir = dir; }
}
