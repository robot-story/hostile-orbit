// Orbital abilities: beacons, cooldowns, kinetic strike, gunship run, sentry pod, supply pod. Host-authoritative effects.
import * as THREE from 'three';
import { ABILITIES } from './weapons.js';
import { DropPod, SentryTurret, Gunship, buildSupplyCrate } from './pods.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { input } from '../core/input.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';
import { COLORS } from '../render/materials.js';

const ORDER = ['kinetic', 'gunship', 'sentry', 'supply'];

export class Abilities {
  constructor(game) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.unlocked = false;
    this.cooldowns = { kinetic: 0, gunship: 0, sentry: 0, supply: 0 };
    this.active = []; // pods, turrets, gunships
    this.pendingBeacon = null;
    net.on(MSG.REQ_ABILITY, (m, from) => { if (net.isHost) this.execute(m.ability, new THREE.Vector3(...m.p), from, new THREE.Vector3(...(m.dir || [0, 0, 1]))); });
    net.on(MSG.EV_POD, (m) => { if (!net.isHost) this.spawnVisual(m); });
  }
  unlock() { if (this.unlocked) return; this.unlocked = true; events.emit('abilities:unlock'); }
  update(dt) {
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    const p = this.game.localPlayer;
    if (p && !p.dead && this.unlocked && input.enabled) {
      ORDER.forEach((id, i) => { if (input.pressed(`ability${i + 1}`)) this.tryUse(id); });
    }
    for (let i = this.active.length - 1; i >= 0; i--) { const a = this.active[i]; a.update(dt); if (a.done || a.removed || (a.poweredDown && a.removed)) this.active.splice(i, 1); }
    events.emit('hud:abilities', this.cooldowns, this.unlocked);
  }
  tryUse(id) {
    const def = ABILITIES[id]; const p = this.game.localPlayer;
    if (this.cooldowns[id] > 0) { audio.ui('ui_error'); events.emit('toast', `${def.name} RECHARGING ${Math.ceil(this.cooldowns[id])}s`, 'warn'); return; }
    if (p.state === 'roll' || p.state === 'vault' || p.reloadT >= 0) return;
    this.cooldowns[id] = def.cooldown;
    // throw a beacon toward the aim point
    const from = p.position.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(p.cam.lookDir, 0.6);
    const dir = p.cam.lookDir.clone();
    const color = id === 'supply' ? COLORS.green : id === 'sentry' ? COLORS.amber : COLORS.cyan;
    const beacon = this.game.projectiles.throwBeacon(from, dir, { color, onLand: (b) => { b.dead = true; this.request(id, b.position.clone(), dir); } });
    p.anim.kick(1.0); audio.play('beacon_throw', { volume: 0.8 });
    audio.say('vg_orbital', { priority: 1 });
    events.emit('toast', `${def.name} REQUESTED`, 'info');
  }
  request(id, pos, dir) { if (net.isHost) this.execute(id, pos, net.localId, dir); else net.send(MSG.REQ_ABILITY, { ability: id, p: v3(pos), dir: v3(dir) }, { reliable: true }); }
  /** Host: spawn the physical effect and replicate. */
  execute(id, pos, owner, dir) {
    const def = ABILITIES[id];
    const g = this.world.groundHeight(pos.x, pos.z); pos.y = g;
    net.send(MSG.EV_POD, { id: this.world.allocId(), kind: id, p: v3(pos), owner, dir: v3(dir) }, { reliable: true });
    this._spawn(id, pos, owner, dir, def);
    this.game.combat.stats.orbitalStrikes++;
  }
  spawnVisual(m) { this._spawn(m.kind, new THREE.Vector3(...m.p), m.owner, new THREE.Vector3(...(m.dir || [0, 0, 1])), ABILITIES[m.kind]); }
  _spawn(id, pos, owner, dir, def) {
    if (id === 'kinetic') {
      const zone = this.fx.warningZone(pos, def.radius, COLORS.red, def.delay);
      audio.play('kinetic_charge', { pos, volume: 1, maxDistance: 500, refDistance: 30, important: true });
      const timer = { t: 0, done: false, update: (dt) => {
        timer.t += dt;
        if (timer.t > def.delay - 1.2 && !timer.beam) { timer.beam = true; this.fx.beam(pos.clone().setY(pos.y + 400), pos.clone(), '#9ff5ff', 2.2, 1.3); audio.play('kinetic_beam', { pos, volume: 1, maxDistance: 600, refDistance: 40, important: true }); }
        if (timer.t > def.delay && !timer.done) {
          timer.done = true; zone.remove();
          if (net.isHost) this.game.combat.explode(pos.clone(), def.radius, def.damage, { kind: 'kinetic', attackerId: owner, impulse: 40, friendly: true, selfMult: 0.8 });
          else this.fx.explosion(pos.clone(), def.radius, 'kinetic');
          audio.play('kinetic_impact', { pos, volume: 1, maxDistance: 800, refDistance: 60, important: true });
          this.fx.smokeColumn?.(pos.clone(), 4, 14);
          events.emit('fx:flash', 0.9); events.emit('fx:shake', 1.5, pos);
          if (this.game.director) this.game.director.noise(pos, 4);
        }
      } };
      this.active.push(timer);
    } else if (id === 'gunship') {
      const t = { t: 0, done: false, update: (dt) => { t.t += dt; if (t.t > 1.5 && !t.g) { t.g = new Gunship(this.game, pos, dir, { owner }); } if (t.g) { t.g.update(dt); if (t.g.done) t.done = true; } } };
      this.active.push(t);
      events.emit('toast', 'GUNSHIP RUN AUTHORISED', 'info');
    } else if (id === 'sentry') {
      const pod = new DropPod(this.game, pos, { kind: 'sentry', owner, color: COLORS.amber, duration: def.delay, onOpen: (pd) => { const t = new SentryTurret(this.game, pd.target.clone().setY(pd.target.y + 0.4), { owner, duration: def.duration, damage: def.damage }); this.active.push(t); pd.model.userData.body.visible = false; setTimeout(() => pd.remove(), 3000); } });
      this.active.push(pod);
    } else if (id === 'supply') {
      const pod = new DropPod(this.game, pos, { kind: 'supply', owner, color: COLORS.green, duration: def.delay, onOpen: (pd) => {
        const crate = buildSupplyCrate(); crate.position.copy(pd.target); this.world.props.add(crate);
        pd.model.userData.body.visible = false; setTimeout(() => { pd.remove(); }, 3000);
        const users = new Set();
        this.game.mission?.addInteractable({ id: 'supply' + pd.id, position: pd.target.clone(), radius: 2.6, label: 'RESUPPLY', holdTime: 1.2, onComplete: (player) => { if (users.has(player.id)) return; users.add(player.id); player.resupply(); audio.play('pickup', { volume: 1 }); events.emit('toast', 'RESUPPLIED: AMMUNITION, GRENADES, WELLNESS', 'unlock'); }, once: false, condition: (player) => !users.has(player.id) });
        audio.say('ship_supply', { priority: 1 });
      } });
      this.active.push(pod);
    }
  }
  clear() { for (const a of this.active) a.remove?.(); this.active.length = 0; }
}
