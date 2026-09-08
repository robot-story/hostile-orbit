// Main VFX/gore/ragdoll facade. Owns every pooled resource (particles, decals,
// debris, lights, ragdolls) and exposes the flat API the rest of the game calls.
// See the class-level method docs below for the full contract.
import * as THREE from 'three';
import { Tex } from '../render/textures.js';
import { settings } from '../core/settings.js';
import { clamp, pick } from '../core/mathx.js';
import { ParticleField, InstancedDebris } from './particles.js';
import { DecalPool } from './decals.js';
import { Ragdoll } from './ragdoll.js';
import { Beam, WarningZone, Marker, spawnExplosion } from './explosions.js';
import { BONES, LIMBS } from '../models/soldier.js';

const UP = new THREE.Vector3(0, 1, 0);
const MAX_LIGHTS = 4;
const MAX_RAGDOLLS = 14;
const RAGDOLL_LINGER = 12; // seconds after settling before fade+removal
const BONE_PARENT = Object.fromEntries(BONES.map((b) => [b[0], b[1]]));

function unitBox() { return new THREE.BoxGeometry(1, 1, 1); }
function tetra() { return new THREE.TetrahedronGeometry(0.6, 0); }

export class FX {
  constructor(world) {
    this.world = world;
    this.camera = null;
    this._transient = []; // {update(dt), dead}
    this._timers = []; // {t, fn}
    this._decalBudget = 8;

    this._buildTextures();
    this._buildParticleFields();
    this._buildDebris();
    this.decals = new DecalPool(world, 300);
    this._buildTracers();
    this._buildMuzzle();
    this._buildLights();

    this.ragdolls = [];
    this.beams = [];
    this.warningZones = [];
    this.markers = [];
    this.smokeEmitters = [];
    this.growingPools = [];
    this.freeDebris = []; // detached limb / real-mesh gib pieces (small count)

    this._flashMatCache = new Map();
    this._hitFlashActive = new Map();
  }

