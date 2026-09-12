// Story layer: Legion encampments, overrun Commonwealth checkpoints and last stands, and the intel points that
// narrate what happened here as the squad moves through. Camps register in `info.camps` so the mission garrisons
// them (host only); story points register in `info.story` and fire locally when a player reaches them.
import * as THREE from 'three';
import { M } from './terrain.js';
import { Mat, COLORS } from '../render/materials.js';
import { crate, crateStack, barrier, sandbagWall, barrel, ammoCache, lightTower, posterFrame, antennaMast, wreckedTruck } from '../models/props.js';
import { pointGlow } from '../models/buildings.js';
import { scorchDecal } from './dressing.js';
import { supplyPickup } from './pickups.js';
import { rand, pick } from '../core/mathx.js';

const onFloor = (world, x, z, margin = -0.6) => world.terrain.isFloor(x, z, margin);
function at(world, mx, my) { const p = M(mx, my); p.y = world.terrain.getHeight(p.x, p.z); return p; }
function ground(world, p) { const q = p.clone(); q.y = world.terrain.getHeight(q.x, q.z); return q; }
function push(info, res) { if (res?.collider || res?.colliders) (info.destructibles ||= []).push(res); }

let _cloth = null, _flagRed = null, _flagCyan = null, _debris = null, _core = null;
const cloth = () => _cloth || (_cloth = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide }));
const flagRed = () => _flagRed || (_flagRed = new THREE.MeshStandardMaterial({ color: '#3a0d08', emissive: COLORS.red, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.DoubleSide }));
const flagCyan = () => _flagCyan || (_flagCyan = new THREE.MeshStandardMaterial({ color: '#0a1a20', emissive: COLORS.cyan, emissiveIntensity: 0.5, roughness: 0.8, side: THREE.DoubleSide }));
const debrisMat = () => _debris || (_debris = new THREE.MeshStandardMaterial({ color: '#1c2026', roughness: 0.5, metalness: 0.8 }));
const coreMat = () => _core || (_core = Mat.neon(COLORS.redOrange, 3.2));

/** Fallen frames: a scatter of armour plates and a dead highlight strip. Reads as "someone lost here" from 30 m. */
export function debrisField(world, pos, r = 3, opts = {}) {
  const g = new THREE.Group(); const n = opts.count || 9; const accent = Mat.neon(opts.color || COLORS.cyan, 0.6);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0.4, r); const p = ground(world, new THREE.Vector3(pos.x + Math.cos(a) * d, 0, pos.z + Math.sin(a) * d));
    const w = rand(0.18, 0.5), h = rand(0.05, 0.14), dd = rand(0.16, 0.42);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), debrisMat()); m.position.copy(p); m.position.y += h * 0.5 + 0.01; m.rotation.set(rand(-0.3, 0.3), a, rand(-0.25, 0.25)); m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (i % 3 === 0) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.02, 0.03), accent); s.position.set(0, h * 0.5 + 0.005, dd * 0.3); m.add(s); }
  }
  world.props.add(g); scorchDecal(world, pos, r * 0.8, { rubble: false });
  return g;
}

/** A Legion field camp: sandbag ring with two gaps, a reactor brazier, a tarp shelter, banner, stores and a loot cache.
 *  `squad` names the SQUADS template the mission garrisons here. */
