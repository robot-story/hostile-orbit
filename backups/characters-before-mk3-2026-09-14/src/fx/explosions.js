// Standalone visual elements used by explosions and mission telegraphs: energy beams,
// ground warning rings, hologram markers, and the layered explosion assembly itself.
// These take the already-built FX instance so they can reuse its pooled particle
// fields, decals and lights instead of allocating their own.
import * as THREE from 'three';
import { Tex } from '../render/textures.js';
import { settings } from '../core/settings.js';
import { events } from '../core/events.js';

const EXPLOSION_KIND = {
  grenade: { radius: 6, flash: 1.0, fireCount: 18, lightPower: 22 },
  barrel: { radius: 6, flash: 1.0, fireCount: 18, lightPower: 22 },
  kinetic: { radius: 13, flash: 1.6, fireCount: 34, lightPower: 60 },
  pod: { radius: 5, flash: 0.8, fireCount: 14, lightPower: 18 },
  gunship: { radius: 9, flash: 1.2, fireCount: 24, lightPower: 34 },
  large: { radius: 10, flash: 1.3, fireCount: 28, lightPower: 40 },
  jammer: { radius: 15, flash: 1.6, fireCount: 30, lightPower: 55 },
};

/** Vertical/angled energy beam: additive cylinder core + glow sprite caps, appear/hold/fade. */
export class Beam {
  constructor(world, from, to, color, width, duration) {
    this.world = world; this.t = 0; this.duration = duration; this.dead = false;
    const d = new THREE.Vector3().subVectors(to, from);
    const len = Math.max(0.05, d.length());
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.18, width * 0.18, len, 10, 1, true), coreMat);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(width, width, len, 10, 1, true), glowMat);
    group.add(core, glow);
    group.position.copy(mid);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    world.fxGroup.add(group);
    this.group = group; this.core = core; this.glow = glow; this.coreMat = coreMat; this.glowMat = glowMat;
  }
  update(dt) {
    this.t += dt;
    const holdEnd = this.duration * 0.6;
    let k;
    if (this.t < 0.08) k = this.t / 0.08;
    else if (this.t < holdEnd) k = 1;
    else k = Math.max(0, 1 - (this.t - holdEnd) / (this.duration - holdEnd));
    this.coreMat.opacity = 0.9 * k;
    this.glowMat.opacity = 0.35 * k;
    this.group.scale.x = this.group.scale.z = 0.6 + k * 0.6;
    if (this.t >= this.duration) this.dead = true;
  }
  dispose() {
    this.world.fxGroup.remove(this.group);
    this.core.geometry.dispose(); this.glow.geometry.dispose();
    this.coreMat.dispose(); this.glowMat.dispose();
  }
}

/** Neon targeting indicator: ground ring + pulsing disc + rotating dashes. */
export class WarningZone {
  constructor(world, pos, radius, color, duration) {
    this.world = world; this.t = 0; this.duration = duration; this.dead = false;
    const group = new THREE.Group();
    group.position.copy(pos);
    group.position.y += 0.03;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    const diskMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), diskMat);
    disk.rotation.x = -Math.PI / 2;
    const dashMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const dashes = new THREE.Group();
    const dashCount = 10;
    for (let i = 0; i < dashCount; i++) {
      const a0 = (i / dashCount) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / dashCount) * 0.5;
      const seg = new THREE.Mesh(new THREE.RingGeometry(radius * 1.05, radius * 1.12, 8, 1, a0, a1 - a0), dashMat);
      seg.rotation.x = -Math.PI / 2;
      dashes.add(seg);
    }
    group.add(disk, ring, dashes);
    world.fxGroup.add(group);
    this.group = group; this.ring = ring; this.disk = disk; this.dashes = dashes;
    this.ringMat = ringMat; this.diskMat = diskMat; this.dashMat = dashMat;
    this.radius = radius;
  }
  setPosition(pos) { this.group.position.x = pos.x; this.group.position.z = pos.z; this.group.position.y = pos.y + 0.03; }
  update(dt) {
    this.t += dt;
    const pulse = 0.7 + 0.3 * Math.sin(this.t * 6);
    this.diskMat.opacity = 0.1 * pulse;
    this.dashes.rotation.y += dt * 0.8;
    let k = 1;
    if (this.t > this.duration - 0.4) k = Math.max(0, (this.duration - this.t) / 0.4);
    this.ringMat.opacity = 0.9 * k;
    this.dashMat.opacity = 0.8 * k;
    if (this.t >= this.duration) this.dead = true;
  }
  remove() { this.dead = true; this._disposed || this._dispose(); }
  _dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.world.fxGroup.remove(this.group);
    this.ring.geometry.dispose(); this.disk.geometry.dispose();
    for (const c of this.dashes.children) c.geometry.dispose();
    this.ringMat.dispose(); this.diskMat.dispose(); this.dashMat.dispose();
  }
}

