// Asset showcase (?showcase): lays every model out in rows on the drop pad for visual audits. Not used in gameplay.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { M } from '../world/terrain.js';
import { buildSoldier } from '../models/soldier.js';
import { CharacterAnimator } from '../entities/animator.js';
import { WEAPON_BUILDERS, buildGrenade } from '../models/weapons.js';
import { buildDroneModel } from '../entities/drone.js';
import { buildPodModel, Gunship, Dropship, buildSupplyCrate } from '../gameplay/pods.js';
import { buildDropZone, buildPylon } from '../models/buildings.js';
import * as Props from '../models/props.js';
import * as Alien from '../models/alien.js';
import * as City from '../models/city.js';
import { mergeStaticProps } from '../world/merge.js';
import { loadCustomMesh, rollBall } from '../models/glbSoldier.js';
import { ROBOTS } from '../models/robots.js';

/** Robot frame line-up: each frame drives around its home spot through idle / walk / sprint / strafe / crouch / aim /
 *  jump / turn phases so the locomotion flavour can be judged. `?showcase&robots[&robot=a|b|c][&angle=..&r=..&h=..]` */
function robotShowcase(game, world, params, base) {
  const kinds = params.get('robot') && ROBOTS[params.get('robot')] ? [params.get('robot')] : ['a', 'b', 'c'];
  const spacing = 7; const demos = [];
  const MAXV = 6.2;
  const PHASES = [{ n: 'idle', d: 2.2 }, { n: 'walk', d: 3.2, sp: 0.4 }, { n: 'sprint', d: 3.2, sp: 1, sprint: 1 }, { n: 'strafe', d: 3, sp: 0.5, strafe: 1 }, { n: 'crouch', d: 2.4, sp: 0.25, crouch: 1 }, { n: 'aim', d: 2.6, aim: 1, fire: 1 }, { n: 'jump', d: 1.5 }, { n: 'turn', d: 2, turn: 1 }];
  kinds.forEach((k, i) => {
    const m = buildSoldier('vanguard', { robot: k }); const a = new CharacterAnimator(m); a.weaponSocket.add(WEAPON_BUILDERS.viper());
    const home = new THREE.Vector3(base.x + (i - (kinds.length - 1) / 2) * spacing, 0, base.z + 4); home.y = world.groundHeight(home.x, home.z);
    m.root.position.copy(home); world.actors.add(m.root);
    // name plate
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 512, 128); x.font = '700 54px Arial'; x.textAlign = 'center'; x.fillStyle = '#00e5ff'; x.fillText(ROBOTS[k].name, 256, 62); x.font = '400 26px Arial'; x.fillStyle = '#ffffff'; x.fillText(k.toUpperCase() + '  //  ' + ROBOTS[k].blurb, 256, 104);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(4, 1, 1); sp.position.set(home.x, home.y + 2.6, home.z); world.actors.add(sp);
    demos.push({ k, m, a, home, sprite: sp, pos: home.clone(), yaw: 0, vel: new THREE.Vector3(), idx: 0, t: 0, fireT: 0, jumpT: 0, land: 0, prevSpeed: 0, prevYaw: 0 });
  });
  world.finalize();
  game.renderer.setScene(world.scene, game.camera);
  game.setBackground(null); game.menus.hide();
  game.mode = 'showcase';
  let t = 0; const fixed = params.get('angle');
  const focus = new THREE.Vector3(base.x, base.y + 1.1, base.z + 4); focus.y = world.groundHeight(focus.x, focus.z) + 1.1;
  const camH = params.get('h') != null ? +params.get('h') : 1.9; const camR = +(params.get('r') || (kinds.length === 1 ? 5.5 : 12));
  game.showcaseUpdate = (dt) => {
    t += dt;
    for (const d of demos) {
      const ph = PHASES[d.idx]; d.t += dt; if (d.t >= ph.d) { d.t = 0; d.idx = (d.idx + 1) % PHASES.length; d.jumpT = 0; }
      const P = PHASES[d.idx];
      // steering: circle the home spot; strafe keeps the facing and slides sideways; turn phase spins in place
      const toHome = Math.atan2(-(d.home.x - d.pos.x), -(d.home.z - d.pos.z)); const far = d.pos.distanceTo(d.home) > 3.2;
      if (P.turn) d.yaw += dt * 2.2; else if (P.sp) { const target = far ? toHome : d.yaw + 0.5; let dy = target - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); d.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 1.4); }
      const dx = P.strafe ? Math.sin(t * 0.9) > 0 ? 1 : -1 : 0, dz = P.strafe ? 0 : -1;
      const spd = (P.sp || 0) * MAXV;
      const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw), rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw);
      const vx = (fx * -dz + rx * dx) * spd, vz = (fz * -dz + rz * dx) * spd;
      d.vel.x = THREE.MathUtils.damp(d.vel.x, vx, 6, dt); d.vel.z = THREE.MathUtils.damp(d.vel.z, vz, 6, dt);
      d.pos.x += d.vel.x * dt; d.pos.z += d.vel.z * dt;
      let y = world.groundHeight(d.pos.x, d.pos.z);
      if (d.idx === 6) { d.jumpT += dt; const u = d.jumpT / 1.5; const arc = Math.max(0, Math.sin(Math.min(1, u) * Math.PI)) * 1.1; y += arc; d.land = u > 0.92 ? 1 : 0; } else d.land = Math.max(0, d.land - dt * 2.5);
      d.m.root.position.set(d.pos.x, y, d.pos.z); d.m.root.rotation.y = d.yaw; d.sprite.position.set(d.pos.x, y + 2.6, d.pos.z);
      const gs = Math.hypot(d.vel.x, d.vel.z); const speedN = Math.min(1, gs / 9.4);
      const accel = (gs - d.prevSpeed) / Math.max(dt, 1e-3); d.prevSpeed = gs; const turn = (d.yaw - d.prevYaw) / Math.max(dt, 1e-3); d.prevYaw = d.yaw;
      if (P.fire) { d.fireT -= dt; if (d.fireT <= 0) { d.fireT = 0.11; d.a.kick(0.5); } }
      const llen = Math.hypot(dx, dz) || 1;
      d.a.update(dt, { speed: speedN, sprint: P.sprint ? 1 : 0, crouch: P.crouch ? 1 : 0, aim: P.aim ? 1 : 0, cover: null, strafe: dx, forward: dz >= -0.3 ? 1 : -1, moveDir: { x: gs > 0.3 ? dx / llen : 0, z: gs > 0.3 ? dz / llen : 1 }, velocity: d.idx === 6 ? 0 : gs, groundAt: (ox, oz) => world.groundHeight(d.pos.x + ox, d.pos.z + oz), accel: THREE.MathUtils.clamp(accel / 12, -1, 1), turn: THREE.MathUtils.clamp(turn / 4, -1, 1), land: d.land, turning: !!P.turn, jet: d.idx === 6 && d.jumpT < 0.7 ? 1 : 0, robotic: true });
      rollBall(d.m, d.vel.x, d.vel.z, dt, d.land, d.yaw, P.crouch ? 1 : 0);
    }
    const ang = fixed != null ? +fixed : t * 0.1;
    game.camera.position.set(focus.x + Math.sin(ang) * camR, focus.y + camH, focus.z + Math.cos(ang) * camR); game.camera.lookAt(focus); game.camera.userData.focus = focus;
    world.update(dt, game.camera);
  };
  window.HO.robotDemos = demos; window.HO.robotPhases = PHASES;
  console.info('[showcase] robots ready');
}

