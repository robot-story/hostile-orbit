// Recon drone: flying mechanical unit that marks the player with a red beam and calls reinforcements.
import * as THREE from 'three';
import { CUSTOM } from '../models/glbSoldier.js';
import { Mat, COLORS } from '../render/materials.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { net } from '../net/net.js';
import { clamp, damp, angleDamp, rand } from '../core/mathx.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export function buildDroneModel() {
  const g = new THREE.Group();
  const hull = CUSTOM.body.drone;
  const body = hull ? new THREE.Mesh(hull.geometry, hull.material) : new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), Mat.legionArmor()); if (!hull) body.scale.set(1, 0.6, 1.2); body.castShadow = true; g.add(body);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), Mat.neon(COLORS.red, 3)); eye.position.set(0, -0.05, 0.42); g.add(eye);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.7), Mat.gunMetal()); arm.position.set(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5); arm.rotation.y = -a + Math.PI / 2; g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12), Mat.glowAdditive(COLORS.redOrange, 0.35)); rotor.position.set(Math.cos(a) * 0.82, 0.1, Math.sin(a) * 0.82); rotor.name = 'rotor'; g.add(rotor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 20), Mat.neon(COLORS.redOrange, 2)); ring.rotation.x = Math.PI / 2; ring.position.copy(rotor.position); g.add(ring);
  }
  const under = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), Mat.gunMetal()); under.position.y = -0.3; g.add(under);
  const light = new THREE.PointLight(COLORS.red, 6, 10, 2); light.position.y = -0.2; g.add(light);
  g.userData.light = light;
  return g;
}

