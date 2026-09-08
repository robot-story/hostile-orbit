// Null Legion infantry: rigged model, hitboxes, armour, squad AI with cover, flanking, suppression, grenades.
import * as THREE from 'three';
import { buildSoldier, LIMBS } from '../models/soldier.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';
import { CharacterAnimator } from './animator.js';
import { WEAPONS } from '../gameplay/weapons.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';
import { clamp, damp, angleDamp, angleDiff, rand, pick, lerp } from '../core/mathx.js';
import { settings } from '../core/settings.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Hitbox helpers -------------------------------------------------------------
function raySphere(o, d, c, r, maxT) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc); if (t < 0) return cc < 0 ? 0 : -1; return t < maxT ? t : -1;
}
function rayCapsule(o, d, a, b, r, maxT) {
  // approximate with 3 spheres along the segment (fast and good enough for limbs)
  let best = -1;
  for (let i = 0; i <= 2; i++) { _v3.lerpVectors(a, b, i / 2); const t = raySphere(o, d, _v3, r, maxT); if (t >= 0 && (best < 0 || t < best)) best = t; }
  return best;
}

export class Enemy {
  constructor(game, typeId, pos, yaw = 0, opts = {}) {
    this.game = game; this.world = game.world; this.fx = game.fx;
    this.type = ENEMY_TYPES[typeId]; this.typeId = typeId;
    this.entityType = 'enemy'; this.isEnemy = true;
    this.id = opts.id ?? null;
    this.squad = opts.squad || null;
    this.position = pos.clone(); this.yaw = yaw; this.velocity = new THREE.Vector3();
    const diff = game.difficulty || { enemyHp: 1, enemyDmg: 1, accuracy: 1 };
    this.maxHealth = Math.round(this.type.health * diff.enemyHp); this.health = this.maxHealth;
    this.armour = { ...(this.type.armour || {}) }; for (const k in this.armour) this.armour[k] = Math.round(this.armour[k] * diff.enemyHp);
    this.dmgMult = diff.enemyDmg; this.accMult = diff.accuracy * (this.type.accuracy || 1);
    this.dead = false; this.mechanical = !!this.type.mechanical;
    this.radius = 0.38 * this.type.scale; this.height = 1.85 * this.type.scale;
    this.hitRadius = 1.3 * this.type.scale; this.hitCenter = new THREE.Vector3();
    this.hitboxes = true;
    this.lostLimbs = new Set();
    // model
    this.model = buildSoldier(this.type.style || 'legion');
    this.anim = new CharacterAnimator(this.model);
    this.weaponDef = this.type.weapon ? WEAPONS[this.type.weapon] : null;
    if (this.weaponDef) { this.weaponModel = WEAPON_BUILDERS[this.type.weapon](); this.anim.weaponSocket.add(this.weaponModel); }
    this.model.root.position.copy(pos); this.model.root.rotation.y = yaw + Math.PI;
    this.world.actors.add(this.model.root);
    this.flashMesh = this.model.meshes[0];
    this.anim.onFootstep = (s) => { if (this.distToCam < 40) audio.play('footstep_dirt', { pos: this.position, volume: 0.35 * (this.type.heavy ? 1.6 : 1), pitchVar: 0.1 }); };
    // AI
    this.state = opts.state || 'patrol'; this.stateT = 0;
    this.alert = false; this.alertT = 0;
    this.target = null; this.lastSeen = null; this.lastSeenT = -99; this.canSee = false; this.seeT = 0;
    this.path = null; this.pathI = 0; this.pathT = 0; this.pathGoal = null; this.pathPending = false;
    this.coverPoint = null; this.coverT = 0; this.peekT = 0; this.inCover = false;
    this.burstLeft = 0; this.fireT = rand(0.2, 1); this.burstPauseT = 0; this.aimError = new THREE.Vector3();
    this.grenadeT = rand(4, 9); this.fleeT = 0; this.fleeFrom = null;
    this.staggerT = 0; this.crouch = 0; this.aiming = 0;
    this.patrolRoute = opts.route || null; this.patrolI = opts.routeIndex || 0; this.patrolWait = 0;
    this.investigatePos = null;
    this.tick = rand(0, 0.2); this.tickRate = 0.1;
    this.distToCam = 0; this.distToTarget = 999;
    this.moveSpeedN = 0; this.grounded = true;
    this.barkT = rand(3, 8);
    this.shootAnchor = new THREE.Vector3();
    this.rescuedFollow = false;
    this.world.register(this);
  }

