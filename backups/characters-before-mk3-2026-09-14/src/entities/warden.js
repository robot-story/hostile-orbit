// WARDEN: large Null Legion exosuit boss with destructible armour plates and glowing weak points.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';
import { clamp, damp, angleDamp, angleDiff, rand, lerp } from '../core/mathx.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _w = new THREE.Vector3();
const B = (w, h, d, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; x.receiveShadow = true; return x; };
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

function buildWardenModel() {
  const root = new THREE.Group(); root.name = 'warden';
  const arm = Mat.legionArmor(), dark = Mat.gunMetal(), plateM = new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.5, metalness: 0.8 });
  const neon = Mat.neon(COLORS.redOrange, 2.8), core = new THREE.MeshStandardMaterial({ color: COLORS.red, emissive: COLORS.red, emissiveIntensity: 3.5, roughness: 0.3 });
  const parts = {};
  // pelvis & torso
  parts.pelvis = at(B(1.6, 0.8, 1.1, dark), 0, 2.4, 0); root.add(parts.pelvis);
  parts.torso = new THREE.Group(); parts.torso.position.set(0, 2.9, 0); root.add(parts.torso);
  parts.torso.add(at(B(2.2, 1.6, 1.4, arm), 0, 0.8, 0));
  parts.chestPlate = at(B(1.9, 1.2, 0.3, plateM), 0, 0.85, 0.8); parts.torso.add(parts.chestPlate);
  parts.torso.add(at(B(0.5, 0.12, 0.06, neon), 0, 1.1, 0.98)); parts.torso.add(at(B(0.5, 0.12, 0.06, neon), 0, 0.6, 0.98));
  // back core (weak point)
  parts.core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), core); parts.core.position.set(0, 0.9, -0.85); parts.torso.add(parts.core);
  parts.coreCage = at(B(0.9, 0.9, 0.2, dark), 0, 0.9, -0.95); parts.torso.add(parts.coreCage);
  parts.coreLight = new THREE.PointLight(COLORS.red, 8, 10, 2); parts.coreLight.position.set(0, 0.9, -1.2); parts.torso.add(parts.coreLight);
  // head
  parts.head = new THREE.Group(); parts.head.position.set(0, 1.75, 0.3); parts.torso.add(parts.head);
  parts.head.add(at(B(0.8, 0.6, 0.8, arm), 0, 0.3, 0)); parts.head.add(at(B(0.6, 0.08, 0.06, neon), 0, 0.35, 0.42)); parts.head.add(at(B(0.12, 0.12, 0.12, core), -0.2, 0.32, 0.4)); parts.head.add(at(B(0.12, 0.12, 0.12, core), 0.2, 0.32, 0.4));
  // shoulders + plates
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? -1 : 1;
    const sh = new THREE.Group(); sh.position.set(sg * 1.45, 1.35, 0); parts.torso.add(sh); parts['shoulder' + s] = sh;
    sh.add(at(B(0.9, 0.9, 1.0, arm), 0, 0, 0));
    const plate = at(B(1.1, 0.5, 1.4, plateM), sg * 0.15, 0.55, 0); sh.add(plate); parts['plate' + s] = plate;
    const pl2 = at(B(0.3, 0.7, 1.2, plateM), sg * 0.7, 0.05, 0); sh.add(pl2); parts['plate' + s + '2'] = pl2;
    sh.add(at(B(0.06, 0.06, 1.0, neon), sg * 0.86, 0.35, 0));
    const armG = new THREE.Group(); armG.position.set(sg * 0.2, -0.5, 0); sh.add(armG); parts['arm' + s] = armG;
    armG.add(at(B(0.6, 1.4, 0.6, dark), 0, -0.6, 0));
    const fore = new THREE.Group(); fore.position.set(0, -1.3, 0); armG.add(fore); parts['fore' + s] = fore;
    if (s === 'R') { // cannon
      fore.add(at(B(0.7, 0.7, 1.6, arm), 0, -0.4, 0.4));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 10), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, -0.4, 1.6); fore.add(barrel);
      fore.add(at(B(0.2, 0.2, 0.1, neon), 0, -0.4, 2.42));
      parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, -0.4, 2.5); fore.add(parts.muzzle);
    } else { // claw + rocket pod on shoulder
      fore.add(at(B(0.6, 1.2, 0.6, arm), 0, -0.6, 0)); fore.add(at(B(0.2, 0.6, 0.3, dark), -0.25, -1.4, 0.15)); fore.add(at(B(0.2, 0.6, 0.3, dark), 0.25, -1.4, 0.15));
      const pod = at(B(0.8, 0.5, 0.9, dark), sg * 0.1, 1.05, -0.2); sh.add(pod); parts.rocketPod = pod;
      for (let i = 0; i < 4; i++) pod.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8), neon), -0.25 + (i % 2) * 0.5, 0.05 + Math.floor(i / 2) * -0.2, 0.46).rotateX(Math.PI / 2));
    }
  }
  // legs (digitigrade)
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? -1 : 1;
    const hip = new THREE.Group(); hip.position.set(sg * 0.7, 2.2, 0); root.add(hip); parts['hip' + s] = hip;
    hip.add(at(B(0.6, 1.3, 0.8, arm), 0, -0.6, 0.1));
    const knee = new THREE.Group(); knee.position.set(0, -1.2, 0.2); hip.add(knee); parts['knee' + s] = knee;
    const kneeCore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), core); kneeCore.position.set(sg * 0.32, 0, 0); knee.add(kneeCore); parts['kneeCore' + s] = kneeCore;
    const kneePlate = at(B(0.4, 0.7, 0.7, plateM), sg * 0.35, 0.1, 0.1); knee.add(kneePlate); parts['kneePlate' + s] = kneePlate;
    knee.add(at(B(0.5, 1.1, 0.6, dark), 0, -0.55, -0.15));
    const foot = at(B(0.8, 0.3, 1.2, dark), 0, -1.2, 0.1); knee.add(foot); parts['foot' + s] = foot;
    foot.add(at(B(0.1, 0.06, 1.0, neon), sg * 0.42, 0.1, 0));
  }
  root.userData.parts = parts;
  return { root, parts };
}

