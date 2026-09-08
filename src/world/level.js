// Blacksite Meridian level construction: assembles the drop zone, the three approach routes,
// the jammer outpost, the comms base (with detention block), and the extraction platform, then
// dresses everything with cover, signage and alien flora. Returns the LevelInfo object consumed
// by gameplay/director code (also cached on world.level).
import * as THREE from 'three';
import { M, FLOOR } from './terrain.js';
import {
  buildDropZone, buildPylon, buildJammerOutpost, buildCommsBase, buildExtractionPlatform,
  buildWallSegment, buildGate, buildWatchtower,
} from '../models/buildings.js';
import {
  crate, crateStack, container, barrier, sandbagWall, wreckedTransport, wreckedTruck, barrel,
  ammoCache, lightTower, billboard, posterFrame, terminal, antennaMast,
  rockSmall, rockMedium, rockLarge, rockCluster, buildRockWallInstances,
} from '../models/props.js';
import { membranePlant, blackGlassTree, glowPool, boneArch, sporeField } from '../models/alien.js';
import { LOCATIONS, patrolRoutes, spawnPoints } from './locations.js';
import { rand, randInt, pick, clamp } from '../core/mathx.js';

function randSign() { return Math.random() < 0.5 ? -1 : 1; }

/** Sample a corridor polyline (map coords) into evenly-ish spaced world-space points+directions. */
function sampleCorridorWorld(pts, stepMin, stepMax) {
  const wp = pts.map(([mx, my]) => M(mx, my));
  const segLens = []; let total = 0;
  for (let i = 0; i < wp.length - 1; i++) { const l = wp[i].distanceTo(wp[i + 1]); segLens.push(l); total += l; }
  const samples = [];
  let d = rand(stepMin, stepMax) * 0.5;
  while (d < total) {
    let acc = 0, idx = 0;
    for (; idx < segLens.length - 1; idx++) { if (acc + segLens[idx] >= d) break; acc += segLens[idx]; }
    const a = wp[idx], b = wp[idx + 1] || wp[idx];
    const segLen = segLens[idx] || 1;
    const t = clamp((d - acc) / segLen, 0, 1);
    const pos = new THREE.Vector3().lerpVectors(a, b, t);
    const dir = new THREE.Vector3().subVectors(b, a);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    samples.push({ pos, dir });
    d += rand(stepMin, stepMax);
  }
  return samples;
}

function pushDestructible(info, res) { if (res && res.destructible) info.destructibles.push(res.destructible); }
function pushSupply(info, res) { if (res && res.supplyCache) info.supplyCaches.push(res.supplyCache); }
function pushPoster(info, res) { if (res && res.poster) info.posters.push(res.poster); }

/** Place one cover object appropriate for a firefight lane; returns the builder's result. */
function placeCover(world, info, pos, yaw) {
  const roll = Math.random();
  let res;
  if (roll < 0.2) res = crate(world, pos, yaw);
  else if (roll < 0.34) res = crateStack(world, pos, yaw);
  else if (roll < 0.52) res = barrier(world, pos, yaw);
  else if (roll < 0.66) res = sandbagWall(world, pos, yaw, { length: rand(2.4, 3.8) });
  else if (roll < 0.76) res = rockMedium(world, pos, yaw);
  else if (roll < 0.84) res = wreckedTruck(world, pos, yaw);
  else if (roll < 0.9) res = wreckedTransport(world, pos, yaw);
  else if (roll < 0.96) res = rockCluster(world, pos, yaw);
  else { res = barrel(world, pos, yaw); pushDestructible(info, res); }
  return res;
}

/** Dress a corridor with cover clusters every ~12-20m, offset to the sides but kept clearly on floor. */
function dressCorridorCover(world, info, corridor) {
  if (!info.supplyCaches) info.supplyCaches = [];
  const samples = sampleCorridorWorld(corridor.pts, 12, 20);
  const halfW = corridor.w / 2;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const sides = Math.random() < 0.65 ? [randSign()] : [-1, 1];
    for (const side of sides) {
      const off = rand(halfW * 0.3, halfW * 0.82) * side;
      const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
      if (!world.terrain.isFloor(px, pz, -0.7)) continue;
      const py = world.terrain.getHeight(px, pz);
      placeCover(world, info, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2));
    }
  }
  // occasional supply cache along the route
  for (const s of samples) {
    if (Math.random() > 0.12) continue;
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const off = rand(-halfW * 0.3, halfW * 0.3);
    const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
    if (!world.terrain.isFloor(px, pz, -0.7)) continue;
    const py = world.terrain.getHeight(px, pz);
    pushSupply(info, ammoCache(world, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2)));
  }
}

