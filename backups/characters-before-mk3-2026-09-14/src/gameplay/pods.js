// Drop pods, sentry turret, supply crate, gunship and extraction dropship: physical orbital assets.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { net } from '../net/net.js';
import { clamp, damp, lerp, rand, angleDamp } from '../core/mathx.js';

const UP = new THREE.Vector3(0, 1, 0);
const B = (w, h, d, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; x.receiveShadow = true; return x; };
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

export function buildPodModel(color = COLORS.cyan) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.8, 8), Mat.armorWhite()); body.position.y = 1.5; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 8), Mat.armorBlack()); nose.position.y = 3.45; g.add(nose);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.0, 0.4, 8), Mat.darkMetal()); base.position.y = 0.2; g.add(base);
  const doors = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pivot = new THREE.Group(); pivot.position.set(Math.cos(a) * 1.0, 0.4, Math.sin(a) * 1.0); pivot.rotation.y = -a; g.add(pivot);
    const door = B(0.8, 2.3, 0.12, Mat.armorWhite()); door.position.set(0, 1.15, 0.05); pivot.add(door);
    const strip = B(0.1, 1.6, 0.04, Mat.neon(color, 2.5)); strip.position.set(0, 1.2, 0.13); door.add(strip);
    doors.push(pivot);
  }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const th = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.5, 8), Mat.gunMetal()); th.position.set(Math.cos(a) * 0.75, 3.3, Math.sin(a) * 0.75); g.add(th); }
  const light = new THREE.PointLight(color, 8, 14, 2); light.position.y = 2; g.add(light);
  g.userData = { doors, light, body };
  return g;
}

/** A pod that falls from orbit onto `target`, crushes what it lands on, opens its doors and delivers a payload. */
export class DropPod {
  constructor(game, target, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.kind = opts.kind || 'reinforce'; this.owner = opts.owner ?? 0;
    this.target = target.clone(); this.target.y = this.world.groundHeight(target.x, target.z);
    this.duration = opts.duration ?? 2.8; this.t = -(opts.delay ?? 0); this.startY = 260;
    this.model = buildPodModel(opts.color || COLORS.cyan); this.world.fxGroup.add(this.model);
    this.position = new THREE.Vector3(target.x, this.target.y + this.startY, target.z);
    this.model.position.copy(this.position);
    this.landed = false; this.opened = false; this.done = false; this.onLand = opts.onLand; this.onOpen = opts.onOpen;
    this.zone = this.fx.warningZone(this.target, 4.5, opts.color || COLORS.cyan, this.duration + Math.max(0, -this.t));
    this.marker = this.fx.marker?.(this.target.clone().setY(this.target.y + 2), opts.color || COLORS.cyan);
    this.whistle = null; this.spinSpeed = rand(2, 4);
    this.id = this.world.allocId();
    audio.play('beacon_beep', { pos: this.target, volume: 0.6 });
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.t < 0) return;
    if (!this.landed) {
      if (!this.whistle) this.whistle = audio.play('pod_whistle', { pos: this.position, volume: 1, maxDistance: 400, refDistance: 20, important: true });
      const k = clamp(this.t / this.duration, 0, 1); const e = k * k; // accelerating
      this.position.y = lerp(this.target.y + this.startY, this.target.y, e);
      this.model.position.copy(this.position); this.model.rotation.y += dt * this.spinSpeed * (1 - k);
      this.whistle?.setPosition(this.position);
      if (this.position.y - this.target.y < 120) this.fx.podTrail?.(this.position.clone().setY(this.position.y + 3.6));
      this.model.userData.light.intensity = 8 + Math.sin(this.t * 30) * 4;
      if (k >= 1) this.land();
    } else {
      this.openT += dt;
      const o = clamp((this.openT - 0.6) / 0.9, 0, 1);
      for (const d of this.model.userData.doors) d.rotation.x = -o * 1.9;
      if (!this.opened && o > 0.5) { this.opened = true; this.onOpen?.(this); }
      if (this.openT > 2 && !this.doneSignal) { this.doneSignal = true; }
    }
  }
  land() {
    this.landed = true; this.openT = 0; this.model.position.y = this.target.y; this.model.rotation.y = Math.round(this.model.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
    this.zone?.remove(); this.marker?.remove(); this.whistle?.stop(0.05);
    audio.play('pod_impact', { pos: this.target, volume: 1.2, maxDistance: 300, refDistance: 15, important: true });
    audio.play('pod_door_open', { pos: this.target, volume: 0.9, delay: 0.7 });
    this.fx.explosion(this.target.clone(), 4, 'pod');
    this.fx.dust?.(this.target.clone(), 6);
    events.emit('fx:shake', 0.9, this.target);
    if (net.isHost) this.game.combat.explode(this.target.clone(), 4.2, 420, { kind: 'pod', attackerId: this.owner, impulse: 20, selfMult: 0, friendly: true });
    // becomes solid cover
    this.collider = this.world.addCyl(new THREE.Vector3(this.target.x, this.target.y + 1.7, this.target.z), 1.15, 3.4, { material: 'metal', cover: true, tag: 'pod' });
    this.world.cover.build();
    this.world.nav?.rebuildRegion(this.target.x, this.target.z, 6);
    this.onLand?.(this);
  }
  remove() { this.done = true; this.model.parent?.remove(this.model); if (this.collider) this.world.removeCollider(this.collider); }
}

