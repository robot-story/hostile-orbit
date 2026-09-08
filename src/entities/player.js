// Player controller: movement, camera, cover, aim, shooting, reload, roll, vault.
import * as THREE from 'three';
import { buildSoldier } from '../models/soldier.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';
import { CharacterAnimator } from './animator.js';
import { ThirdPersonCamera } from './camera.js';
import { WEAPONS, GRENADE, INJECTOR } from '../gameplay/weapons.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { clamp, damp, angleDamp, angleDiff, lerp } from '../core/mathx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Ray();

export class Player {
  constructor(game, camera, fx, loadout = { primary: 'viper', secondary: 'sidearm' }) {
    const world = game.world;
    this.game = game; this.world = world; this.fx = fx;
    this.model = buildSoldier('vanguard');
    this.anim = new CharacterAnimator(this.model);
    this.cam = new ThirdPersonCamera(camera, world);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.grounded = true; this.vy = 0;
    this.health = 200; this.maxHealth = 200; this.dead = false;
    this.radius = 0.38; this.height = 1.8;
    this.state = 'normal'; // normal | roll | vault | cover | interact
    this.stateT = 0;
    this.crouching = false; this.aiming = false; this.sprinting = false;
    this.cover = null; this.coverT = 0; this.peek = 0; this.coverAlong = 0; this.coverStart = new THREE.Vector3();
    this.grenades = GRENADE.count; this.injectors = INJECTOR.count; this.healT = 0;
    this.weapons = { primary: this.makeWeapon(loadout.primary), secondary: this.makeWeapon(loadout.secondary) };
    this.slot = 'primary'; this.weaponGroup = new THREE.Group(); this.anim.weaponSocket.add(this.weaponGroup);
    this.fireT = 0; this.bloom = 0; this.reloadT = -1; this.reloadStage = 0; this.trigger = false;
    this.shots = 0; this.hits = 0;
    world.actors.add(this.model.root);
    this.entityType = 'player'; this.isPlayer = true; this.id = null;
    this.hitboxes = true; this.hitRadius = 1.3; this.hitCenter = new THREE.Vector3();
    this.downed = false; this.lastDamageT = -99; this.regenDelay = 9; this.armourHp = 0;
    this.grenadeCharge = -1; this.throwing = 0;
    world.register(this);
    this.equip('primary');
    this.anim.onFootstep = () => { audio.play(this.onMetal ? 'footstep_metal' : 'footstep_dirt', { pos: this.position, volume: 0.6, pitchVar: 0.08 }); audio.play('armor_rustle', { pos: this.position, volume: 0.35, pitchVar: 0.15 }); if (this.fx?.dust && !this.onMetal) this.fx.dust(this.position.clone(), this.sprinting ? 1.2 : 0.5); };
    this.spawnT = 0;
  }
  makeWeapon(id) { const d = WEAPONS[id]; return { def: d, ammo: d.mag, reserve: d.reserve, model: WEAPON_BUILDERS[id]() }; }
  get weapon() { return this.weapons[this.slot]; }
  equip(slot) { this.slot = slot; while (this.weaponGroup.children.length) this.weaponGroup.remove(this.weaponGroup.children[0]); this.weaponGroup.add(this.weapon.model); this.reloadT = -1; audio.play('weapon_swap', { volume: 0.6 }); events.emit('player:weapon', this.weapon); }
  spawnAt(p, yaw = 0) { this.position.copy(p); this.yaw = yaw; this.cam.yaw = yaw; this.velocity.set(0, 0, 0); this.model.root.position.copy(p); }
  get eyeHeight() { return this.crouching || (this.state === 'cover' && this.cover?.height === 'low' && !this.aiming) ? 1.15 : 1.55; }
  get moveSpeedMax() { const w = this.weapon.def.moveMult || 1; if (this.aiming) return 3.1 * w; if (this.crouching) return 2.7; if (this.sprinting) return 7.8 * w; return 5.1 * w; }