/** Alien flora scattered along the rock-wall edge of a corridor (0..~4m into the rock). */
function dressCorridorAlien(world, corridor, density = 1) {
  const samples = sampleCorridorWorld(corridor.pts, 14 / density, 26 / density);
  const halfW = corridor.w / 2;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    for (const side of [-1, 1]) {
      if (Math.random() > 0.45 * density) continue;
      const off = (halfW + rand(0.5, 3.5)) * side;
      const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
      const fd = world.terrain.floorDistance(px, pz);
      if (fd < -0.5 || fd > 8) continue;
      const py = world.terrain.getHeight(px, pz);
      const pos = new THREE.Vector3(px, py, pz);
      const roll = Math.random();
      if (roll < 0.45) membranePlant(world, pos);
      else if (roll < 0.7) blackGlassTree(world, pos, { height: rand(3, 7) });
      else if (roll < 0.85) glowPool(world, pos, { radius: rand(1, 2.2) });
      else boneArch(world, pos, rand(0, Math.PI * 2), { height: rand(4, 6) });
    }
  }
}

/** Collect rock-wall scatter samples (into the rock, no colliders) alongside a corridor. */
function collectRockWallSamples(corridor, out) {
  const samples = sampleCorridorWorld(corridor.pts, 3, 5);
  const halfW = corridor.w / 2;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    for (const side of [-1, 1]) {
      const off = (halfW + rand(1, 9)) * side;
      out.push({ mx: s.pos.x, mz: s.pos.z, perp, off });
    }
  }
}

function signMainRoute(world, info) {
  const corridor = FLOOR.corridors.find((c) => c.name === 'main');
  const samples = sampleCorridorWorld(corridor.pts, 42, 60);
  const halfW = corridor.w / 2;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const side = randSign();
    const off = (halfW + 0.6) * side;
    const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
    if (!world.terrain.isFloor(px, pz, 1.5)) continue;
    const py = world.terrain.getHeight(px, pz);
    const yaw = Math.atan2(-perp.z * side, perp.x * side) + Math.PI; // roughly face the corridor
    pushPoster(info, billboard(world, new THREE.Vector3(px, py, pz), Math.random() * Math.PI * 2, { accent: Math.random() < 0.5 ? '#00e5ff' : '#ff5a1f' }));
  }
}

function dressRoad(world, corridor) {
  const samples = sampleCorridorWorld(corridor.pts, 20, 32);
  const halfW = corridor.w / 2;
  for (const s of samples) {
    if (Math.random() > 0.5) continue;
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const off = rand(halfW * 0.4, halfW * 0.75) * randSign();
    const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
    if (!world.terrain.isFloor(px, pz, -0.6)) continue;
    const py = world.terrain.getHeight(px, pz);
    if (Math.random() < 0.6) barrier(world, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2));
    else posterFrame(world, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2));
  }
}

