// Combat resolver: applies damage (host-authoritative), dispatches gore/FX events, tracks stats.
import * as THREE from 'three';
import { events } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';
import { settings } from '../core/settings.js';

const ZONE_MULT = { head: 1, chest: 1, pelvis: 0.9, armL: 0.65, armR: 0.65, legL: 0.7, legR: 0.7, core: 1.6, body: 1 };
const LIMB_ZONES = ['armL', 'armR', 'legL', 'legR'];

export class Combat {
  constructor(game) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.stats = { kills: 0, headshots: 0, shotsFired: 0, shotsHit: 0, damageDealt: 0, damageTaken: 0, limbsRemoved: 0, grenadesThrown: 0, orbitalStrikes: 0, dronesDestroyed: 0, streak: 0, bestStreak: 0 };
    this._tmp = new THREE.Vector3();
  }
  /** Player weapon hit on anything (called locally by the shooter). */
  playerHit(hit, weaponDef, dir, shooterId = net.localId) {
    this.stats.shotsHit++;
    const e = hit.entity;
    if (!e) return;
    const dist = hit.dist;
    let dmg = weaponDef.damage;
    if (weaponDef.falloffStart && dist > weaponDef.falloffStart) dmg *= Math.max(0.35, 1 - (dist - weaponDef.falloffStart) / (weaponDef.range - weaponDef.falloffStart));
    const zone = hit.zone || 'chest';
    if (zone === 'head') dmg *= weaponDef.headMult || 2;
    dmg *= ZONE_MULT[zone] ?? 1;
    const info = { targetId: e.id, targetType: e.entityType, zone, dmg: Math.round(dmg), weapon: weaponDef.id, p: v3(hit.point), n: v3(hit.normal), dir: v3(dir), attackerId: shooterId, impulse: weaponDef.impulse || 1 };
    // Local cosmetic feedback immediately (blood/sparks), authoritative damage via host
    this.hitEffects(e, info);
    net.request(MSG.REQ_HIT, info);
  }
  /** Host: apply damage from a hit request. */
  applyHit(info, fromId) {
    if (!net.isHost) return;
    const e = this.world.entities.get(info.targetId);
    if (!e || e.dead) return;
    const result = e.takeDamage(info.dmg, info);
    if (!result) return;
    const ev = { ...info, hp: e.health, dead: !!result.dead, gib: !!result.gib, limb: result.limb || null, stagger: !!result.stagger, armourBroke: !!result.armourBroke };
    net.send(MSG.EV_DAMAGE, ev, { reliable: true });
    this.onDamageEvent(ev, true);
  }
  /** Both host (after apply) and clients (on receipt) run this for presentation + stats. */
  onDamageEvent(ev, isHost = false) {
    const e = this.world.entities.get(ev.targetId);
    if (!e) return;
    const mine = ev.attackerId === net.localId;
    if (!isHost) e.applyRemoteDamage(ev);
    if (mine) {
      this.stats.damageDealt += ev.dmg;
      events.emit('hud:hitmarker', { headshot: ev.zone === 'head', kill: ev.dead, armour: ev.armourBroke });
    }
    if (ev.armourBroke) { audio.play('armor_break', { pos: e.position, volume: 0.9 }); this.fx.sparksBurst?.(this._tmp.set(...ev.p), this._tmp.clone().set(...ev.n), 14); }
    if (ev.stagger && !ev.dead) e.stagger?.(ev);
    if (ev.limb && !ev.dead) { e.loseLimb(ev.limb, ev); if (mine) this.stats.limbsRemoved++; }
    if (ev.dead) this.onKill(e, ev, mine);
  }
  hitEffects(e, info) {
    const p = new THREE.Vector3(...info.p), n = new THREE.Vector3(...info.n), d = new THREE.Vector3(...info.dir);
    if (e.mechanical) { this.fx.impact(p, n, 'metal'); this.fx.sparksBurst?.(p, n, 10, '#ffb36a'); audio.play('hit_metal', { pos: p, volume: 0.7, pitchVar: 0.1 }); }
    else if (e.armourAt?.(info.zone) > 0) { this.fx.impact(p, n, 'metal'); audio.play('hit_armor', { pos: p, volume: 0.8, pitchVar: 0.1 }); }
    else { this.fx.blood(p, n, d, info.zone === 'head' ? 1.6 : 1); audio.play('hit_flesh', { pos: p, volume: 0.9, pitchVar: 0.12 }); if (settings.goreLevel > 0) audio.play('blood_splat', { pos: p, volume: 0.5, pitchVar: 0.15 }); }
    this.fx.hitFlash?.(e.flashMesh || e.model?.meshes?.[0]);
  }
  onKill(e, ev, mine) {
    if (mine) {
      this.stats.kills++; this.stats.streak++; if (this.stats.streak > this.stats.bestStreak) this.stats.bestStreak = this.stats.streak;
      if (ev.zone === 'head') this.stats.headshots++;
      if (e.type?.id === 'drone') this.stats.dronesDestroyed++;
      events.emit('player:kill', e, ev);
    }
    e.die(ev);
    events.emit('enemy:died', e, ev);
  }
  /** Area damage (grenades, barrels, orbital). Host authoritative; clients only get FX via EV_EXPLOSION. */
  explode(pos, radius, damage, opts = {}) {
    const kind = opts.kind || 'grenade';
    this.fx.explosion(pos, radius, kind);
    audio.play(radius > 10 ? 'explosion_huge' : radius > 6 ? 'explosion_large' : 'explosion_medium', { pos, volume: 1, important: true, maxDistance: 400, refDistance: 12 });
    if (!net.isHost) return;
    net.send(MSG.EV_EXPLOSION, { p: v3(pos), r: radius, kind }, { reliable: true });
    const attackerId = opts.attackerId ?? 0;
    for (const e of [...this.world.entities.values()]) {
      if (e.dead || !e.takeDamage) continue;
      const c = e.hitCenter || e.position;
      const d = c.distanceTo(pos);
      const r = radius + (e.hitRadius || 0.5) * 0.5;
      if (d > r) continue;
      const fall = 1 - Math.pow(Math.max(0, d - 1) / r, 1.4);
      const dmg = Math.round(damage * fall * (e.isPlayer && opts.friendly ? 0.35 : 1) * (e.isPlayer && opts.selfMult != null ? opts.selfMult : 1));
      if (dmg <= 0) continue;
      const dir = c.clone().sub(pos).normalize(); if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
      const info = { targetId: e.id, targetType: e.entityType, zone: 'chest', dmg, weapon: kind, p: v3(c), n: v3(dir.clone().negate()), dir: v3(dir), attackerId, impulse: (opts.impulse ?? 14) * fall, explosive: true };
      if (e.isPlayer) { e.takeDamage(dmg, info); continue; }
      const result = e.takeDamage(dmg, info);
      if (!result) continue;
      const ev = { ...info, hp: e.health, dead: !!result.dead, gib: !!result.gib, limb: result.limb || null, stagger: !!result.stagger };
      net.send(MSG.EV_DAMAGE, ev, { reliable: true });
      this.onDamageEvent(ev, true);
    }
    // destructibles (barrels)
    for (const d of (this.world.level?.destructibles || [])) {
      if (d.destroyed || !d.position) continue;
      if (d.position.distanceTo(pos) < radius + 1) this.game.mission?.destroyDestructible(d, 0.25 + Math.random() * 0.3);
    }
  }
}