/** Sentry turret deployed by a pod. */
export class SentryTurret {
  constructor(game, pos, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.position = pos.clone(); this.owner = opts.owner ?? 0; this.life = opts.duration ?? 60; this.dmg = opts.damage ?? 18;
    this.entityType = 'turret'; this.isTurret = true; this.id = this.world.allocId(); this.dead = false; this.health = 400; this.hitRadius = 1.4; this.hitCenter = pos.clone().setY(pos.y + 1); this.hitboxes = true; this.armour = {}; this.mechanical = true;
    const g = new THREE.Group(); g.position.copy(pos); this.root = g;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.4, 8), Mat.darkMetal()); base.position.y = 0.2; g.add(base);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = B(0.15, 0.15, 1.2, Mat.gunMetal()); leg.position.set(Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7); leg.rotation.y = -a; g.add(leg); }
    this.yawG = new THREE.Group(); this.yawG.position.y = 0.9; g.add(this.yawG);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 8), Mat.armorBlack()); mast.position.y = -0.3; this.yawG.add(mast);
    this.pitchG = new THREE.Group(); this.yawG.add(this.pitchG);
    this.pitchG.add(at(B(0.5, 0.4, 0.8, Mat.armorWhite()), 0, 0, 0));
    for (const s of [-1, 1]) { const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), Mat.gunMetal()); barrel.rotation.x = Math.PI / 2; barrel.position.set(s * 0.15, 0, 0.7); this.pitchG.add(barrel); }
    this.pitchG.add(at(B(0.3, 0.06, 0.04, Mat.neon(COLORS.cyan, 3)), 0, 0.23, 0.4));
    this.eye = at(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), Mat.neon(COLORS.cyan, 3)), 0, 0.1, 0.42); this.pitchG.add(this.eye);
    this.muzzles = [new THREE.Object3D(), new THREE.Object3D()]; this.muzzles[0].position.set(-0.15, 0, 1.15); this.muzzles[1].position.set(0.15, 0, 1.15); this.pitchG.add(...this.muzzles);
    this.light = new THREE.PointLight(COLORS.cyan, 3, 8, 2); this.light.position.y = 1.2; g.add(this.light);
    this.world.actors.add(g);
    this.collider = this.world.addCyl(new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), 0.7, 1.2, { material: 'metal', cover: true, tag: 'turret' });
    this.fireT = 0; this.deployT = 0; this.target = null; this.retargetT = 0; this.mi = 0;
    this.world.register(this);
    audio.play('turret_deploy', { pos, volume: 1 });
    this.scanA = 0;
  }
  raycastHitboxes(o, d, maxT) { const c = this.hitCenter; const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - 0.8 * 0.8; const disc = b * b - cc; if (disc < 0) return null; const t = -b - Math.sqrt(disc); if (t < 0 || t > maxT) return null; return { t, zone: 'body', normal: d.clone().negate(), material: 'metal' }; }
  armourAt() { return 0; }
  takeDamage(dmg) { if (this.dead) return null; this.health -= dmg; if (this.health <= 0) return { dead: true }; return { dead: false }; }
  applyRemoteDamage(ev) { this.health = ev.hp; }
  die() { if (this.dead) return; this.dead = true; this.fx.explosion(this.hitCenter.clone(), 3, 'barrel'); audio.play('explosion_medium', { pos: this.position }); this.remove(); }
  stagger() {} loseLimb() {}
  update(dt) {
    if (this.dead) return;
    this.deployT += dt; this.life -= dt;
    const deployed = this.deployT > 1.2;
    this.root.scale.y = lerp(0.2, 1, clamp(this.deployT / 1.0, 0, 1));
    if (this.life <= 0) { this.powerDown(); return; }
    if (!deployed) return;
    if (!net.isHost) return;
    this.retargetT -= dt;
    if (this.retargetT <= 0) {
      this.retargetT = 0.4; let best = null, bd = 42;
      for (const e of this.game.director.enemies) { if (e.dead || e.type?.ally) continue; const d = e.position.distanceTo(this.position); if (d < bd && this.world.hasLOS(this.hitCenter, e.hitCenter || e.position, { terrainStep: 2 })) { bd = d; best = e; } }
      this.target = best;
    }
    if (this.target && !this.target.dead) {
      const tp = (this.target.hitCenter || this.target.position).clone();
      const dx = tp.x - this.position.x, dz = tp.z - this.position.z, dy = tp.y - (this.position.y + 0.9);
      const yaw = Math.atan2(-dx, -dz) + Math.PI; this.yawG.rotation.y = angleDamp(this.yawG.rotation.y, yaw, 10, dt);
      this.pitchG.rotation.x = damp(this.pitchG.rotation.x, -Math.atan2(dy, Math.hypot(dx, dz)), 10, dt);
      this.fireT -= dt;
      if (this.fireT <= 0 && Math.abs(this.yawG.rotation.y - yaw) < 0.2) {
        this.fireT = 0.11; this.mi ^= 1;
        const m = this.muzzles[this.mi].getWorldPosition(new THREE.Vector3());
        const dir = tp.sub(m).add(new THREE.Vector3(rand(-0.25, 0.25), rand(-0.2, 0.2), rand(-0.25, 0.25))).normalize();
        const hit = this.world.raycast(m, dir, 60, { ignoreEntity: this });
        const end = hit ? hit.point.clone() : m.clone().addScaledVector(dir, 60);
        this.fx.tracer(m, end, '#8ff0ff', 0.05, 260); this.fx.muzzleFlash(m, dir, '#8ff0ff', 0.6);
        audio.play('turret_fire', { pos: m, volume: 0.6, pitchVar: 0.05 });
        if (hit?.entity && hit.entity !== this) {
          if (hit.entity.isPlayer) hit.entity.takeDamage(Math.round(this.dmg * 0.35), { attackerId: this.owner, p: [hit.point.x, hit.point.y, hit.point.z], n: [0, 1, 0], dir: [dir.x, dir.y, dir.z], weapon: 'turret', zone: hit.zone });
          else this.game.combat.playerHit(hit, { id: 'turret', damage: this.dmg, headMult: 2, impulse: 1, falloffStart: 30, range: 60 }, dir, this.owner);
        } else if (hit) this.fx.impact(hit.point, hit.normal, hit.material);
      }
    } else { this.scanA += dt * 0.8; this.yawG.rotation.y = angleDamp(this.yawG.rotation.y, Math.sin(this.scanA) * 1.2, 3, dt); this.pitchG.rotation.x = damp(this.pitchG.rotation.x, 0, 3, dt); }
  }
  powerDown() { if (this.poweredDown) return; this.poweredDown = true; this.dead = true; this.light.intensity = 0; this.eye.material = Mat.gunMetal(); this.world.unregister(this); setTimeout(() => this.remove(), 20000); }
  remove() { this.root.parent?.remove(this.root); if (this.collider) this.world.removeCollider(this.collider); this.removed = true; }
}

