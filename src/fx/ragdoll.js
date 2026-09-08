// Verlet-integrated ragdoll driving a soldier model's bones. One particle per bone
// (matches BONES 1:1), distance constraints hold rough bone lengths, gravity + ground
// collision + a cheap capsule push-out keep it grounded. Bone world orientation is
// re-derived each frame from parent particle -> child particle direction.
import * as THREE from 'three';
import { BONES, LIMBS } from '../models/soldier.js';

// primary child used to orient each bone (direction bone -> child particle)
const PRIMARY_CHILD = {
  root: 'spine', spine: 'chest', chest: 'neck', neck: 'head',
  shoulderL: 'upperArmL', upperArmL: 'forearmL', forearmL: 'handL',
  shoulderR: 'upperArmR', upperArmR: 'forearmR', forearmR: 'handR',
  thighL: 'shinL', shinL: 'footL',
  thighR: 'shinR', shinR: 'footR',
};
// rest-space direction from each bone to its primary child (local axis the bone's
// identity rotation points along, taken straight from the rest-pose offsets).
const REST_DIR = {};
for (const [name] of BONES) {
  const child = PRIMARY_CHILD[name];
  if (!child) continue;
  const off = BONES.find((b) => b[0] === child)[2];
  const v = new THREE.Vector3(off[0], off[1], off[2]);
  if (v.lengthSq() < 1e-8) v.set(0, -1, 0);
  REST_DIR[name] = v.normalize();
}
// extra mass / stiffness per bone (index by name)
const MASS = { root: 3, spine: 2.4, chest: 2.2, head: 1 };
function massOf(name) { return MASS[name] || (name.startsWith('thigh') ? 1.6 : 1); }

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

export class Ragdoll {
  constructor(world, model, opts = {}) {
    this.world = world;
    this.model = model;
    this.onDetach = opts.onDetach || null;
    this.onRemove = opts.onRemove || null;
    this.settled = false;
    this.age = 0;
    this.settledAt = -1;
    this.removed = false;

    const root = model.root;
    if (opts.position) root.position.copy(opts.position);
    if (opts.yaw != null) root.rotation.y = opts.yaw;
    root.updateMatrixWorld(true);
    // model.root's own transform (position/yaw/mirror-scale) is frozen from here on;
    // the whole pose is expressed by driving the bones inside it. Cache its inverse
    // so world-space particle positions/orientations can be converted into the
    // root bone's local space each frame.
    this._invRootMatrix = new THREE.Matrix4().copy(root.matrixWorld).invert();
    this._invRootQuat = new THREE.Quaternion();
    root.getWorldQuaternion(this._invRootQuat).invert();

    this.names = BONES.map((b) => b[0]);
    this.n = this.names.length;
    this.pos = []; this.prev = []; this.worldQuat = [];
    this.invMass = new Float32Array(this.n);
    this.detached = new Set();
    for (let i = 0; i < this.n; i++) {
      const name = this.names[i];
      const p = new THREE.Vector3();
      model.bones[name].getWorldPosition(p);
      this.pos.push(p.clone());
      this.prev.push(p.clone());
      this.worldQuat.push(new THREE.Quaternion());
      this.invMass[i] = 1 / massOf(name);
    }
    // distance constraints: parent/child pairs with their rest length
    this.constraints = [];
    for (const [name, parent] of BONES) {
      if (!parent) continue;
      const a = this.names.indexOf(parent), b = this.names.indexOf(name);
      const len = this.pos[a].distanceTo(this.pos[b]) || 0.05;
      this.constraints.push({ a, b, len });
    }

    // initial impulse
    if (opts.impulse) {
      let idx = 0;
      if (opts.hitLimb && LIMBS[opts.hitLimb]) idx = this.names.indexOf(LIMBS[opts.hitLimb][0]);
      else idx = this.names.indexOf('chest');
      if (idx < 0) idx = this.names.indexOf('root');
      _v1.copy(opts.impulse).multiplyScalar(1 / 30);
      this.prev[idx].sub(_v1);
      // spread a smaller kick through the whole body so it doesn't look like one bone yanks
      for (let i = 0; i < this.n; i++) if (i !== idx) this.prev[i].sub(_v2.copy(opts.impulse).multiplyScalar(0.15 / 30));
    }
  }

  detachLimb(limb) {
    if (!LIMBS[limb] || this.detached.has(limb)) return;
    this.detached.add(limb);
    const rootBoneName = LIMBS[limb][0];
    const idx = this.names.indexOf(rootBoneName);
    const pos = this.pos[idx].clone();
    const vel = _v3.copy(this.pos[idx]).sub(this.prev[idx]).multiplyScalar(60);
    this.model.hideLimb(limb);
    // remove the limb's internal constraints so the stump can flail free-ish (keep the
    // attachment constraint to the parent so it doesn't fully detach the particle chain)
    if (this.onDetach) this.onDetach(limb, pos, vel.clone());
  }

