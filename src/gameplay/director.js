// Spawn director: patrols, area garrisons, waves, reinforcements, player-count scaling, AI budget.
import * as THREE from 'three';
import { Enemy, Squad } from '../entities/enemy.js';
import { Drone } from '../entities/drone.js';
import { Warden } from '../entities/warden.js';
import { SQUADS } from '../entities/enemyTypes.js';
import { events } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';
import { rand, pick, randInt, seededRandom } from '../core/mathx.js';

export function scaleForPlayers(n) {
  if (n <= 1) return { enemies: 1.0, waveBudget: 1.0, flankGroups: 0, bossHp: 1.0, elites: 0 };
  if (n === 2) return { enemies: 1.6, waveBudget: 1.6, flankGroups: 1, bossHp: 1.3, elites: 1 };
  return { enemies: 2.2, waveBudget: 2.2, flankGroups: 2, bossHp: 1.6, elites: 2 };
}

export class Director {
  constructor(game, seed = 1) {
    this.game = game; this.world = game.world;
    this.enemies = []; this.squads = []; this.nextSquad = 1;
    this.rng = seededRandom(seed);
    this.maxActive = 24; this.alertLevel = 0; this.alertDecay = 0;
    this.garrisons = []; this.waveQueue = [];
    this.reinforceCooldown = 0;
    this.lastAlertLevel = 0;
    this.killCount = 0;
    this.grid = new Map();
  }
  get scaling() { return scaleForPlayers(this.game.players?.length || 1); }
  get diffCount() { return this.game.difficulty?.enemyCount ?? 1; }
  budget() { return Math.round(this.maxActive * Math.min(1.5, this.scaling.enemies * 0.7 + 0.3)); }
  spawn(typeId, pos, opts = {}) {
    if (!net.isHost) return null;
    const p = this.world.nav.nearestWalkable(pos.x, pos.z, 12) || { x: pos.x, z: pos.z };
    const at = new THREE.Vector3(p.x, this.world.groundHeight(p.x, p.z), p.z);
    const e = typeId === 'drone' ? new Drone(this.game, at.clone().setY(at.y + 6), opts) : typeId === 'warden' ? new Warden(this.game, at, opts) : new Enemy(this.game, typeId, at, opts.yaw ?? rand(0, 6.28), opts);
    if (typeId === 'warden') this.boss = e;
    this.enemies.push(e);
    net.send(MSG.EV_SPAWN, { id: e.id, type: typeId, p: v3(at), yaw: e.yaw, hp: e.health, squad: opts.squad?.id ?? 0 }, { reliable: true });
    return e;
  }
  /** Client-side spawn from replication. */
  spawnRemote(msg) {
    if (net.isHost) return;
    const at = new THREE.Vector3(...msg.p);
    const e = msg.type === 'drone' ? new Drone(this.game, at, { id: msg.id }) : msg.type === 'warden' ? new Warden(this.game, at, { id: msg.id, yaw: msg.yaw }) : new Enemy(this.game, msg.type, at, msg.yaw, { id: msg.id });
    if (msg.type === 'warden') this.boss = e;
    e.health = msg.hp; this.enemies.push(e); return e;
  }
  spawnSquad(template, center, opts = {}) {
    if (!net.isHost) return null;
    const types = Array.isArray(template) ? template : SQUADS[template];
    const sq = new Squad(this.nextSquad++); this.squads.push(sq);
    const extra = Math.round((types.length) * (this.scaling.enemies * this.diffCount - 1));
    const list = [...types]; for (let i = 0; i < extra; i++) list.push(pick(['rifleman', 'rifleman', 'breacher', 'grenadier']));
    if (this.scaling.elites && opts.allowElite) for (let i = 0; i < this.scaling.elites; i++) list.push('suppressor');
    list.forEach((t, i) => {
      const a = (i / list.length) * 6.28, r = 1.5 + i * 0.8;
      const p = new THREE.Vector3(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r);
      const e = this.spawn(t, p, { squad: sq, route: opts.route, routeIndex: opts.routeIndex, state: opts.state || (opts.route ? 'patrol' : 'idle') });
      if (e) { sq.add(e); if (opts.alert) { e.alert = true; e.setState?.('combat'); e.target = opts.target || null; e.lastSeen = opts.target ? opts.target.position.clone() : null; } }
    });
    return sq;
  }
  /** Garrison: a group that spawns when a player gets within `radius` of `center`, once. */
  addGarrison(center, radius, templates, opts = {}) { this.garrisons.push({ center: center.clone(), radius, templates, spawned: false, ...opts }); }
  /** Patrol on a level route */
  addPatrol(route, template, startIndex = 0) {
    const p = route.points[startIndex % route.points.length];
    return this.spawnSquad(template, new THREE.Vector3(p.x, 0, p.z), { route, routeIndex: startIndex, state: 'patrol' });
  }
  activeCount() { return this.enemies.filter(e => !e.dead).length; }
  near(e, r) { const out = []; for (const o of this.enemies) { if (o === e || o.dead) continue; if (Math.abs(o.position.x - e.position.x) < r && Math.abs(o.position.z - e.position.z) < r) out.push(o); } return out; }
  noise(pos, loud, source) { for (const e of this.enemies) if (e !== source && e.hearNoise) e.hearNoise(pos, loud); }
  grenadeWarning(pos) { for (const e of this.enemies) e.reactToGrenade?.(pos); }
  /** Drone / alert-triggered reinforcements from the nearest spawn point. */
  callReinforcements(targetPos, caller) {
    if (!net.isHost || this.reinforceCooldown > 0) return;
    if (this.activeCount() > this.budget()) return;
    this.reinforceCooldown = 20;
    const sp = this.nearestSpawnPoint(targetPos, 40, 110);
    if (!sp) return;
    const tmpl = pick(['patrol', 'assault', 'fire_team']);
    const target = this.game.players?.find(p => !p.dead) || null;
    this.spawnSquad(tmpl, sp, { alert: true, target, allowElite: true });
    events.emit('enemy:reinforcements', sp);
    audio.say('lg_replace', { priority: 1, delay: 1 });
    audio.play('enemy_alert', { pos: sp, volume: 0.6 });
  }
  nearestSpawnPoint(pos, minD = 30, maxD = 120) {
    const all = []; const sp = this.world.level?.spawnPoints || {}; for (const k in sp) all.push(...sp[k]);
    const cands = all.filter(p => { const d = p.distanceTo(pos); return d > minD && d < maxD; });
    if (!cands.length) return all.length ? all.reduce((a, b) => (a.distanceTo(pos) < b.distanceTo(pos) ? a : b)) : null;
    cands.sort((a, b) => a.distanceTo(pos) - b.distanceTo(pos));
    return cands[Math.min(cands.length - 1, randInt(0, 2))];
  }
  /** Queue a wave (used by mission hold phases). directions: array of spawn points. */
  wave(templates, points, opts = {}) { this.waveQueue.push({ templates, points, delay: opts.delay || 0, alert: true, allowElite: opts.allowElite }); }
  onEnemyRemoved(e) { this.killCount++; }
  update(dt) {
    if (!net.isHost) { for (const e of this.enemies) e.update(dt, this.game.camera); this.enemies = this.enemies.filter(e => !e.removed); return; }
    this.reinforceCooldown -= dt;
    const players = this.game.players || [];
    // garrisons
    for (const g of this.garrisons) {
      if (g.spawned) continue;
      for (const p of players) { if (p.dead) continue; if (p.position.distanceTo(g.center) < g.radius) { g.spawned = true; for (const t of g.templates) { const off = new THREE.Vector3(rand(-g.spread || -10, g.spread || 10), 0, rand(-g.spread || -10, g.spread || 10)); this.spawnSquad(t.template || t, g.center.clone().add(off), { route: t.route, state: t.route ? 'patrol' : 'idle', alert: !!g.alert, target: g.alert ? p : null }); } break; } }
    }
    // waves
    for (let i = this.waveQueue.length - 1; i >= 0; i--) {
      const w = this.waveQueue[i]; w.delay -= dt; if (w.delay > 0) continue;
      if (this.activeCount() > this.budget() + 4) continue;
      this.waveQueue.splice(i, 1);
      const target = players.find(p => !p.dead) || null;
      w.templates.forEach((t, k) => { const pt = w.points[k % w.points.length]; this.spawnSquad(t, pt, { alert: true, target, allowElite: w.allowElite }); });
    }
    // update enemies with LOD: near ones every frame, far ones throttled inside Enemy
    let alert = 0;
    for (const e of this.enemies) { e.update(dt, this.game.camera); if (!e.dead && e.alert) alert++; }
    this.enemies = this.enemies.filter(e => !e.removed);
    for (const s of this.squads) s.update(dt); this.squads = this.squads.filter(s => s.members.length);
    // alert level for HUD/music
    this.alertLevel = alert === 0 ? Math.max(0, this.alertLevel - dt * 0.25) : Math.min(3, Math.max(this.alertLevel, alert >= 8 ? 3 : alert >= 3 ? 2 : 1));
    const lvl = Math.round(this.alertLevel);
    if (lvl !== this.lastAlertLevel) { this.lastAlertLevel = lvl; events.emit('alert:level', lvl); }
  }
  snapshot() { return this.enemies.filter(e => !e.dead).map(e => e.snapshot()); }
  applySnapshot(list) {
    const seen = new Set();
    for (const s of list) { seen.add(s[0]); let e = this.world.entities.get(s[0]); if (!e) { e = this.spawnRemote({ id: s[0], type: s[1], p: [s[2], s[3], s[4]], yaw: s[5], hp: s[6] }); } e.applySnapshot(s); }
  }
  clear() { for (const e of this.enemies) { e.dead = true; e.removeModel?.(); e.model?.parent?.remove(e.model); this.world.unregister(e); } this.enemies.length = 0; this.squads.length = 0; this.garrisons.length = 0; this.waveQueue.length = 0; }
}
