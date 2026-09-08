// Remote squadmate: interpolated soldier driven by network snapshots; damageable so enemies and friendly fire can hit it.
import * as THREE from 'three';
import { buildSoldier } from '../models/soldier.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';
import { CharacterAnimator } from './animator.js';
import { WEAPONS } from '../gameplay/weapons.js';
import { Mat } from '../render/materials.js';
import { audio } from '../audio/audio.js';
import { net, MSG } from '../net/net.js';
import { FRIENDLY_FIRE_MULT, SQUAD_COLORS } from '../net/protocol.js';
import { events } from '../core/events.js';
import { clamp, damp, angleDamp } from '../core/mathx.js';

const UP = new THREE.Vector3(0, 1, 0);

export class RemotePlayer {
  constructor(game, info) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.id = info.id; this.slot = info.slot ?? 1; this.name = info.name || 'VANGUARD'; this.color = SQUAD_COLORS[this.slot] || '#ffb020';
    this.entityType = 'player'; this.isPlayer = true; this.isRemote = true;
    this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.health = 100; this.maxHealth = 100; this.dead = false; this.downed = false; this.crouching = false; this.aiming = false; this.sprinting = false; this.state = 'normal';
    this.hitboxes = true; this.hitRadius = 1.3; this.hitCenter = new THREE.Vector3(); this.radius = 0.38;
    this.model = buildSoldier('vanguard'); this.anim = new CharacterAnimator(this.model);
    // squad-colour the neon strips
    const neon = Mat.neon(this.color, 2.6); for (const m of this.model.meshes) if (m.name === 'part:neon') m.material = neon;
    this.weaponId = 'viper'; this.weaponModel = WEAPON_BUILDERS.viper(); this.anim.weaponSocket.add(this.weaponModel);
    this.world.actors.add(this.model.root);
    this.target = { p: new THREE.Vector3(), yaw: 0, pitch: 0, anim: { speed: 0, crouch: 0, aim: 0, sprint: 0, cover: null }, t: 0 };
    this.lastSnapT = 0; this.flashMesh = this.model.meshes[0];
    this.world.register(this);
    this.marker = null;
    events.emit('squad:joined', this);
  }
  applySnapshot(s) {
    this.target.p.set(s.p[0], s.p[1], s.p[2]); this.target.yaw = s.yaw; this.target.pitch = s.pitch || 0;
    this.target.anim = s.anim || this.target.anim; this.health = s.hp; this.dead = !!s.dead; this.state = s.state || 'normal';
    this.crouching = !!s.anim?.crouch; this.aiming = !!s.anim?.aim; this.sprinting = !!s.anim?.sprint;
    if (s.w && s.w !== this.weaponId) { this.weaponId = s.w; this.anim.weaponSocket.remove(this.weaponModel); this.weaponModel = (WEAPON_BUILDERS[s.w] || WEAPON_BUILDERS.viper)(); this.anim.weaponSocket.add(this.weaponModel); }
    if (this.lastSnapT === 0) { this.position.copy(this.target.p); this.yaw = this.target.yaw; }
    this.lastSnapT = performance.now();
  }
  /** Replicated shot visual */
  showShot(from, to) { const def = WEAPONS[this.weaponId] || WEAPONS.viper; const m = this.weaponModel.userData.muzzle.getWorldPosition(new THREE.Vector3()); this.fx.tracer(m, new THREE.Vector3(...to), def.tracer, 0.05, 260); this.fx.muzzleFlash(m, new THREE.Vector3(...to).sub(m).normalize(), def.tracer, 1); audio.play(def.sound, { pos: m, volume: 0.8, pitchVar: 0.05 }); this.anim.kick(def.kick || 0.4); }
  // hitboxes: reuse a compact set
  raycastHitboxes(o, d, maxT) {
    const B = this.model.bones; const a = new THREE.Vector3(), b = new THREE.Vector3(); let best = maxT, zone = null;
    const sph = (c, r, z) => { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const bb = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r; const disc = bb * bb - cc; if (disc < 0) return; const t = -bb - Math.sqrt(disc); if (t >= 0 && t < best) { best = t; zone = z; } };
    sph(B.head.getWorldPosition(a).add(new THREE.Vector3(0, 0.1, 0)), 0.2, 'head');
    B.spine.getWorldPosition(a); B.neck.getWorldPosition(b); for (let i = 0; i <= 2; i++) sph(new THREE.Vector3().lerpVectors(a, b, i / 2), 0.3, 'chest');
    sph(B.root.getWorldPosition(a), 0.3, 'pelvis');
    if (!zone) return null; return { t: best, zone, normal: d.clone().negate(), material: 'flesh' };
  }
  armourAt() { return 0; }
  /** Damage to a remote player is forwarded to its owner (host applies friendly-fire scaling). */
  takeDamage(dmg, info = {}) {
    if (this.dead) return null;
    const attacker = info.attackerId ? this.world.entities.get(info.attackerId) : null;
    const friendly = attacker?.isPlayer || info.friendly;
    const final = Math.round(dmg * (friendly ? FRIENDLY_FIRE_MULT : 1));
    if (final <= 0) return null;
    if (net.isHost) net.send(MSG.EV_DAMAGE, { targetId: this.id, targetType: 'player', dmg: final, zone: info.zone || 'chest', p: info.p, n: info.n, dir: info.dir, attackerId: info.attackerId || 0, weapon: info.weapon }, { reliable: true, to: this.id });
    if (friendly && attacker === this.game.localPlayer) { audio.say('ship_friendly_fire', { priority: 1 }); events.emit('toast', 'FRIENDLY FIRE — WELLNESS SCORE AFFECTED', 'warn'); }
    return { dead: false };
  }
  applyRemoteDamage() {}
  stagger() {} loseLimb() {}
  die() { this.dead = true; }
  update(dt) {
    const stale = performance.now() - this.lastSnapT > 4000;
    this.position.lerp(this.target.p, Math.min(1, dt * 14));
    this.yaw = angleDamp(this.yaw, this.target.yaw, 14, dt);
    this.velocity.copy(this.target.p).sub(this.position).multiplyScalar(6);
    const a = this.target.anim || {};
    this.anim.aimPitch = clamp(this.target.pitch / 1.1, -1, 1);
    this.anim.update(dt, { speed: a.speed || 0, strafe: a.strafe || 0, forward: a.forward ?? 1, sprint: a.sprint || 0, crouch: a.crouch || 0, aim: a.aim || 0, cover: a.cover || null, dead: this.dead, weaponLow: 0, roll: a.roll ?? null, vault: a.vault ?? null, reload: a.reload ?? null });
    this.model.root.position.copy(this.position); this.model.root.rotation.y = this.yaw + Math.PI;
    this.model.root.visible = !stale && !(this.dead && this.state === 'dead' && performance.now() - this.lastSnapT > 6000);
    this.hitCenter.copy(this.position).setY(this.position.y + 1);
  }
  remove() { this.world.unregister(this); this.model.root.parent?.remove(this.model.root); events.emit('squad:left', this); }
}
