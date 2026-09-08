// Gameplay replication: host broadcasts world snapshots/events; clients apply them. Player snapshots flow both ways.
import * as THREE from 'three';
import { net, MSG } from './net.js';
import { v3, SNAPSHOT_HZ, PLAYER_SNAP_HZ } from './protocol.js';
import { events } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { RemotePlayer } from '../entities/remotePlayer.js';
import { WEAPONS } from '../gameplay/weapons.js';

export class NetSync {
  constructor(game) {
    this.game = game; this.world = game.world; this.session = game.session;
    this.remotes = new Map(); // playerId -> RemotePlayer
    this.snapT = 0; this.playerSnapT = 0;
    this.offs = [];
    const on = (t, fn) => this.offs.push(net.on(t, fn));
    // --- both ---
    on(MSG.SNAP_PLAYER, (s, from) => { if (s.id === net.localId) return; const rp = this.ensureRemote(s.id, s); rp.applySnapshot(s); });
    on(MSG.REQ_SHOT, (m, from) => { if (m.id === net.localId) return; const rp = this.remotes.get(m.id); if (rp) rp.showShot(m.from, m.to); if (net.isHost) net.send(MSG.REQ_SHOT, m, { reliable: false }); });
    on(MSG.EV_DAMAGE, (ev) => {
      if (ev.targetType === 'player') { if (ev.targetId === net.localId) this.game.localPlayer?.takeDamage(ev.dmg, { ...ev, fromNet: true }); return; }
      if (!net.isHost) this.session.combat.onDamageEvent(ev, false);
    });
    on(MSG.EV_PLAYERDOWN, (m, from) => { if (net.isHost) this.session.mission.onRemotePlayerDied(m, from); });
    on(MSG.EV_REINFORCE, (m) => { if (m.id === net.localId && !net.isHost) { this.session.mission.lives = m.lives; events.emit('lives:changed', m.lives); this.game.launchPlayerPod(this.game.localPlayer, new THREE.Vector3(...m.p)); } else if (m.id !== net.localId) { events.emit('toast', `${this.remotes.get(m.id)?.name || 'SQUADMATE'} REINFORCED`, 'info'); } });
    // --- client only ---
    if (!net.isHost) {
      on(MSG.SNAP_WORLD, (s) => { this.session.director.applySnapshot(s.enemies); if (s.boss) events.emit('boss:health', this.session.director.boss); });
      on(MSG.EV_SPAWN, (m) => this.session.director.spawnRemote(m));
      on(MSG.EV_DESPAWN, (m) => { const e = this.world.entities.get(m.id); if (e) { e.dead = true; e.removeModel?.(); this.world.unregister(e); } });
      on(MSG.EV_ENEMYFIRE, (m) => { const e = this.world.entities.get(m.id); const from = new THREE.Vector3(...m.from); const def = WEAPONS[m.weapon]; for (const to of m.to) { this.session.fx.tracer(from, new THREE.Vector3(...to), def?.tracer || '#ff5a1f', 0.05, 220); } this.session.fx.muzzleFlash(from, new THREE.Vector3(...m.to[0]).sub(from).normalize(), '#ff6a2a', 1); audio.play(def?.sound || 'enemy_rifle_fire', { pos: from, volume: 0.8 }); e?.anim?.kick?.(0.5); });
      on(MSG.EV_EXPLOSION, (m) => { this.session.fx.explosion(new THREE.Vector3(...m.p), m.r, m.kind); audio.play(m.r > 10 ? 'explosion_huge' : m.r > 6 ? 'explosion_large' : 'explosion_medium', { pos: new THREE.Vector3(...m.p), volume: 1, maxDistance: 400, refDistance: 12 }); });
      on(MSG.EV_GRENADE, (m) => { if (m.owner === net.localId) return; this.session.projectiles.spawn('grenade', new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), { fuse: m.fuse, enemy: m.enemy, owner: m.owner, id: m.id, noExplode: true }); setTimeout(() => { const p = this.session.projectiles.list.find(x => x.id === m.id); if (p) p.dead = true; }, m.fuse * 1000); });
      on(MSG.EV_MISSION, (m) => { this.session.mission.active = false; this.session.mission.result = m.stats; events.emit('mission:end', m.stats); });
      on(MSG.EV_DEATH, () => {});
    }
    // roster changes
    this.offs.push(events.on('mp:left', (id) => this.dropRemote(id)));
  }
  ensureRemote(id, s) {
    let rp = this.remotes.get(id);
    if (!rp) { const info = net.transport?.players?.find(p => p.id === id) || { id, slot: this.remotes.size + 1, name: 'VANGUARD' }; rp = new RemotePlayer(this.game, info); this.remotes.set(id, rp); this.session.players.push(rp); }
    return rp;
  }
  dropRemote(id) { const rp = this.remotes.get(id); if (!rp) return; rp.remove(); this.remotes.delete(id); const i = this.session.players.indexOf(rp); if (i >= 0) this.session.players.splice(i, 1); events.emit('toast', `${rp.name} DISCONNECTED — WAVES RESCALED`, 'warn'); }
  update(dt) {
    for (const rp of this.remotes.values()) rp.update(dt);
    if (!net.transport || net.transport.peerCount === 0 && net.isHost) return;
    // local player snapshot
    this.playerSnapT += dt;
    if (this.playerSnapT >= 1 / PLAYER_SNAP_HZ) {
      this.playerSnapT = 0;
      const p = this.game.localPlayer; if (p) {
        const a = p.lastAnimState || {};
        net.send(MSG.SNAP_PLAYER, { id: net.localId, p: v3(p.position), yaw: +p.yaw.toFixed(3), pitch: +p.cam.pitch.toFixed(2), hp: Math.round(p.health), dead: p.dead, state: p.state, w: p.weapon.def.id, anim: { speed: +(a.speed || 0).toFixed(2), strafe: +(a.strafe || 0).toFixed(2), forward: a.forward, sprint: a.sprint, crouch: a.crouch, aim: a.aim, cover: a.cover ? { high: a.cover.high, peek: +(a.cover.peek || 0).toFixed(2), over: a.cover.over, blind: a.cover.blind } : null, roll: a.roll, vault: a.vault, reload: a.reload } }, { reliable: false });
      }
    }
    if (net.isHost) {
      this.snapT += dt;
      if (this.snapT >= 1 / SNAPSHOT_HZ) { this.snapT = 0; const d = this.session.director; net.send(MSG.SNAP_WORLD, { t: +this.game.time.toFixed(2), enemies: d.snapshot(), boss: d.boss && !d.boss.dead ? [d.boss.health, d.boss.phase] : null }, { reliable: false }); }
    }
  }
  dispose() { for (const o of this.offs) o(); for (const rp of this.remotes.values()) rp.remove(); this.remotes.clear(); }
}