export class Drone {
  constructor(game, pos, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.type = ENEMY_TYPES.drone; this.typeId = 'drone'; this.entityType = 'enemy'; this.isEnemy = true; this.mechanical = true;
    this.id = opts.id ?? null; this.squad = opts.squad || null;
    this.position = pos.clone(); this.position.y = Math.max(this.position.y, this.world.terrain.getHeight(pos.x, pos.z) + this.type.hoverHeight);
    this.velocity = new THREE.Vector3(); this.yaw = 0;
    this.maxHealth = this.type.health; this.health = this.maxHealth; this.dead = false;
    this.hitRadius = 1.0; this.hitCenter = this.position; this.hitboxes = true; this.armour = {};
    this.model = buildDroneModel(); this.world.actors.add(this.model); this.flashMesh = this.model.children[0];
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1, 6, 1, true), Mat.glowAdditive(COLORS.red, 0.6)); this.beam.visible = false; this.world.fxGroup.add(this.beam);
    this.target = null; this.canSee = false; this.markT = 0; this.callT = 8; this.alert = false; this.orbitA = rand(0, 6.28); this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.hum = null; this.distToCam = 99; this.tick = 0; this.state = 'scan'; this.staggerT = 0;
    this.world.register(this);
  }
  raycastHitboxes(o, d, maxT) {
    const ox = o.x - this.position.x, oy = o.y - this.position.y, oz = o.z - this.position.z;
    const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - 0.6 * 0.6; const disc = b * b - cc; if (disc < 0) return null;
    const t = -b - Math.sqrt(disc); if (t < 0 || t > maxT) return null;
    return { t, zone: 'core', normal: _v.copy(d).negate(), material: 'metal' };
  }
  armourAt() { return 0; }
  takeDamage(dmg, info) {
    if (this.dead) return null; this.health -= dmg; this.alert = true;
    this.velocity.addScaledVector(new THREE.Vector3(...(info.dir || [0, 0, 0])), 2);
    if (this.health <= 0) return { dead: true, gib: false, stagger: false };
    return { dead: false, stagger: false };
  }
  applyRemoteDamage(ev) { this.health = ev.hp; }
  stagger() {}
  loseLimb() {}
  die() {
    if (this.dead) return; this.dead = true; this.world.unregister(this);
    this.fx.explosion(this.position.clone(), 2.5, 'drone'); this.fx.sparksBurst?.(this.position.clone(), UP, 40); this.fx.smokeColumn?.(this.position.clone(), 0.6, 3);
    audio.play('drone_explode', { pos: this.position, volume: 1 }); this.hum?.stop(0.1);
    this.model.parent?.remove(this.model); this.beam.parent?.remove(this.beam);
    if (this.marking) { events.emit('player:unmarked'); }
    this.game.director?.onEnemyRemoved(this);
  }
  pickTarget() { const ps = this.game.players || []; let b = null, bd = Infinity; for (const p of ps) { if (p.dead) continue; const d = p.position.distanceTo(this.position); if (d < bd) { bd = d; b = p; } } return b; }
  update(dt, camera) {
    if (this.dead) return;
    this.distToCam = camera ? camera.position.distanceTo(this.position) : 50;
    if (!this.hum && this.distToCam < 60) this.hum = audio.play('drone_hum', { pos: this.position, loop: true, volume: 0.6 });
    this.hum?.setPosition(this.position);
    const rot = this.model.children.filter(c => c.name === 'rotor'); for (const r of rot) r.rotation.y += dt * 40;
    if (net.isHost) {
      this.target = this.pickTarget();
      const ground = this.world.terrain.getHeight(this.position.x, this.position.z);
      let goal = _v.set(this.position.x, ground + this.type.hoverHeight, this.position.z);
      if (this.target) {
        const d = this.target.position.distanceTo(this.position);
        const eye = this.position, aim = _v2.copy(this.target.position).addScaledVector(UP, 1.3);
        this.canSee = d < 60 && this.world.hasLOS(eye, aim, { terrainStep: 2 });
        if (this.canSee) this.alert = true;
        // recon behaviour: patrol -> spot (hover and scan, killable) -> fetch the nearest squad -> lead them in
        const grace = (this.game.mission?.time || 0) < 14; // nobody gets tagged in the first seconds after landing
        this.scanT = this.scanT || 0; this.loseT = this.loseT || 0; this.state = this.state || 'patrol';
        if (this.state === 'patrol' || this.state === 'return') {
          if (this.canSee && !grace && d < 48) { this.state = 'spot'; this.scanT = 0; this.scanPhase = 0; audio.play('drone_alert', { pos: this.position }); events.emit('toast', 'RECON DRONE HAS YOU  //  KILL IT BEFORE IT SCANS', 'warn'); }
          this.orbitA += dt * 0.2; goal.x += Math.cos(this.orbitA) * 4; goal.z += Math.sin(this.orbitA) * 4;
        }
        if (this.state === 'spot') {
          // hover close and low, scanning beam sweeps up and down the target
          const side = _v2.set(this.position.x - this.target.position.x, 0, this.position.z - this.target.position.z); if (side.lengthSq() < 1) side.set(1, 0, 0); side.normalize();
          goal.set(this.target.position.x + side.x * 9, 0, this.target.position.z + side.z * 9); goal.y = Math.max(this.world.terrain.getHeight(goal.x, goal.z), this.target.position.y) + 4.2 + Math.sin(this.game.time * 2) * 0.3;
          if (this.canSee) { this.scanT += dt; this.loseT = 0; this.marking = true; this.scanPhase = (this.scanPhase || 0) + dt * 2.2; }
          else { this.loseT += dt; this.marking = false; if (this.loseT > 1.6) { this.state = 'patrol'; this.scanT = 0; events.emit('player:unmarked'); } }
          if (this.scanT >= (this.type.markTime || 2.5) + 1.2) { this.state = 'fetch'; this.marking = false; events.emit('player:unmarked'); this.lastMark = this.target.position.clone(); events.emit('player:marked', this); audio.play('drone_marking', { pos: this.position, volume: 0.9 }); events.emit('toast', 'SCAN COMPLETE  //  DRONE IS FETCHING A PATROL', 'warn');
            // pick the nearest awake-able squad within reach; fall back to calling a drop
            let best = null, bd = 150; for (const e of this.game.director?.enemies || []) { if (e.dead || e.typeId === 'drone' || e.typeId === 'ravager' || e.isBoss || e.alert) continue; const dd = e.position.distanceTo(this.position); if (dd < bd) { bd = dd; best = e; } }
            this.fetchTarget = best; if (!best) { this.game.director?.callReinforcements(this.lastMark, this); this.state = 'return'; this.callT = this.type.callCooldown; } }
        }
        if (this.state === 'fetch') {
          const f = this.fetchTarget; if (!f || f.dead) { this.state = 'return'; }
          else { goal.set(f.position.x, f.position.y + 5, f.position.z); if (this.position.distanceTo(f.position) < 8) { const squad = f.squad?.members || [f]; for (const m of squad) { if (m.dead) continue; m.alert = true; m.lastSeen = (m.lastSeen || new THREE.Vector3()).copy(this.lastMark || this.target.position); if (m.state !== 'cover') m.state = 'investigate'; } audio.play('drone_alert', { pos: this.position }); events.emit('toast', 'LEGION PATROL ALERTED  //  INBOUND', 'warn'); this.state = 'lead'; this.leadT = 0; } }
        }
        if (this.state === 'lead') {
          // fly back toward the mark ahead of the squad, then resume spotting after a cooldown
          this.leadT = (this.leadT || 0) + dt; const m = this.lastMark || this.target.position; goal.set(m.x, m.y + 6, m.z);
          if (this.position.distanceTo(m) < 10 || this.leadT > 14) { this.state = 'return'; this.callT = this.type.callCooldown; this.spotCooldown = 12; }
        }
        if (this.state === 'return') { this.spotCooldown = Math.max(0, (this.spotCooldown || 0) - dt); if (this.spotCooldown <= 0) this.state = 'patrol'; }
        if (this.state !== 'spot') this.marking = false;
      }
      const toGoal = _v2.subVectors(goal, this.position); const dist = toGoal.length();
      const speed = Math.min(this.type.speed, dist * 1.5);
      if (dist > 0.1) toGoal.divideScalar(dist).multiplyScalar(speed); else toGoal.set(0, 0, 0);
      this.velocity.lerp(toGoal, Math.min(1, dt * 2.5));
      this.position.addScaledVector(this.velocity, dt);
      const minY = this.world.terrain.getHeight(this.position.x, this.position.z) + 2.5; if (this.position.y < minY) this.position.y = minY;
      if (this.target) this.yaw = angleDamp(this.yaw, Math.atan2(-(this.target.position.x - this.position.x), -(this.target.position.z - this.position.z)), 4, dt);
    } else if (this.netTarget) { this.position.lerp(this.netTarget.p, Math.min(1, dt * 10)); this.yaw = angleDamp(this.yaw, this.netTarget.yaw, 8, dt); this.marking = this.netTarget.marking; }
    this.model.position.copy(this.position); this.model.rotation.y = this.yaw + Math.PI;
    this.model.rotation.z = clamp(-this.velocity.x * 0.03, -0.3, 0.3); this.model.rotation.x = clamp(this.velocity.z * 0.03, -0.3, 0.3);
    // marking beam
    if (this.marking && this.target) {
      this.beam.visible = true;
      const sweep = 0.4 + (Math.sin(this.scanPhase || 0) * 0.5 + 0.5) * 1.5; // up and down the frame
      const a = this.position, b = _v.copy(this.target.position).addScaledVector(UP, sweep);
      const mid = _v2.addVectors(a, b).multiplyScalar(0.5); const len = a.distanceTo(b);
      this.beam.position.copy(mid); this.beam.scale.set(1, len, 1); this.beam.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      this.model.userData.light.intensity = 10 + Math.sin(this.game.time * 20) * 4;
    } else { this.beam.visible = false; this.model.userData.light.intensity = 5; }
  }
  snapshot() { return [this.id, 'drone', +this.position.x.toFixed(2), +this.position.y.toFixed(2), +this.position.z.toFixed(2), +this.yaw.toFixed(2), this.health, this.marking ? 1 : 0, 0, 0, 0, 0]; }
  applySnapshot(s) { this.netTarget = this.netTarget || { p: new THREE.Vector3(), yaw: 0, marking: false }; this.netTarget.p.set(s[2], s[3], s[4]); this.netTarget.yaw = s[5]; this.health = s[6]; this.netTarget.marking = !!s[7]; }
}