export function legionCamp(world, info, pos, opts = {}) {
  if (!onFloor(world, pos.x, pos.z, -1)) return null;
  const r = opts.r || 6.5, base = opts.yaw || 0; const centre = ground(world, pos);
  const segs = opts.segs || 6; const gaps = new Set(opts.gaps || [0, 3]);
  for (let i = 0; i < segs; i++) { if (gaps.has(i)) continue; const a = base + (i / segs) * Math.PI * 2; const p = ground(world, new THREE.Vector3(centre.x + Math.cos(a) * r, 0, centre.z + Math.sin(a) * r)); if (!onFloor(world, p.x, p.z, -0.4)) continue; (i % 2 ? sandbagWall(world, p, -a + Math.PI / 2, { length: 3.4 }) : push(info, barrier(world, p, -a + Math.PI / 2))); }
  // brazier: a cracked reactor core the frames stand around. Warm flicker light.
  { const g = new THREE.Group(); const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.5, 8), Mat.darkMetal()); bowl.position.y = 0.25; g.add(bowl); const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), coreMat()); core.position.y = 0.6; g.add(core); for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), Mat.darkMetal()); const a = (k / 3) * Math.PI * 2; leg.position.set(Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45); leg.rotation.z = Math.cos(a) * 0.3; leg.rotation.x = -Math.sin(a) * 0.3; g.add(leg); } const l = pointGlow(COLORS.redOrange, 5, 11, 2, 'flicker'); l.position.y = 1.0; g.add(l); const bp = ground(world, new THREE.Vector3(centre.x + 0.8, 0, centre.z - 0.6)); g.position.copy(bp); world.props.add(g); world.addCyl(bp.clone().setY(bp.y + 0.35), 0.55, 0.7, { material: 'metal', cover: false }); scorchDecal(world, bp, 2.2, { rubble: false }); }
  // tarp shelter over the stores
  { const sp = ground(world, new THREE.Vector3(centre.x - 3.2, 0, centre.z + 1.6)); const g = new THREE.Group(); const yaw = base + rand(-0.4, 0.4);
    for (const [x, z, h] of [[-1.6, -1.2, 2.3], [1.6, -1.2, 2.3], [-1.6, 1.2, 1.5], [1.6, 1.2, 1.5]]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 6), Mat.darkMetal()); pole.position.set(x, h / 2, z); g.add(pole); }
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.9), cloth()); tarp.position.set(0, 1.92, 0); tarp.rotation.x = -Math.PI / 2 + 0.32; tarp.receiveShadow = true; tarp.castShadow = true; g.add(tarp);
    g.position.copy(sp); g.rotation.y = yaw; world.props.add(g);
    push(info, crateStack(world, ground(world, sp.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.6, 0, -Math.sin(yaw) * 0.6))), yaw, { count: 2 })); push(info, barrel(world, ground(world, sp.clone().add(new THREE.Vector3(-1.1, 0, 0.4))), 0)); push(info, barrel(world, ground(world, sp.clone().add(new THREE.Vector3(-0.5, 0, 0.9))), 0.7)); }
  // banner pole with the Legion's null glyph
  { const bp = ground(world, new THREE.Vector3(centre.x + 2.6, 0, centre.z + 2.4)); const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6), Mat.darkMetal()); pole.position.y = 2.1; g.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), opts.friendly ? flagCyan() : flagRed()); flag.position.set(0.47, 3.3, 0); g.add(flag); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 20), Mat.neon(opts.friendly ? COLORS.cyan : COLORS.red, 2)); ring.position.set(0.47, 3.3, 0.02); g.add(ring); g.position.copy(bp); g.rotation.y = base; world.props.add(g); world.addCyl(bp.clone().setY(bp.y + 2), 0.12, 4, { material: 'metal', cover: false }); }
  // stores and loot on the far side, a roll-through cache for the squad that clears it
  push(info, crate(world, ground(world, new THREE.Vector3(centre.x + 1.8, 0, centre.z - 2.6)), base + 0.3));
  const acPos = ground(world, new THREE.Vector3(centre.x - 1.4, 0, centre.z - 2.2)); const ac = ammoCache(world, acPos, base); push(info, ac); (info.supplyCaches ||= []).push({ position: acPos.clone(), collider: ac.collider });
  supplyPickup(world, ground(world, new THREE.Vector3(centre.x, 0, centre.z + 2.6)), opts.loot || 'ammo');
  if (opts.tower) lightTower(world, ground(world, new THREE.Vector3(centre.x - r * 0.7, 0, centre.z - r * 0.5)), 0, { color: COLORS.redOrange });
  (info.camps ||= []).push({ pos: centre.clone(), r: opts.triggerR || 42, squad: opts.squad || 'patrol', spread: Math.max(3, r - 2), name: opts.name || 'LEGION CAMP', alert: !!opts.alert });
  return centre;
}