export class Warden {
  constructor(game, pos, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.entityType = 'enemy'; this.isEnemy = true; this.isBoss = true; this.typeId = 'warden'; this.type = { id: 'warden', name: 'WARDEN', scale: 2.4, mass: 6, heavy: true, xp: 900, gibThreshold: 9, staggerThreshold: 9999, voiceBarks: [] };
    this.id = opts.id ?? null; this.squad = null;
    this.position = pos.clone(); this.yaw = opts.yaw ?? 0; this.velocity = new THREE.Vector3();
    const scale = game.director?.scaling.bossHp || 1;
    this.maxHealth = Math.round(2600 * (game.difficulty?.enemyHp || 1) * scale); this.health = this.maxHealth;
    this.armour = { plateL: 420, plateR: 420, chest: 600, kneeL: 220, kneeR: 220 };
    this.armourMax = { ...this.armour };
    this.dead = false; this.mechanical = false; this.hitboxes = true; this.hitRadius = 4.2; this.hitCenter = new THREE.Vector3();
    this.radius = 1.4; this.height = 5;
    const m = buildWardenModel(); this.model = m; this.parts = m.parts; this.root = m.root; this.root.position.copy(pos); this.world.actors.add(this.root); this.flashMesh = this.parts.torso.children[0];
    this.state = 'advance'; this.stateT = 0; this.phase = 1; this.target = null; this.canSee = false; this.lastSeen = null;
    this.cannonT = 2; this.rocketT = 8; this.chargeT = 14; this.stompT = 0; this.gait = 0; this.speed = 3.0; this.path = null; this.pathI = 0; this.pathPending = false; this.pathGoal = null;
    this.staggerT = 0; this.distToCam = 0; this.dmgMult = game.difficulty?.enemyDmg || 1;
    this.world.register(this);
    audio.say('lg_warden_intro', { priority: 2, delay: 1.5 });
    events.emit('boss:spawn', this);
  }
  // hitbox helper: sphere at part world position
  _pp(part, out, off = null) { part.getWorldPosition(out); if (off) out.add(off); return out; }
  raycastHitboxes(o, d, maxT) {
    let best = maxT, zone = null;
    const sph = (c, r, z) => { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r; const disc = b * b - cc; if (disc < 0) return; const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) { best = t; zone = z; } };
    const P = this.parts;
    // weak points first (smaller spheres tested with priority by being tighter)
    sph(this._pp(P.core, _v), 0.45, 'core');
    if (this.armour.kneeL <= 0) sph(this._pp(P.kneeCoreL, _v), 0.35, 'kneeCoreL'); if (this.armour.kneeR <= 0) sph(this._pp(P.kneeCoreR, _v), 0.35, 'kneeCoreR');
    sph(this._pp(P.head, _v, _w.set(0, 0.3, 0)), 0.55, 'head');
    if (this.armour.plateL > 0) sph(this._pp(P.plateL, _v), 0.8, 'plateL'); if (this.armour.plateR > 0) sph(this._pp(P.plateR, _v), 0.8, 'plateR');
    sph(this._pp(P.shoulderL, _v), 0.75, 'shoulderL'); sph(this._pp(P.shoulderR, _v), 0.75, 'shoulderR');
    if (this.armour.chest > 0) sph(this._pp(P.chestPlate, _v), 1.0, 'chest'); else sph(this._pp(P.torso, _v, _w.set(0, 0.8, 0.5)), 1.0, 'torsoOpen');
    sph(this._pp(P.torso, _v, _w.set(0, 0.8, 0)), 1.2, 'torso');
    sph(this._pp(P.pelvis, _v), 0.9, 'pelvis');
    if (this.armour.kneeL > 0) sph(this._pp(P.kneePlateL, _v), 0.5, 'kneeL'); if (this.armour.kneeR > 0) sph(this._pp(P.kneePlateR, _v), 0.5, 'kneeR');
    sph(this._pp(P.hipL, _v, _w.set(0, -0.6, 0)), 0.6, 'legL'); sph(this._pp(P.hipR, _v, _w.set(0, -0.6, 0)), 0.6, 'legR');
    if (!zone) return null;
    return { t: best, zone, normal: _v2.copy(d).negate(), material: zone.startsWith('plate') || zone === 'chest' || zone.startsWith('knee') && !zone.includes('Core') ? 'metal' : 'flesh' };
  }
  armourAt(zone) { return this.armour[zone] || 0; }
  takeDamage(dmg, info) {
    if (this.dead) return null;
    const z = info.zone || 'torso'; const res = { dead: false, gib: false, stagger: false, armourBroke: false };
    if (this.armour[z] > 0) {
      this.armour[z] -= dmg; dmg *= 0.15;
      if (this.armour[z] <= 0) { this.armour[z] = 0; res.armourBroke = true; this.onArmourBroke(z); }
    } else if (z === 'core') dmg *= 2.2;
    else if (z === 'kneeCoreL' || z === 'kneeCoreR') { dmg *= 1.8; this.staggerT = Math.max(this.staggerT, 0.25); }
    else if (z === 'torsoOpen') dmg *= 1.4;
    else if (z === 'head') dmg *= 1.2;
    else if (z === 'torso' || z === 'pelvis' || z.startsWith('shoulder') || z.startsWith('leg')) dmg *= 0.5;
    this.health -= Math.round(dmg);
    this.alert = true; if (info.attackerId) { const a = this.world.entities.get(info.attackerId); if (a?.isPlayer) this.target = a; }
    if (this.health <= 0) { res.dead = true; }
    else { const p = this.health / this.maxHealth; const np = p < 0.3 ? 3 : p < 0.6 ? 2 : 1; if (np !== this.phase) { this.phase = np; this.onPhase(np); } }
    events.emit('boss:health', this);
    return res;
  }
  applyRemoteDamage(ev) { this.health = ev.hp; if (ev.armourBroke) { this.armour[ev.zone] = 0; this.onArmourBroke(ev.zone); } events.emit('boss:health', this); }
  onArmourBroke(z) {
    const P = this.parts; const mesh = { plateL: P.plateL, plateR: P.plateR, chest: P.chestPlate, kneeL: P.kneePlateL, kneeR: P.kneePlateR }[z];
    if (mesh && mesh.visible) { mesh.visible = false; const wp = mesh.getWorldPosition(new THREE.Vector3()); this.fx.gibs?.(wp, UP.clone(), { armour: true, count: 12 }); this.fx.sparksBurst?.(wp, UP, 40); this.fx.explosion(wp, 1.5, 'grenade'); audio.play('warden_armor_break', { pos: wp, volume: 1 }); if (P['plate' + z.slice(-1) + '2'] && z.startsWith('plate')) P['plate' + z.slice(-1) + '2'].visible = false; }
    events.emit('toast', z === 'chest' ? 'WARDEN CHEST ARMOUR BREACHED' : z.startsWith('knee') ? 'KNEE ACTUATOR EXPOSED' : 'SHOULDER PLATE DESTROYED', 'warn');
  }
  onPhase(p) { audio.play('warden_roar', { pos: this.position, volume: 1, maxDistance: 300 }); this.staggerT = 0.8; if (p === 3) { this.speed = 4.2; events.emit('toast', 'WARDEN ENRAGED', 'warn'); } }
  stagger() {}
  loseLimb() {}
  die(ev) {
    if (this.dead) return; this.dead = true; this.world.unregister(this); this.state = 'dying'; this.stateT = 0;
    audio.play('warden_death', { pos: this.position, volume: 1, maxDistance: 400 });
    this.deathT = 0; this.deathDir = new THREE.Vector3(...(ev?.dir || [0, 0, 1])).setY(0).normalize();
    events.emit('boss:died', this);
    if (this.game.combat) this.game.combat.stats.wardensKilled = (this.game.combat.stats.wardensKilled || 0) + 1;
  }
  pickTarget() { const ps = this.game.players || []; let b = null, bd = Infinity; for (const p of ps) { if (p.dead) continue; const d = p.position.distanceTo(this.position); if (d < bd) { bd = d; b = p; } } return b; }
  requestPath(goal) { if (this.pathPending || (this.pathGoal && this.pathGoal.distanceTo(goal) < 3 && this.path)) return; this.pathPending = true; this.pathGoal = goal.clone(); this.world.nav.request(this.position.x, this.position.z, goal.x, goal.z, (p) => { this.pathPending = false; this.path = p; this.pathI = 0; }); }
  moveToward(goal, dt, speed) {
    const d = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
    let tx = goal.x, tz = goal.z;
    if (d > 8 && !this.world.nav.lineWalkable(this.position.x, this.position.z, goal.x, goal.z)) { this.requestPath(goal); if (this.path && this.pathI < this.path.length) { const wp = this.path[this.pathI]; if (Math.hypot(wp.x - this.position.x, wp.z - this.position.z) < 2.5) this.pathI++; tx = wp.x; tz = wp.z; } }
    const dx = tx - this.position.x, dz = tz - this.position.z; const l = Math.hypot(dx, dz) || 1;
    this.velocity.x = damp(this.velocity.x, dx / l * speed, 3, dt); this.velocity.z = damp(this.velocity.z, dz / l * speed, 3, dt);
    this.yaw = angleDamp(this.yaw, Math.atan2(-dx, -dz), 2.5, dt);
  }
  update(dt, camera) {
    if (this.dead) { this.updateDeath(dt); return; }
    this.distToCam = camera ? camera.position.distanceTo(this.position) : 50;
    this.stateT += dt;
    if (net.isHost) {
      this.target = this.pickTarget();
      if (this.target) {
        const eye = _v.copy(this.position).setY(this.position.y + 4.5), aim = _v2.copy(this.target.position).setY(this.target.position.y + 1.2);
        this.canSee = this.world.hasLOS(eye, aim, { terrainStep: 2 }); if (this.canSee) this.lastSeen = (this.lastSeen || new THREE.Vector3()).copy(this.target.position);
        this.dist = this.target.position.distanceTo(this.position);
      }
      if (this.staggerT > 0) { this.staggerT -= dt; this.velocity.multiplyScalar(0.9); }
      else this.updateAI(dt);
      // integrate
      this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt;
      this.world.resolveCapsule(this.position, this.radius, this.height);
      this.position.y = damp(this.position.y, this.world.groundHeight(this.position.x, this.position.z, this.position.y, 1.2, this.radius), 10, dt);
      // crush cover it walks through? no: big units path around. push small enemies aside is handled by their separation.
    } else if (this.netTarget) { this.position.lerp(this.netTarget.p, Math.min(1, dt * 10)); this.yaw = angleDamp(this.yaw, this.netTarget.yaw, 8, dt); }
    this.animate(dt);
    this.hitCenter.copy(this.position).setY(this.position.y + 3);
  }
  updateAI(dt) {
    const t = this.target; if (!t) { this.velocity.multiplyScalar(0.95); return; }
    const focus = this.lastSeen || t.position; const d = this.dist || 99;
    this.cannonT -= dt; this.rocketT -= dt; this.chargeT -= dt;
    if (this.state === 'charge') {
      // rush straight at the target then stomp
      this.moveToward(focus, dt, this.speed * 2.6);
      if (d < 4.5 || this.stateT > 5) { this.state = 'stomp'; this.stateT = 0; this.velocity.set(0, 0, 0); }
      return;
    }
    if (this.state === 'stomp') {
      if (this.stateT > 0.55 && !this.stomped) { this.stomped = true; const p = this.position.clone(); this.game.combat.explode(p, 7, 90 * this.dmgMult, { kind: 'pod', attackerId: this.id, impulse: 18, selfMult: 1 }); audio.play('warden_step', { pos: p, volume: 1.4 }); events.emit('fx:shake', 1.0, p); }
      if (this.stateT > 1.6) { this.state = 'advance'; this.stateT = 0; this.stomped = false; }
      return;
    }
    // advance & hold at range 12-22
    if (d > 20) this.moveToward(focus, dt, this.speed); else if (d < 9) this.moveToward(_v.copy(this.position).sub(focus).setY(0).normalize().multiplyScalar(6).add(this.position), dt, this.speed * 0.7); else { this.velocity.multiplyScalar(0.9); this.yaw = angleDamp(this.yaw, Math.atan2(-(focus.x - this.position.x), -(focus.z - this.position.z)), 3, dt); }
    const facing = Math.abs(angleDiff(this.yaw, Math.atan2(-(focus.x - this.position.x), -(focus.z - this.position.z)))) < 0.35;
    if (this.canSee && facing && this.cannonT <= 0 && d < 60) { this.fireCannon(); this.cannonT = this.phase === 3 ? 1.1 : 1.7; }
    if (this.rocketT <= 0 && d > 10 && d < 70) { this.fireRockets(); this.rocketT = this.phase >= 2 ? 7 : 11; }
    if (this.phase >= 2 && this.chargeT <= 0 && d < 30 && this.canSee) { this.state = 'charge'; this.stateT = 0; this.chargeT = this.phase === 3 ? 9 : 14; audio.play('warden_charge', { pos: this.position, volume: 1 }); audio.play('warden_roar', { pos: this.position, volume: 0.8 }); }
  }
  fireCannon() {
    const P = this.parts; const muzzle = P.muzzle.getWorldPosition(new THREE.Vector3());
    const t = this.target; const aim = t.position.clone().setY(t.position.y + 1.0).add(new THREE.Vector3(rand(-0.8, 0.8), rand(-0.3, 0.3), rand(-0.8, 0.8)));
    const dir = aim.sub(muzzle).normalize();
    audio.play('warden_cannon', { pos: muzzle, volume: 1.2, maxDistance: 300 });
    this.fx.muzzleFlash(muzzle, dir, '#ff5a1f', 2.5); this.cannonRecoil = 1;
    if (!net.isHost) return;
    const hit = this.world.raycast(muzzle, dir, 120, { ignoreEntity: this, entityFilter: (e) => !e.isEnemy });
    const end = hit ? hit.point.clone() : muzzle.clone().addScaledVector(dir, 120);
    this.fx.tracer(muzzle, end, '#ff5a1f', 0.25, 160);
    setTimeout(() => this.game.combat.explode(end, 3.2, 55 * this.dmgMult, { kind: 'grenade', attackerId: this.id, impulse: 10, selfMult: 1 }), 120);
    net.send(MSG.EV_ENEMYFIRE, { id: this.id, from: v3(muzzle), to: [[...v3(end)]], weapon: 'warden_cannon' }, { reliable: false });
  }
  fireRockets() {
    if (!net.isHost || !this.target) return;
    const pod = this.parts.rocketPod.getWorldPosition(new THREE.Vector3());
    audio.play('warden_rocket_launch', { pos: pod, volume: 1 });
    for (let i = 0; i < 3; i++) {
      setTimeout(() => { if (this.dead) return; const to = this.target.position.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))); const from = pod.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0.3, rand(-0.3, 0.3)));
        const vel = new THREE.Vector3().subVectors(to, from); const dist = vel.length(); vel.normalize().multiplyScalar(14); vel.y += dist * 0.55;
        this.game.projectiles.spawn('grenade', from, vel, { fuse: 4, enemy: true, owner: this.id, damage: 60 * this.dmgMult, radius: 5, onDetonate: (p) => this.game.combat.explode(p.position.clone(), 5, 60 * this.dmgMult, { kind: 'grenade', attackerId: this.id, impulse: 12, selfMult: 1 }) });
        this.fx.smokeColumn?.(from, 0.4, 1.5);
      }, i * 220);
    }
  }
  animate(dt) {
    const P = this.parts; const sp = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = sp > 0.3;
    if (moving) { const prev = this.gait; this.gait += dt * (this.state === 'charge' ? 6 : 3.2) * clamp(sp / this.speed, 0.4, 1.6); if (Math.floor(prev / Math.PI) !== Math.floor(this.gait / Math.PI)) { audio.play('warden_step', { pos: this.position, volume: 1, maxDistance: 200 }); events.emit('fx:shake', 0.25 * clamp(1 - this.distToCam / 60, 0, 1), this.position); this.fx.dust?.(this.position.clone(), 3); } }
    const s = Math.sin(this.gait), c = Math.cos(this.gait);
    P.hipL.rotation.x = -s * 0.45 * (moving ? 1 : 0); P.hipR.rotation.x = s * 0.45 * (moving ? 1 : 0);
    P.kneeL.rotation.x = Math.max(0, s) * 0.7 + 0.25; P.kneeR.rotation.x = Math.max(0, -s) * 0.7 + 0.25;
    P.footL.rotation.x = -P.kneeL.rotation.x - P.hipL.rotation.x; P.footR.rotation.x = -P.kneeR.rotation.x - P.hipR.rotation.x;
    this.root.position.copy(this.position); this.root.position.y += Math.abs(c) * 0.12 * (moving ? 1 : 0);
    this.root.rotation.y = this.yaw + Math.PI;
    P.torso.rotation.y = Math.sin(this.gait) * 0.06; P.torso.rotation.x = this.state === 'charge' ? -0.25 : this.state === 'stomp' ? 0.2 : 0;
    // aim arms at target
    if (this.target) { const dy = (this.target.position.y + 1) - (this.position.y + 4); const dxz = Math.max(2, this.dist || 10); const pitch = clamp(Math.atan2(dy, dxz), -0.6, 0.5); P.shoulderR.rotation.x = damp(P.shoulderR.rotation.x, -1.45 + pitch * -1, 4, dt); P.shoulderL.rotation.x = damp(P.shoulderL.rotation.x, -0.5 + Math.sin(this.gait) * 0.2, 4, dt); }
    this.cannonRecoil = damp(this.cannonRecoil || 0, 0, 8, dt); P.foreR.position.z = -this.cannonRecoil * 0.4;
    P.core.material.emissiveIntensity = 3 + Math.sin(this.game.time * 6) * 1.5; P.coreLight.intensity = 6 + Math.sin(this.game.time * 6) * 4;
    P.core.scale.setScalar(1 + Math.sin(this.game.time * 6) * 0.08);
  }
  updateDeath(dt) {
    this.deathT += dt;
    const P = this.parts;
    // stagger, explode in sequence, then collapse forward
    if (this.deathT < 2.2) {
      this.root.position.x += Math.sin(this.deathT * 30) * 0.02; P.torso.rotation.z = Math.sin(this.deathT * 9) * 0.1;
      if (!this._nextBoom || this.deathT > this._nextBoom) { this._nextBoom = this.deathT + 0.35; const p = this.position.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(1, 5), rand(-1.5, 1.5))); this.fx.explosion(p, 2.5, 'barrel'); this.fx.sparksBurst?.(p, UP, 30); }
    } else {
      const t = clamp((this.deathT - 2.2) / 1.2, 0, 1); const e = t * t;
      this.root.rotation.x = e * 1.35; this.root.position.y = this.position.y + e * 0.6;
      P.hipL.rotation.x = e * 0.8; P.hipR.rotation.x = e * 0.8;
      if (t >= 1 && !this._final) { this._final = true; const p = this.position.clone().add(new THREE.Vector3(0, 2, 2.5)); this.fx.explosion(p, 9, 'large'); this.fx.smokeColumn?.(p, 3, 20); audio.play('explosion_huge', { pos: p, volume: 1, maxDistance: 400 }); events.emit('fx:shake', 1, p); P.coreLight.intensity = 0; P.core.material.emissiveIntensity = 0.2; this.fx.gibs?.(p, UP.clone(), { armour: true, count: 30 }); this.game.director?.onEnemyRemoved(this); }
    }
  }
  snapshot() { return [this.id, 'warden', +this.position.x.toFixed(2), +this.position.y.toFixed(2), +this.position.z.toFixed(2), +this.yaw.toFixed(2), this.health, this.state === 'charge' ? 1 : 0, this.phase, 0, 0, 0]; }
  applySnapshot(s) { this.netTarget = this.netTarget || { p: new THREE.Vector3(), yaw: 0 }; this.netTarget.p.set(s[2], s[3], s[4]); this.netTarget.yaw = s[5]; this.health = s[6]; this.phase = s[8]; }
  removeModel() { this.root.parent?.remove(this.root); this.removed = true; }
}