  // ---------- hitboxes ----------
  _bonePos(name, out) { return this.model.bones[name].getWorldPosition(out); }
  raycastHitboxes(o, d, maxT) {
    const B = this.model.bones; const s = this.type.scale;
    let best = maxT, zone = null;
    const test = (t, z) => { if (t >= 0 && t < best) { best = t; zone = z; } };
    if (!this.lostLimbs.has('head')) test(raySphere(o, d, this._bonePos('head', _v).addScaledVector(UP, 0.10 * s), 0.19 * s, best), 'head');
    test(rayCapsule(o, d, this._bonePos('spine', _v), this._bonePos('neck', _v2), 0.27 * s, best), 'chest');
    test(raySphere(o, d, this._bonePos('root', _v), 0.26 * s, best), 'pelvis');
    for (const [limb, bones] of Object.entries(LIMBS)) {
      if (limb === 'head' || this.lostLimbs.has(limb)) continue;
      const a = this._bonePos(bones[0], _v), b = this._bonePos(bones[2], _v2);
      test(rayCapsule(o, d, a, b, (limb.startsWith('arm') ? 0.11 : 0.14) * s, best), limb);
    }
    if (!zone) return null;
    _n.copy(d).negate();
    return { t: best, zone, normal: _n, material: this.mechanical ? 'metal' : 'flesh' };
  }
  armourAt(zone) { return this.armour[zone] || 0; }

  // ---------- damage (host) ----------
  takeDamage(dmg, info) {
    if (this.dead) return null;
    const zone = info.zone || 'chest';
    const res = { dead: false, gib: false, limb: null, stagger: false, armourBroke: false };
    if (this.armour[zone] > 0) {
      const absorbed = Math.min(this.armour[zone], dmg * 0.7);
      this.armour[zone] -= absorbed; dmg -= absorbed;
      if (this.armour[zone] <= 0) { this.armour[zone] = 0; res.armourBroke = true; }
    }
    this.health -= dmg;
    this.alert = true; this.alertT = 0;
    if (info.attackerId) { const att = this.world.entities.get(info.attackerId); if (att && !this.target) this.target = att; this.lastSeenT = this.game.time; if (att) { this.lastSeen = (this.lastSeen || new THREE.Vector3()).copy(att.position); } }
    if (this.squad) this.squad.alert(this);
    if (dmg >= this.type.staggerThreshold || zone === 'head' && !this.type.heavy) res.stagger = true;
    if (this.health <= 0) {
      res.dead = true;
      const overkill = -this.health / this.maxHealth;
      res.gib = settings.goreLevel > 0 && !this.mechanical && (info.explosive ? overkill > 0.15 : overkill > this.type.gibThreshold || (zone === 'head' && (info.weapon === 'hammer' || dmg > 80)));
      if (!res.gib && ['armL', 'armR', 'legL', 'legR'].includes(zone) && (dmg > 45 || info.weapon === 'hammer') && !this.mechanical && settings.data.dismemberment) res.limb = zone;
      if (!res.gib && zone === 'head' && dmg > 60 && !this.mechanical && settings.data.dismemberment) res.limb = 'head';
    } else if (['armL', 'armR', 'legL', 'legR'].includes(zone) && dmg > 55 && !this.mechanical && settings.data.dismemberment && settings.goreLevel === 2 && !this.lostLimbs.has(zone)) {
      res.limb = zone; // maimed but alive
    }
    return res;
  }
  applyRemoteDamage(ev) { this.health = ev.hp; if (ev.armourBroke) this.armour[ev.zone] = 0; this.alert = true; }
  stagger(ev) {
    this.staggerT = this.type.heavy ? 0.35 : 0.6;
    this.anim.hitReact((Math.random() - 0.5) * 2, 1);
    audio.play('enemy_stagger', { pos: this.position, volume: 0.6 });
    if (ev && ev.impulse) { const d = new THREE.Vector3(...ev.dir); this.velocity.addScaledVector(d, ev.impulse * 0.6 / this.type.mass); }
  }
  loseLimb(limb, ev) {
    if (this.lostLimbs.has(limb)) return;
    this.lostLimbs.add(limb);
    const bone = this.model.bones[LIMBS[limb][0]];
    const p = bone.getWorldPosition(new THREE.Vector3());
    const vel = new THREE.Vector3(...(ev?.dir || [0, 1, 0])).multiplyScalar(ev?.impulse ? 3 + ev.impulse * 0.6 : 5).add(new THREE.Vector3(rand(-1, 1), rand(2, 4), rand(-1, 1)));
    this.fx.limb?.(this.model, limb, p, vel, bone);
    audio.play('limb_off', { pos: p, volume: 0.9 });
    if (limb.startsWith('leg')) { this.crippled = true; }
    if (limb === 'head' && !this.dead) { this.health = 0; }
  }
  die(ev) {
    if (this.dead) return; this.dead = true; this.state = 'dead';
    this.coverPoint && (this.coverPoint.occupant = null);
    this.world.unregister(this);
    const dir = new THREE.Vector3(...(ev?.dir || [0, 0, 1]));
    const hitPoint = ev?.p ? new THREE.Vector3(...ev.p) : this.position.clone();
    if (this.mechanical) { this.fx.explosion(this.hitCenter, 2.2, 'drone'); this.fx.sparksBurst?.(this.hitCenter, UP, 30); audio.play('drone_explode', { pos: this.position }); this.removeModel(); this.game.director?.onEnemyRemoved(this); return; }
    if (ev?.gib) {
      const limbs = Object.keys(LIMBS);
      this.fx.gibs(this.hitCenter.clone(), dir, { model: this.model, limbs, armour: true, count: 10 + Math.round(ev.impulse || 4) });
      this.fx.blood(this.hitCenter.clone(), UP, dir, 4);
      audio.play('gib', { pos: this.position, volume: 1 });
      this.removeModel();
    } else {
      const impulse = dir.clone().multiplyScalar((ev?.impulse || 1) * 2.2 / this.type.mass).add(this.velocity.clone().multiplyScalar(0.5));
      if (ev?.explosive) impulse.y += 4;
      this.ragdoll = this.fx.ragdoll(this.model, { position: this.position.clone(), yaw: this.yaw + Math.PI, impulse, hitPoint, hitLimb: ev?.zone });
      if (this.weaponModel) { this.weaponModel.visible = false; }
      if (settings.goreLevel > 0) this.fx.bloodPool?.(this.position.clone(), 1 + Math.random() * 0.6);
      audio.play('body_fall', { pos: this.position, volume: 0.7, delay: 0.5 });
      if (this.ragdoll) this.ragdoll.onRemove = () => this.removeModel();
      else this.removeModel();
    }
    if (ev?.zone === 'head') audio.play('headshot_marker', { volume: 0.5 });
    audio.play('enemy_death_mech', { pos: this.position, volume: 0.5, pitchVar: 0.1 });
    if (Math.random() < 0.25 && this.distToCam < 45) audio.say(pick(['lg_death_1', 'lg_death_2', 'lg_man_down']), { priority: 1 });
    this.game.director?.onEnemyRemoved(this);
  }
  removeModel() { if (this.model.root.parent) this.model.root.parent.remove(this.model.root); this.model.dispose?.(); this.removed = true; }