/** Overrun Commonwealth checkpoint: barriers and a boom across the road, a dead light tower, the crew's remains. */
export function checkpoint(world, info, pos, yaw = 0, opts = {}) {
  const c = ground(world, pos); const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); const side = new THREE.Vector3(dir.z, 0, -dir.x);
  for (const s of [-1, 1]) push(info, barrier(world, ground(world, c.clone().addScaledVector(side, s * 3.2)), yaw));
  { const g = new THREE.Group(); const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), Mat.panel(1)); post.position.y = 0.65; g.add(post); const boom = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 0.12), Mat.hazard()); boom.position.set(2.4, 1.1, 0); boom.rotation.z = opts.broken === false ? 0 : -0.55; g.add(boom); g.position.copy(ground(world, c.clone().addScaledVector(side, -2.9))); g.rotation.y = yaw; world.props.add(g); }
  lightTower(world, ground(world, c.clone().addScaledVector(side, 4.6).addScaledVector(dir, -1.5)), 0, { color: COLORS.cyan });
  push(info, posterFrame(world, ground(world, c.clone().addScaledVector(side, -4.8).addScaledVector(dir, -1.2)), yaw + Math.PI, { stand: true, slogan: opts.slogan || 'PAPERS READY. SMILES READY.' }));
  const cr = crate(world, ground(world, c.clone().addScaledVector(side, 2.2).addScaledVector(dir, -2.4)), yaw + 0.9); cr.group.rotation.z = 0.5; cr.group.position.y += 0.15; push(info, cr);
  debrisField(world, c.clone().addScaledVector(dir, -1.5), 3.4, { count: 11 });
  return c;
}

/** Commonwealth last stand: a sandbag half-ring facing the enemy, cyan lights still burning, frames down inside it. */
export function lastStand(world, info, pos, yaw = 0, opts = {}) {
  const c = ground(world, pos); const r = opts.r || 5;
  for (let i = -2; i <= 2; i++) { const a = yaw + i * 0.42; const p = ground(world, new THREE.Vector3(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r)); if (onFloor(world, p.x, p.z, -0.4)) sandbagWall(world, p, a, { length: 3.2 }); }
  debrisField(world, c, r * 0.7, { count: opts.count || 14, color: COLORS.cyan });
  push(info, barrel(world, ground(world, new THREE.Vector3(c.x - 2.2, 0, c.z - 1.6)), 0.4)); push(info, ammoCache(world, ground(world, new THREE.Vector3(c.x + 2.0, 0, c.z - 1.8)), yaw));
  antennaMast(world, ground(world, new THREE.Vector3(c.x - 3.2, 0, c.z - 3.0)), 0, { height: 7 });
  { const bp = ground(world, new THREE.Vector3(c.x + 0.6, 0, c.z - 2.4)); const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 6), Mat.darkMetal()); pole.position.y = 1.8; pole.rotation.z = 0.35; g.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), flagCyan()); flag.position.set(1.05, 2.6, 0); flag.rotation.z = 0.35; g.add(flag); g.position.copy(bp); g.rotation.y = yaw; world.props.add(g); }
  supplyPickup(world, ground(world, new THREE.Vector3(c.x, 0, c.z + 1.2)), 'health');
  return c;
}

/** Intel point: fires once per session when a player reaches it. */
export function storyPoint(info, pos, r, speaker, text, opts = {}) { (info.story ||= []).push({ pos: pos.clone(), r, speaker, text, toast: opts.toast || 'FIELD INTEL LOGGED', done: false }); }