/** Small floating hologram diamond beacon. */
export class Marker {
  constructor(world, pos, color) {
    this.world = world; this.t = 0; this.dead = false;
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    mesh.position.copy(pos);
    mesh.position.y += 0.6;
    world.fxGroup.add(mesh);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos); ring.position.y += 0.03;
    world.fxGroup.add(ring);
    this.mesh = mesh; this.ring = ring; this.ringMat = ringMat; this.basePos = pos.clone();
  }
  setPosition(pos) {
    this.basePos.copy(pos);
    this.ring.position.x = pos.x; this.ring.position.z = pos.z; this.ring.position.y = pos.y + 0.03;
  }
  update(dt) {
    this.t += dt;
    this.mesh.position.x = this.basePos.x; this.mesh.position.z = this.basePos.z;
    this.mesh.position.y = this.basePos.y + 0.6 + Math.sin(this.t * 2) * 0.08;
    this.mesh.rotation.y += dt * 1.4;
    this.mesh.rotation.x += dt * 0.6;
    this.ring.rotation.z += dt * 0.5;
  }
  remove() {
    if (this.dead) return;
    this.dead = true;
    this.world.fxGroup.remove(this.mesh); this.world.fxGroup.remove(this.ring);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.ring.geometry.dispose(); this.ringMat.dispose();
  }
}

/** One expanding/fading additive fireball or shockwave billboard/ring driven purely by a timer. */
class TimedMesh {
  constructor(mesh, life, onUpdate) { this.mesh = mesh; this.t = 0; this.life = life; this.onUpdate = onUpdate; this.dead = false; }
  update(dt) {
    this.t += dt;
    const f = Math.min(1, this.t / this.life);
    this.onUpdate(this.mesh, f, this.t);
    if (this.t >= this.life) this.dead = true;
  }
}

/**
 * Build the full layered explosion: flash event, fireball billboards, shockwave ring,
 * sparks, debris, smoke column, scorch decal, pooled point light, camera shake.
 * Returns nothing — everything it spawns registers itself with fx's own update loop
 * via fx._transient (a flat list of {update(dt), dead}).
 */
export function spawnExplosion(fx, pos, radius = 6, kind = 'grenade') {
  const cfg = EXPLOSION_KIND[kind] || EXPLOSION_KIND.grenade;
  radius = radius || cfg.radius;
  const world = fx.world;
  const flashCap = settings.data.reduceFlashing ? 0.5 : 1;
  events.emit('fx:flash', cfg.flash * flashCap);
  events.emit('fx:shake', Math.min(1.6, radius / 8), pos);

  // fireball billboards (2-3 additive sprites growing then fading)
  const fireballColors = ['#fff6d8', '#ffb04a', '#ff5a1f'];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({ map: Tex.glow(), color: fireballColors[i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 1 });
    const spr = new THREE.Sprite(mat);
    spr.position.copy(pos).addScaledVector(new THREE.Vector3((Math.random() - 0.5), 0.3, (Math.random() - 0.5)), radius * 0.15);
    spr.scale.setScalar(radius * 0.3);
    world.fxGroup.add(spr);
    const life = 0.4 + i * 0.15 + radius * 0.02;
    const maxScale = radius * (1.1 + i * 0.35);
    fx._transient.push(new TimedMesh(spr, life, (m, f) => {
      const grow = 1 - Math.pow(1 - f, 3);
      m.scale.setScalar(radius * 0.3 + grow * (maxScale - radius * 0.3));
      mat.opacity = (1 - f) * (i === 0 ? 1 : 0.8);
      if (f >= 1) { world.fxGroup.remove(m); mat.dispose(); }
    }));
  }
  // shockwave ring
  {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffe9c2', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, radius * 0.12, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos); ring.position.y = (world.terrain ? world.terrain.getHeight(pos.x, pos.z) : pos.y) + 0.05;
    world.fxGroup.add(ring);
    fx._transient.push(new TimedMesh(ring, 0.5, (m, f) => {
      const s = 1 + f * radius * 3.2;
      m.scale.set(s, s, s);
      mat.opacity = 0.8 * (1 - f);
      if (f >= 1) { world.fxGroup.remove(m); m.geometry.dispose(); mat.dispose(); }
    }));
  }
  // point light (pooled)
  fx._flashLight(pos, cfg.lightPower, 0.6, radius * 2.2);
  // fire sparks + debris + dust/smoke
  const density = settings.data.particles ?? 1;
  const fireN = Math.round(cfg.fireCount * density);
  for (let i = 0; i < fireN; i++) {
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * radius * 1.4;
    const vel = new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * radius * 0.6, Math.sin(a) * sp);
    fx.fields.fire.spawn({ pos, vel, life: 0.5 + Math.random() * 0.6, size: 0.5 + Math.random() * 0.7, color: Math.random() < 0.5 ? '#ffb04a' : '#ff5a1f', gravity: 6, drag: 1.2, growth: -0.4 });
  }
  const debrisN = Math.round(Math.min(16, radius * 1.4) * density);
  for (let i = 0; i < debrisN; i++) {
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * radius;
    const vel = new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp);
    fx.debris.chunk.spawn({ pos, vel, life: 3 + Math.random() * 2, scale: 0.15 + Math.random() * 0.25, bounce: 0.3 });
  }
  fx.smokeColumn(pos, Math.max(1, radius / 6), 6 + Math.min(4, radius * 0.3));
  fx.scorch(pos, radius);

  if (kind === 'jammer') {
    // secondary explosions scattered over ~2s
    for (let i = 0; i < 5; i++) {
      const delay = 0.2 + Math.random() * 1.8;
      const off = new THREE.Vector3((Math.random() - 0.5) * radius, 0, (Math.random() - 0.5) * radius);
      fx._timers.push({ t: delay, fn: () => spawnExplosion(fx, pos.clone().add(off), radius * 0.4, 'grenade') });
    }
  }
}