  // ---------- setup ----------
  _buildTextures() {
    this.tex = {
      dot: Tex.dot(), glow: Tex.glow(), smoke: Tex.smoke(),
      bulletHole: Tex.bulletHole(), scorch: Tex.scorch(),
      blood: [Tex.bloodSplat(0), Tex.bloodSplat(1), Tex.bloodSplat(2), Tex.bloodSplat(3)],
    };
  }
  _buildParticleFields() {
    const w = this.world;
    this.fields = {
      sparks: new ParticleField(w, 220, this.tex.glow, { additive: true }),
      blood: new ParticleField(w, 220, this.tex.dot, { additive: false }),
      bloodGlow: new ParticleField(w, 90, this.tex.dot, { additive: true }),
      smoke: new ParticleField(w, 110, this.tex.smoke, { additive: false }),
      dust: new ParticleField(w, 90, this.tex.smoke, { additive: false }),
      fire: new ParticleField(w, 150, this.tex.glow, { additive: true }),
    };
    // droplets that splat when they hit the ground
    const onLand = (x, y, z, i, glow) => {
      if (this._decalBudget <= 0 || !settings.data.bloodDecals) return;
      this._decalBudget--;
      const gore = settings.goreLevel;
      const size = (gore === 1 ? 0.22 : 0.34) * (0.6 + Math.random() * 0.7);
      this._spawnBloodDecal(_v.set(x, y, z), UP, size, 40 + Math.random() * 15);
    };
    this.fields.blood.groundCheck = { world: w, cb: (x, y, z, i) => onLand(x, y, z, i, false) };
    this.fields.bloodGlow.groundCheck = { world: w, cb: (x, y, z, i) => onLand(x, y, z, i, true) };
  }
  _buildDebris() {
    const w = this.world;
    const shellMat = new THREE.MeshStandardMaterial({ color: '#d9b45a', roughness: 0.35, metalness: 0.85, vertexColors: true });
    const chunkMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.4, vertexColors: true });
    const gibMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.1, vertexColors: true, emissive: '#1a0004', emissiveIntensity: 0.4 });
    const armourMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.3, vertexColors: true });
    this.debris = {
      shell: new InstancedDebris(w, new THREE.CylinderGeometry(0.5, 0.5, 1, 6), shellMat, 40, { perInstanceColor: true }),
      chunk: new InstancedDebris(w, unitBox(), chunkMat, 90, { perInstanceColor: true, castShadow: true }),
      gib: new InstancedDebris(w, tetra(), gibMat, 60, { perInstanceColor: true, castShadow: true }),
      armour: new InstancedDebris(w, unitBox(), armourMat, 40, { perInstanceColor: true, castShadow: true }),
    };
  }
  _buildTracers() {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.tracers = [];
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#8ff0ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false; mesh.frustumCulled = false;
      this.world.fxGroup.add(mesh);
      this.tracers.push({ mesh, mat, from: new THREE.Vector3(), to: new THREE.Vector3(), len: 0, dir: new THREE.Vector3(), speed: 260, width: 0.06, t: 0, total: 0, active: false });
    }
  }
  _buildMuzzle() {
    this.muzzleSprites = [];
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.tex.glow, color: '#8ff0ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
      const spr = new THREE.Sprite(mat);
      spr.visible = false;
      this.world.fxGroup.add(spr);
      this.muzzleSprites.push({ spr, mat, t: 0, total: 0.06 });
    }
  }
  _buildLights() {
    this.lights = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 10, 2);
      this.world.fxGroup.add(light);
      this.lights.push({ light, t: 0, total: 0, base: 0 });
    }
  }

  // ---------- per-frame ----------
  update(dt, camera) {
    this.camera = camera || this.camera;
    dt = Math.min(dt, 1 / 20);
    this._decalBudget = 8;

    for (const t of this.tracers) if (t.active) this._updateTracer(t, dt);
    for (const m of this.muzzleSprites) if (m.t > 0) this._updateMuzzleSprite(m, dt, camera);
    for (const l of this.lights) if (l.t > 0) { l.t -= dt; l.light.intensity = l.t <= 0 ? 0 : l.base * (l.t / l.total); if (l.t <= 0) l.light.intensity = 0; }

    for (const key in this.fields) this.fields[key].update(dt);
    for (const key in this.debris) this.debris[key].update(dt);
    this.decals.update(dt);

    for (let i = this.freeDebris.length - 1; i >= 0; i--) this._updateFreeDebris(this.freeDebris[i], dt, i);

    for (let i = this.ragdolls.length - 1; i >= 0; i--) this._updateRagdoll(this.ragdolls[i], dt, i);

    for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; b.update(dt); if (b.dead) { b.dispose(); this.beams.splice(i, 1); } }
    for (const wz of this.warningZones) wz.update(dt);
    this.warningZones = this.warningZones.filter((wz) => { if (wz.dead) { wz._dispose(); return false; } return true; });
    for (const mk of this.markers) mk.update(dt);

    for (let i = this.smokeEmitters.length - 1; i >= 0; i--) this._updateSmokeEmitter(this.smokeEmitters[i], dt, i);
    for (let i = this.growingPools.length - 1; i >= 0; i--) {
      const g = this.growingPools[i]; g.t += dt; const f = Math.min(1, g.t / g.dur);
      g.slot.mesh.scale.setScalar(g.from + (g.target - g.from) * f);
      if (f >= 1) this.growingPools.splice(i, 1);
    }

    for (let i = this._transient.length - 1; i >= 0; i--) { const o = this._transient[i]; o.update(dt); if (o.dead) this._transient.splice(i, 1); }
    for (let i = this._timers.length - 1; i >= 0; i--) { const t = this._timers[i]; t.t -= dt; if (t.t <= 0) { this._timers.splice(i, 1); t.fn(); } }

    for (const [mesh, s] of [...this._hitFlashActive]) { s.t -= dt; if (s.t <= 0) { mesh.material = s.orig; this._hitFlashActive.delete(mesh); } }
  }

  // ---------- tracer ----------
  tracer(from, to, color = '#8ff0ff', width = 0.06, speed = 260) {
    const slot = this.tracers.find((t) => !t.active) || this.tracers[0];
    slot.from.copy(from); slot.to.copy(to);
    slot.dir.subVectors(to, from);
    slot.len = Math.max(0.001, slot.dir.length());
    slot.dir.divideScalar(slot.len);
    slot.speed = speed; slot.width = width;
    slot.t = 0; slot.total = slot.len / speed + 0.05;
    slot.active = true;
    slot.mesh.visible = true;
    slot.mat.color.set(color);
    slot.mat.opacity = 0.9;
  }
  _updateTracer(t, dt) {
    t.t += dt;
    const headDist = Math.min(t.len, t.t * t.speed);
    const tailLen = Math.min(headDist, Math.max(1.5, t.len * 0.18));
    const tailDist = Math.max(0, headDist - tailLen);
    const segLen = headDist - tailDist;
    const midDist = (headDist + tailDist) * 0.5;
    _v.copy(t.from).addScaledVector(t.dir, midDist);
    t.mesh.position.copy(_v);
    t.mesh.scale.set(Math.max(0.001, segLen), t.width, 1);
    t.mesh.quaternion.setFromUnitVectors(_axisX, t.dir);
    const fadeStart = t.total - 0.08;
    t.mat.opacity = t.t > fadeStart ? Math.max(0, 0.9 * (1 - (t.t - fadeStart) / 0.08)) : 0.9;
    if (t.t >= t.total) { t.active = false; t.mesh.visible = false; }
  }

  // ---------- muzzle flash ----------
  muzzleFlash(pos, dir = UP, color = '#8ff0ff', scale = 1) {
    const m = this.muzzleSprites.reduce((a, b) => (a.t <= 0 ? a : b.t <= 0 ? b : a), this.muzzleSprites[0]);
    m.spr.visible = true;
    m.spr.position.copy(pos);
    m.mat.color.set(color);
    m.mat.opacity = 1;
    m.spr.scale.setScalar(0.5 * scale);
    m.t = m.total = 0.06;
    this._flashLight(pos, 26 * scale, 0.07, 9 * scale, color);
    const density = settings.data.particles ?? 1;
    const n = Math.round(4 * density);
    for (let i = 0; i < n; i++) {
      const v = _v2.copy(dir).multiplyScalar(3 + Math.random() * 4).addScaledVector(_rand3(), 2);
      this.fields.sparks.spawn({ pos, vel: v, life: 0.12 + Math.random() * 0.15, size: 0.12 + Math.random() * 0.08, color: '#ffd27a', gravity: 6, drag: 1 });
    }
    this.fields.smoke.spawn({ pos, vel: _v3.copy(dir).multiplyScalar(0.6), life: 0.5, size: 0.35 * scale, color: '#ffffff', gravity: -0.4, drag: 0.6, growth: 0.6 });
  }
  /** Legacy alias (fxlite compat). */
  muzzle(pos, dir) { this.muzzleFlash(pos, dir || UP); }

  _updateMuzzleSprite(m, dt) {
    m.t -= dt;
    if (m.t <= 0) { m.mat.opacity = 0; m.spr.visible = false; return; }
    m.mat.opacity = m.t / m.total;
  }

  _flashLight(pos, intensity, duration, distance = 10, color = '#ffffff') {
    let slot = this.lights.find((l) => l.t <= 0);
    if (!slot) slot = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.light.intensity = intensity;
    slot.base = intensity; slot.t = slot.total = duration;
    return slot;
  }

  // ---------- shells ----------
  shell(pos, dir = UP, kind = 'rifle') {
    const right = _v.set(dir.z, 0, -dir.x).normalize();
    const cfg = { rifle: { s: 0.012, len: 0.032, color: '#d9b45a', spd: 2.2 }, shotgun: { s: 0.014, len: 0.07, color: '#b8552e', spd: 2.6 }, lmg: { s: 0.013, len: 0.045, color: '#c9a545', spd: 2.6 } }[kind] || { s: 0.012, len: 0.032, color: '#d9b45a', spd: 2.2 };
    const vel = _v2.copy(right).multiplyScalar(cfg.spd + Math.random()).addScaledVector(UP, 2.4 + Math.random()).addScaledVector(dir, -0.4);
    const idx = this.debris.shell.spawn({ pos, vel, life: 4, scale: 1, bounce: 0.25, color: cfg.color });
    // scale the (unit r=0.5,h=1 cylinder) non-uniformly per axis isn't supported by the
    // pool's uniform scale, so bake a representative size into `scale` instead.
    this.debris.shell.scale[idx] = cfg.s * 22;
  }

  // ---------- impact ----------
  impact(point, normal = UP, material = 'metal') {
    if (material === 'flesh') { this.blood(point, normal, normal, 0.4); return; }
    const density = settings.data.particles ?? 1;
    const palette = { metal: '#ffc36a', concrete: '#d8d0c0', rock: '#c9a878', dirt: '#8a5a34' };
    const color = palette[material] || palette.metal;
    const sparky = material === 'metal';
    const n = Math.round((sparky ? 6 : 3) * density);
    for (let i = 0; i < n; i++) {
      const v = _v.copy(normal).multiplyScalar(2 + Math.random() * 3).addScaledVector(_rand3(), 2.5);
      this.fields.sparks.spawn({ pos: point, vel: v, life: 0.15 + Math.random() * 0.25, size: (sparky ? 0.1 : 0.16) * (0.6 + Math.random() * 0.6), color, gravity: sparky ? 9 : 5, drag: 0.6 });
    }
    if (!sparky) {
      const dn = Math.round(3 * density);
      for (let i = 0; i < dn; i++) {
        const v = _v2.copy(normal).multiplyScalar(0.6 + Math.random()).addScaledVector(_rand3(), 0.6);
        this.fields.dust.spawn({ pos: point, vel: v, life: 0.6 + Math.random() * 0.4, size: 0.2 + Math.random() * 0.2, color: color, gravity: 1.5, drag: 1.2, growth: 0.25 });
      }
    }
    if ((material === 'metal' || material === 'concrete' || material === 'rock') && this._decalBudget > 0) {
      this._decalBudget--;
      this.decals.spawn(point, normal, { texture: this.tex.bulletHole, color: '#0c0c0d', size: 0.16 + Math.random() * 0.08, life: 30, opacity: 0.85 });
    }
  }

  // ---------- blood ----------
  blood(point, normal, dir, amount = 1, opts = {}) {
    const gore = settings.goreLevel;
    if (gore === 0) { this.sparksBurst(point, normal || UP, Math.round(5 * amount), '#9aa0a6'); return; }
    const density = clamp(settings.data.particles ?? 1, 0.15, 1);
    const goreScale = gore === 1 ? 0.5 : 1;
    const n = Math.max(1, Math.round(11 * amount * density * goreScale));
    const base = (dir && dir.lengthSq() > 1e-6 ? dir : normal || UP);
    _base.copy(base).normalize();
    for (let i = 0; i < n; i++) {
      const glow = Math.random() < 0.25;
      const v = _v.copy(_base).multiplyScalar(2.2 + Math.random() * 3.4).addScaledVector(_rand3(), 1.6);
      (glow ? this.fields.bloodGlow : this.fields.blood).spawn({
        pos: point, vel: v, life: 0.45 + Math.random() * 0.5,
        size: (glow ? 0.07 : 0.11) * (0.6 + Math.random() * 0.7),
        color: glow ? '#a3121f' : '#5a0a12', gravity: 13, drag: 0.35,
      });
    }
    if (normal && settings.data.bloodDecals && this._decalBudget > 0) {
      this._decalBudget--;
      const size = (gore === 1 ? 0.35 : 0.6) * (0.7 + Math.random() * 0.6) * Math.min(2, amount);
      this._spawnBloodDecal(point, normal, size, 55 + Math.random() * 10);
    }
  }
  _spawnBloodDecal(point, normal, size, life) {
    this.decals.spawn(point, normal, {
      texture: pick(this.tex.blood), color: pick(['#4a0a10', '#5c0d14', '#7a1018']),
      size, life, opacity: 0.95,
    });
  }
  bloodPool(pos, size = 1) {
    if (settings.goreLevel === 0) return;
    const slot = this.decals.spawn(pos, UP, { texture: pick(this.tex.blood), color: '#3d0a10', size: 0.05, life: 90, opacity: 0.92 });
    this.growingPools.push({ slot, t: 0, dur: 2.2 + Math.random(), from: 0.05, target: size });
  }

  // ---------- gibs / dismemberment ----------
  gibs(pos, dir = UP, opts = {}) {
    if (settings.goreLevel === 0 || !settings.data.dismemberment) { this.sparksBurst(pos, dir, 10, '#9aa0a6'); return; }
    const density = clamp(settings.data.particles ?? 1, 0.2, 1);
    const count = Math.round((opts.count ?? 8) * density);
    for (let i = 0; i < count; i++) {
      const v = _v.copy(dir).multiplyScalar(3 + Math.random() * 5).addScaledVector(_rand3(), 4);
      const useGib = Math.random() < 0.65;
      const pool = useGib ? this.debris.gib : this.debris.chunk;
      const idx = pool.spawn({ pos, vel: v, life: 3 + Math.random() * 2.5, scale: 0.08 + Math.random() * 0.14, bounce: 0.25, color: useGib ? pick(['#5a0f16', '#7a1018', '#3a1218']) : '#2a2c31' });
      if (i % 2 === 0) this.blood(pos, null, v.clone().normalize(), 0.3);
    }
    if (opts.armour !== false) {
      const an = Math.round(4 * density);
      for (let i = 0; i < an; i++) {
        const v = _v.copy(dir).multiplyScalar(2.5 + Math.random() * 4).addScaledVector(_rand3(), 3);
        this.debris.armour.spawn({ pos, vel: v, life: 3.5 + Math.random() * 2, scale: 0.1 + Math.random() * 0.12, bounce: 0.3, color: pick(['#d9d4c8', '#3a3d42']) });
      }
    }
    if (opts.model && opts.limbs) for (const limb of opts.limbs) this._limbDebris(opts.model, limb, pos.clone(), dir.clone().multiplyScalar(4 + Math.random() * 3));
  }

  limb(model, limb, pos, vel) {
    if (settings.goreLevel === 0 || !settings.data.dismemberment) return;
    this._limbDebris(model, limb, pos, vel || new THREE.Vector3(0, 2, 0));
  }
  _limbDebris(model, limb, pos, vel) {
    if (!LIMBS[limb] || model.hiddenLimbs?.has(limb)) return;
    const group = model.makeLimbMeshes(limb);
    const rootBoneName = LIMBS[limb][0];
    const boneQuat = new THREE.Quaternion();
    model.bones[rootBoneName].getWorldQuaternion(boneQuat);
    model.hideLimb(limb);
    group.position.copy(pos);
    group.quaternion.copy(boneQuat);
    this.world.fxGroup.add(group);
    const stumpName = BONE_PARENT[rootBoneName];
    const entry = {
      obj: group, vel: vel.clone(), angVel: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      life: 1.5, maxLife: 1.5, stumpBone: stumpName ? model.bones[stumpName] : null, spurtT: 1.5,
    };
    if (this.freeDebris.length > 24) { const old = this.freeDebris.shift(); this.world.fxGroup.remove(old.obj); }
    this.freeDebris.push(entry);
  }
  _updateFreeDebris(e, dt, i) {
    e.life -= dt;
    if (e.life <= 0) { this.world.fxGroup.remove(e.obj); this.freeDebris.splice(i, 1); return; }
    e.vel.y -= 14 * dt;
    e.obj.position.addScaledVector(e.vel, dt);
    const gh = this.world.terrain ? this.world.terrain.getHeight(e.obj.position.x, e.obj.position.z) : 0;
    if (e.obj.position.y <= gh) { e.obj.position.y = gh; e.vel.y = Math.max(0, -e.vel.y * 0.2); e.vel.x *= 0.7; e.vel.z *= 0.7; e.angVel.multiplyScalar(0.5); }
    _q.setFromAxisAngle(_axisY.copy(e.angVel).normalize() , e.angVel.length() * dt);
    e.obj.quaternion.multiply(_q);
    if (e.spurtT > 0 && e.stumpBone) {
      e.spurtT -= dt;
      // blood() uses the shared _v/_v2/_base scratch vectors internally for its own
      // math, so the point we hand it must be a stable object of its own.
      e.stumpBone.getWorldPosition(_stumpPos);
      if (Math.random() < 0.7) this.blood(_stumpPos, null, _rand3(), 0.15);
    }
  }

  // ---------- ragdoll ----------
  ragdoll(model, opts = {}) {
    if (this.ragdolls.length >= MAX_RAGDOLLS) {
      const oldest = this.ragdolls.shift();
      this._finishRagdoll(oldest, true);
    }
    const rd = new Ragdoll(this.world, model, {
      ...opts,
      onDetach: (limb, pos, vel) => this._limbDebris(model, limb, pos, vel),
    });
    const handle = {
      _rd: rd, model, position: model.root.position, onRemove: null, removed: false,
      update: (dt) => rd.update(dt),
      detachLimb: (limb) => rd.detachLimb(limb),
      settle: () => rd.settle(),
      dispose: () => { rd.dispose(); handle.removed = true; },
    };
    this.ragdolls.push(handle);
    return handle;
  }
  _updateRagdoll(handle, dt, i) {
    if (handle.removed) { this.ragdolls.splice(i, 1); return; }
    handle._rd.update(dt);
    if (handle._rd.settled) {
      const since = handle._rd.age - handle._rd.settledAt;
      if (since > RAGDOLL_LINGER) {
        const sinkT = Math.min(1, (since - RAGDOLL_LINGER) / 2);
        if (!handle._sinkStart) handle._sinkStart = handle.model.root.position.y;
        handle.model.root.position.y = handle._sinkStart - sinkT * 1.0;
        if (sinkT >= 1) this._finishRagdoll(handle, false, i);
      }
    }
  }
  _finishRagdoll(handle, spliceNow, idx) {
    if (handle.removed) return;
    handle.removed = true;
    if (handle.onRemove) handle.onRemove();
    if (spliceNow) { const j = this.ragdolls.indexOf(handle); if (j >= 0) this.ragdolls.splice(j, 1); }
  }

  // ---------- explosions & beams ----------
  explosion(pos, radius = 6, kind = 'grenade') { spawnExplosion(this, pos, radius, kind); }
  beam(from, to, color = '#7fe9ff', width = 1.5, duration = 1.2) { this.beams.push(new Beam(this.world, from, to, color, width, duration)); }
  scorch(pos, radius = 3) {
    if (this._decalBudget <= 0) return;
    this._decalBudget--;
    let n = UP;
    if (this.world.terrain) { n = this.world.terrain.getNormal(pos.x, pos.z, _v4); }
    this.decals.spawn(pos, n, { texture: this.tex.scorch, color: '#0a0a0a', size: radius * 1.7, life: 45, opacity: 0.85 });
  }

  warningZone(pos, radius, color = '#ff3b1f', duration = 3) {
    const wz = new WarningZone(this.world, pos, radius, color, duration);
    this.warningZones.push(wz);
    return wz;
  }
  marker(pos, color = '#00e5ff') {
    const mk = new Marker(this.world, pos, color);
    this.markers.push(mk);
    const orig = mk.remove.bind(mk);
    mk.remove = () => { orig(); const i = this.markers.indexOf(mk); if (i >= 0) this.markers.splice(i, 1); };
    return mk;
  }

  smokeColumn(pos, size = 1, duration = 8) {
    this.smokeEmitters.push({ pos: pos.clone(), size, t: 0, duration, acc: 0 });
  }
  _updateSmokeEmitter(e, dt, i) {
    e.t += dt; e.acc += dt;
    const rate = 1 / 12; // seeds per second-ish, scaled by density below
    const density = settings.data.particles ?? 1;
    while (e.acc > rate / Math.max(0.25, density)) {
      e.acc -= rate / Math.max(0.25, density);
      const spread = e.size * (0.4 + (e.t / e.duration) * 1.2);
      const p = _v.copy(e.pos).addScaledVector(_rand3(), spread * 0.4);
      this.fields.smoke.spawn({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), life: 2.5 + Math.random() * 2.5, size: e.size * (0.8 + Math.random() * 0.8), color: '#cfcfd2', gravity: -0.5, drag: 0.3, growth: 0.35 });
      if (Math.random() < 0.4) this.fields.fire.spawn({ pos: e.pos, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1 + Math.random(), (Math.random() - 0.5) * 0.6), life: 0.4 + Math.random() * 0.3, size: e.size * 0.4, color: '#ff8a3a', gravity: 3, drag: 1, growth: -0.3 });
    }
    if (e.t >= e.duration) this.smokeEmitters.splice(i, 1);
  }

  sparksBurst(pos, normal = UP, count = 12, color = '#ffc36a') {
    const density = settings.data.particles ?? 1;
    const n = Math.round(count * density);
    for (let i = 0; i < n; i++) {
      const v = _v.copy(normal).multiplyScalar(1.5 + Math.random() * 3).addScaledVector(_rand3(), 3);
      this.fields.sparks.spawn({ pos, vel: v, life: 0.15 + Math.random() * 0.3, size: 0.09 + Math.random() * 0.08, color, gravity: 8, drag: 0.5 });
    }
  }
  dust(pos, amount = 1) {
    const density = settings.data.particles ?? 1;
    const n = Math.round(6 * amount * density);
    for (let i = 0; i < n; i++) {
      const v = _v.set((Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4);
      this.fields.dust.spawn({ pos, vel: v, life: 0.6 + Math.random() * 0.5, size: 0.3 + Math.random() * 0.3, color: '#b8905a', gravity: 0.6, drag: 1, growth: 0.3 });
    }
  }
  podTrail(pos) {
    this.fields.fire.spawn({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, -2, (Math.random() - 0.5) * 0.5), life: 0.35, size: 0.5, color: '#ff8a3a', gravity: 0, drag: 1, growth: -0.5 });
    this.fields.smoke.spawn({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, -1, (Math.random() - 0.5) * 0.3), life: 1.2, size: 0.6, color: '#cfcfd2', gravity: -0.2, drag: 0.6, growth: 0.4 });
  }

  hitFlash(mesh, duration = 0.08) {
    if (!mesh || !mesh.material) return;
    let active = this._hitFlashActive.get(mesh);
    if (!active) {
      const orig = mesh.material;
      mesh.material = Array.isArray(orig) ? orig.map((m) => this._flashMatFor(m)) : this._flashMatFor(orig);
      active = { orig, t: duration };
      this._hitFlashActive.set(mesh, active);
    } else {
      active.t = duration;
    }
  }
  _flashMatFor(mat) {
    let clone = this._flashMatCache.get(mat);
    if (!clone) {
      clone = mat.clone();
      clone.emissive = new THREE.Color('#ffffff');
      clone.emissiveIntensity = Math.max(clone.emissiveIntensity || 0, 2.2);
      clone.toneMapped = false;
      this._flashMatCache.set(mat, clone);
    }
    return clone;
  }

  // ---------- reset ----------
  clear() {
    for (const key in this.fields) { const f = this.fields[key]; f.active.fill(0); f.size.fill(0); }
    for (const key in this.debris) this.debris[key].clear();
    this.decals.clear();
    for (const t of this.tracers) { t.active = false; t.mesh.visible = false; }
    for (const m of this.muzzleSprites) { m.t = 0; m.spr.visible = false; }
    for (const l of this.lights) { l.t = 0; l.light.intensity = 0; }
    for (const e of this.freeDebris) this.world.fxGroup.remove(e.obj);
    this.freeDebris.length = 0;
    for (const h of this.ragdolls) { if (h.onRemove) h.onRemove(); }
    this.ragdolls.length = 0;
    for (const b of this.beams) b.dispose(); this.beams.length = 0;
    for (const wz of this.warningZones) wz._dispose(); this.warningZones.length = 0;
    for (const mk of this.markers) { this.world.fxGroup.remove(mk.mesh); this.world.fxGroup.remove(mk.ring); } this.markers.length = 0;
    this.smokeEmitters.length = 0;
    this.growingPools.length = 0;
    this._transient.length = 0;
    this._timers.length = 0;
    for (const [mesh, s] of this._hitFlashActive) mesh.material = s.orig;
    this._hitFlashActive.clear();
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _base = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
function _rand3() { return _rtmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); }
const _rtmp = new THREE.Vector3();
const _stumpPos = new THREE.Vector3();