// ================================================================ Blacksite Meridian: how the outpost fell
export function buildMeridianStory(world, info) {
  const P = (mx, my) => at(world, mx, my);
  // 1. Checkpoint Alpha went dark first: the road out of the landing camp.
  checkpoint(world, info, P(200, 96), 0, { slogan: 'CHECKPOINT ALPHA  //  PAPERS READY.' });
  storyPoint(info, P(200, 92), 14, 'VOSS', 'Checkpoint Alpha. First thing to go dark. They never got a shot off.');
  // 2. The Legion dug in on the junction convoy ambush site and both flanking routes.
  legionCamp(world, info, P(210, 150), { squad: 'patrol', yaw: 0.6, name: 'JUNCTION CAMP', tower: true, r: 5.5 });
  storyPoint(info, P(214, 134), 16, 'VOSS', 'Convoy wreckage. They hit the resupply column here and set up camp in the pieces.');
  legionCamp(world, info, P(108, 214), { squad: 'fire_team', yaw: 1.2, name: 'HIGH ROUTE CAMP', loot: 'health' });
  legionCamp(world, info, P(272, 212), { squad: 'patrol_heavy', yaw: -0.5, name: 'TRENCH CAMP', gaps: [1, 4] });
  storyPoint(info, P(268, 150), 14, 'VOSS', 'Trench line. Commonwealth engineers cut it to slow them down. It slowed us down instead.');
  // 3. Jammer approach: an assault camp outside the bowl; the crew that tried to hold the gate.
  lastStand(world, info, P(125, 295), Math.PI * 0.85, { count: 12, r: 4 });
  storyPoint(info, P(124, 291), 14, 'VOSS', 'Gate crew. They held the jammer approach for nine minutes. Command logged it as a scheduling delay.');
  legionCamp(world, info, P(92, 276), { squad: 'assault', yaw: 2.4, name: 'JAMMER PICKET', alert: false, tower: true });
  // 4. Comms base back yard: the motor pool where the last transports were stripped.
  legionCamp(world, info, P(262, 332), { squad: 'heavy', yaw: 3.0, name: 'MOTOR POOL CAMP', gaps: [2, 5] });
  wreckedTruck(world, P(272, 322), 2.2); wreckedTruck(world, P(252, 310), -0.4);
  storyPoint(info, P(258, 322), 16, 'VOSS', 'Motor pool. They stripped the transports for parts. Whatever they are building, it is not going home.');
  // 5. Extraction: the last stand on the platform approach, and the picket that finished it.
  lastStand(world, info, P(318, 272), Math.PI * 0.35, { count: 16 });
  storyPoint(info, P(318, 268), 16, 'VOSS', 'Extraction approach. The evac crew made their stand here so the data could leave. It did not.');
  legionCamp(world, info, P(300, 214), { squad: 'patrol', yaw: 1.8, name: 'EXTRACTION PICKET', loot: 'both' });
  storyPoint(info, P(200, 48), 12, 'VOSS', 'Blacksite Meridian. Relay station, mining claim, and as of this morning a Null Legion staging ground. Move.', { toast: 'OPERATION BRIEF' });
}

// ================================================================ Black Lantern: a city that switched sides
export function buildLanternStory(world, info) {
  const L = world.map.locations; const W = (key, dx, dz) => ground(world, L[key].pos.clone().add(new THREE.Vector3(dx, 0, dz)));
  checkpoint(world, info, W('dropZone', 0, -24), 0, { slogan: 'TRANSIT AUTHORITY  //  QUEUE HERE.' });
  storyPoint(info, W('dropZone', 0, -22), 14, 'VOSS', 'Transit checkpoint. The city guard walked off shift the night the Legion arrived. Nobody came back for the barriers.');
  legionCamp(world, info, W('canyonJunction', 16, 8), { squad: 'patrol', yaw: 0.4, name: 'PLAZA CAMP', tower: true });
  storyPoint(info, W('canyonJunction', 0, 0), 16, 'VOSS', 'Meridian Avenue. The billboards still run the Commonwealth feed. Nobody here is watching it.');
  legionCamp(world, info, W('trenchRouteMid', -22, -22), { squad: 'fire_team', yaw: 2.0, name: 'WEST ARCADE CAMP', loot: 'health' });
  legionCamp(world, info, W('highRouteMid', 0, 0), { squad: 'patrol_heavy', yaw: -1.0, name: 'EAST SKYWAY CAMP', gaps: [1, 4], r: 4.5 });
  lastStand(world, info, W('jammerGateSouth', 22, -18), Math.PI * 1.1, { count: 12 });
  storyPoint(info, W('jammerGateSouth', 20, -14), 14, 'VOSS', 'Substation gate. The utility crew tried to cut the Legion’s power. The Legion cut theirs.');
  legionCamp(world, info, W('commsGateSouth', -16, -24), { squad: 'heavy', yaw: 3.0, name: 'HOLDING BLOCK CAMP', gaps: [2, 5] });
  storyPoint(info, W('detentionEntrance', 0, 0), 14, 'VOSS', 'Holding block. Citizens with the wrong opinions were already inside when the Legion came. Efficient of everyone.');
  lastStand(world, info, W('extractionApproach', -16, 22), Math.PI * 0.6, { count: 16 });
  legionCamp(world, info, W('extractionApproach', -14, 10), { squad: 'patrol', yaw: 1.4, name: 'ROOFTOP PICKET', loot: 'both' });
  storyPoint(info, W('dropZone', 0, 0), 12, 'VOSS', 'Black Lantern. Twelve million citizens, one relay tower, and a Legion garrison that thinks it owns both. Prove otherwise.', { toast: 'OPERATION BRIEF' });
}