  // ---------- perception ----------
  eye(out) { return out.copy(this.position).addScaledVector(UP, 1.62 * this.type.scale - this.crouch * 0.45); }
  pickTarget() {
    const players = this.game.players || [];
    let best = null, bd = Infinity;
    for (const p of players) { if (p.dead || p.downed) continue; const d = p.position.distanceTo(this.position); if (d < bd) { bd = d; best = p; } }
    if (this.type.ally) return null;
    return best;
  }
  updatePerception(dt) {
    const t = this.pickTarget();
    if (t !== this.target && (!this.target || this.target.dead || this.target.downed)) this.target = t;
    else if (t && this.target && !this.target.dead && this.target.position.distanceTo(this.position) > t.position.distanceTo(this.position) + 8) this.target = t;
    if (!this.target) { this.canSee = false; return; }
    this.distToTarget = this.target.position.distanceTo(this.position);
    const eye = this.eye(_v);
    const aim = _v2.copy(this.target.position).addScaledVector(UP, this.target.crouching ? 0.9 : 1.3);
    const dir = _v3.subVectors(aim, eye); const dist = dir.length(); dir.divideScalar(dist || 1);
    // FOV check unless alerted
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const inFov = this.alert || fwd.dot(dir) > 0.25 || dist < 6;
    const maxRange = this.alert ? 140 : (this.target.sprinting ? 70 : this.target.crouching ? 30 : 50);
    let see = false;
    if (inFov && dist < maxRange) see = this.world.hasLOS(eye, aim, { terrainStep: 2 });
    if (see) {
      this.seeT += dt;
      if (this.seeT > this.type.reactionTime * (this.alert ? 0.4 : 1)) { this.canSee = true; this.lastSeen = (this.lastSeen || new THREE.Vector3()).copy(this.target.position); this.lastSeenT = this.game.time; if (!this.alert) this.onAlert(true); }
    } else { this.seeT = Math.max(0, this.seeT - dt * 2); if (this.canSee) this.acquiredT = null; this.canSee = false; }
  }
  onAlert(first) {
    this.alert = true; this.alertT = 0;
    if (this.state === 'patrol' || this.state === 'idle' || this.state === 'investigate') this.setState('combat');
    if (first) { audio.play('enemy_alert', { pos: this.position, volume: 0.8 }); if (Math.random() < 0.5 && this.type.voiceBarks?.length) audio.say('lg_contact', { priority: 1 }); }
    this.squad?.alert(this);
    events.emit('enemy:alert', this);
  }
  hearNoise(pos, loud = 1) {
    if (this.dead || this.alert || this.type.ally) return;
    const d = pos.distanceTo(this.position);
    if (d < 25 * loud) { this.investigatePos = pos.clone(); if (this.state === 'patrol' || this.state === 'idle') this.setState('investigate'); }
  }
  setState(s) { if (this.state === s) return; this.state = s; this.stateT = 0; this.path = null; this.pathGoal = null; if (s !== 'cover' && this.coverPoint) { this.coverPoint.occupant = null; this.coverPoint = null; this.inCover = false; } }

