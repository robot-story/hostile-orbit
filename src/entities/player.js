// Player controller: movement, camera, cover, aim, shooting, reload, roll, vault.
import { damageBreakable } from '../world/breakables.js';
import * as THREE from 'three';
import { buildSoldier } from '../models/soldier.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';
import { CharacterAnimator } from './animator.js';
import { ThirdPersonCamera } from './camera.js';
import { FRAME_VARIANTS, WEAPONS, GRENADE, INJECTOR } from '../gameplay/weapons.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { clamp, damp, angleDamp, angleDiff, angleLerp, lerp } from '../core/mathx.js';
import { settings } from '../core/settings.js';
import { net } from '../net/net.js';
import { SQUAD_COLORS } from '../net/protocol.js';
import { rollBall } from '../models/glbSoldier.js';
const RAM_DEF = { id: 'ram', damage: 110, impulse: 7, headMult: 1, range: 4 };
const RAM_BALL = { id: 'ram', damage: 165, impulse: 10, headMult: 1, range: 4.6 }; // rolled-up frame hits like a wrecking ball

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Ray();

export class Player {
  constructor(game, camera, fx, loadout = { primary: 'viper', secondary: 'sidearm' }) {
    const world = game.world;
    this.game = game; this.world = world; this.fx = fx;
    this.model = buildSoldier('vanguard', { robot:'a', neon: loadout.neon || SQUAD_COLORS[net.slot ?? 0] || SQUAD_COLORS[0] });
    this.anim = new CharacterAnimator(this.model);
    this.cam = new ThirdPersonCamera(camera, world);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.grounded = true; this.vy = 0;
    this.variant = FRAME_VARIANTS[loadout.neon] || FRAME_VARIANTS['#00e5ff'];
    this.health = Math.round(200 * this.variant.hp); this.maxHealth = this.health; this.dead = false;
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
    this.heroLight = new THREE.PointLight(loadout.neon || '#00e5ff', 1.4, 6.5, 2); this.heroLight.position.set(0, 1.25, 0); this.heroLight.castShadow = false; this.model.root.add(this.heroLight); // frame highlight spill: walls and floor pick up your colour
    this.entityType = 'player'; this.isPlayer = true; this.id = null;
    this.hitboxes = true; this.hitRadius = 1.3; this.hitCenter = new THREE.Vector3();
    this.downed = false; this.lastDamageT = -99; this.regenDelay = 9; this.armourHp = 0;
    this.grenadeCharge = -1; this.throwing = 0;
    this.fuel = 1; this.maxBurn = 3.2; this.jet = false; this.spaceHeld = 0; this.jetSound = null; this.jetFx = 0;
    world.register(this);
    this.equip('primary');
    this.anim.onFootstep = () => { audio.play(this.onMetal ? 'footstep_metal' : 'footstep_dirt', { pos: this.position, volume: 0.6, pitchVar: 0.08 }); audio.play('armor_rustle', { pos: this.position, volume: 0.35, pitchVar: 0.15 }); if (this.fx?.dust && !this.onMetal) this.fx.dust(this.position.clone(), this.sprinting ? 1.2 : 0.5); };
    this.spawnT = 0;
  }
  makeWeapon(id) { const d = WEAPONS[id]; return { def: d, ammo: d.mag, reserve: d.reserve, model: WEAPON_BUILDERS[id](this.model.neonColor) }; }
  get weapon() { return this.weapons[this.slot]; }
  equip(slot) { this.slot = slot; while (this.weaponGroup.children.length) this.weaponGroup.remove(this.weaponGroup.children[0]); this.weaponGroup.add(this.weapon.model); this.reloadT = -1; audio.play('weapon_swap', { volume: 0.6 }); events.emit('player:weapon', this.weapon); }
  spawnAt(p, yaw = 0) { this.position.copy(p); this.yaw = yaw; this.cam.yaw = yaw; this.velocity.set(0, 0, 0); this.model.root.position.copy(p); }
  get eyeHeight() { const lift = this.model?.robot ? 0.22 : 0; return (this.crouching || (this.state === 'cover' && this.cover?.height === 'low' && !this.aiming) ? 1.15 : 1.55) + lift; }
  get moveSpeedMax() { const w = (this.weapon.def.moveMult || 1) * (this.variant?.speed || 1); if (this.aiming) return (this.weapon.def.kind === 'sniper' ? 1.6 : 3.1) * w; if (this.crouching) return 3.1; if (this.sprinting || (this.rollMode && this.model?.robot)) return (this.model?.robot ? 12.2 : 9.8) * w; return 7.4 * w; }