/** Supply crate: interactable that refills the user. */
export function buildSupplyCrate() {
  const g = new THREE.Group();
  const box = B(1.6, 1.2, 1.6, Mat.armorWhite()); box.position.y = 0.6; g.add(box);
  const lid = B(1.7, 0.15, 1.7, Mat.armorBlack()); lid.position.y = 1.25; g.add(lid);
  for (const s of [-1, 1]) { const strip = B(1.4, 0.06, 0.06, Mat.neon(COLORS.cyan, 2.5)); strip.position.set(0, 0.9, s * 0.83); g.add(strip); }
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), Mat.emblem(COLORS.cyan)); emblem.position.set(0, 1.33, 0); emblem.rotation.x = -Math.PI / 2; g.add(emblem);
  const light = new THREE.PointLight(COLORS.cyan, 4, 8, 2); light.position.y = 1.6; g.add(light);
  return g;
}

/** Gunship strafing run along a line through `target`. */
export class Gunship {
  constructor(game, target, dir, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx; this.owner = opts.owner ?? 0;
    this.target = target.clone(); this.dir = dir.clone().setY(0).normalize();
    this.model = Gunship.buildModel(); this.world.fxGroup.add(this.model);
    this.t = 0; this.duration = 7; this.altitude = 38; this.length = 320;
    this.start = this.target.clone().addScaledVector(this.dir, -this.length / 2); this.start.y = this.target.y + this.altitude;
    this.end = this.target.clone().addScaledVector(this.dir, this.length / 2); this.end.y = this.target.y + this.altitude;
    this.fireStart = 0.42; this.fireEnd = 0.58; this.shotT = 0; this.done = false;
    this.engine = audio.play('gunship_pass', { pos: this.start, volume: 1, maxDistance: 500, refDistance: 40, important: true });
    this.cannon = null; this.strip = this.fx.warningZone(this.target, 8, COLORS.cyan, 3.2);
    events.emit('toast', 'GUNSHIP INBOUND', 'info');
  }
  static buildModel() {
    const g = new THREE.Group();
    g.add(at(B(3, 1.4, 9, Mat.armorBlack()), 0, 0, 0));
    g.add(at(B(2.2, 0.8, 3, Mat.armorWhite()), 0, 0.9, -1.5));
    g.add(at(B(14, 0.35, 2.6, Mat.armorWhite()), 0, 0.3, 0.5));
    for (const s of [-1, 1]) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 10), Mat.gunMetal()); eng.position.set(s * 5.2, 0.1, 0.5); g.add(eng); const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 10), Mat.neon(COLORS.cyan, 3)); glow.position.set(s * 5.2, -1.2, 0.5); g.add(glow); g.add(at(B(0.1, 0.1, 8, Mat.neon(COLORS.cyan, 2.5)), s * 1.55, 0.4, 0)); }
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.5, 8), Mat.gunMetal()); cannon.rotation.x = Math.PI / 2; cannon.position.set(0, -0.6, 4.5); g.add(cannon);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 8), Mat.armorBlack()); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0, 5.6); g.add(nose);
    const l = new THREE.PointLight(COLORS.cyan, 10, 40, 2); l.position.y = -1; g.add(l);
    return g;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt; const k = this.t / this.duration;
    const p = this.start.clone().lerp(this.end, k);
    // slight dive over the target
    p.y -= Math.sin(clamp((k - 0.2) / 0.6, 0, 1) * Math.PI) * 10;
    this.model.position.copy(p); this.model.lookAt(this.end); this.model.rotation.z = Math.sin(k * Math.PI) * 0.15;
    this.engine?.setPosition(p);
    if (k > this.fireStart && k < this.fireEnd) {
      if (!this.cannon) this.cannon = audio.play('gunship_cannon', { pos: p, loop: true, volume: 1, maxDistance: 400, refDistance: 30, important: true });
      this.cannon.setPosition(p);
      this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = 0.1;
        const along = (k - this.fireStart) / (this.fireEnd - this.fireStart);
        const gp = this.target.clone().addScaledVector(this.dir, (along - 0.5) * 34).add(new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)));
        gp.y = this.world.groundHeight(gp.x, gp.z);
        const m = p.clone().setY(p.y - 1);
        this.fx.tracer(m, gp, '#9ff5ff', 0.14, 400);
        this.fx.muzzleFlash(m, gp.clone().sub(m).normalize(), '#9ff5ff', 1.5);
        if (net.isHost) this.game.combat.explode(gp, 3.6, 95, { kind: 'gunship', attackerId: this.owner, impulse: 10, friendly: true, selfMult: 0.5 });
        else this.fx.explosion(gp, 3.6, 'gunship');
      }
    } else if (this.cannon) { this.cannon.stop(0.2); this.cannon = null; }
    if (k >= 1) { this.done = true; this.model.parent?.remove(this.model); this.engine?.stop(0.5); this.cannon?.stop(0.2); }
  }
}

