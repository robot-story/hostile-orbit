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
import { mergeStaticProps } from '../world/merge.js';

export function startShowcase(game) {
  const world = new World();
  game.world = world;
  const base = M(200, 45, 0);
  const center = base.clone();
  const rows = [];
  const put = (obj, col, row, yaw = 0) => { const x = base.x - 21 + col * 6, z = base.z - 12 + row * 8; const y = world.groundHeight(x, z); if (obj.isObject3D) { obj.position.set(x, y, z); obj.rotation.y = yaw; world.actors.add(obj); } return new THREE.Vector3(x, y, z); };
  const anims = [];
  // Row 0: characters
  const rig = (style, col, opts = {}) => { const m = buildSoldier(style); const a = new CharacterAnimator(m); if (opts.weapon) a.weaponSocket.add(WEAPON_BUILDERS[opts.weapon]()); put(m.root, col, 0, Math.PI); anims.push({ a, s: opts.state || { speed: 0, sprint: 0, crouch: 0, aim: 1, cover: null, weaponLow: 0 } }); return m; };
  rig('vanguard', 0, { weapon: 'viper' });
  rig('vanguard', 1, { weapon: 'longshot', state: { speed: 0.8, sprint: 0.55, crouch: 0, aim: 0, cover: null } });
  rig('legion', 2, { weapon: 'legion_rifle' });
  rig('legion', 3, { weapon: 'legion_shotgun', state: { speed: 0, sprint: 0, crouch: 1, aim: 1, cover: null } });
  rig('legionHeavy', 4, { weapon: 'legion_heavy' });
  rig('rescued', 5, { state: { speed: 0, sprint: 0, crouch: 0, aim: 0, cover: null, weaponLow: 1 } });
  const drone = buildDroneModel(); put(drone, 6, 0); drone.position.y += 2.5;
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
  world.finalize();
  game.renderer.setScene(world.scene, game.camera);
  game.setBackground(null); game.menus.hide();
  game.mode = 'showcase';
  const focus = new THREE.Vector3(base.x, base.y + 1.5, base.z + 4);
  let t = 0; const params = new URLSearchParams(location.search); const fixed = params.get('angle');
  game.showcaseUpdate = (dt) => {
    t += dt; for (const x of anims) x.a.update(dt, x.s);
    const ang = fixed != null ? +fixed : t * 0.12; const r = +(params.get('r') || 34);
    game.camera.position.set(focus.x + Math.sin(ang) * r, focus.y + 9, focus.z + Math.cos(ang) * r); game.camera.lookAt(focus); game.camera.userData.focus = focus;
    world.update(dt, game.camera);
  };
  console.info('[showcase] ready');
}