  update(dt) {
    this.stateT += dt; this.spawnT += dt;
    const m = input.consumeMouse();
    // Aim assist: snap on aim press, soft magnetism while aiming (mouse still adjusts inside the lock)
    const assist = settings.data.aimAssist !== false;
    if (assist && input.aimPressed && !this.dead) this.aimTarget = this.findAimTarget(this.grounded ? 0.26 : 0.4);
    if (!input.aim()) this.aimTarget = null;
    const onTarget = assist && this.aimTarget && !this.aimTarget.dead && this.aiming;
    const sensScale = onTarget ? 1 - 0.45 * (settings.data.aimAssistStrength ?? 0.7) : 1;
    if (!this.dead) this.cam.look(m.dx * sensScale, m.dy * sensScale);
    if (onTarget) {
      const t = this.aimTarget; const c = t.hitCenter || t.position; const aimAt = new THREE.Vector3(c.x, c.y + (t.isBoss ? 0.5 : 0.25), c.z);
      const d = aimAt.sub(this.cam.camera.position); const dist = d.length(); d.normalize();
      const wantYaw = Math.atan2(-d.x, -d.z), wantPitch = Math.asin(clamp(d.y, -1, 1));
      const cone = Math.abs(angleDiff(this.cam.yaw, wantYaw)) + Math.abs(this.cam.pitch - wantPitch);
      if (cone > 0.5 || dist > 140) this.aimTarget = null;
      else {
        const strength = (settings.data.aimAssistStrength ?? 0.7);
        const snap = this.aimSnapT > 0 ? 30 : 3.6 * strength; // fast initial snap, then gentle pull
        const moving = Math.min(1, (Math.abs(m.dx) + Math.abs(m.dy)) / 12);
        const k = 1 - Math.exp(-snap * dt * (this.aimSnapT > 0 ? 1 : 1 - moving * 0.85));
        this.cam.yaw = angleLerp(this.cam.yaw, wantYaw, k); this.cam.pitch = lerp(this.cam.pitch, wantPitch, k);
      }
    }
    this.aimSnapT = Math.max(0, (this.aimSnapT || 0) - dt);
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
      else if (this.state === 'grind') this.updateGrind(dt, ax);
    }
    this.integrate(dt);
    if (!this.dead) { this.updateWeapon(dt); this.updateGrenade(dt); }
    if (this.healT > 0) { this.healT -= dt; this.health = Math.min(this.maxHealth, this.health + INJECTOR.heal / INJECTOR.duration * dt); }
    else if (!this.dead && this.spawnT - this.lastDamageT > this.regenDelay && this.health < 40) this.health = Math.min(40, this.health + 4 * dt);
    this.invulnT = Math.max(0, (this.invulnT || 0) - dt);
    this.transformT = Math.max(0, (this.transformT || 0) - dt);
    this.hitCenter.copy(this.position).add(new THREE.Vector3(0, 1.0, 0));
    // animation state
    const speedN = clamp(this.velocity.length() / 9.4, 0, 1);
    // relaxed low-ready carry after standing still for a moment (drops instantly on aim/fire/move)
    const idle = this.state === 'normal' && speedN < 0.05 && !this.aiming && !this.trigger && this.reloadT < 0 && !this.jet && this.grounded;
    this.idleT = idle ? (this.idleT || 0) + dt : 0;
    const weaponLow = clamp(((this.idleT || 0) - 1.4) / 0.7, 0, 0.75);
    const local = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    const llen = Math.hypot(local.x, local.z) || 1;
    const prevSpeed = this._prevSpeedN ?? speedN; this._prevSpeedN = speedN;
    const accelN = clamp((speedN - prevSpeed) / Math.max(dt, 1e-3) / 3, -1, 1);
    this._accelS = damp(this._accelS || 0, accelN, 8, dt);
    const prevYaw = this._prevYaw ?? this.yaw; this._prevYaw = this.yaw;
    const turnN = clamp(angleDiff(prevYaw, this.yaw) / Math.max(dt, 1e-3) / 5, -1, 1);
    this._turnS = damp(this._turnS || 0, turnN, 8, dt);
    this.landT = Math.max(0, (this.landT || 0) - dt); this.ramChainT = Math.max(0, (this.ramChainT || 0) - dt); if (this.ramChainT <= 0) this.ramChain = 0;
    const s = {
      speed: this.state === 'cover' ? speedN * 0.6 : speedN, strafe: clamp(local.x / 4, -1, 1), forward: local.z >= -0.3 ? 1 : -1, moveDir: { x: speedN > 0.03 ? local.x / llen : 0, z: speedN > 0.03 ? local.z / llen : 1 }, velocity: this.grounded ? Math.hypot(this.velocity.x, this.velocity.z) : 0, groundAt: this.grounded ? (ox, oz) => this.world.groundHeight(this.position.x + ox, this.position.z + oz, this.position.y) : null, accel: this._accelS, turn: this._turnS, land: this.landT > 0 ? this.landT / 0.5 : 0, turning: !!this.turning,
      sprint: this.sprinting && speedN > 0.3 ? 1 : (speedN > 0.35 && !this.aiming && !this.crouching && this.state === 'normal' ? 0.55 : 0), crouch: this.crouching ? 1 : 0, aim: this.aiming ? 1 : 0,
      cover: this.state === 'cover' ? { high: this.cover.height === 'high', peek: this.peek, over: this.cover.height === 'low', blind: this.blindFiring } : null,
      roll: this.state === 'roll' ? this.stateT / 0.62 : null, transform: (this.state === 'cover' && this.stateT < 0.42) ? this.stateT / 0.42 : (this.transformT > 0 ? 1 - this.transformT / 0.42 : null), vault: this.state === 'vault' ? this.stateT / 0.7 : null,
      dead: this.dead, aimPitch: clamp(-this.cam.pitch / 1.1, -1, 1) * -1, weaponLow, reload: this.reloadT >= 0 ? this.reloadT / this.weapon.def.reloadTime : null,
      interact: !!this.interacting, grind: this.state === 'grind', jet: this.jet ? 1 : (!this.grounded && this.state === 'normal' ? 0.5 : 0), robotic: true,
    };
    events.emit('hud:fuel', this.fuel, this.jet);
    // sprint ram: the ball is a weapon. Rolling into a hostile at speed hits it (through the normal req:hit path).
    if (this.sprinting && this.grounded && speedN > 0.72 && !this.dead) {
      const now = this.game.time; const dir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
      for (const e of this.game.director?.enemies || []) {
        if (e.dead || e.type?.ally || e.isBoss) continue;
        const dx = e.position.x - this.position.x, dz = e.position.z - this.position.z; const d = Math.hypot(dx, dz);
        if (d > 1.35 || Math.abs(e.position.y - this.position.y) > 1.6) continue;
        if (e._ramT != null && now - e._ramT < 0.7) continue; e._ramT = now;
        const hit = { entity: e, dist: d, zone: 'chest', point: e.hitCenter.clone(), normal: dir.clone().negate() };
        const base = (this.model?.fold || 0) > 0.6 ? RAM_BALL : RAM_DEF; const chain = this.ramChainT > 0 ? (this.ramChain || 0) : 0;
        this.game.combat.playerHit(hit, chain ? { ...base, damage: Math.round(base.damage * (1 + 0.25 * chain)) } : base, dir);
        this.ramChain = Math.min(6, chain + 1); this.ramChainT = 3; if (this.ramChain >= 2) events.emit('toast', `RAM CHAIN x${this.ramChain}`, 'good');
        this.fx.sparksBurst?.(e.hitCenter.clone(), dir, 18, '#7fe9ff'); this.fx.dust?.(e.position.clone(), 1.5);
        audio.play('impact_metal', { pos: e.position, volume: 1, pitchVar: 0.15 }); events.emit('fx:shake', 0.5);
        this.velocity.multiplyScalar(0.82);
      }
    }
    // onboarding: nudge the cover prompt when standing next to usable cover
    this._coverHintT = 1e9; // cover hints retired with the cover system
    this._coverHintT2 = (this._coverHintT2 || 0) - dt; if (this._coverHintT <= 0 && this.state === 'normal' && this.grounded && !this.aiming) { this._coverHintT = 0.6; const facing = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw)); if (this.world.cover.findSnap(this.position, facing, 2.4)) events.emit('hint:cover'); }
    if (this.interacting) { this.velocity.x = damp(this.velocity.x, 0, 12, dt); this.velocity.z = damp(this.velocity.z, 0, 12, dt); }
    this.anim.aimPitch = clamp(this.cam.pitch / 1.1, -1, 1);
    this.lastAnimState = s;
    this.anim.update(dt, s);
    rollBall(this.model, this.grounded ? this.velocity.x : this.velocity.x * 0.3, this.grounded ? this.velocity.z : this.velocity.z * 0.3, dt, this.anim.land || 0, this.model.root.rotation.y, this.crouching ? 1 : 0);
    if (this.model.ball && this.grounded && speedN > 0.2 && !this.onMetal) { const sp = Math.hypot(this.velocity.x, this.velocity.z); this._trackD = (this._trackD || 0) + sp * dt; if (this._trackD > 0.55 && sp > 0.5) { this._trackD = 0; const hd = Math.atan2(this.velocity.x, this.velocity.z); this.fx?.trackMark?.(this.position.clone().add(new THREE.Vector3(-this.velocity.x / sp * 0.3, 0, -this.velocity.z / sp * 0.3)), hd, 1.15, 0.46 + speedN * 0.08); } }
    if (this.model.ball && this.grounded && speedN > 0.3) { this._rollDustT = (this._rollDustT || 0) - dt; if (this._rollDustT <= 0) { this._rollDustT = 0.16 - speedN * 0.08; this.fx.dust?.(this.position.clone().add(new THREE.Vector3(-this.velocity.x * 0.05, 0.05, -this.velocity.z * 0.05)), 0.25 + speedN * 0.4); } }
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw + Math.PI;
    this.cam.update(dt, { position: this.position, height: this.eyeHeight, robot: !!this.model?.robot, aim: this.aiming, sprint: this.sprinting && speedN > 0.3, crouch: this.crouching, cover: s.cover, dead: this.dead, zoom: this.weapon.def.zoom });
    this.scoped = this.aiming && this.weapon.def.kind === 'sniper' && this.cam.aim > 0.85;
    if (!this.model.custom) { for (const m of this.model.meshes) m.visible = !this.scoped; } else this.model.custom.visible = !this.scoped;
    this.weaponGroup.visible = !this.scoped;
  }
  faceCamera(dt, rate = 14) { this.yaw = angleDamp(this.yaw, this.cam.yaw, rate, dt); }
  updateNormal(dt, wish, ax, aimNow) {
    if (input.pressed('crouch') && !input.crouchToggleHandled) { /* handled by input.crouch() toggle */ }
    this.crouching = input.crouch();
    this.aiming = aimNow && this.reloadT < 0;
    if (this.model?.robot) {
      if (input.pressed('sprint')) { this.rollMode = !this.rollMode; audio.play(this.rollMode ? 'armor_rustle' : 'kinetic_charge', { pos: this.position, volume: 0.6, pitch: this.rollMode ? 0.8 : 1.5 }); if (this.rollMode) input.clearSprintToggle(); }
      if (this.rollMode && this.crouching) this.rollMode = false; // crouch unfolds; aiming and firing remain available while rolled
      this.sprinting = this.rollMode && ax.active && !this.aiming;
    } else this.sprinting = input.sprint() && ax.z > 0.1 && !this.aiming && !this.crouching;
    if (this.grounded && !this.jet) this._ballAir = false;
    if (this.model?.robot && this.state === 'normal' && this.vy <= 0.5 && !this.grounded && this.tryGrind()) return;
    if (this.model) this.model.sprintBall = !!(this.model.robot && (this.rollMode || (this._ballAir && !this.grounded)));
    // auto-hop: a low wall in the run direction gets vaulted without a key press
    this._hopT = (this._hopT || 0) - dt; if (this.sprinting && this.grounded && this._hopT <= 0 && wish.lengthSq() > 0.1) { this._hopT = 0.15; if (this.tryVaultAlong(wish.clone().normalize())) return; }
    this.knockT = Math.max(0, (this.knockT || 0) - dt); if (this.knockT > 0) { wish.set(0, 0, 0); } else if (this._wasRolling !== undefined && this.grounded) { this.rollMode = this._wasRolling; this._wasRolling = undefined; }
    const max = this.moveSpeedMax;
    const target = wish.clone().multiplyScalar(max);
    const accel = this.grounded ? 34 : (this.jet ? (this._ballAir ? 3 : 14) : 6);
    this.velocity.x = damp(this.velocity.x, target.x, accel * 0.5, dt); this.velocity.z = damp(this.velocity.z, target.z, accel * 0.5, dt);
    if (this.model?.robot && this.grounded) { const ball = !!this.model?.sprintBall; const n = this.world.terrain.getNormal(this.position.x, this.position.z); const sp = Math.hypot(this.velocity.x, this.velocity.z); if (sp > 1) { const down = (n.x * this.velocity.x + n.z * this.velocity.z) / sp; const k = 1 + Math.abs(down) * (ball ? 9 : 5) * dt; const cap = ball ? 19 : 13.5; const ns = Math.min(cap, sp * k); this.velocity.x *= ns / sp; this.velocity.z *= ns / sp; this._slopeUp = -down; if (-down > 0.12) { this._slopeMem = 0.2; this._slopePeak = -down; } else this._slopeMem = Math.max(0, (this._slopeMem || 0) - dt); if (-down > 0.12) { this._rampFx = (this._rampFx || 0) - dt; if (this._rampFx <= 0) { this._rampFx = 0.06; this.fx?.sparksBurst?.(this.position.clone(), new THREE.Vector3(0, 1, 0), 3, '#7fe9ff'); } } } } // down or up, momentum builds: ramps are turbos
    const spd = Math.hypot(this.velocity.x, this.velocity.z); this.speedFx = clamp((spd - 8.5) / 8, 0, 1); this.cam.speedKick = this.speedFx;
    if (this.heroLight) { this.heroLight.intensity = 1.2 + this.speedFx * 1.4 + (this.fireT > 0 ? 1.2 : 0); this.heroLight.position.y = this.model?.sprintBall ? 0.7 : 1.25; }
    // Facing: sprint turns the body into the run direction; every other movement strafes (body faces the camera);
    // standing still only turns in place once the camera has swung far enough (no constant spinning).
    if (this.sprinting && ax.active && !input.fire) { this.turning = false; this.yaw = angleDamp(this.yaw, Math.atan2(-wish.x, -wish.z), 11, dt); }
    else if (this.aiming || this.trigger || ax.active) { this.turning = false; this.faceCamera(dt, ax.active ? 13 : 16); }
    else { const d = Math.abs(angleDiff(this.yaw, this.cam.yaw)); if (d > 1.05) this.turning = true; if (this.turning) { this.yaw = angleDamp(this.yaw, this.cam.yaw, 7, dt); if (d < 0.06) this.turning = false; } }
    if (input.pressed('roll') && ax.active) { this.state = 'roll'; this.stateT = 0; this.rollDir = wish.clone().normalize(); this.yaw = Math.atan2(-this.rollDir.x, -this.rollDir.z); this.aiming = false; audio.play('roll', { pos: this.position }); }
    // Space: tap = cover/vault, hold = jetpack thrust
    this._slamTapT = Math.max(0, (this._slamTapT || 0) - dt); if (input.pressed('cover') && !this.grounded && (this._ballAir || (this.model?.fold || 0) > 0.6) && this.vy < 1) this._slamTapT = 0.45;
    if (input.down('cover')) this.spaceHeld += dt; else { if (this.spaceHeld > 0 && this.spaceHeld < 0.22 && !this.jet) this.tryCoverOrVault(wish); this.spaceHeld = 0; }
    const wantJet = input.down('cover') && this.spaceHeld >= 0.22 && this.fuel > 0.02;
    if (wantJet && !this.jet) { const rolled = this.model?.sprintBall && (this.model?.fold || 0) > 0.6; if (rolled) { this._ballAir = true; const h = Math.hypot(this.velocity.x, this.velocity.z) || 1; const boost = Math.min(17, h * 1.5 + 4); this.velocity.x *= boost / h; this.velocity.z *= boost / h; this.vy = Math.max(this.vy, 9.5); this.fx?.sparksBurst?.(this.position.clone(), new THREE.Vector3(0, -1, 0), 24, '#7fe9ff'); this.fx?.dust?.(this.position.clone(), 2.5); events.emit('fx:shake', 0.25); audio.play('kinetic_charge', { pos: this.position, volume: 0.6, pitch: 1.1 }); }
      this.jet = true; this.grounded = false; this.vy = Math.max(this.vy, 6); audio.play('kinetic_charge', { pos: this.position, volume: 0.35, pitch: 1.6 }); this.jetSound = audio.play('dropship_engine', { pos: this.position, loop: true, volume: 0.45, pitch: 1.7 }); if (this.fx?.dust) this.fx.dust(this.position.clone(), 2); events.emit('player:jet', true); }
    if (this.jet) {
      this.fuel = Math.max(0, this.fuel - dt / this.maxBurn);
      if (!wantJet || this.fuel <= 0) { this.jet = false; this.jetSound?.stop(0.25); this.jetSound = null; events.emit('player:jet', false); }
      else { this.fuel = Math.min(1, this.fuel + dt * (1 / this.maxBurn) * ((this.variant?.fuel || 1) - 1)); const agl = this.position.y - this.world.terrain.getHeight(this.position.x, this.position.z); const ceil = clamp((58 - agl) / 8, 0, 1); this.vy = damp(this.vy, (this._ballAir ? 4.5 : (this.spaceHeld < 1.0 ? 11.5 : 5.5)) * ceil - (1 - ceil) * 2, this._ballAir ? 2.5 : 5, dt); this.jetSound?.setPosition(this.position); this.jetFx -= dt; if (this.jetFx <= 0) { this.jetFx = 0.05; const back = new THREE.Vector3(Math.sin(this.yaw) * 0.25, 0.75, Math.cos(this.yaw) * 0.25).add(this.position); this.fx.sparksBurst?.(back, new THREE.Vector3(0, -1, 0), 3, '#7fe9ff'); if (Math.random() < 0.5) this.fx.dust?.(this.position.clone(), 0.3); } }
    }
    if (this.grounded && !this.jet) this.fuel = Math.min(1, this.fuel + dt / 3.5 * (this.variant?.fuel || 1));
  }
  updateRoll(dt) {
    const t = this.stateT / 0.62;
    const sp = 8.5 * (1 - t * 0.5);
    this.velocity.x = this.rollDir.x * sp; this.velocity.z = this.rollDir.z * sp;
    this.crouching = false; this.aiming = false; this.sprinting = false;
    if (t >= 1) { this.state = 'normal'; this.stateT = 0; if (this.vaultFast) { const d = this.vaultTo.clone().sub(this.vaultFrom).setY(0).normalize(); this.velocity.copy(d.multiplyScalar(8)); } this.vaultFast = false; }
  }
  /** Grind rails: a rolled frame that comes down onto a rail locks to it and rides the curve, sparks flying. */
  tryGrind() {
    if (!this.world.rails?.length || !this.model?.robot) return false;
    let best = null, bd = 1.1, bi = 0;
    for (const rail of this.world.rails) { const S = rail.samples; for (let i = 0; i < S.length; i++) { const dx = S[i].x - this.position.x, dy = S[i].y - this.position.y, dz = S[i].z - this.position.z; if (dy < -0.3 || dy > 1.0) continue; const d = Math.hypot(dx, dz) + Math.max(0, dy - 0.2) * 0.5; if (d < bd) { bd = d; best = rail; bi = i; } } }
    if (!best) return false;
    const S = best.samples; const n = S.length; const tan = S[Math.min(n - 1, bi + 1)].clone().sub(S[Math.max(0, bi - 1)]).setY(0).normalize();
    const along = tan.x * this.velocity.x + tan.z * this.velocity.z; const face = -Math.sin(this.cam.yaw) * tan.x + -Math.cos(this.cam.yaw) * tan.z; const dir = Math.abs(along) > 2 ? (along >= 0 ? 1 : -1) : (face >= 0 ? 1 : -1); // turned in the air? ride back the other way
    this.grind = { rail: best, i: bi, dir, speed: Math.max(9, Math.abs(along)) }; this.rollMode = true; this.state = 'grind'; this.stateT = 0; this.vy = 0; this._ballAir = false;
    audio.play('impact_metal', { pos: this.position, volume: 0.8, pitch: 1.3 }); events.emit('fx:shake', 0.15); events.emit('toast', 'GRIND', 'good');
    return true;
  }
  updateGrind(dt, ax) {
    const G = this.grind; const S = G.rail.samples; const n = S.length;
    // ride the samples: advance by speed; downhill adds, uphill bleeds, gentle constant gain so grinds feel fast
    G.speed = clamp(G.speed + dt * 1.2, 6, 20);
    let remaining = G.speed * dt; G.frac = G.frac || 0;
    while (remaining > 0) { const j = G.i + G.dir; if (j < 0 || j >= n) { this.exitGrind(0.35); return; } const seg = S[j].distanceTo(S[G.i]) || 0.01; const left = (1 - G.frac) * seg; if (remaining >= left) { remaining -= left; G.speed = clamp(G.speed - (S[j].y - S[G.i].y) * 4, 6, 20); G.i = j; G.frac = 0; } else { G.frac += remaining / seg; remaining = 0; } }
    const j = clamp(G.i + G.dir, 0, n - 1); const a = S[G.i], b = S[j]; const f = G.frac || 0; const pos = a.clone().lerp(b, f); const tan = b.clone().sub(a).setY(0).normalize();
    this.position.set(pos.x, pos.y + 0.02, pos.z); this.velocity.set(tan.x * G.speed, 0, tan.z * G.speed); this.grounded = true; this.vy = 0;
    this.yaw = angleDamp(this.yaw, Math.atan2(-tan.x, -tan.z), 14, dt);
    // sparks and scrape
    this._grindFx = (this._grindFx || 0) - dt; if (this._grindFx <= 0) { this._grindFx = 0.04; const back = this.position.clone().addScaledVector(tan, -0.3); back.y += 0.05; this.fx?.sparksBurst?.(back, new THREE.Vector3(-tan.x, 0.6, -tan.z), 6, '#ffd27a'); }
    if (!this._grindSound) this._grindSound = audio.play('armor_rustle', { pos: this.position, loop: true, volume: 0.5, pitch: 0.55 }); this._grindSound?.setPosition?.(this.position);
    this.speedFx = clamp((G.speed - 6) / 10, 0, 1); this.cam.speedKick = this.speedFx;
    // exits: jump off (boosted), lean off with sideways input held, or pop out of the roll
    if (input.pressed('cover') || input.down('cover')) { this.exitGrind(1); return; }
    if (Math.abs(ax.x) > 0.8 && this.stateT > 0.3) { this.exitGrind(0.3, ax.x); return; }
    if (!this.rollMode) { this.exitGrind(0.2); return; }
    // ride upright: the wheel grinds, the torso is free to shoot
    if (this.model) this.model.sprintBall = false;
    this.aiming = input.aim() && this.reloadT < 0; this.yaw = this.aiming ? angleDamp(this.yaw, this.cam.yaw, 12, dt) : this.yaw;
    this.anim.update(dt, { speed: 0.6, sprint: 0, crouch: 0, aim: this.aiming ? 1 : 0, cover: null, moveDir: { x: 0, z: -1 }, velocity: G.speed, robotic: true, lean: 0.3 });
  }
  exitGrind(hop = 0.3, side = 0) {
    const G = this.grind; if (!G) return; this.grind = null; this.state = 'normal'; this.stateT = 0;
    const sp = G.speed * (hop >= 1 ? 1.25 : 1); const tan = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
    this.velocity.set(tan.x * sp, 0, tan.z * sp); if (side) { const right = new THREE.Vector3(-tan.z, 0, tan.x); this.velocity.addScaledVector(right, side * 4); }
    this.vy = hop >= 1 ? 8.5 : 4; this.grounded = false; this._ballAir = true; this._grindSound?.stop?.(0.15); this._grindSound = null;
    audio.play('vault', { pos: this.position, volume: 0.6, pitch: hop >= 1 ? 1.3 : 1.0 }); this.fx?.sparksBurst?.(this.position.clone(), new THREE.Vector3(0, 1, 0), 10, '#ffd27a');
  }
  /** Arc projector: the bolt jumps to nearby enemies with falling damage; visual beams per hop. */
  arcChain(hit, d) {
    let from = hit.entity, fromP = hit.point.clone(); const done = new Set([from]);
    for (let i = 0; i < d.chain.count; i++) {
      let best = null, bd = d.chain.range;
      for (const e of this.world.hitTargets || []) { if (!e.isEnemy || e.dead || done.has(e)) continue; const dist = e.hitCenter.distanceTo(fromP); if (dist < bd) { bd = dist; best = e; } }
      if (!best) break; done.add(best);
      const to = best.hitCenter.clone(); this.fx.tracer(fromP, to, '#bff6ff'); this.fx.sparksBurst?.(to, new THREE.Vector3(0, 1, 0), 6, '#7fe9ff');
      const dir = to.clone().sub(fromP).normalize(); const dmg = Math.round(d.damage * Math.pow(d.chain.falloff, i + 1));
      this.game.combat.playerHit({ entity: best, dist: bd, zone: 'chest', point: to, normal: dir.clone().negate() }, { ...d, damage: dmg, chain: null }, dir, this.id);
      from = best; fromP = to;
    }
  }
  /** Landing from a roll-jump slams a shockwave into whatever is underneath, scaled by fall speed and ground speed. */
  rollSlam(fallSpeed, perfect = false) {
    const sp = Math.hypot(this.velocity.x, this.velocity.z); const power = clamp((fallSpeed - 3) / 8 + sp / 16, 0.25, 1.6) * (perfect ? 1.45 : 1);
    const p = this.position.clone(); p.y += 0.3;
    const radius = 2.6 + power * 2.2, dmg = Math.round(70 + power * 90);
    if (this.game.combat) this.game.combat.explode(p, radius, dmg, { kind: 'pod', attackerId: this.id, impulse: 10 + power * 8, selfMult: 0 });
    this.fx?.dust?.(p, 3 + power * 2); events.emit('fx:shake', 0.3 + power * 0.4); audio.play('land', { pos: p, volume: 1, pitch: 0.7 });
    events.emit('toast', perfect ? 'PERFECT SLAM' : power > 1 ? 'ROLL SLAM  //  HEAVY' : 'ROLL SLAM', 'good');
    this.ramChain = Math.min(6, (this.ramChain || 0) + 1); this.ramChainT = 3;
  }
  /** Vault check along an arbitrary ground direction (sprint auto-hop). */
  tryVaultAlong(dir) {
    const o = this.position.clone(); o.y += 0.7;
    const h = this.world.raycast(o, dir, 1.6, { entities: false, terrain: false });
    if (!(h && h.collider && h.collider.top - this.position.y < 1.45 && h.collider.top - this.position.y > 0.35)) return false;
    const c = h.collider; const far = this.position.clone().addScaledVector(dir, h.dist + (c.type === 'box' ? Math.min(c.half.x, c.half.z) * 2 : c.radius * 2) + 1.2);
    const gy = this.world.groundHeight(far.x, far.z, c.top + 0.2, 1.5, 0.3);
    if (!(this.world.headroom(far, 1.8) > 1.6 && Math.abs(gy - this.position.y) < 1.6)) return false;
    this.state = 'vault'; this.stateT = 0; this.vaultFrom = this.position.clone(); this.vaultTo = new THREE.Vector3(far.x, gy, far.z); this.vaultTop = c.top + 0.1; this.vaultFast = true;
    this.cover = null; audio.play('vault', { pos: this.position }); if (this.model) this.model.sprintBall = true; return true;
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
    return false; // cover snapping removed: movement is the defence now
  }
  updateVault(dt) {
    const t = clamp(this.stateT / (this.vaultFast ? 0.42 : 0.7), 0, 1);
    const p = this.vaultFrom.clone().lerp(this.vaultTo, t);
    p.y = lerp(this.vaultFrom.y, this.vaultTo.y, t) + Math.sin(t * Math.PI) * Math.max(0.25, this.vaultTop - Math.min(this.vaultFrom.y, this.vaultTo.y) + 0.1);
    this.position.copy(p); this.velocity.set(0, 0, 0); this.vaultY = p.y;
    if (t >= 1) { this.state = 'normal'; this.stateT = 0; this.vaultY = null; }
  }
  enterCover(p) {
    if (this.jet) { this.jet = false; this.jetSound?.stop(0.2); this.jetSound = null; }
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
    // a rolling frame smashes through breakables it hits at speed
    if (this.model?.sprintBall) { const sp = Math.hypot(this.velocity.x, this.velocity.z); if (sp > 7) for (const h of hits) { const b = h.collider?.breakable; if (b && !b.broken) { const dir = new THREE.Vector3(this.velocity.x, 0.3, this.velocity.z).normalize(); if (damageBreakable(this.world, b, 90 + sp * 12, this.position.clone(), dir, this.fx)) { this.velocity.multiplyScalar(0.8); events.emit('toast', 'SMASH', 'good'); } else { this.velocity.multiplyScalar(0.55); } } } }
    for (const h of hits) { const vn = this.velocity.x * h.nx + this.velocity.z * h.nz; if (vn < 0) { this.velocity.x -= h.nx * vn; this.velocity.z -= h.nz * vn; } }
    // map bounds
    this.position.x = clamp(this.position.x, -196, 196); this.position.z = clamp(this.position.z, -196, 196);
    const g = this.world.groundHeight(this.position.x, this.position.z, this.position.y, 0.55, this.radius);
    this.floating = !this.grounded && this.aiming && !this.jet && !this._ballAir && this.fuel > 0.02 && this.vy < 2;
    if (this.floating) { this.fuel = Math.max(0, this.fuel - dt * 0.3); this.vy = Math.max(this.vy - 5 * dt, -2.4); this._floatFx = (this._floatFx || 0) - dt; if (this._floatFx <= 0) { this._floatFx = 0.07; this.fx?.sparksBurst?.(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3(0, -1, 0), 2, '#7fe9ff'); } }
    else this.vy -= (this.jet ? 6 : 22) * dt;
    let y = this.position.y + this.vy * dt;
    if (y <= g + 0.02 && !(this.jet && this.vy > 0)) { y = this.grounded ? damp(this.position.y, g, 30, dt) : g; if (!this.grounded) { this.landT = Math.min(0.5, Math.max(0.16, -this.vy * 0.05)); if ((this._ballAir || (this.model?.fold || 0) > 0.6) && this.vy < -3 && (this._slamTapT || 0) > 0) this.rollSlam(-this.vy, this._slamTapT > 0.27); this._slamTapT = 0; if (this.vy < -6) audio.play('land', { pos: this.position }); this.fx?.dust?.(this.position.clone(), Math.min(3, -this.vy * 0.3 + 0.5)); } this.grounded = true; this.vy = 0; if (g - this.position.y > 0.05) y = damp(this.position.y, g, 25, dt); }
    else if (this.grounded && !this.jet && this.vy <= 0 && y - g < 0.6 && !(this.model?.robot && (this._slopeMem || 0) > 0 && Math.hypot(this.velocity.x, this.velocity.z) > (this.model?.sprintBall ? 7 : 9))) { y = g; this.vy = 0; } // ground stick: follow descending slopes instead of drifting off them (but a rolling ball leaves a ramp lip)
    else if (this.grounded && this.model?.robot && (this._slopeMem || 0) > 0 && this.vy <= 0.5 && Math.hypot(this.velocity.x, this.velocity.z) > (this.model?.sprintBall ? 7 : 9)) { const sp = Math.hypot(this.velocity.x, this.velocity.z); this.vy = Math.max(this.vy, sp * Math.min(0.75, (this._slopePeak || 0.2) * 1.6) + 1.5); this._ballAir = true; this.grounded = false; this._slopeUp = 0; this._slopeMem = 0; this.fx?.dust?.(this.position.clone(), 2); audio.play('vault', { pos: this.position, volume: 0.7, pitch: 1.2 }); events.emit('fx:shake', 0.2); } // ramp launch
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
    this.trigger = input.fire && !this.dead && (this.state !== 'roll' || this.model?.mk3) && this.state !== 'vault' && this.reloadT < 0 && !(this.state === 'cover' && !this.aiming && !this.blindOk());
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
  /** Nearest living enemy within `cone` radians of the crosshair with line of sight. */
  findAimTarget(cone = 0.26) {
    const cam = this.cam.camera.position, look = this.cam.lookDir; let best = null, bs = Infinity;
    for (const e of this.game.director?.enemies || []) {
      if (e.dead || e.type?.ally) continue;
      const c = e.hitCenter || e.position; const d = new THREE.Vector3(c.x, c.y + 0.25, c.z).sub(cam); const dist = d.length(); if (dist > 140 || dist < 1.5) continue;
      d.divideScalar(dist); const ang = Math.acos(clamp(d.dot(look), -1, 1)); if (ang > cone) continue;
      const score = ang * 2 + dist / 140; if (score >= bs) continue;
      if (!this.world.hasLOS(cam, new THREE.Vector3(c.x, c.y + 0.25, c.z), { terrainStep: 2 })) continue;
      bs = score; best = e;
    }
    if (best) { this.aimSnapT = 0.2; audio.play('ui_tab', { volume: 0.25 }); }
    return best;
  }
  resupply(frac = 1) {
    for (const k of ['primary', 'secondary']) { const w = this.weapons[k]; w.reserve = Math.min(w.def.maxReserve, w.reserve + Math.round(w.def.reserve * frac)); }
    this.grenades = Math.min(GRENADE.maxCount, this.grenades + (frac >= 1 ? 2 : 1)); this.injectors = Math.min(INJECTOR.maxCount, this.injectors + (frac >= 1 ? 2 : 1));
  }
  pickupWeapon(id) { const w = this.makeWeapon(id); const slot = WEAPONS[id].slot === 'secondary' ? 'secondary' : 'primary'; this.weapons[slot] = w; this.equip(slot); events.emit('player:weapon', w); }
  respawn(pos, yaw = 0) {
    this.dead = false; this.downed = false; this.health = this.maxHealth; this.state = 'normal'; this.stateT = 0; this.spawnT = 0; this.lastDamageT = -99; this.invulnT = 2.5;
    const st = this.game?.combat?.stats; this.lifeStart = { kills: st?.kills || 0, damage: st?.damageDealt || 0, t: performance.now() };
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
  /** Blastwave: thrown off the wheel, tumbling as a ball until it settles. No control for a moment. */
  knockdown(dir, impulse) {
    if (this.dead || this.knockT > 0) return;
    this.knockT = 1.1; this._wasRolling = this.rollMode; this.rollMode = true; this._ballAir = true; this.grounded = false; this.state = 'normal';
    this.velocity.set(dir.x * impulse, 0, dir.z * impulse); this.vy = Math.max(this.vy, 5 + impulse * 0.35);
    events.emit('fx:shake', 1.2); audio.play('land', { pos: this.position, volume: 1, pitch: 0.6 }); events.emit('toast', 'BLASTWAVE', 'warn');
  }
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
  /** Kill credit: a sliver of hull back per confirmed kill (2%). Rewards aggression without turning into lifesteal. */
  onKillHeal() { if (this.dead) return; const amt = Math.max(2, Math.round(this.maxHealth * 0.02)); if (this.health < this.maxHealth) { this.health = Math.min(this.maxHealth, this.health + amt); events.emit('hud:heal-tick', amt); } }
  creditKill() { this.onKillHeal(); }
  die(info) {
    if (this.dead) return; this.dead = true; this.aiming = false; this.sprinting = false; this.trigger = false;
    if (this.state === 'cover') this.leaveCover();
    this.state = 'dead'; this.stateT = 0;
    if (this.model?.robot) { const dir = info?.dir ? new THREE.Vector3(...info.dir) : new THREE.Vector3(0, 1, 0); this.fx?.shatterFrame?.(this.model, dir, { max: 30 }); this.fx?.explosion?.(this.position.clone().setY(this.position.y + 1), 1.4, 'drone'); this.model.root.visible = false; events.emit('fx:shake', 1.0); }
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
    if (!this.grounded) spread *= this.floating ? 0.7 : 1.35; // thruster-stabilised aim in the air, wild while tumbling
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
        if (hit.entity) { this.hits++; this.game.combat.playerHit(hit, d, dir, this.id); if (d.chain) this.arcChain(hit, d); }
        else if (hit.collider?.breakable) { damageBreakable(this.world, hit.collider.breakable, d.damage * (d.pellets > 1 ? 1 : 1.6), hit.point, dir, this.fx); audio.play(hit.material === 'metal' ? 'hit_metal' : 'hit_rock', { pos: hit.point, volume: 0.6, pitchVar: 0.1 }); }
        else { this.fx.impact(hit.point, hit.normal, hit.material); audio.play(hit.material === 'metal' ? 'hit_metal' : hit.material === 'rock' ? 'hit_rock' : 'hit_dirt', { pos: hit.point, volume: 0.5, pitchVar: 0.1 }); }
        if (d.explosive) this.game.combat.explode(hit.point.clone().addScaledVector(hit.normal || dir, 0.3), d.explosive.radius, d.explosive.damage, { kind: 'grenade', attackerId: this.id, impulse: d.explosive.impulse, selfMult: 0.35 });
      } else if (d.explosive) this.game.combat.explode(end, d.explosive.radius * 0.7, d.explosive.damage * 0.5, { kind: 'grenade', attackerId: this.id, impulse: d.explosive.impulse, selfMult: 0.35 });
    }
    this.game.combat.stats.shotsFired++;
    this.fx.muzzleFlash(muzzle, _ray.direction, d.tracer, d.kind === 'shotgun' ? 1.6 : d.kind === 'lmg' ? 1.3 : 1);
    this.fx.shell?.(w.model.userData.ejector.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(Math.cos(this.yaw), 0.6, -Math.sin(this.yaw)), d.kind);
    this.game.director?.noise(this.position, 1.5, this);
    audio.play(d.sound, { pos: muzzle, volume: 1, pitchVar: 0.05, important: true });
    events.emit('world:gunshot', muzzle, d.kind === 'shotgun' ? 2 : 1);
    audio.play('shell_drop', { pos: this.position, volume: 0.25, delay: 0.35, pitchVar: 0.15 });
    this.anim.kick(d.kick);
    this.cam.addRecoil(d.recoil * (this.aiming ? 0.75 : 1), (Math.random() - 0.5) * d.recoilYaw * 2);
    this.cam.shake(d.kick * 0.12);
    events.emit('player:fire', w);
  }
}