  // ---------- navigation ----------
  requestPath(goal) {
    if (this.pathPending) return;
    if (this.pathGoal && this.pathGoal.distanceTo(goal) < 1.5 && this.path) return;
    this.pathPending = true; this.pathGoal = goal.clone();
    this.world.nav.request(this.position.x, this.position.z, goal.x, goal.z, (p) => { this.pathPending = false; this.path = p; this.pathI = 0; this.pathT = 0; });
  }
  /** Move toward current path; returns true when arrived. */
  followPath(dt, speed, arriveDist = 0.8) {
    if (!this.path || this.pathI >= this.path.length) return !this.path ? false : true;
    const wp = this.path[this.pathI];
    const dx = wp.x - this.position.x, dz = wp.z - this.position.z; const d = Math.hypot(dx, dz);
    if (d < arriveDist) { this.pathI++; if (this.pathI >= this.path.length) { this.velocity.x = this.velocity.z = 0; return true; } return false; }
    const vx = dx / d * speed, vz = dz / d * speed;
    this.velocity.x = damp(this.velocity.x, vx, 10, dt); this.velocity.z = damp(this.velocity.z, vz, 10, dt);
    this.pathT += dt;
    if (this.pathT > 6) { this.path = null; this.pathGoal = null; } // stuck timeout
    return false;
  }
  moveTo(goal, dt, speed, arrive = 0.8) {
    const d = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
    if (d < arrive) { this.velocity.x = damp(this.velocity.x, 0, 12, dt); this.velocity.z = damp(this.velocity.z, 0, 12, dt); return true; }
    // direct steering when close & clear, else path
    if (d < 6 && this.world.nav.lineWalkable(this.position.x, this.position.z, goal.x, goal.z)) {
      this.velocity.x = damp(this.velocity.x, (goal.x - this.position.x) / d * speed, 10, dt); this.velocity.z = damp(this.velocity.z, (goal.z - this.position.z) / d * speed, 10, dt); return false;
    }
    this.requestPath(goal);
    if (this.path) return this.followPath(dt, speed, arrive);
    this.velocity.x = damp(this.velocity.x, 0, 8, dt); this.velocity.z = damp(this.velocity.z, 0, 8, dt);
    return false;
  }
  faceToward(x, z, dt, rate = 10) { this.yaw = angleDamp(this.yaw, Math.atan2(-(x - this.position.x), -(z - this.position.z)), rate, dt); }

