// RAVAGER: a large Legion war-beast. Quadruped hunter frame (3.6 m long, 2.2 m at the shoulder) that prowls at range,
// charges, swipes, and leaps onto squads. Built with the OUTRIDER modelling kit in the Legion palette. Armour plates on
// the back shrug off fire; the reactor under the chest and the head are the way in. Host-authoritative like the Warden.
import * as THREE from 'three';
import { KIT } from '../models/robots.js';
import { COLORS } from '../render/materials.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { net } from '../net/net.js';
import { clamp, damp, angleDamp, angleDiff, rand } from '../core/mathx.js';

const { armour, neon, neonOwn, add, box, cyl, sphere, torus, channel, bevelBox, hexPlate, lathe, tube, decal } = KIT;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _w = new THREE.Vector3();
const RED = '#ff3b1f';

function buildRavagerModel() {
  const root = new THREE.Group(); root.name = 'ravager';
  const oxide = armour('gunmetal', '#c4583e'), graphite = armour('gunmetal', '#3f434c'), gun = armour('gunmetal', '#7c828e'), light = armour('gunmetal', '#b4bac6');
  const P = {};
  // body: low chassis, ribbed flanks, back plates, spine channel, reactor under the chest
  const body = new THREE.Group(); body.position.y = 1.35; root.add(body); P.body = body;
  add(body, bevelBox(1.3, 0.8, 2.3, graphite, 0.05, 0.12), [0, 0, 0]);
  add(body, bevelBox(1.0, 0.5, 1.4, graphite, 0.04, 0.1), [0, -0.35, 0.2]);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) add(body, bevelBox(0.08, 0.6, 0.22, gun, 0.01), [sx * 0.7, -0.05, -0.8 + i * 0.4]);
  P.plateL = add(body, bevelBox(0.62, 0.12, 1.9, oxide, 0.03, 0.1), [-0.34, 0.46, -0.05], [0, 0, 0.18]);
  P.plateR = add(body, bevelBox(0.62, 0.12, 1.9, oxide, 0.03, 0.1), [0.34, 0.46, -0.05], [0, 0, -0.18]);
  for (let i = 0; i < 4; i++) add(body, bevelBox(0.3, 0.14, 0.24, oxide, 0.02, 0.05), [0, 0.5, -0.7 + i * 0.45], [0.3, 0, 0]); // dorsal fins
  add(body, channel(1.8, RED, 1.8, 0.03), [0, 0.52, 0], [0, Math.PI / 2, Math.PI / 2]);
  P.core = add(body, hexPlate(0.16, 0.06, neonOwn(RED, 3)), [0, -0.62, 0.55], [Math.PI / 2, 0, 0]); P.core.castShadow = false;
  add(body, torus(0.2, 0.02, gun, 6), [0, -0.63, 0.55], [Math.PI / 2, 0, 0]);
  P.coreLight = new THREE.PointLight(RED, 4, 9, 2); P.coreLight.position.set(0, -0.7, 0.55); P.coreLight.castShadow = false; body.add(P.coreLight);
  // neck + head: wedge skull, three eyes, jaw that opens, tusks, cheek vents
  const neck = new THREE.Group(); neck.position.set(0, 0.15, 1.15); body.add(neck); P.neck = neck;
  add(neck, cyl(0.24, 0.3, 0.5, gun, 12), [0, 0, 0.2], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) add(neck, torus(0.27, 0.025, i % 2 ? neon(RED, 1.4) : light, 16), [0, 0, 0.05 + i * 0.14], [0, 0, 0]);
  const head = new THREE.Group(); head.position.set(0, 0.05, 0.5); neck.add(head); P.head = head;
  add(head, bevelBox(0.62, 0.42, 0.9, oxide, 0.04, 0.1), [0, 0.1, 0.35]);
  add(head, bevelBox(0.5, 0.2, 0.5, graphite, 0.03, 0.06), [0, 0.38, 0.1], [0.25, 0, 0]);
  for (let i = -1; i <= 1; i++) { const eye = sphere(0.045, neonOwn(RED, 3.2), 10); eye.position.set(i * 0.16, 0.2, 0.82); eye.castShadow = false; head.add(eye); (P.eyes ||= []).push(eye); }
  add(head, channel(0.42, RED, 2.2, 0.03), [0, 0.06, 0.8]);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.08, 0.15); head.add(jaw); P.jaw = jaw;
  add(jaw, bevelBox(0.54, 0.16, 0.7, graphite, 0.03, 0.06), [0, -0.08, 0.35]);
  for (const sx of [-1, 1]) { add(jaw, cyl(0.02, 0.06, 0.34, light, 8), [sx * 0.24, 0.1, 0.72], [-0.9, 0, sx * 0.25]); add(head, cyl(0.03, 0.07, 0.4, light, 8), [sx * 0.3, -0.05, 0.7], [0.9, 0, sx * 0.3]); }
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) add(head, box(0.02, 0.1, 0.04, gun), [sx * 0.32, 0.05, 0.1 + i * 0.12]);
  // legs: hip ball -> upper -> knee ring -> lower -> claw foot (front pair reversed knee like a cat)
  P.legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.72, -0.1, sz * 0.8); body.add(hip);
    add(hip, sphere(0.2, gun, 14), [0, 0, 0]);
    add(hip, bevelBox(0.26, 0.9, 0.36, oxide, 0.03, 0.08), [sx * 0.12, -0.42, 0], [0, 0, sx * 0.08]);
    add(hip, cyl(0.035, 0.035, 0.7, light, 8), [sx * 0.25, -0.45, sz * 0.14], [0.1 * sz, 0, 0]);
    const knee = new THREE.Group(); knee.position.set(sx * 0.06, -0.86, 0); hip.add(knee);
    const ring = add(knee, torus(0.15, 0.035, neonOwn(RED, 1.6), 20), [0, 0, 0], [0, Math.PI / 2, 0]); ring.castShadow = false;
    add(knee, cyl(0.13, 0.13, 0.32, gun, 12), [0, 0, 0], [0, 0, Math.PI / 2]);
    add(knee, bevelBox(0.2, 0.86, 0.26, graphite, 0.025, 0.06), [0, -0.44, sz * 0.05], [0, 0, 0]);
    add(knee, bevelBox(0.22, 0.5, 0.1, oxide, 0.02, 0.04), [0, -0.4, sz * 0.05 + 0.12]);
    const foot = new THREE.Group(); foot.position.set(0, -0.9, sz * 0.05); knee.add(foot);
    add(foot, bevelBox(0.34, 0.16, 0.5, graphite, 0.02, 0.05), [0, -0.08, 0.1]);
    for (let c = -1; c <= 1; c++) add(foot, cyl(0.02, 0.05, 0.28, light, 8), [c * 0.11, -0.1, 0.4], [1.2, 0, 0]);
    add(foot, channel(0.24, RED, 1.2, 0.02), [0, -0.05, 0.36]);
    P.legs.push({ hip, knee, foot, ring, sx, sz });
  }
  // tail: three tapering segments with a lamp
  let parent = body; P.tail = [];
  for (let i = 0; i < 3; i++) { const seg = new THREE.Group(); seg.position.set(0, i ? 0 : 0.1, i ? -0.5 : -1.2); parent.add(seg); add(seg, bevelBox(0.28 - i * 0.06, 0.24 - i * 0.05, 0.55, i % 2 ? graphite : oxide, 0.02, 0.05), [0, 0, -0.25]); P.tail.push(seg); parent = seg; }
  const lamp = sphere(0.06, neonOwn(RED, 2.4), 10); lamp.position.set(0, 0, -0.55); lamp.castShadow = false; parent.add(lamp);
  add(body, decal('hazard', RED, 0.5, 0.06), [0, 0.02, 1.16]);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow ?? true; o.receiveShadow = true; } });
  return { root, parts: P };
}

