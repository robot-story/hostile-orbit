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
    upperArmL: [-0.55, 0.35, 0.35], forearmL: [-1.6, 0.0, 0.0], handL: [0, 0, 0],
    upperArmR: [-0.75, -0.3, -0.3], forearmR: [-1.4, 0.1, 0.0], handR: [0, 0, 0],
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
    if (s.dead) { CharacterAnimator.mix(T, POSE.dead, 1, T); rootTarget = -0.85; blend = 6; }
    if (s.reload != null) {
      // left hand goes to magazine and back
      const t = s.reload; const k = Math.sin(Math.min(1, t) * Math.PI);
      T.upperArmL = [lerp(T.upperArmL[0], -0.9, k), lerp(T.upperArmL[1], 0.3, k), lerp(T.upperArmL[2], 0.4, k)];
      T.forearmL = [lerp(T.forearmL[0], -1.9, k), 0, 0];
      T.head = [lerp(T.head[0], 0.35, k), T.head[1], T.head[2]];
    }
    // damp current toward target
    const k = 1 - Math.exp(-blend * dt);
    for (const n of BONE_NAMES) { const c = this.cur[n], t = T[n]; c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k; }
    this.rootY = damp(this.rootY, rootTarget, 10, dt);
    this.lean = damp(this.lean, leanTarget, 10, dt);
    // gait
    this.speed = damp(this.speed, s.speed, 10, dt);
    this.strafe = damp(this.strafe, s.strafe || 0, 10, dt);
    this.forward = damp(this.forward, s.forward ?? 1, 10, dt);
    const stride = s.sprint > 0.8 ? 1.6 : (s.sprint > 0.3 ? 1.4 : (s.crouch > 0.5 ? 1.0 : 1.25));
    const freq = (s.sprint > 0.8 ? 11.5 : s.sprint > 0.3 ? 9.8 : 8.5) * (s.crouch > 0.5 ? 0.85 : 1);
    if (this.speed > 0.02 && !s.dead && s.roll == null && s.vault == null) this.phase += dt * freq * clamp(this.speed, 0.35, 1);
    // servo gait: sharpened sine so legs snap between poses like actuators, with a short dwell
    const rawSw = Math.sin(this.phase);
    const sw = Math.sign(rawSw) * Math.pow(Math.abs(rawSw), 0.55), sw2 = Math.sin(this.phase * 2);
    const amp = this.speed * stride * (s.cover ? 0.45 : 1) * 0.9;
    const dirSign = this.forward >= 0 ? 1 : -1;
    // apply legs gait (additive)
    const legSwing = amp * 0.55 * dirSign;
    const thighL = this.cur.thighL, thighR = this.cur.thighR, shinL = this.cur.shinL, shinR = this.cur.shinR;
    const bendL = Math.max(0, -sw) * amp * 0.9, bendR = Math.max(0, sw) * amp * 0.9;
    const strafeSpread = this.strafe * amp * 0.35;
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
    set('spine', c.spine[0] + this.hit * 0.25 + breathe, c.spine[1] + sw * amp * 0.06 + this.hit * this.hitDir * 0.2, c.spine[2] + this.lean * 0.5 + this.strafe * amp * 0.05);
    set('chest', c.chest[0] - this.aimPitch * 0.55 * (s.aim > 0 || s.cover ? 1 : 0.5) + this.recoil * 0.4 + breathe, c.chest[1] - sw * amp * 0.08, c.chest[2] + this.lean * 0.5);
    set('neck', c.neck[0], c.neck[1], c.neck[2]);
    // head is gyro-stabilised: counter the torso sway instead of following it
    set('head', c.head[0] - this.aimPitch * 0.25 + this.hit * 0.3, c.head[1] - sw * amp * 0.06, c.head[2] - this.lean * 0.4 - this.lean * 0.5);
    set('upperArmL', c.upperArmL[0] - this.recoil * 0.6 + armSwing * sw, c.upperArmL[1], c.upperArmL[2]);
    set('forearmL', c.forearmL[0] - this.recoil * 0.5, c.forearmL[1], c.forearmL[2]);
    set('handL', c.handL[0], c.handL[1], c.handL[2]);
    set('upperArmR', c.upperArmR[0] - this.recoil * 0.8 - armSwing * sw, c.upperArmR[1], c.upperArmR[2]);
    set('forearmR', c.forearmR[0] - this.recoil * 0.4, c.forearmR[1], c.forearmR[2]);
    set('handR', c.handR[0], c.handR[1], c.handR[2]);
    set('thighL', thighL[0] - sw * legSwing, thighL[1], thighL[2] - strafeSpread);
    set('shinL', shinL[0] + bendL, shinL[1], shinL[2]);
    set('footL', c.footL[0] + Math.max(0, -sw) * amp * -0.3, c.footL[1], c.footL[2]);
    set('thighR', thighR[0] + sw * legSwing, thighR[1], thighR[2] + strafeSpread);
    set('shinR', shinR[0] + bendR, shinR[1], shinR[2]);
    set('footR', c.footR[0] + Math.max(0, sw) * amp * -0.3, c.footR[1], c.footR[2]);
    B.root.position.y = 0.98 + this.rootY + bob;
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
    else if (s.sprint > 0.5) { wp.pos.set(-0.15, -0.02, 0.24); wp.rot.set(-0.35, -0.25, 0); }
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
    const weapon = ws.children[0]?.children?.[0] || ws.children[0];
    const grips = weapon?.userData?.gripR ? weapon.userData : (weapon?.children?.[0]?.userData?.gripR ? weapon.children[0].userData : null);
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
    const a = 0.30, b = 0.27, handLen = 0.09;
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
    _ikQ2.setFromAxisAngle(target.clone().normalize(), (side === 'R' ? 0.55 : -0.45));
    _ikQ.premultiply(_ikQ2);
    _ikQb.setFromEuler(up.rotation);
    up.quaternion.copy(_ikQb.slerp(_ikQ, blend));
    _ikE.set(bend, 0, 0); _ikQ.setFromEuler(_ikE); _ikQb.setFromEuler(fo.rotation);
    fo.quaternion.copy(_ikQb.slerp(_ikQ, blend));
    ha.rotation.set(0.3, 0, 0);
  }
  kick(amount = 1) { this.recoil = Math.min(1.5, this.recoil + amount); }
  hitReact(dir = 0, amount = 1) { this.hit = Math.min(1.2, this.hit + amount); this.hitDir = dir; }
}