export function startShowcase(game) {
  const params = new URLSearchParams(location.search);
  const world = new World();
  game.world = world;
  const base = M(200, 45, 0);
  const center = base.clone();
  const rows = [];
  const put = (obj, col, row, yaw = 0) => { const x = base.x - 21 + col * 6, z = base.z - 12 + row * 8; const y = world.groundHeight(x, z); if (obj.isObject3D) { obj.position.set(x, y, z); obj.rotation.y = yaw; world.actors.add(obj); } return new THREE.Vector3(x, y, z); };
  const anims = [];
  if (params.has('robots')) return robotShowcase(game, world, params, base);
  // Row 0: characters
  const rig = (style, col, opts = {}) => { const m = buildSoldier(style, { custom: opts.custom }); const a = new CharacterAnimator(m); if (opts.weapon) a.weaponSocket.add(WEAPON_BUILDERS[opts.weapon]()); put(m.root, col, 0, 0); anims.push({ a, s: opts.state || { speed: 0, sprint: 0, crouch: 0, aim: 1, cover: null, weaponLow: 0 } }); return m; };
  rig('vanguard', 0, { weapon: 'viper' });
  rig('vanguard', 1, { weapon: 'longshot', state: { speed: 0.8, sprint: 0.55, crouch: 0, aim: 0, cover: null } });
  rig('legion', 2, { weapon: 'legion_rifle' });
  rig('legion', 3, { weapon: 'legion_shotgun', state: { speed: 0, sprint: 0, crouch: 1, aim: 1, cover: null } });
  rig('legionHeavy', 4, { weapon: 'legion_heavy' });
  rig('rescued', 5, { state: { speed: 0, sprint: 0, crouch: 0, aim: 0, cover: null, weaponLow: 1 } });
  const drone = buildDroneModel(); put(drone, 6, 0); drone.position.y += 2.5;
  rig('legion', 7, { weapon: 'legion_rifle', custom: 'sentinel', state: { speed: 0, sprint: 0, crouch: 0, aim: 1, cover: null } });
  // Row 1: weapons (scaled up) + grenade + pod + turret crate
  ['viper', 'hammer', 'atlas', 'longshot', 'sidearm'].forEach((w, i) => { const g = WEAPON_BUILDERS[w](); g.scale.setScalar(2.4); put(g, i, 1, Math.PI / 2); g.position.y += 1.2; });
  const gr = buildGrenade(); gr.scale.setScalar(6); put(gr, 5, 1); gr.position.y += 1;
  const pod = buildPodModel(); put(pod, 6, 1); pod.userData.doors.forEach(d => d.rotation.x = -1.6);
  const sup = buildSupplyCrate(); put(sup, 7, 1);
  // Row 2: props
  const pos = (c, r) => { const x = base.x - 21 + c * 6, z = base.z - 12 + r * 8; return new THREE.Vector3(x, world.groundHeight(x, z), z); };
  Props.crate(world, pos(0, 2), 0.3); Props.crateStack(world, pos(1, 2), 0); Props.barrier(world, pos(2, 2), 0.4); Props.sandbagWall(world, pos(3, 2), 0.2);
  Props.barrel(world, pos(4, 2), 0); Props.ammoCache(world, pos(5, 2), 0); Props.terminal(world, pos(6, 2), Math.PI); Props.rockMedium(world, pos(7, 2), 0);
  // Row 3: big props + alien
  Props.container(world, pos(0.5, 3), 0.3); Props.wreckedTruck(world, pos(2.5, 3), 0.5); Props.billboard(world, pos(4, 3), Math.PI); Props.lightTower(world, pos(5, 3), 0);
  Alien.membranePlant(world, pos(6, 3)); Alien.blackGlassTree(world, pos(7, 3), { height: 5 });
  // Row 4: vehicles
  const gs = Gunship.buildModel(); gs.scale.setScalar(0.5); put(gs, 1.5, 4.6); gs.position.y += 4;
  const ds = Dropship.buildModel(); ds.scale.setScalar(0.5); put(ds, 5.5, 4.6); ds.position.y += 1;
  buildPylon(world, pos(-0.5, 0.5), 7);
  // Row 5: city
  City.buildTower(world, pos(0, 5), 0, { color: '#00e5ff' });
  City.buildTower(world, pos(1.3, 5), 0.4, { color: '#ff3fd8' });
  City.hoverWreck(world, pos(2.6, 5), 0.2);
  City.kiosk(world, pos(4, 5), 0);
  City.neonSign(world, pos(5, 5), 0);
  City.holoBillboard(world, pos(6.5, 5), 0);
  City.streetLamp(world, pos(7.5, 5), { light: false });
  // ?glb=1: preview the custom character mesh (normalised, unskinned) beside the procedural rigs
  if (params.get('glb')) {
    const o = { up: params.get('up') || undefined, yaw: params.get('yaw') != null ? +params.get('yaw') : 0, flipUp: params.has('flip'), part: params.get('part') != null ? +params.get('part') : undefined, split: params.get('split') || undefined };
    loadCustomMesh(params.get('glb') === 'enemy' ? 'models/sentinel.glb' : 'models/vanguard.glb', o).then((c) => { const m = new THREE.Mesh(c.geometry, c.material); const p = pos(7, 0); m.position.copy(p); world.actors.add(m); window.HO.glbPreview = m; if (c.weapon) { const w = new THREE.Mesh(c.weapon, c.material); w.position.copy(p); world.actors.add(w); window.HO.glbWeapon = w; } console.info('[glb] size', c.geometry.boundingBox.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))); }).catch((e) => console.error('[glb]', e));
  }
  // ?bind=1: overlay the custom mesh (semi-transparent) on a zero-pose procedural rig to tune the bind pose
  if (params.get('bind')) {
    const rigM = buildSoldier(params.get('bind') === 'enemy' ? 'legion' : 'vanguard'); const p = pos(7, 0); rigM.root.position.copy(p); rigM.root.rotation.y = Math.PI; world.actors.add(rigM.root); window.HO.bindRig = rigM;
    for (const n in rigM.bones) rigM.bones[n].rotation.set(0, 0, 0);
    const bp = params.get('pose'); if (bp) { try { const o = JSON.parse(bp); for (const n in o) rigM.bones[n]?.rotation.set(...o[n]); } catch (e) { console.warn('bad pose', e); } }
    loadCustomMesh(params.get('bind') === 'enemy' ? 'models/sentinel.glb' : 'models/vanguard.glb', { part: +(params.get('part') || 0) }).then((c) => { const mat = c.material.clone(); mat.transparent = true; mat.opacity = 0.45; mat.depthWrite = false; const m = new THREE.Mesh(c.geometry, mat); m.position.copy(p); m.rotation.y = Math.PI; world.actors.add(m); window.HO.glbPreview = m; });
  }
  world.finalize();
  game.renderer.setScene(world.scene, game.camera);
  game.setBackground(null); game.menus.hide();
  game.mode = 'showcase';
  let t = 0; const fixed = params.get('angle');
  const rowP = params.get('row'), colP = params.get('col');
  const focus = rowP != null ? pos(colP != null ? +colP : 3, +rowP).add(new THREE.Vector3(0, 1.2, 0)) : new THREE.Vector3(base.x, base.y + 1.5, base.z + 4);
  const camH = params.get('h') != null ? +params.get('h') : (rowP != null ? 2.5 : 9);
  game.showcaseUpdate = (dt) => {
    t += dt; for (const x of anims) x.a.update(dt, x.s);
    const ang = fixed != null ? +fixed : t * 0.12; const r = +(params.get('r') || 34);
    game.camera.position.set(focus.x + Math.sin(ang) * r, focus.y + camH, focus.z + Math.cos(ang) * r); game.camera.lookAt(focus); game.camera.userData.focus = focus;
    world.update(dt, game.camera);
  };
  window.HO.showcaseAnims = anims; window.HO.showcaseRigs = anims.map(x => x.a);
  console.info('[showcase] ready');
}