export class Ravager {
  constructor(game, pos, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.entityType = 'enemy'; this.isEnemy = true; this.isBoss = false; this.typeId = 'ravager';
    this.type = { id: 'ravager', name: 'RAVAGER', scale: 1.8, mass: 4, heavy: true, xp: 380, gibThreshold: 9, staggerThreshold: 9999, voiceBarks: [] };
    this.id = opts.id ?? null; this.squad = opts.squad || null;
    this.position = pos.clone(); this.yaw = opts.yaw ?? 0; this.velocity = new THREE.Vector3();
    const scale = game.director?.scaling?.enemyHp || 1;
    this.maxHealth = Math.round(1100 * (game.difficulty?.enemyHp || 1) * scale); this.health = this.maxHealth;
    this.armour = { plateL: 260, plateR: 260 }; this.armourMax = { ...this.armour };
    this.dead = false; this.mechanical = true; this.hitboxes = true; this.hitRadius = 2.6; this.hitCenter = new THREE.Vector3();
    this.radius = 0.9; this.height = 2.2; this.alert = false;
    const m = buildRavagerModel(); this.model = m; this.parts = m.parts; this.root = m.root; this.root.position.copy(pos); this.world.actors.add(this.root); this.flashMesh = null;
    this.state = 'prowl'; this.stateT = 0; this.target = null; this.canSee = false; this.lastSeen = null; this.dist = 99;
    this.gait = 0; this.speed = 4.2; this.leapT = 6; this.swipeT = 0; this.roarT = rand(2, 5); this.staggerT = 0; this.jawOpen = 0; this.distToCam = 0;
    this.path = null; this.pathI = 0; this.pathPending = false; this.pathGoal = null; this.dmgMult = game.difficulty?.enemyDmg || 1;
    this.world.register(this);
  }
  _pp(part, out, off = null) { part.getWorldPosition(out); if (off) out.add(off); return out; }
  raycastHitboxes(o, d, maxT) {
    let best = maxT, zone = null;
    const sph = (c, r, z) => { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r; const disc = b * b - cc; if (disc < 0) return; const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) { best = t; zone = z; } };
    const P = this.parts;
    sph(this._pp(P.core, _v), 0.42, 'core');
    sph(this._pp(P.head, _v, _w.set(0, 0.1, 0.4)), 0.6, 'head');
    if (this.armour.plateL > 0) sph(this._pp(P.plateL, _v), 0.75, 'plateL'); if (this.armour.plateR > 0) sph(this._pp(P.plateR, _v), 0.75, 'plateR');
    sph(this._pp(P.body, _v), 1.25, 'body');
    for (let i = 0; i < 4; i++) sph(this._pp(P.legs[i].knee, _v), 0.5, 'leg' + i);
    if (!zone) return null;
    return { t: best, zone, normal: _v2.copy(d).negate(), material: zone.startsWith('plate') || zone === 'body' ? 'metal' : 'flesh' };
  }
  armourAt(zone) { return this.armour[zone] || 0; }
  takeDamage(dmg, info) {
    if (this.dead) return null;
    const z = info.zone || 'body'; const res = { dead: false, gib: false, stagger: false, armourBroke: false };
    if (this.armour[z] > 0) { this.armour[z] -= dmg; dmg *= 0.12; if (this.armour[z] <= 0) { this.armour[z] = 0; res.armourBroke = true; this.onArmourBroke(z); } }
    else if (z === 'core') { dmg *= 2.4; this.staggerT = Math.max(this.staggerT, 0.35); res.stagger = true; }
    else if (z === 'head') dmg *= 1.3;
    else if (z.startsWith('leg')) dmg *= 0.6;
    else dmg *= 0.7;
    this.health -= Math.round(dmg); this.alert = true;
    if (info.attackerId) { const a = this.world.entities.get(info.attackerId); if (a?.isPlayer) this.target = a; }
    if (this.health <= 0) res.dead = true;
    return res;
  }
  applyRemoteDamage(ev) { this.health = ev.hp; if (ev.armourBroke) { this.armour[ev.zone] = 0; this.onArmourBroke(ev.zone); } }
  onArmourBroke(z) {
    const mesh = z === 'plateL' ? this.parts.plateL : this.parts.plateR; if (mesh && mesh.visible) { mesh.visible = false; const wp = mesh.getWorldPosition(new THREE.Vector3()); this.fx.gibs?.(wp, UP.clone(), { armour: true, count: 10 }); this.fx.sparksBurst?.(wp, UP, 30); this.fx.explosion?.(wp, 1.2, 'grenade'); audio.play('impact_metal', { pos: wp, volume: 1 }); }
    events.emit('toast', 'RAVAGER BACK PLATE DESTROYED', 'warn');
  }
  stagger() { this.staggerT = Math.max(this.staggerT, 0.3); }
  loseLimb() {}
  die(ev) {
    if (this.dead) return; this.dead = true; this.world.unregister(this); this.state = 'dying'; this.stateT = 0; this.deathT = 0;
    this.deathDir = new THREE.Vector3(...(ev?.dir || [0, 0, 1])).setY(0).normalize();
    audio.play('warden_death', { pos: this.position, volume: 0.8, maxDistance: 300 });
    events.emit('toast', 'RAVAGER DOWN', 'good');
  }
  pickTarget() { const ps = this.game.players || []; let b = null, bd = Infinity; for (const p of ps) { if (p.dead) continue; const d = p.position.distanceTo(this.position); if (d < bd) { bd = d; b = p; } } return b; }
  requestPath(goal) { if (this.pathPending || (this.pathGoal && this.pathGoal.distanceTo(goal) < 3 && this.path)) return; this.pathPending = true; this.pathGoal = goal.clone(); this.world.nav.request(this.position.x, this.position.z, goal.x, goal.z, (p) => { this.pathPending = false; this.path = p; this.pathI = 0; }); }
  moveToward(goal, dt, speed, turnRate = 3) {
    const d = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
    let tx = goal.x, tz = goal.z;
    if (d > 6 && !this.world.nav.lineWalkable(this.position.x, this.position.z, goal.x, goal.z)) { this.requestPath(goal); if (this.path && this.pathI < this.path.length) { const wp = this.path[this.pathI]; if (Math.hypot(wp.x - this.position.x, wp.z - this.position.z) < 2.5) this.pathI++; tx = wp.x; tz = wp.z; } }
    const dx = tx - this.position.x, dz = tz - this.position.z; const l = Math.hypot(dx, dz) || 1;
    this.velocity.x = damp(this.velocity.x, dx / l * speed, 4, dt); this.velocity.z = damp(this.velocity.z, dz / l * speed, 4, dt);
    this.yaw = angleDamp(this.yaw, Math.atan2(-dx, -dz), turnRate, dt);
  }
  update(dt, camera) {
    if (this.dead) { this.updateDeath(dt); return; }
    this.distToCam = camera ? camera.position.distanceTo(this.position) : 50;
    this.stateT += dt;
    if (net.isHost) {
      this.target = this.pickTarget();
      if (this.target) {
        const eye = _v.copy(this.position).setY(this.position.y + 2), aim = _v2.copy(this.target.position).setY(this.target.position.y + 1.0);
        this.canSee = this.world.hasLOS(eye, aim, { terrainStep: 2 }); if (this.canSee) { this.lastSeen = (this.lastSeen || new THREE.Vector3()).copy(this.target.position); this.alert = true; }
        this.dist = this.target.position.distanceTo(this.position);
      }
      if (this.staggerT > 0) { this.staggerT -= dt; this.velocity.multiplyScalar(0.85); }
      else this.updateAI(dt);
      if (this.state !== 'leap') {
        this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt;
        this.world.resolveCapsule(this.position, this.radius, this.height);
        this.position.y = damp(this.position.y, this.world.groundHeight(this.position.x, this.position.z, this.position.y, 1.0, this.radius), 12, dt);
      }
    } else if (this.netTarget) { this.position.lerp(this.netTarget.p, Math.min(1, dt * 10)); this.yaw = angleDamp(this.yaw, this.netTarget.yaw, 8, dt); }
    this.animate(dt);
    this.hitCenter.copy(this.position).setY(this.position.y + 1.3);
  }
  updateAI(dt) {
    const t = this.target; if (!t || !this.alert) { this.velocity.multiplyScalar(0.92); return; }
    const focus = this.lastSeen || t.position; const d = this.dist || 99;
    this.leapT -= dt; this.swipeT -= dt; this.roarT -= dt;
    if (this.roarT <= 0 && this.state === 'prowl') { this.roarT = rand(6, 11); this.jawOpen = 1; audio.play('warden_roar', { pos: this.position, volume: 0.7, pitch: 1.35, maxDistance: 200 }); }
    if (this.state === 'leap') {
      // ballistic arc onto the marked landing point; shockwave on landing
      const k = clamp(this.stateT / 0.85, 0, 1); const p = this.leapFrom.clone().lerp(this.leapTo, k); p.y = this.leapFrom.y * (1 - k) + this.leapTo.y * k + Math.sin(k * Math.PI) * 4.5; this.position.copy(p);
      const dx = this.leapTo.x - this.leapFrom.x, dz = this.leapTo.z - this.leapFrom.z; this.yaw = angleDamp(this.yaw, Math.atan2(-dx, -dz), 10, dt);
      if (k >= 1) { this.state = 'recover'; this.stateT = 0; this.velocity.set(0, 0, 0); const lp = this.position.clone(); this.game.combat.explode(lp, 4.2, 70 * this.dmgMult, { kind: 'pod', attackerId: this.id, impulse: 16, selfMult: 1 }); this.fx.dust?.(lp, 4); audio.play('warden_step', { pos: lp, volume: 1 }); events.emit('fx:shake', 0.6); }
      return;
    }
    if (this.state === 'recover') { this.velocity.multiplyScalar(0.8); if (this.stateT > 0.9) { this.state = 'prowl'; this.stateT = 0; } return; }
    if (this.state === 'charge') {
      this.moveToward(focus, dt, this.speed * 2.7, 2.2);
      if (d < 3.6 && this.swipeT <= 0) { this.state = 'swipe'; this.stateT = 0; this.swipeT = 1.6; this.jawOpen = 1; }
      else if (this.stateT > 4.5 || (!this.canSee && this.stateT > 1.5)) { this.state = 'prowl'; this.stateT = 0; }
      return;
    }
    if (this.state === 'swipe') {
      this.velocity.multiplyScalar(0.7);
      if (this.stateT > 0.32 && !this.swiped) { this.swiped = true; const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); const p = this.position.clone().addScaledVector(fwd, 2.2).setY(this.position.y + 1); this.game.combat.explode(p, 3.2, 55 * this.dmgMult, { kind: 'pod', attackerId: this.id, impulse: 14, selfMult: 1 }); audio.play('impact_metal', { pos: p, volume: 1, pitch: 0.7 }); events.emit('fx:shake', 0.35); }
      if (this.stateT > 0.9) { this.state = d < 6 ? 'charge' : 'prowl'; this.stateT = 0; this.swiped = false; }
      return;
    }
    // prowl: circle the squad at 10-16 m, then commit to a charge or a leap
    const toMe = _v.copy(this.position).sub(focus).setY(0); const r = toMe.length() || 1; toMe.multiplyScalar(1 / r);
    const side = _v2.set(-toMe.z, 0, toMe.x); const want = focus.clone().addScaledVector(toMe, 13).addScaledVector(side, Math.sin(this.game.time * 0.35 + (this.id || 0)) * 9);
    this.moveToward(want, dt, this.speed, 2.5);
    if (this.canSee && this.stateT > 1.2) {
      if (this.leapT <= 0 && d > 7 && d < 20) { this.state = 'leap'; this.stateT = 0; this.leapT = rand(7, 11); this.leapFrom = this.position.clone(); this.leapTo = focus.clone(); this.leapTo.y = this.world.groundHeight(focus.x, focus.z); this.jawOpen = 1; audio.play('warden_charge', { pos: this.position, volume: 0.8, pitch: 1.3 }); this.fx.warningZone?.(this.leapTo, 4.2, RED, 0.85); return; }
      if (d < 26 && Math.random() < dt * 0.5) { this.state = 'charge'; this.stateT = 0; audio.play('warden_roar', { pos: this.position, volume: 0.9, pitch: 1.2, maxDistance: 220 }); this.jawOpen = 1; }
    }
  }
  animate(dt) {
    const P = this.parts; const sp = Math.hypot(this.velocity.x, this.velocity.z); const moving = sp > 0.4 || this.state === 'leap';
    const rate = this.state === 'charge' ? 9 : 5;
    if (moving && this.state !== 'leap') { const prev = this.gait; this.gait += dt * rate * clamp(sp / this.speed, 0.5, 2.4); if (Math.floor(prev / Math.PI) !== Math.floor(this.gait / Math.PI)) { audio.play('footstep_metal', { pos: this.position, volume: 0.9, pitch: 0.6 }); if (this.distToCam < 60) this.fx.dust?.(this.position.clone(), 0.8); } }
    const g = this.gait; const amp = moving ? 1 : 0.15;
    for (let i = 0; i < 4; i++) { const L = P.legs[i]; const ph = g + (L.sx * L.sz > 0 ? 0 : Math.PI); const swing = Math.sin(ph); const lift = Math.max(0, Math.cos(ph));
      if (this.state === 'leap') { L.hip.rotation.x = -0.9 * L.sz; L.knee.rotation.x = 1.4 * L.sz; L.foot.rotation.x = -0.4; }
      else { L.hip.rotation.x = swing * 0.55 * amp * -L.sz; L.knee.rotation.x = (0.25 + lift * 0.9 * amp) * L.sz; L.foot.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.6; }
      L.ring.material.emissiveIntensity = 1.4 + lift * 1.6 * amp; }
    const bob = moving ? Math.abs(Math.cos(g)) * 0.08 : Math.sin(this.game.time * 1.6) * 0.03;
    this.root.position.copy(this.position); this.root.position.y += bob;
    this.root.rotation.y = this.yaw + Math.PI;
    P.body.rotation.x = this.state === 'charge' ? -0.14 : this.state === 'leap' ? -0.35 : 0; P.body.rotation.z = Math.sin(g) * 0.04 * amp;
    this.jawOpen = damp(this.jawOpen, this.state === 'charge' || this.state === 'swipe' ? 1 : 0, 3, dt); P.jaw.rotation.x = this.jawOpen * 0.55;
    P.neck.rotation.x = this.state === 'swipe' ? -0.35 + Math.sin(this.stateT * 12) * 0.2 : Math.sin(g * 0.5) * 0.06;
    if (this.target && this.alert) { const dy = (this.target.position.y + 1) - (this.position.y + 1.6); const pitch = clamp(Math.atan2(dy, Math.max(2, this.dist)), -0.5, 0.4); P.head.rotation.x = damp(P.head.rotation.x, -pitch, 4, dt); }
    for (let i = 0; i < 3; i++) P.tail[i].rotation.y = Math.sin(this.game.time * 2.2 - i * 0.7) * 0.25 * (1 + i * 0.4);
    const pulse = 2.6 + Math.sin(this.game.time * 5) * 1.0 + (this.staggerT > 0 ? 3 : 0); P.core.material.emissiveIntensity = pulse; P.coreLight.intensity = 3 + pulse;
    for (const e of P.eyes) e.material.emissiveIntensity = this.alert ? 3.2 : 1.2;
  }
  updateDeath(dt) {
    this.deathT += dt; const P = this.parts;
    if (this.deathT < 1.3) { this.root.position.x += Math.sin(this.deathT * 28) * 0.015; P.body.rotation.z = Math.sin(this.deathT * 11) * 0.12; if (!this._nextBoom || this.deathT > this._nextBoom) { this._nextBoom = this.deathT + 0.4; const p = this.position.clone().add(new THREE.Vector3(rand(-1, 1), rand(0.8, 2.2), rand(-1, 1))); this.fx.explosion?.(p, 1.6, 'barrel'); } }
    else { const t = clamp((this.deathT - 1.3) / 0.9, 0, 1); const e = t * t; this.root.rotation.z = e * 1.2 * (this.deathDir.x >= 0 ? 1 : -1); this.root.position.y = this.position.y - e * 0.5; for (const L of P.legs) { L.hip.rotation.x = e * 0.9; L.knee.rotation.x = e * 1.2; } P.jaw.rotation.x = e * 0.7;
      if (t >= 1 && !this._final) { this._final = true; const p = this.position.clone().add(new THREE.Vector3(0, 1.2, 0)); this.fx.explosion?.(p, 4, 'large'); this.fx.smokeColumn?.(p, 1.5, 12); audio.play('explosion_huge', { pos: p, volume: 0.9 }); for (const e of P.eyes) e.material.emissiveIntensity = 0; P.core.material.emissiveIntensity = 0; P.coreLight.intensity = 0; }
      if (this.deathT > 14 && !this.removed) this.removeModel(); }
  }
  snapshot() { return [this.id, 'ravager', +this.position.x.toFixed(2), +this.position.y.toFixed(2), +this.position.z.toFixed(2), +this.yaw.toFixed(2), this.health, this.state === 'charge' ? 1 : this.state === 'leap' ? 2 : 0, 0, 0, 0, 0]; }
  applySnapshot(s) { this.netTarget = this.netTarget || { p: new THREE.Vector3(), yaw: 0 }; this.netTarget.p.set(s[2], s[3], s[4]); this.netTarget.yaw = s[5]; this.health = s[6]; this.state = s[7] === 1 ? 'charge' : s[7] === 2 ? 'leap' : 'prowl'; }
  removeModel() { this.root.parent?.remove(this.root); this.removed = true; }
}