  // ---------- combat behaviours ----------
  updateAI(dt) {
    this.stateT += dt; this.alertT += dt;
    if (this.staggerT > 0) { this.staggerT -= dt; this.velocity.x = damp(this.velocity.x, 0, 6, dt); this.velocity.z = damp(this.velocity.z, 0, 6, dt); return; }
    if (this.type.ally) { this.updateAlly(dt); return; }
    if (this.fleeT > 0) { this.updateFlee(dt); return; }
    if (this.alert && (this.state === 'patrol' || this.state === 'idle' || this.state === 'investigate')) { if (!this.target) this.target = this.pickTarget(); this.setState('combat'); }
    switch (this.state) {
      case 'patrol': this.updatePatrol(dt); break;
      case 'investigate': this.updateInvestigate(dt); break;
      case 'combat': this.updateCombat(dt); break;
      case 'cover': this.updateCover(dt); break;
      case 'rush': this.updateRush(dt); break;
      case 'flank': this.updateFlank(dt); break;
      default: this.updateIdle(dt);
    }
    // lose target
    if (this.alert && this.target && !this.canSee && this.game.time - this.lastSeenT > 18) { this.alert = false; this.setState('investigate'); this.investigatePos = this.lastSeen?.clone() || null; }
    if (this.canSee) this.tryFire(dt); else { this.burstLeft = 0; }
    if (this.type.grenadier && this.alert) this.tryGrenade(dt);
    this.barkT -= dt; if (this.barkT < 0 && this.alert && this.distToCam < 40 && this.type.voiceBarks?.length && Math.random() < 0.3) { audio.say(pick(this.type.voiceBarks), { priority: 1 }); this.barkT = rand(8, 16); }
  }
  updateIdle(dt) { this.velocity.x = damp(this.velocity.x, 0, 8, dt); this.velocity.z = damp(this.velocity.z, 0, 8, dt); this.aiming = damp(this.aiming, 0, 5, dt); }
  updatePatrol(dt) {
    this.aiming = damp(this.aiming, 0, 5, dt); this.crouch = damp(this.crouch, 0, 5, dt);
    if (!this.patrolRoute || !this.patrolRoute.points?.length) { this.updateIdle(dt); return; }
    if (this.patrolWait > 0) { this.patrolWait -= dt; this.updateIdle(dt); return; }
    const pts = this.patrolRoute.points; const wp = pts[this.patrolI % pts.length];
    if (this.moveTo(wp, dt, this.type.speed * 0.7, 1.5)) { this.patrolI++; this.patrolWait = rand(0.5, 3); }
    if (this.velocity.lengthSq() > 0.1) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 6);
  }
  updateInvestigate(dt) {
    this.aiming = damp(this.aiming, 0.6, 5, dt);
    if (!this.investigatePos) { this.setState('patrol'); return; }
    if (this.moveTo(this.investigatePos, dt, this.type.speed * 0.85, 2.5)) { if (this.stateT > 6) { this.investigatePos = null; this.setState('patrol'); } this.faceToward(this.position.x - Math.sin(this.game.time * 0.7) * 3, this.position.z - Math.cos(this.game.time * 0.7) * 3, dt, 3); }
    else if (this.velocity.lengthSq() > 0.1) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 6);
  }
  updateCombat(dt) {
    this.aiming = damp(this.aiming, 1, 6, dt);
    const tgt = this.target; if (!tgt) { this.setState('patrol'); return; }
    const focus = this.canSee ? tgt.position : (this.lastSeen || tgt.position);
    this.faceToward(focus.x, focus.z, dt, 8);
    const d = this.distToTarget;
    if (this.type.rusher) { this.setState('rush'); return; }
    // squad role: designated flanker
    if (this.squad?.flanker === this && this.squad.combatT > 6) { this.setState('flank'); return; }
    const [minR, maxR] = this.type.preferredRange;
    if (this.type.usesCover) {
      const cp = this.world.cover.findCover(this.position, focus, 22, { self: this, minDistToThreat: minR * 0.6, maxDistToThreat: maxR + 10, preferredDist: (minR + maxR) / 2, preferLow: !this.type.heavy });
      if (cp) { this.coverPoint = cp; cp.occupant = this; this.setState('cover'); this.state = 'cover'; return; }
    }
    // no cover: hold range and strafe
    let goal = null;
    if (d > maxR) goal = focus; else if (d < minR) goal = _v.copy(this.position).sub(focus).normalize().multiplyScalar(6).add(this.position);
    if (goal) this.moveTo(goal, dt, this.type.speed, 2);
    else { const side = Math.sin(this.game.time * 0.5 + this.id) > 0 ? 1 : -1; const sx = -(focus.z - this.position.z), sz = (focus.x - this.position.x); const l = Math.hypot(sx, sz) || 1; this.velocity.x = damp(this.velocity.x, sx / l * side * 1.8, 6, dt); this.velocity.z = damp(this.velocity.z, sz / l * side * 1.8, 6, dt); }
  }
  updateCover(dt) {
    const cp = this.coverPoint; const tgt = this.target;
    if (!cp || !tgt) { this.setState('combat'); return; }
    this.aiming = damp(this.aiming, 1, 6, dt);
    const focus = this.canSee ? tgt.position : (this.lastSeen || tgt.position);
    const arrived = this.moveTo(cp.pos, dt, this.type.sprint, 0.5);
    if (!arrived) { this.inCover = false; if (this.velocity.lengthSq() > 0.5 && !this.canSee) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 8); else this.faceToward(focus.x, focus.z, dt, 8); this.crouch = damp(this.crouch, 0, 6, dt); return; }
    this.inCover = true; this.coverT += dt;
    this.faceToward(focus.x, focus.z, dt, 8);
    // Is the cover still valid (threat in front of the cover)?
    const tx = focus.x - cp.pos.x, tz = focus.z - cp.pos.z; const td = Math.hypot(tx, tz) || 1;
    const facing = (tx / td) * cp.dir.x + (tz / td) * cp.dir.z;
    if (facing < 0.3 || td < 5 || this.coverT > rand(9, 16)) { this.coverT = 0; cp.lastUsed = performance.now(); this.setState('combat'); return; }
    // peek cycle: hide 1.2-2.5 s, expose 1.5-3 s while firing
    this.peekT -= dt;
    if (this.peekT <= 0) { this.exposed = !this.exposed; this.peekT = this.exposed ? rand(1.4, 3) : rand(1, 2.2); if (this.type.heavy) this.peekT *= 1.6; }
    const lowCover = cp.height === 'low';
    this.crouch = damp(this.crouch, lowCover ? (this.exposed ? 0.35 : 1) : 0, 6, dt);
    // lateral peek offset for high cover
    this.peekSide = lowCover ? 0 : (cp.leftEdge && !cp.rightEdge ? 1 : cp.rightEdge && !cp.leftEdge ? -1 : (this.id % 2 ? 1 : -1));
    const leftX = cp.dir.z, leftZ = -cp.dir.x;
    const off = !lowCover && this.exposed ? 0.7 * this.peekSide : 0;
    const gx = cp.pos.x + leftX * off, gz = cp.pos.z + leftZ * off;
    this.velocity.x = damp(this.velocity.x, (gx - this.position.x) * 6, 10, dt); this.velocity.z = damp(this.velocity.z, (gz - this.position.z) * 6, 10, dt);
  }
  updateRush(dt) {
    const tgt = this.target; if (!tgt) { this.setState('patrol'); return; }
    this.aiming = damp(this.aiming, 0.5, 6, dt); this.crouch = damp(this.crouch, 0, 6, dt);
    const focus = this.canSee ? tgt.position : (this.lastSeen || tgt.position);
    const d = this.distToTarget;
    if (d > 6) { this.moveTo(focus, dt, this.type.sprint, 3); if (!this.canSee && this.velocity.lengthSq() > 0.5) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 8); else this.faceToward(focus.x, focus.z, dt, 10); }
    else { // circle strafe at close range
      const side = this.id % 2 ? 1 : -1; const sx = -(focus.z - this.position.z), sz = (focus.x - this.position.x); const l = Math.hypot(sx, sz) || 1;
      this.velocity.x = damp(this.velocity.x, sx / l * side * 3, 6, dt); this.velocity.z = damp(this.velocity.z, sz / l * side * 3, 6, dt);
      this.faceToward(focus.x, focus.z, dt, 12);
    }
  }
  updateFlank(dt) {
    const tgt = this.target; if (!tgt || !this.squad) { this.setState('combat'); return; }
    this.aiming = damp(this.aiming, 0.7, 6, dt);
    if (!this.flankGoal || this.stateT > 12) {
      const focus = this.lastSeen || tgt.position;
      const toMe = _v.subVectors(this.position, focus).setY(0).normalize();
      const side = new THREE.Vector3(-toMe.z, 0, toMe.x).multiplyScalar(this.squad.flankSide || 1);
      const goal = focus.clone().addScaledVector(side, 16).addScaledVector(toMe, 6);
      const w = this.world.nav.nearestWalkable(goal.x, goal.z, 14);
      this.flankGoal = w ? new THREE.Vector3(w.x, 0, w.z) : null; this.stateT = 0;
      if (!this.flankGoal) { this.squad.flanker = null; this.setState('combat'); return; }
    }
    if (this.moveTo(this.flankGoal, dt, this.type.sprint, 2.5) || (this.canSee && this.stateT > 3)) { this.flankGoal = null; this.squad.flanker = null; this.setState('combat'); return; }
    if (this.velocity.lengthSq() > 0.5) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 8);
  }
  updateFlee(dt) {
    this.fleeT -= dt; this.aiming = damp(this.aiming, 0.3, 6, dt); this.crouch = damp(this.crouch, 0, 8, dt);
    if (!this.fleeGoal && this.fleeFrom) { const away = _v.subVectors(this.position, this.fleeFrom).setY(0).normalize().multiplyScalar(9).add(this.position); const w = this.world.nav.nearestWalkable(away.x, away.z, 8); this.fleeGoal = w ? new THREE.Vector3(w.x, 0, w.z) : this.position.clone(); }
    if (this.fleeGoal) { this.moveTo(this.fleeGoal, dt, this.type.sprint, 1.2); if (this.velocity.lengthSq() > 0.5) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 10); }
    if (this.fleeT <= 0) { this.fleeGoal = null; this.fleeFrom = null; this.setState('combat'); }
  }
  /** Called by the director when a grenade lands near. */
  reactToGrenade(pos) { if (this.dead || this.fleeT > 0) return; if (pos.distanceTo(this.position) < 8) { this.fleeT = 1.8; this.fleeFrom = pos.clone(); this.fleeGoal = null; if (this.coverPoint) { this.coverPoint.occupant = null; this.coverPoint = null; } if (this.distToCam < 40 && Math.random() < 0.5) audio.say('lg_grenade', { priority: 1 }); } }
  updateAlly(dt) {
    // rescued operative: follow the nearest player at a distance, crouch when they crouch
    const p = this.game.localPlayer; if (!p) { this.updateIdle(dt); return; }
    const d = p.position.distanceTo(this.position);
    if (this.rescuedFollow && d > 5) { this.moveTo(p.position, dt, this.type.speed, 4); if (this.velocity.lengthSq() > 0.5) this.faceToward(this.position.x + this.velocity.x, this.position.z + this.velocity.z, dt, 8); }
    else { this.updateIdle(dt); this.faceToward(p.position.x, p.position.z, dt, 4); }
  }

  // ---------- shooting ----------
  tryFire(dt) {
    const w = this.weaponDef; if (!w || !this.target) return;
    if (this.state === 'cover' && this.inCover && !this.exposed) { this.burstLeft = 0; return; }
    if (this.state === 'flank' || this.fleeT > 0) return;
    const d = this.distToTarget; if (d > w.range * 1.2) return;
    if (this.type.rusher && d > w.range) return;
    this.fireT -= dt;
    if (this.burstLeft <= 0) { this.burstPauseT -= dt; if (this.burstPauseT <= 0) { this.burstLeft = w.burst + Math.floor(rand(0, 2)); this.burstPauseT = w.burstPause * rand(0.8, 1.3); this.aimError.set(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).multiplyScalar(0.6 / this.accMult); } else return; }
    if (this.fireT > 0) return;
    this.fireT = 60 / w.rpm; this.burstLeft--;
    this.fireShot();
  }
  fireShot() {
    const w = this.weaponDef, tgt = this.target;
    const muzzle = this.weaponModel?.userData.muzzle ? this.weaponModel.userData.muzzle.getWorldPosition(new THREE.Vector3()) : this.eye(new THREE.Vector3());
    const aim = tgt.position.clone().addScaledVector(UP, tgt.crouching ? 0.85 : 1.25).add(this.aimError);
    // accuracy: worse when target moves fast, far, or shooter just exposed
    // grace: the first seconds after acquiring a target are wild; sustained fire tightens up
    const acquired = this.game.time - (this.acquiredT ?? (this.acquiredT = this.game.time));
    const grace = 1 + Math.max(0, 2.2 - acquired) * 1.6;
    const spreadBase = w.spread * grace * (1 / this.accMult) * (1 + Math.min(1.5, (tgt.velocity?.length() || 0) / 5) * 0.8) * (1 + this.distToTarget / 60) * (tgt.state === 'cover' && !tgt.aiming ? 2.5 : 1);
    const pellets = w.pellets || 1;
    this.anim.kick(this.type.heavy ? 0.3 : 0.5);
    this.fx.muzzleFlash(muzzle, _v.subVectors(aim, muzzle).normalize(), '#ff6a2a', this.type.heavy ? 1.4 : 1);
    audio.play(w.sound, { pos: muzzle, volume: 0.85, pitchVar: 0.06 });
    if (!net.isHost) return; // clients only render replicated fire events
    const shots = [];
    for (let i = 0; i < pellets; i++) {
      const dir = _v2.subVectors(aim, muzzle).normalize();
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadBase;
      const side = _v3.crossVectors(dir, UP).normalize(); const up = new THREE.Vector3().crossVectors(side, dir);
      dir.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const hit = this.world.raycast(muzzle, dir, w.range * 1.5, { ignoreEntity: this, entityFilter: (e) => !e.isEnemy || e.type?.ally });
      const end = hit ? hit.point.clone() : muzzle.clone().addScaledVector(dir, w.range * 1.5);
      shots.push([...v3(end)]);
      if (hit) {
        if (hit.entity?.isPlayer) hit.entity.takeDamage(Math.round(w.damage * this.dmgMult), { attackerId: this.id, p: v3(hit.point), n: v3(hit.normal), dir: v3(dir), weapon: w.id, zone: hit.zone });
        else if (hit.entity?.takeDamage) { const res = hit.entity.takeDamage(Math.round(w.damage * this.dmgMult), { attackerId: this.id, zone: hit.zone, p: v3(hit.point), n: v3(hit.normal), dir: v3(dir), weapon: w.id }); if (res?.dead) hit.entity.die?.({ dir: v3(dir) }); }
        else { this.fx.impact(hit.point, hit.normal, hit.material); }
      }
      this.fx.tracer(muzzle, end, w.tracer, 0.05, 220);
    }
    net.send(MSG.EV_ENEMYFIRE, { id: this.id, from: v3(muzzle), to: shots, weapon: w.id }, { reliable: false });
    // noise: nearby idle enemies become suspicious of the fight
    this.game.director?.noise(this.position, 1.2, this);
  }
  tryGrenade(dt) {
    this.grenadeT -= dt;
    if (this.grenadeT > 0 || !this.target || !net.isHost) return;
    const d = this.distToTarget; if (d < 9 || d > 34) return;
    const tgt = this.target;
    // grenadiers punish stationary / cover-camping players
    const stationary = (tgt.velocity?.length() || 0) < 1.0 || tgt.state === 'cover';
    if (!stationary && Math.random() < 0.6) { this.grenadeT = 2; return; }
    if (!this.lastSeen) return;
    this.grenadeT = rand(...(this.type.grenadeInterval || [7, 11]));
    const from = this.eye(new THREE.Vector3());
    const to = this.lastSeen.clone();
    this.game.projectiles.throwGrenade(from, to, { owner: this.id, enemy: true, fuse: 2.6, damage: 70 * this.dmgMult, radius: 5.5 });
    this.anim.kick(0.8);
    audio.play('enemy_grenade_throw', { pos: from, volume: 0.8 });
    if (this.distToCam < 45) audio.say('lg_grenade', { priority: 1 });
  }

  // ---------- integration & presentation ----------
  integrate(dt) {
    this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt;
    this.world.resolveCapsule(this.position, this.radius, this.height);
    this.position.x = clamp(this.position.x, -197, 197); this.position.z = clamp(this.position.z, -197, 197);
    const g = this.world.groundHeight(this.position.x, this.position.z, this.position.y, 0.6, this.radius);
    this.position.y = damp(this.position.y, g, 18, dt);
    // separation from other enemies
    const dir = this.game.director; if (dir) { for (const o of dir.near(this, 1.6)) { if (o === this || o.dead) continue; const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z; const dd = Math.hypot(dx, dz) || 0.01; if (dd < 1.4) { const push = (1.4 - dd) * 3 * dt; this.position.x += dx / dd * push; this.position.z += dz / dd * push; } } }
    this.velocity.x = damp(this.velocity.x, 0, 1.5, dt); this.velocity.z = damp(this.velocity.z, 0, 1.5, dt);
  }
  update(dt, camera) {
    if (this.dead) return;
    this.distToCam = camera ? camera.position.distanceTo(this.position) : 50;
    const far = this.distToCam > 90;
    if (net.isHost) {
      this.tick -= dt;
      if (this.tick <= 0) { const step = far ? 0.35 : 0.1; this.updatePerception(step + Math.max(0, -this.tick)); this.tick = step; }
      this.updateAI(dt);
      this.integrate(dt);
    } else {
      // remote: interpolate toward snapshot
      if (this.netTarget) { this.position.lerp(this.netTarget.p, Math.min(1, dt * 12)); this.yaw = angleDamp(this.yaw, this.netTarget.yaw, 12, dt); this.velocity.copy(this.netTarget.v); this.crouch = damp(this.crouch, this.netTarget.crouch, 8, dt); this.aiming = this.netTarget.aim; }
    }
    // presentation
    this.hitCenter.copy(this.position).addScaledVector(UP, 1.0 * this.type.scale);
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    this.moveSpeedN = clamp(sp / this.type.sprint, 0, 1);
    const local = _v.set(this.velocity.x, 0, this.velocity.z).applyAxisAngle(UP, -this.yaw);
    if (this.distToCam < 120 || !far) {
      this.anim.update(dt, { speed: this.moveSpeedN, strafe: clamp(local.x / 3, -1, 1), forward: local.z >= -0.3 ? 1 : -1, sprint: this.moveSpeedN > 0.75 ? 1 : 0, crouch: this.crouch, aim: this.aiming, cover: null, weaponLow: this.alert ? 0 : 0.8 });
    }
    if (this.target && this.aiming > 0.5) { const dy = (this.target.position.y + 1.2) - (this.position.y + 1.4); const dxz = Math.max(1, this.distToTarget); this.anim.aimPitch = clamp(Math.atan2(dy, dxz) / 1.1, -1, 1); }
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw + Math.PI;
    if (this.crippled) this.model.root.position.y -= 0.35;
  }
  snapshot() { return [this.id, this.typeId, +this.position.x.toFixed(2), +this.position.y.toFixed(2), +this.position.z.toFixed(2), +this.yaw.toFixed(2), this.health, this.state === 'cover' ? 1 : 0, +this.aiming.toFixed(1), +this.crouch.toFixed(1), +this.velocity.x.toFixed(1), +this.velocity.z.toFixed(1)]; }
  applySnapshot(s) { this.netTarget = this.netTarget || { p: new THREE.Vector3(), v: new THREE.Vector3(), yaw: 0, aim: 0, crouch: 0 }; this.netTarget.p.set(s[2], s[3], s[4]); this.netTarget.yaw = s[5]; this.health = s[6]; this.netTarget.aim = s[8]; this.netTarget.crouch = s[9]; this.netTarget.v.set(s[10], 0, s[11]); this.alert = s[8] > 0.5; }
}