/** Extraction dropship: descends to the pad, hovers, lands, opens ramp; carries the squad out. */
export class Dropship {
  constructor(game, padCenter, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.pad = padCenter.clone(); this.pad.y = this.world.groundHeight(padCenter.x, padCenter.z);
    this.model = Dropship.buildModel(); this.world.fxGroup.add(this.model);
    this.state = 'approach'; this.t = 0; this.hoverY = 26; this.landed = false;
    this.position = this.pad.clone().add(new THREE.Vector3(120, 140, 160)); this.model.position.copy(this.position);
    this.engine = audio.play('dropship_engine', { pos: this.position, loop: true, volume: 1, maxDistance: 600, refDistance: 40, important: true });
    audio.play('dropship_land', { pos: this.pad, volume: 1, delay: 8, maxDistance: 400, refDistance: 30 });
    this.canLand = !!opts.canLand; this.ramp = this.model.userData.ramp; this.lights = this.model.userData.lights;
    this.boarded = false;
  }
  static buildModel() {
    const g = new THREE.Group();
    g.add(at(B(5, 3, 14, Mat.armorBlack()), 0, 1.5, 0));
    g.add(at(B(4.2, 2.2, 5, Mat.armorWhite()), 0, 3.2, -3));
    g.add(at(B(3.4, 1.8, 3, Mat.armorWhite()), 0, 2.2, 6.5));
    g.add(at(B(22, 0.5, 4, Mat.armorWhite()), 0, 3.2, 1));
    for (const s of [-1, 1]) { for (const z of [-3.5, 4.5]) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 2.8, 12), Mat.gunMetal()); eng.position.set(s * 8.5, 2.6, z); g.add(eng); const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.4, 12), Mat.neon(COLORS.cyan, 3.5)); glow.position.set(s * 8.5, 1.1, z); g.add(glow); } g.add(at(B(0.12, 0.12, 12, Mat.neon(COLORS.cyan, 2.5)), s * 2.55, 2.4, 0)); }
    const ramp = new THREE.Group(); ramp.position.set(0, 0.1, -7); g.add(ramp);
    const rampMesh = B(3.8, 0.2, 5, Mat.darkMetal()); rampMesh.position.set(0, 0, -2.5); ramp.add(rampMesh);
    ramp.add(at(B(3.4, 0.05, 0.3, Mat.neon(COLORS.amber, 2)), 0, 0.12, -4.8));
    ramp.rotation.x = -Math.PI / 2 + 0.05; // closed
    const bayLight = new THREE.PointLight(COLORS.cyan, 0, 12, 2); bayLight.position.set(0, 2, -5); g.add(bayLight);
    const emblem = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), Mat.emblem('#d8d8d8')); emblem.position.set(0, 3.6, 1); emblem.rotation.x = -Math.PI / 2; g.add(emblem);
    const lights = [];
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), Mat.neon(COLORS.red, 3)); l.position.set(s * 11, 3.5, 1); g.add(l); lights.push(l); }
    const spot = new THREE.PointLight('#dff7ff', 0, 40, 2); spot.position.set(0, -1, 2); g.add(spot);
    g.userData = { ramp, lights, bayLight, spot };
    return g;
  }
  update(dt) {
    this.t += dt;
    const hover = this.pad.clone().setY(this.pad.y + this.hoverY);
    if (this.state === 'approach') {
      this.position.lerp(hover, Math.min(1, dt * 0.35));
      const d = this.position.distanceTo(hover);
      this.model.lookAt(this.position.x - (hover.x - this.position.x), this.position.y, this.position.z - (hover.z - this.position.z));
      if (d < 3) { this.state = 'hover'; this.t = 0; }
    } else if (this.state === 'hover') {
      this.position.copy(hover); this.position.y += Math.sin(this.t * 1.2) * 0.6;
      this.model.rotation.set(Math.sin(this.t * 0.7) * 0.02, this.model.rotation.y, Math.sin(this.t * 0.9) * 0.03);
      this.model.userData.spot.intensity = 30;
      if (this.canLand) { this.state = 'land'; this.t = 0; audio.play('dropship_land', { pos: this.pad, volume: 1, maxDistance: 400, refDistance: 30 }); }
    } else if (this.state === 'land') {
      const k = clamp(this.t / 6, 0, 1); const e = 1 - Math.pow(1 - k, 3);
      this.position.copy(hover).setY(lerp(hover.y, this.pad.y + 0.2, e));
      this.model.rotation.set(0, this.model.rotation.y, 0);
      if (k > 0.7) this.fx.dust?.(this.pad.clone(), 2);
      if (k >= 1) { this.state = 'landed'; this.t = 0; this.landed = true; events.emit('fx:shake', 0.6, this.pad); this.model.userData.bayLight.intensity = 12; audio.play('door_open', { pos: this.pad, volume: 1 }); }
    } else if (this.state === 'landed') {
      this.ramp.rotation.x = damp(this.ramp.rotation.x, 0.08, 3, dt);
      this.position.copy(this.pad).setY(this.pad.y + 0.2);
    } else if (this.state === 'takeoff') {
      this.ramp.rotation.x = damp(this.ramp.rotation.x, -Math.PI / 2 + 0.05, 4, dt);
      const k = this.t / 9; this.position.y = this.pad.y + 0.2 + k * k * 90; this.position.z += dt * k * 25; this.position.x += dt * k * 12;
      this.model.rotation.x = -k * 0.25;
    }
    this.model.position.copy(this.position);
    this.engine?.setPosition(this.position);
    const blink = Math.sin(this.t * 6) > 0.5; for (const l of this.lights) l.visible = blink;
  }
  takeOff() { this.state = 'takeoff'; this.t = 0; audio.play('dropship_takeoff', { pos: this.position, volume: 1, maxDistance: 500 }); }
  get rampPoint() { return this.pad.clone().add(new THREE.Vector3(0, 0, -11).applyAxisAngle(UP, this.model.rotation.y)); }
  remove() { this.model.parent?.remove(this.model); this.engine?.stop(0.5); }
}