  settle() {
    this.settled = true;
    this.settledAt = this.age;
    for (let i = 0; i < this.n; i++) this.prev[i].copy(this.pos[i]);
  }

  update(dt) {
    this.age += dt;
    if (this.settled) { this._applyToBones(); return; }
    dt = Math.min(dt, 1 / 30);
    const damping = 0.985;
    const g = 18;
    for (let i = 0; i < this.n; i++) {
      const p = this.pos[i], pv = this.prev[i];
      _v1.copy(p).sub(pv).multiplyScalar(damping);
      _v1.y -= g * dt * dt;
      pv.copy(p);
      p.add(_v1);
    }
    for (let iter = 0; iter < 4; iter++) {
      for (const c of this.constraints) {
        const a = this.pos[c.a], b = this.pos[c.b];
        _v1.copy(b).sub(a);
        const d = _v1.length() || 0.0001;
        const diff = (d - c.len) / d;
        const wa = this.invMass[c.a], wb = this.invMass[c.b];
        const sum = wa + wb || 1;
        _v2.copy(_v1).multiplyScalar(diff * (wa / sum) * 0.9);
        a.add(_v2);
        _v3.copy(_v1).multiplyScalar(diff * (wb / sum) * 0.9);
        b.sub(_v3);
      }
      // ground + collider resolve per particle
      for (let i = 0; i < this.n; i++) {
        const p = this.pos[i];
        const gh = this.world.groundHeight ? this.world.groundHeight(p.x, p.z) : 0;
        if (p.y < gh + 0.08) {
          p.y = gh + 0.08;
          const pv = this.prev[i];
          pv.x = p.x - (p.x - pv.x) * 0.55;
          pv.z = p.z - (p.z - pv.z) * 0.55;
          pv.y = p.y;
        }
        if (this.world.resolveCapsule) {
          const before = _v1.set(p.x, 0, p.z);
          this.world.resolveCapsule(p, 0.14, 0.3, _cq);
          if (p.x !== before.x || p.z !== before.z) { this.prev[i].x = p.x; this.prev[i].z = p.z; }
        }
      }
    }
    this._applyToBones();
    if (!this.settled) {
      let moving = false;
      for (let i = 0; i < this.n; i++) if (_v1.copy(this.pos[i]).sub(this.prev[i]).lengthSq() > 0.0009) { moving = true; break; }
      if (!moving && this.age > 0.6) this.settle();
    }
  }

  _applyToBones() {
    const bones = this.model.bones;
    // root bone carries the particle's world position, converted into model.root's
    // (frozen) local space so we never touch the model.root transform itself.
    const rootIdx = this.names.indexOf('root');
    _v2.copy(this.pos[rootIdx]).applyMatrix4(this._invRootMatrix);
    bones.root.position.copy(_v2);

    for (let i = 0; i < this.n; i++) {
      const name = this.names[i];
      const bone = bones[name];
      const parentName = BONES[i][1];
      const parentWorldQuat = parentName ? this.worldQuat[this.names.indexOf(parentName)] : _q1.identity();
      const child = PRIMARY_CHILD[name];
      let worldQuat;
      if (child) {
        const ci = this.names.indexOf(child);
        _v1.copy(this.pos[ci]).sub(this.pos[i]);
        if (_v1.lengthSq() < 1e-8) _v1.copy(REST_DIR[name]);
        _v1.normalize();
        worldQuat = this.worldQuat[i].setFromUnitVectors(REST_DIR[name], _v1);
      } else {
        worldQuat = this.worldQuat[i].copy(parentWorldQuat);
      }
      if (name === 'root') {
        bone.quaternion.copy(this._invRootQuat).multiply(worldQuat);
      } else {
        const inv = _q1.copy(parentWorldQuat).invert();
        bone.quaternion.copy(inv.multiply(worldQuat));
      }
      // NaN guard
      const q = bone.quaternion;
      if (!(isFinite(q.x) && isFinite(q.y) && isFinite(q.z) && isFinite(q.w))) bone.quaternion.identity();
    }
  }

  jointPos(name, out = new THREE.Vector3()) {
    const i = this.names.indexOf(name);
    return i >= 0 ? out.copy(this.pos[i]) : out.set(0, 0, 0);
  }

  dispose() {
    this.removed = true;
  }
}
const _cq = [];