/** Squad: shared awareness, flank assignment. */
export class Squad {
  constructor(id) { this.id = id; this.members = []; this.alerted = false; this.combatT = 0; this.flanker = null; this.flankSide = Math.random() < 0.5 ? 1 : -1; }
  add(e) { this.members.push(e); e.squad = this; }
  alert(from) {
    if (!this.alerted) { this.alerted = true; this.combatT = 0; if (from?.distToCam < 50 && Math.random() < 0.4) audio.say('lg_flank', { priority: 1, delay: 1.5 }); }
    for (const m of this.members) { if (m !== from && !m.dead && !m.alert) { m.alert = true; m.target = from.target || m.pickTarget(); m.lastSeen = from.lastSeen ? from.lastSeen.clone() : m.lastSeen; m.lastSeenT = from.lastSeenT; if (m.state === 'patrol' || m.state === 'idle' || m.state === 'investigate') m.setState('combat'); } }
  }
  update(dt) {
    this.members = this.members.filter(m => !m.dead);
    if (!this.alerted) return;
    this.combatT += dt;
    if (this.members.length >= 3 && !this.flanker && this.combatT > 6) { const cands = this.members.filter(m => !m.type.heavy && !m.type.rusher && m.state !== 'flank'); if (cands.length) { this.flanker = pick(cands); this.flankSide *= -1; } }
    if (this.flanker?.dead) this.flanker = null;
    if (this.members.every(m => !m.alert)) this.alerted = false;
  }
}