export function buildLevel(world) {
  const info = {
    locations: LOCATIONS,
    patrolRoutes,
    spawnPoints,
    jammer: null,
    terminal: null,
    cells: null,
    extraction: null,
    destructibles: [],
    supplyCaches: [],
    posters: [],
    animated: [],
  };

  // --- drop zone ---
  buildDropZone(world, LOCATIONS.dropZone.pos);

  // --- three approach routes ---
  const highC = FLOOR.corridors.find((c) => c.name === 'high');
  const mainC = FLOOR.corridors.find((c) => c.name === 'main');
  const trenchC = FLOOR.corridors.find((c) => c.name === 'trench');
  for (const c of [highC, mainC, trenchC]) dressCorridorCover(world, info, c);
  for (const c of [highC, mainC, trenchC]) dressCorridorAlien(world, c, c === trenchC ? 0.6 : 1);
  signMainRoute(world, info);

  // canyon junction: a light scatter of crates/rocks around the circular plaza
  {
    const [cx, cy] = FLOOR.circles.find((c) => c.name === 'canyon_junction').c;
    const r = FLOOR.circles.find((c) => c.name === 'canyon_junction').r;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = LOCATIONS.canyonJunction.pos.x + Math.cos(a) * (r - 3), pz = LOCATIONS.canyonJunction.pos.z + Math.sin(a) * (r - 3);
      const py = world.terrain.getHeight(px, pz);
      placeCover(world, info, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2));
    }
    buildPylon(world, new THREE.Vector3(LOCATIONS.canyonJunction.pos.x, world.terrain.getHeight(LOCATIONS.canyonJunction.pos.x, LOCATIONS.canyonJunction.pos.z), LOCATIONS.canyonJunction.pos.z + r + 4), 9);
  }

  // --- enemy reinforcement roads: stay walkable end to end, sparse barricades/posters ---
  for (const name of ['west_road', 'east_road', 'sw_road', 'se_road', 'north_gate_w', 'north_gate_e']) {
    const c = FLOOR.corridors.find((x) => x.name === name);
    if (c) dressRoad(world, c);
  }

  // --- jammer outpost ---
  const jammer = buildJammerOutpost(world, LOCATIONS.jammerCenter.pos);
  info.jammer = jammer;
  info.animated.push(jammer.animated);
  // alien flora concentrated around the jammer (Legion built cheap hardware over the alien growth)
  sporeField(world, LOCATIONS.jammerCenter.pos, { count: 90, radius: 44, color: '#9b4dff' });
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), r = rand(20, 48);
    const px = LOCATIONS.jammerCenter.pos.x + Math.cos(a) * r, pz = LOCATIONS.jammerCenter.pos.z + Math.sin(a) * r;
    if (!world.terrain.isFloor(px, pz, 4)) continue;
    const py = world.terrain.getHeight(px, pz);
    const roll = Math.random();
    if (roll < 0.4) membranePlant(world, new THREE.Vector3(px, py, pz));
    else if (roll < 0.7) blackGlassTree(world, new THREE.Vector3(px, py, pz), { height: rand(4, 9) });
    else if (roll < 0.88) glowPool(world, new THREE.Vector3(px, py, pz), { radius: rand(1.5, 3) });
    else boneArch(world, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2), { height: rand(5, 7) });
  }

  // --- comms base (with detention block) ---
  const comms = buildCommsBase(world, LOCATIONS.commsPlaza.pos);
  info.terminal = comms.terminal;
  info.cells = comms.cells;
  info.posters.push(...(comms.posters || []));
  info.supplyCaches.push(...(comms.supplyCaches || []));
  info.destructibles.push(...(comms.destructibles || []));

  // --- extraction platform ---
  const extraction = buildExtractionPlatform(world, LOCATIONS.extractionCenter.pos);
  info.extraction = extraction.extraction;
  for (let i = 0; i < 3; i++) {
    const a = rand(0, Math.PI * 2), r = rand(35, 50);
    const px = LOCATIONS.extractionCenter.pos.x + Math.cos(a) * r, pz = LOCATIONS.extractionCenter.pos.z + Math.sin(a) * r;
    if (!world.terrain.isFloor(px, pz, -0.5)) continue;
    const py = world.terrain.getHeight(px, pz);
    placeCover(world, info, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2));
  }

  // --- rock wall dressing: InstancedMesh scatter along canyon walls (no colliders) ---
  {
    const rawSamples = [];
    for (const c of [highC, mainC, trenchC]) collectRockWallSamples(c, rawSamples);
    const pts = [];
    for (const s of rawSamples) {
      const px = s.mx + s.perp.x * s.off, pz = s.mz + s.perp.z * s.off;
      const fd = world.terrain.floorDistance(px, pz);
      if (fd < 1.5) continue; // must be clearly in the rock, not on floor
      const py = world.terrain.getHeight(px, pz);
      pts.push({ x: px, y: py, z: pz, scale: rand(0.5, 2.0) });
      if (pts.length > 420) break;
    }
    buildRockWallInstances(world, pts);
  }

  // --- a handful of utility props scattered near objectives ---
  antennaMast(world, new THREE.Vector3(LOCATIONS.jammerGateSouth.pos.x, world.terrain.getHeight(LOCATIONS.jammerGateSouth.pos.x, LOCATIONS.jammerGateSouth.pos.z), LOCATIONS.jammerGateSouth.pos.z), 0, { height: 8 });
  lightTower(world, new THREE.Vector3(LOCATIONS.dropZoneAlt1.pos.x, world.terrain.getHeight(LOCATIONS.dropZoneAlt1.pos.x, LOCATIONS.dropZoneAlt1.pos.z), LOCATIONS.dropZoneAlt1.pos.z), 0, { color: '#00e5ff' });
  lightTower(world, new THREE.Vector3(LOCATIONS.dropZoneAlt2.pos.x, world.terrain.getHeight(LOCATIONS.dropZoneAlt2.pos.x, LOCATIONS.dropZoneAlt2.pos.z), LOCATIONS.dropZoneAlt2.pos.z), 0, { color: '#00e5ff' });

  world.level = info;
  return info;
}
