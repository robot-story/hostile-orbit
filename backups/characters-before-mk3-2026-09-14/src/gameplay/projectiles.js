// Grenades, beacons and rockets: simple ballistic bodies with bounce, fuse and explosion callbacks.
import * as THREE from 'three';
import { buildGrenade } from '../models/weapons.js';
import { Mat, COLORS } from '../render/materials.js';
import { audio } from '../audio/audio.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

export class Projectiles {
  constructor(game) { this.game = game; this.world = game.world; this.list = []; }
  /** Solve a launch velocity from->to with given speed-ish arc (45deg-ish lob). */
  static lobVelocity(from, to, speed = 16) {
    const d = new THREE.Vector3().subVectors(to, from); const dy = d.y; d.y = 0; const dist = d.length(); d.normalize();
    const g = 22;
    // choose flight time from distance
    const t = Math.max(0.6, Math.min(2.2, dist / speed + 0.35));
    const vx = dist / t; const vy = dy / t + 0.5 * g * t;
    return d.multiplyScalar(vx).setY(vy);
  }
  spawn(kind, pos, vel, opts = {}) {
    const p = { kind, position: pos.clone(), velocity: vel.clone(), t: 0, fuse: opts.fuse ?? 3, owner: opts.owner ?? 0, damage: opts.damage ?? 160, radius: opts.radius ?? 6.5, enemy: !!opts.enemy, bounces: 0, onDetonate: opts.onDetonate || null, onLand: opts.onLand || null, landed: false, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), id: opts.id ?? this.world.allocId(), sticky: !!opts.sticky, noExplode: !!opts.noExplode };
    p.mesh = kind === 'beacon' ? this._beaconMesh(opts.color) : buildGrenade();
    if (kind === 'grenade' && opts.enemy) { p.mesh.traverse(o => { if (o.isMesh && o.material === Mat.neon(COLORS.amber, 2)) o.material = Mat.neon(COLORS.red, 2); }); }
    p.mesh.position.copy(pos); this.world.fxGroup.add(p.mesh);
    if (kind === 'grenade' && opts.enemy) p.light = null;
    this.list.push(p);
    return p;
  }
  _beaconMesh(color = COLORS.cyan) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 8), Mat.gunWhite()); g.add(body);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), Mat.neon(color, 3)); tip.position.y = 0.2; g.add(tip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14), Mat.neon(color, 3)); ring.rotation.x = Math.PI / 2; g.add(ring);
    return g;
  }
  throwGrenade(from, to, opts = {}) {
    const vel = Projectiles.lobVelocity(from, to, opts.speed || 16);
    const p = this.spawn('grenade', from, vel, opts);
    if (net.isHost) net.send(MSG.EV_GRENADE, { id: p.id, p: v3(from), v: v3(vel), owner: p.owner, enemy: p.enemy, fuse: p.fuse }, { reliable: true });
    return p;
  }
  throwBeacon(from, dir, opts = {}) {
    const vel = dir.clone().multiplyScalar(opts.speed || 18); vel.y += 4;
    return this.spawn('beacon', from, vel, { ...opts, fuse: 999, noExplode: true, sticky: true });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (!p.landed) {
        p.velocity.y -= 22 * dt;
        const next = _v.copy(p.position).addScaledVector(p.velocity, dt);
        // collide with world (colliders + terrain)
        const step = next.clone().sub(p.position); const len = step.length();
        let hit = null;
        if (len > 0.001) hit = this.world.raycast(p.position, step.clone().divideScalar(len), len + 0.08, { entities: false, terrainStep: 0.3 });
        if (hit) {
          const n = hit.normal.clone(); if (n.lengthSq() < 0.5) n.set(0, 1, 0);
          p.position.copy(hit.point).addScaledVector(n, 0.09);
          const vn = p.velocity.dot(n);
          if (p.sticky) { p.landed = true; p.velocity.set(0, 0, 0); p.onLand?.(p); }
          else {
            p.velocity.addScaledVector(n, -vn * 1.55); p.velocity.multiplyScalar(0.55); p.bounces++;
            if (p.velocity.length() > 1.5) audio.play('grenade_bounce', { pos: p.position, volume: 0.6, pitchVar: 0.1 });
            if (p.velocity.length() < 1.2 && n.y > 0.6) { p.landed = true; p.velocity.set(0, 0, 0); }
          }
          // enemies react to grenades landing near them
          if (p.kind === 'grenade' && !p.enemy && p.bounces === 1) this.game.director?.grenadeWarning(p.position);
        } else p.position.copy(next);
        const g = this.world.terrain.getHeight(p.position.x, p.position.z);
        if (p.position.y < g + 0.08) { p.position.y = g + 0.08; if (p.velocity.y < 0) { p.velocity.y *= -0.45; p.velocity.x *= 0.6; p.velocity.z *= 0.6; p.bounces++; if (p.sticky || p.velocity.length() < 1.2) { p.landed = true; p.velocity.set(0, 0, 0); if (p.sticky) p.onLand?.(p); } } }
        p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.z += p.spin.z * dt;
      }
      p.mesh.position.copy(p.position);
      if (p.kind === 'grenade') { const blink = Math.sin(p.t * (6 + p.t * 6)) > 0; p.mesh.children[1].visible = blink; }
      if (p.t >= p.fuse && !p.noExplode) { this.detonate(p); this.list.splice(i, 1); continue; }
      if (p.dead) { this.remove(p); this.list.splice(i, 1); }
    }
  }
  detonate(p) {
    this.remove(p);
    if (p.onDetonate) p.onDetonate(p);
    else this.game.combat.explode(p.position.clone(), p.radius, p.damage, { kind: 'grenade', attackerId: p.owner, impulse: 14, friendly: !p.enemy, selfMult: p.enemy ? 1 : 0.6 });
  }
  remove(p) { p.mesh.parent?.remove(p.mesh); }
  clear() { for (const p of this.list) this.remove(p); this.list.length = 0; }
}