  update(dt) {
    this.stateT += dt; this.spawnT += dt;
    const m = input.consumeMouse();
    if (!this.dead) this.cam.look(m.dx, m.dy);
    if (m.wheel !== 0 || input.pressed('swap')) this.equip(this.slot === 'primary' ? 'secondary' : 'primary');
    if (input.pressed('shoulder')) this.cam.shoulder *= -1;
    const ax = input.moveAxis();
    const camYaw = this.cam.yaw;
    // camera-relative move direction
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, ax.z).addScaledVector(right, ax.x);
    const aimNow = input.aim();
    if (!this.dead) {
      if (this.state === 'normal') this.updateNormal(dt, wish, ax, aimNow);
      else if (this.state === 'roll') this.updateRoll(dt);
      else if (this.state === 'vault') this.updateVault(dt);
      else if (this.state === 'cover') this.updateCover(dt, wish, ax, aimNow);
    }
    this.integrate(dt);
    if (!this.dead) { this.updateWeapon(dt); this.updateGrenade(dt); }
    if (this.healT > 0) { this.healT -= dt; this.health = Math.min(this.maxHealth, this.health + INJECTOR.heal / INJECTOR.duration * dt); }
    else if (!this.dead && this.spawnT - this.lastDamageT > this.regenDelay && this.health < 40) this.health = Math.min(40, this.health + 4 * dt);
    this.invulnT = Math.max(0, (this.invulnT || 0) - dt);
    this.transformT = Math.max(0, (this.transformT || 0) - dt);
    this.hitCenter.copy(this.position).add(new THREE.Vector3(0, 1.0, 0));
    // animation state
    const speedN = clamp(this.velocity.length() / 7.8, 0, 1);
    const local = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    const s = {
      speed: this.state === 'cover' ? speedN * 0.6 : speedN, strafe: clamp(local.x / 4, -1, 1), forward: local.z >= -0.3 ? 1 : -1,
      sprint: this.sprinting && speedN > 0.3 ? 1 : 0, crouch: this.crouching ? 1 : 0, aim: this.aiming ? 1 : 0,
      cover: this.state === 'cover' ? { high: this.cover.height === 'high', peek: this.peek, over: this.cover.height === 'low', blind: this.blindFiring } : null,
      roll: this.state === 'roll' ? this.stateT / 0.62 : null, transform: (this.state === 'cover' && this.stateT < 0.42) ? this.stateT / 0.42 : (this.transformT > 0 ? 1 - this.transformT / 0.42 : null), vault: this.state === 'vault' ? this.stateT / 0.7 : null,
      dead: this.dead, aimPitch: clamp(-this.cam.pitch / 1.1, -1, 1) * -1, weaponLow: 0, reload: this.reloadT >= 0 ? this.reloadT / this.weapon.def.reloadTime : null,
      interact: !!this.interacting,
    };
    if (this.interacting) { this.velocity.x = damp(this.velocity.x, 0, 12, dt); this.velocity.z = damp(this.velocity.z, 0, 12, dt); }
    this.anim.aimPitch = clamp(this.cam.pitch / 1.1, -1, 1);
    this.lastAnimState = s;
    this.anim.update(dt, s);
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw + Math.PI;
    this.cam.update(dt, { position: this.position, height: this.eyeHeight, aim: this.aiming, sprint: this.sprinting && speedN > 0.3, crouch: this.crouching, cover: s.cover, dead: this.dead });
  }
  faceCamera(dt, rate = 14) { this.yaw = angleDamp(this.yaw, this.cam.yaw, rate, dt); }
  updateNormal(dt, wish, ax, aimNow) {
    if (input.pressed('crouch') && !input.crouchToggleHandled) { /* handled by input.crouch() toggle */ }
    this.crouching = input.crouch();
    this.aiming = aimNow && this.reloadT < 0;
    this.sprinting = input.sprint() && ax.z > 0.1 && !this.aiming && !this.crouching;
    const max = this.moveSpeedMax;
    const target = wish.clone().multiplyScalar(max);
    const accel = this.grounded ? 22 : 6;
    this.velocity.x = damp(this.velocity.x, target.x, accel * 0.5, dt); this.velocity.z = damp(this.velocity.z, target.z, accel * 0.5, dt);
    if (this.aiming || this.trigger) this.faceCamera(dt, 16);
    else if (ax.active) this.yaw = angleDamp(this.yaw, Math.atan2(-wish.x, -wish.z), 12, dt);
    if (input.pressed('roll') && ax.active) { this.state = 'roll'; this.stateT = 0; this.rollDir = wish.clone().normalize(); this.yaw = Math.atan2(-this.rollDir.x, -this.rollDir.z); this.aiming = false; audio.play('roll', { pos: this.position }); }
    if (input.pressed('cover')) this.tryCoverOrVault(wish);
  }
  updateRoll(dt) {
    const t = this.stateT / 0.62;
    const sp = 8.5 * (1 - t * 0.5);
    this.velocity.x = this.rollDir.x * sp; this.velocity.z = this.rollDir.z * sp;
    this.crouching = false; this.aiming = false; this.sprinting = false;
    if (t >= 1) { this.state = 'normal'; this.stateT = 0; }
  }
  tryCoverOrVault(wish) {
    const facing = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    // vault check: low collider directly ahead
    const o = this.position.clone(); o.y += 0.7;
    const h = this.world.raycast(o, facing, 1.3, { entities: false, terrain: false });
    if (h && h.collider && h.collider.top - this.position.y < 1.45 && h.collider.top - this.position.y > 0.5) {
      const c = h.collider; const far = this.position.clone().addScaledVector(facing, h.dist + (c.type === 'box' ? Math.min(c.half.x, c.half.z) * 2 : c.radius * 2) + 0.9);
      const gy = this.world.groundHeight(far.x, far.z, c.top + 0.2, 1.5, 0.3);
      if (this.world.headroom(far, 1.8) > 1.6 && Math.abs(gy - this.position.y) < 1.6) {
        this.state = 'vault'; this.stateT = 0; this.vaultFrom = this.position.clone(); this.vaultTo = new THREE.Vector3(far.x, gy, far.z); this.vaultTop = c.top + 0.1;
        this.yaw = this.cam.yaw; this.cover = null; this.crouching = false; input.clearCrouchToggle(); audio.play('vault', { pos: this.position }); return true;
      }
    }
    const p = this.world.cover.findSnap(this.position, facing, 2.8);
    if (p) { this.enterCover(p); return true; }
    return false;
  }
  updateVault(dt) {
    const t = clamp(this.stateT / 0.7, 0, 1);
    const p = this.vaultFrom.clone().lerp(this.vaultTo, t);
    p.y = lerp(this.vaultFrom.y, this.vaultTo.y, t) + Math.sin(t * Math.PI) * Math.max(0.25, this.vaultTop - Math.min(this.vaultFrom.y, this.vaultTo.y) + 0.1);
    this.position.copy(p); this.velocity.set(0, 0, 0); this.vaultY = p.y;
    if (t >= 1) { this.state = 'normal'; this.stateT = 0; this.vaultY = null; }
  }
  enterCover(p) {
    this.state = 'cover'; this.cover = p; this.stateT = 0; this.peek = 0; this.coverStart.copy(this.position);
    this.crouching = p.height === 'low'; this.sprinting = false;
    this.yaw = Math.atan2(-p.dir.x, -p.dir.z); // face the cover
    this.blindFiring = false;
    audio.play('roll', { pos: this.position, volume: 0.6 });
    audio.play('armor_rustle', { pos: this.position, volume: 0.8, pitch: 0.8 });
    audio.play('cover_snap', { pos: this.position, volume: 0.9, delay: 0.38 });
    if (this.fx?.dust) this.fx.dust(this.position.clone(), 1.5);
    events.emit('player:cover', true);
  }
  leaveCover() {
    this.state = 'normal'; this.cover = null; this.stateT = 0; this.peek = 0; this.crouching = false; input.clearCrouchToggle(); this.blindFiring = false;
    this.transformT = 0.42;
    audio.play('roll', { pos: this.position, volume: 0.5, pitch: 1.15 }); audio.play('armor_rustle', { pos: this.position, volume: 0.8, pitch: 1.2 });
    if (this.fx?.sparksBurst) this.fx.sparksBurst(this.position.clone().setY(this.position.y + 0.9), new THREE.Vector3(0, 1, 0), 8, '#7fe9ff');
    events.emit('player:cover', false);
  }
  updateCover(dt, wish, ax, aimNow) {
    const c = this.cover;
    // slide into place
    if (this.stateT < 0.42) { const t = this.stateT / 0.42; const e = t * t * (3 - 2 * t); this.position.x = lerp(this.coverStart.x, c.pos.x, e); this.position.z = lerp(this.coverStart.z, c.pos.z, e); }
    this.aiming = aimNow && this.reloadT < 0;
    // move along cover: lateral input relative to cover facing
    const left = new THREE.Vector3(c.dir.z, 0, -c.dir.x);
    const lat = wish.dot(left);
    const away = wish.dot(c.dir); // negative = pulling away from cover
    if (away < -0.6 && this.stateT > 0.3) { this.leaveCover(); return; }
    if (input.pressed('cover') && this.stateT > 0.2) { if (c.height === 'low' && away > -0.3) { this.leaveCover(); this.tryCoverOrVault(c.dir); return; } this.leaveCover(); return; }
    if (input.pressed('roll') && ax.active) { this.leaveCover(); this.state = 'roll'; this.stateT = 0; this.rollDir = wish.clone().normalize(); this.yaw = Math.atan2(-this.rollDir.x, -this.rollDir.z); return; }
    // peek detection: at edges, lateral input or aiming toward side
    let peekTarget = 0;
    if (Math.abs(lat) > 0.5) {
      const dirSign = lat > 0 ? 1 : -1; // 1 = moving left
      const edge = dirSign > 0 ? c.leftEdge : c.rightEdge;
      if (edge && this.aiming) peekTarget = dirSign;
      else { // slide along the cover to neighbouring cover points
        const step = 2.2 * dt;
        const nx = this.position.x + left.x * lat * step * 1.2, nz = this.position.z + left.z * lat * step * 1.2;
        const np = this.world.cover.findSnap(new THREE.Vector3(nx, this.position.y, nz), c.dir, 0.9);
        if (np && np.collider === c.collider) { this.cover = np; this.position.x = nx; this.position.z = nz; }
        else if (edge && !this.aiming) { /* at edge: stay */ }
      }
    }
    if (c.height === 'low' && this.aiming && peekTarget === 0) peekTarget = 0; // aim over
    this.peek = damp(this.peek, peekTarget, 10, dt);
    this.crouching = c.height === 'low' && !(this.aiming && peekTarget === 0);
    this.blindFiring = !this.aiming && this.trigger;
    this.velocity.x = damp(this.velocity.x, 0, 12, dt); this.velocity.z = damp(this.velocity.z, 0, 12, dt);
    if (this.aiming) this.faceCamera(dt, 14); else this.yaw = angleDamp(this.yaw, Math.atan2(-c.dir.x, -c.dir.z), 10, dt);
    // peek: offset position around the edge
    if (Math.abs(this.peek) > 0.01) { this.position.x = c.pos.x + left.x * this.peek * 0.7; this.position.z = c.pos.z + left.z * this.peek * 0.7; }
    else if (this.stateT >= 0.42 && Math.abs(lat) <= 0.5) { this.position.x = damp(this.position.x, c.pos.x, 10, dt); this.position.z = damp(this.position.z, c.pos.z, 10, dt); }
  }
  integrate(dt) {
    if (this.state === 'vault') { this.grounded = true; return; }
    this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt;
    const hits = this.world.resolveCapsule(this.position, this.radius, this.crouching ? 1.3 : 1.8);
    for (const h of hits) { const vn = this.velocity.x * h.nx + this.velocity.z * h.nz; if (vn < 0) { this.velocity.x -= h.nx * vn; this.velocity.z -= h.nz * vn; } }
    // map bounds
    this.position.x = clamp(this.position.x, -196, 196); this.position.z = clamp(this.position.z, -196, 196);
    const g = this.world.groundHeight(this.position.x, this.position.z, this.position.y, 0.55, this.radius);
    this.vy -= 22 * dt;
    let y = this.position.y + this.vy * dt;
    if (y <= g + 0.02) { y = this.grounded ? damp(this.position.y, g, 30, dt) : g; if (!this.grounded && this.vy < -6) audio.play('land', { pos: this.position }); this.grounded = true; this.vy = 0; if (g - this.position.y > 0.05) y = damp(this.position.y, g, 25, dt); }
    else this.grounded = y - g < 0.15;
    if (this.grounded && y < g) y = g;
    this.position.y = y;
    // steep slope slide
    const n = this.world.terrain.getNormal(this.position.x, this.position.z);
    if (n.y < 0.72 && this.world.terrain.floorDistance(this.position.x, this.position.z) > 0.5 && this.grounded) { this.velocity.x += n.x * 40 * dt; this.velocity.z += n.z * 40 * dt; }
    this.onMetal = g > this.world.terrain.getHeight(this.position.x, this.position.z) + 0.2;
  }
  // ---------- weapons ----------
  updateWeapon(dt) {
    const w = this.weapon, d = w.def;
    this.fireT -= dt; this.bloom = Math.max(0, this.bloom - dt * 0.12);
    this.trigger = input.fire && !this.dead && this.state !== 'roll' && this.state !== 'vault' && this.reloadT < 0 && !(this.state === 'cover' && !this.aiming && !this.blindOk());
    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      if (d.reloadType === 'shell') { if (this.reloadT >= d.reloadTime) { w.ammo++; w.reserve--; this.reloadT = (w.ammo < d.mag && w.reserve > 0 && !input.fire) ? 0 : -1; audio.play('reload_shotgun_shell', { pos: this.position }); } }
      else {
        if (this.reloadStage === 0 && this.reloadT > d.reloadTime * 0.25) { this.reloadStage = 1; audio.play(d.reloadSounds[0], { pos: this.position }); }
        if (this.reloadStage === 1 && this.reloadT > d.reloadTime * 0.65) { this.reloadStage = 2; audio.play(d.reloadSounds[1], { pos: this.position }); }
        if (this.reloadT >= d.reloadTime) { const need = d.mag - w.ammo, take = Math.min(need, w.reserve); w.ammo += take; w.reserve -= take; this.reloadT = -1; if (d.reloadSounds[2]) audio.play(d.reloadSounds[2], { pos: this.position }); }
      }
      return;
    }
    if ((input.pressed('reload') || (w.ammo === 0 && input.firePressed)) && w.ammo < d.mag && w.reserve > 0) { this.reloadT = 0; this.reloadStage = 0; this.aiming = false; if (d.reloadType !== 'shell') audio.play('reload_mag_out', { pos: this.position, volume: 0.01 }); return; }
    const wantFire = d.auto ? this.trigger : (this.trigger && input.firePressed);
    if (wantFire && this.fireT <= 0) {
      if (w.ammo <= 0) { audio.play('dry_fire'); this.fireT = 0.25; return; }
      this.fire();
    }
    if (input.pressed('heal') && this.injectors > 0 && this.health < this.maxHealth && this.healT <= 0) { this.injectors--; this.healT = INJECTOR.duration; audio.play('heal_inject'); events.emit('player:heal'); }
  }
  blindOk() { return this.state === 'cover'; }
  resupply(frac = 1) {
    for (const k of ['primary', 'secondary']) { const w = this.weapons[k]; w.reserve = Math.min(w.def.maxReserve, w.reserve + Math.round(w.def.reserve * frac)); }
    this.grenades = Math.min(GRENADE.maxCount, this.grenades + (frac >= 1 ? 2 : 1)); this.injectors = Math.min(INJECTOR.maxCount, this.injectors + (frac >= 1 ? 2 : 1));
  }
  pickupWeapon(id) { const w = this.makeWeapon(id); const slot = WEAPONS[id].slot === 'secondary' ? 'secondary' : 'primary'; this.weapons[slot] = w; this.equip(slot); events.emit('player:weapon', w); }
  respawn(pos, yaw = 0) {
    this.dead = false; this.downed = false; this.health = this.maxHealth; this.state = 'normal'; this.stateT = 0; this.spawnT = 0; this.lastDamageT = -99; this.invulnT = 2.5;
    for (const k of ['primary', 'secondary']) { const w = this.weapons[k]; w.ammo = w.def.mag; w.reserve = Math.max(w.reserve, Math.round(w.def.reserve * 0.6)); }
    this.grenades = Math.max(this.grenades, 2); this.injectors = Math.max(this.injectors, 2); this.reloadT = -1; this.healT = 0;
    this.spawnAt(pos, yaw); this.model.root.visible = true; this.velocity.set(0, 0, 0); this.vy = 0;
    input.clearCrouchToggle(); input.clearAimToggle();
    events.emit('player:respawn', this);
  }
  // ---------- hitboxes (enemy fire / friendly fire) ----------
  raycastHitboxes(o, d, maxT) {
    const B = this.model.bones; const _a = new THREE.Vector3(), _b = new THREE.Vector3();
    let best = maxT, zone = null;
    const sph = (c, r, z) => { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r; const disc = b * b - cc; if (disc < 0) return; const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) { best = t; zone = z; } };
    sph(B.head.getWorldPosition(_a).add(new THREE.Vector3(0, 0.1, 0)), 0.2, 'head');
    B.spine.getWorldPosition(_a); B.neck.getWorldPosition(_b); for (let i = 0; i <= 2; i++) sph(new THREE.Vector3().lerpVectors(_a, _b, i / 2), 0.3, 'chest');
    sph(B.root.getWorldPosition(_a), 0.3, 'pelvis');
    B.thighL.getWorldPosition(_a); B.footL.getWorldPosition(_b); for (let i = 0; i <= 2; i++) sph(new THREE.Vector3().lerpVectors(_a, _b, i / 2), 0.16, 'legL');
    B.thighR.getWorldPosition(_a); B.footR.getWorldPosition(_b); for (let i = 0; i <= 2; i++) sph(new THREE.Vector3().lerpVectors(_a, _b, i / 2), 0.16, 'legR');
    if (!zone) return null;
    return { t: best, zone, normal: d.clone().negate(), material: 'flesh' };
  }
  armourAt() { return 0; }
  takeDamage(dmg, info = {}) {
    if (this.dead || this.invulnT > 0) return null;
    if (this.state === 'roll' && this.stateT < 0.35) return null; // i-frames
    if (this.game.god) { events.emit('player:damaged', { dmg: 0, from: info.p ? new THREE.Vector3(...info.p) : null, health: this.health, info }); return null; }
    this.health -= dmg; this.lastDamageT = this.spawnT;
    this.healT = 0;
    const from = info.p ? new THREE.Vector3(...info.p) : null;
    events.emit('player:damaged', { dmg, from, health: this.health, info });
    this.anim.hitReact((Math.random() - 0.5) * 2, Math.min(1, dmg / 30));
    this.cam.shake(Math.min(0.6, dmg / 60));
    audio.play('player_hurt', { volume: 0.8, pitchVar: 0.1 });
    if (Math.random() < 0.25) audio.say(['vg_pain_1', 'vg_pain_2', 'vg_pain_3'][(Math.random() * 3) | 0], { priority: 1 });
    if (this.health <= 0) { this.health = 0; this.die(info); }
    return { dead: this.dead };
  }
  die(info) {
    if (this.dead) return; this.dead = true; this.aiming = false; this.sprinting = false; this.trigger = false;
    if (this.state === 'cover') this.leaveCover();
    this.state = 'dead'; this.stateT = 0;
    audio.play('player_death', { volume: 1 });
    audio.say('vg_death', { priority: 2 });
    events.emit('player:died', this, info);
  }
  // ---------- grenades ----------
  updateGrenade(dt) {
    if (this.dead || this.state === 'roll' || this.state === 'vault') return;
    if (input.pressed('grenade') && this.grenades > 0 && this.grenadeCharge < 0 && this.reloadT < 0) { this.grenadeCharge = 0; audio.play('grenade_pin', { volume: 0.7 }); }
    if (this.grenadeCharge >= 0) {
      this.grenadeCharge += dt;
      const fwd = this.cam.lookDir.clone();
      const from = this.position.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(fwd, 0.5);
      const power = Math.min(1, 0.45 + this.grenadeCharge * 0.5);
      const to = from.clone().addScaledVector(fwd, 8 + power * 22); to.y -= 2;
      events.emit('hud:grenadeArc', { from, to, power });
      if (input.released('grenade') || this.grenadeCharge > 2.5) {
        this.grenadeCharge = -1; this.grenades--; this.throwing = 0.5;
        events.emit('hud:grenadeArc', null);
        this.game.projectiles.throwGrenade(from, to, { owner: this.id, fuse: 3.0, speed: 14 + power * 10 });
        this.anim.kick(1.2); this.game.combat.stats.grenadesThrown++;
        audio.play('grenade_throw', { volume: 0.8 }); if (Math.random() < 0.5) audio.say('vg_grenade', { priority: 1 });
      }
    }
    this.throwing = Math.max(0, this.throwing - dt);
  }
  fire() {
    const w = this.weapon, d = w.def;
    w.ammo--; this.fireT = 60 / d.rpm; this.shots++;
    const moving = clamp(this.velocity.length() / 6, 0, 1);
    const blind = this.state === 'cover' && !this.aiming;
    let spread = (this.aiming ? d.spreadAim : d.spread) + this.bloom + d.spreadMove * moving + (this.crouching ? -0.002 : 0) + (blind ? 0.06 : 0);
    this.bloom = Math.min(d.bloomMax, this.bloom + d.bloom);
    const muzzle = w.model.userData.muzzle.getWorldPosition(new THREE.Vector3());
    this.cam.aimRay(_ray);
    for (let i = 0; i < d.pellets; i++) {
      const dir = _ray.direction.clone();
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(side, dir);
      dir.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const hit = this.world.raycast(_ray.origin, dir, d.range, { ignoreEntity: this });
      const end = hit ? hit.point.clone() : _ray.origin.clone().addScaledVector(dir, d.range);
      this.fx.tracer(muzzle, end, d.tracer);
      if (hit) {
        if (hit.entity) { this.hits++; this.game.combat.playerHit(hit, d, dir, this.id); }
        else { this.fx.impact(hit.point, hit.normal, hit.material); audio.play(hit.material === 'metal' ? 'hit_metal' : hit.material === 'rock' ? 'hit_rock' : 'hit_dirt', { pos: hit.point, volume: 0.5, pitchVar: 0.1 }); }
      }
    }
    this.game.combat.stats.shotsFired++;
    this.fx.muzzleFlash(muzzle, _ray.direction, d.tracer, d.kind === 'shotgun' ? 1.6 : d.kind === 'lmg' ? 1.3 : 1);
    this.fx.shell?.(w.model.userData.ejector.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(Math.cos(this.yaw), 0.6, -Math.sin(this.yaw)), d.kind);
    this.game.director?.noise(this.position, 1.5, this);
    audio.play(d.sound, { pos: muzzle, volume: 1, pitchVar: 0.05, important: true });
    audio.play('shell_drop', { pos: this.position, volume: 0.25, delay: 0.35, pitchVar: 0.15 });
    this.anim.kick(d.kick);
    this.cam.addRecoil(d.recoil * (this.aiming ? 0.75 : 1), (Math.random() - 0.5) * d.recoilYaw * 2);
    this.cam.shake(d.kick * 0.12);
    events.emit('player:fire', w);
  }
}
