// Black Lantern level construction: transit plaza drop zone, Meridian Avenue / skyway / canal routes
// through neon tower blocks, the substation spire, the broadcast compound with its re-education
// block, and the rooftop extraction pad. Returns the same LevelInfo shape as buildMeridian().
import { buildHorizon } from './horizon.js';
import * as THREE from 'three';
import { M } from './terrain.js';
import { buildPylon } from '../models/buildings.js';
import { crate, crateStack, barrier, barrel, ammoCache, container } from '../models/props.js';
import {
  buildTower, buildTowerCluster, hoverWreck, kiosk, planter, trafficBarrier, transitShelter, cableSpool, dumpster,
  neonSign, holoBillboard, streetLamp, buildTransitPlaza, buildSubstation, buildBroadcastTower, buildRooftopPad,
} from '../models/city.js';
import { rand, pick, clamp } from '../core/mathx.js';
import { buildLanternStory } from './encampments.js';
import { dressLantern } from './dressing.js';

const SLOGANS = [
  ['OBEY THE GLOW', 'NULL LEGION CIVIC NOTICE'], ['CURFEW IS KINDNESS', 'REPORT UNLIT WINDOWS'], ['YOUR THOUGHTS ARE LOUD', 'PLEASE LOWER THEM'],
  ['REST. COMPLY. REPEAT.', 'EREBUS COLONY AUTHORITY'], ['ONE CITY, ONE SIGNAL', 'BROADCAST DIVISION'], ['DISSENT DIMS THE LIGHTS', 'LEGION POWER BOARD'],
];
const NEON = ['#00e5ff', '#ff3fd8', '#ffb020'];

function randSign() { return Math.random() < 0.5 ? -1 : 1; }

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
    const t = clamp((d - acc) / (segLens[idx] || 1), 0, 1);
    const pos = new THREE.Vector3().lerpVectors(a, b, t);
    const dir = new THREE.Vector3().subVectors(b, a); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    samples.push({ pos, dir });
    d += rand(stepMin, stepMax);
  }
  return samples;
}

function pushDestructible(info, res) { if (res && res.destructible) info.destructibles.push(res.destructible); }
function pushSupply(info, res) { if (res && res.supplyCache) info.supplyCaches.push(res.supplyCache); }
function pushPoster(info, res) { if (res && res.poster) info.posters.push(res.poster); }

function placeStreetCover(world, info, pos, yaw) {
  const roll = Math.random();
  let res;
  if (roll < 0.22) res = hoverWreck(world, pos, yaw);
  else if (roll < 0.36) res = kiosk(world, pos, yaw);
  else if (roll < 0.5) res = planter(world, pos, yaw);
  else if (roll < 0.64) res = trafficBarrier(world, pos, yaw);
  else if (roll < 0.72) res = dumpster(world, pos, yaw);
  else if (roll < 0.8) res = cableSpool(world, pos, yaw);
  else if (roll < 0.88) res = crateStack(world, pos, yaw);
  else if (roll < 0.94) res = crate(world, pos, yaw);
  else { res = barrel(world, pos, yaw); pushDestructible(info, res); }
  return res;
}

function dressStreet(world, info, corridor) {
  const samples = sampleCorridorWorld(corridor.pts, 11, 18);
  const halfW = corridor.w / 2;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const sides = Math.random() < 0.6 ? [randSign()] : [-1, 1];
    for (const side of sides) {
      const off = rand(halfW * 0.3, halfW * 0.8) * side;
      const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
      if (!world.terrain.isFloor(px, pz, -0.7)) continue;
      placeStreetCover(world, info, new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz), rand(0, Math.PI * 2));
    }
  }
  for (const s of samples) {
    if (Math.random() > 0.12) continue;
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const off = rand(-halfW * 0.3, halfW * 0.3);
    const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
    if (!world.terrain.isFloor(px, pz, -0.7)) continue;
    pushSupply(info, ammoCache(world, new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz), rand(0, Math.PI * 2)));
  }
}

/** Neon signage and lamps along the street edges (posters feed the propaganda side op). */
function dressStreetSigns(world, info, corridor, density = 1) {
  const samples = sampleCorridorWorld(corridor.pts, 26 / density, 40 / density);
  const halfW = corridor.w / 2;
  let i = 0;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    const side = randSign();
    const off = (halfW + 0.9) * side;
    const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
    const fd = world.terrain.floorDistance(px, pz);
    if (fd > 4) continue;
    const py = world.terrain.getHeight(px, pz);
    const yaw = Math.atan2(-perp.x * side, -perp.z * side); // face into the street
    const [text, sub] = pick(SLOGANS);
    if (i++ % 3 === 0) pushPoster(info, holoBillboard(world, new THREE.Vector3(px, py, pz), yaw, { text, sub, color: pick(NEON) }));
    else pushPoster(info, neonSign(world, new THREE.Vector3(px, py, pz), yaw, { text, sub, color: pick(NEON), mount: 'pole' }));
    if (Math.random() < 0.5) { const lx = s.pos.x - perp.x * off * 0.9, lz = s.pos.z - perp.z * off * 0.9; if (world.terrain.floorDistance(lx, lz) < 3) streetLamp(world, new THREE.Vector3(lx, world.terrain.getHeight(lx, lz), lz), { color: pick(NEON) }); }
  }
}

/** Tower blocks along both sides of a street, placed on the raised block plateaus (never on the floor). */
function towersAlong(world, corridor, opts = {}) {
  const samples = sampleCorridorWorld(corridor.pts, 16, 24);
  const halfW = corridor.w / 2;
  let n = 0;
  for (const s of samples) {
    const perp = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    for (const side of [-1, 1]) {
      if (Math.random() > (opts.chance ?? 0.8)) continue;
      const off = (halfW + rand(7, 13)) * side;
      const px = s.pos.x + perp.x * off, pz = s.pos.z + perp.z * off;
      const fd = world.terrain.floorDistance(px, pz);
      if (fd < 5) continue; // must sit clearly inside the block, not on the street
      const py = world.terrain.getHeight(px, pz);
      buildTower(world, new THREE.Vector3(px, py, pz), rand(-0.2, 0.2) + (side > 0 ? 0 : Math.PI), { height: rand(opts.minH ?? 16, opts.maxH ?? 38), width: rand(7, 12), color: pick(NEON), antenna: Math.random() < 0.3 });
      if (++n > (opts.max ?? 60)) return;
    }
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
    trafficBarrier(world, new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz), rand(0, Math.PI * 2));
  }
}

export function buildLantern(world) {
  const map = world.map;
  const FL = map.floor, L = map.locations;
  const info = { locations: L, patrolRoutes: map.patrolRoutes, spawnPoints: map.spawnPoints, jammer: null, terminal: null, cells: null, extraction: null, destructibles: [], supplyCaches: [], posters: [], animated: [] };
  const ground = (x, z) => world.terrain.getHeight(x, z);
  const at = (loc) => new THREE.Vector3(loc.pos.x, ground(loc.pos.x, loc.pos.z), loc.pos.z);

  // --- transit plaza (drop zone) ---
  buildTransitPlaza(world, at(L.dropZone));
  transitShelter(world, M(214, 66).setY(ground(M(214, 66).x, M(214, 66).z)), Math.PI);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const px = L.dropZone.pos.x + Math.cos(a) * 30, pz = L.dropZone.pos.z + Math.sin(a) * 30; if (world.terrain.floorDistance(px, pz) < 4) { if (i % 2 === 0) streetLamp(world, new THREE.Vector3(px, ground(px, pz), pz), { color: pick(NEON), light: true }); else { const [text, sub] = pick(SLOGANS); info.posters.push(holoBillboard(world, new THREE.Vector3(px, ground(px, pz), pz), -a + Math.PI / 2, { text, sub, color: pick(NEON), light: true }).poster); } } }
  transitShelter(world, M(186, 66).setY(ground(M(186, 66).x, M(186, 66).z)), Math.PI);

  // --- the three routes ---
  const mainC = FL.corridors.find((c) => c.name === 'main');
  const highC = FL.corridors.find((c) => c.name === 'high');
  const trenchC = FL.corridors.find((c) => c.name === 'trench');
  for (const c of [mainC, highC, trenchC]) dressStreet(world, info, c);
  dressStreetSigns(world, info, mainC, 2.0); dressStreetSigns(world, info, highC, 1.1); dressStreetSigns(world, info, trenchC, 0.7);
  // lit lamps down Meridian Avenue (within the 26-light budget; the strongest survive the cull)
  for (const smp of sampleCorridorWorld(mainC.pts, 30, 34)) { const perp = new THREE.Vector3(-smp.dir.z, 0, smp.dir.x); for (const side of [-1, 1]) { const px = smp.pos.x + perp.x * (mainC.w / 2 - 1.2) * side, pz = smp.pos.z + perp.z * (mainC.w / 2 - 1.2) * side; if (world.terrain.floorDistance(px, pz) > 2) continue; streetLamp(world, new THREE.Vector3(px, ground(px, pz), pz), { color: side > 0 ? '#00e5ff' : '#ff3fd8', light: true }); } }
  towersAlong(world, mainC, { minH: 20, maxH: 40, max: 34 });
  towersAlong(world, highC, { minH: 14, maxH: 30, max: 24, chance: 0.6 });
  towersAlong(world, trenchC, { minH: 12, maxH: 26, max: 22, chance: 0.6 });

  // --- Lantern Square (junction): ring of cover and a beacon pylon, towers around ---
  {
    const c = FL.circles.find((x) => x.name === 'canyon_junction');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = L.canyonJunction.pos.x + Math.cos(a) * (c.r - 3), pz = L.canyonJunction.pos.z + Math.sin(a) * (c.r - 3);
      placeStreetCover(world, info, new THREE.Vector3(px, ground(px, pz), pz), a + Math.PI / 2);
    }
    buildPylon(world, new THREE.Vector3(L.canyonJunction.pos.x, ground(L.canyonJunction.pos.x, L.canyonJunction.pos.z), L.canyonJunction.pos.z), 11, '#ff3fd8');
    buildTowerCluster(world, at(L.canyonJunction), 8, 46, { avoid: (x, z) => world.terrain.floorDistance(x, z) < 6, minHeight: 22, maxHeight: 42 });
  }

  // --- enemy roads ---
  for (const name of ['west_road', 'east_road', 'sw_road', 'se_road', 'north_gate_w', 'north_gate_e']) { const c = FL.corridors.find((x) => x.name === name); if (c) dressRoad(world, c); }

  // --- substation + signal spire (the "jammer") ---
  const sub = buildSubstation(world, at(L.jammerCenter));
  info.jammer = sub; info.animated.push(sub.animated);
  buildTowerCluster(world, at(L.jammerCenter), 10, 70, { avoid: (x, z) => world.terrain.floorDistance(x, z) < 6, minHeight: 18, maxHeight: 40 });
  for (let i = 0; i < 4; i++) { const a = rand(0, Math.PI * 2), r = rand(18, 40); const px = L.jammerCenter.pos.x + Math.cos(a) * r, pz = L.jammerCenter.pos.z + Math.sin(a) * r; if (world.terrain.isFloor(px, pz, -0.5)) placeStreetCover(world, info, new THREE.Vector3(px, ground(px, pz), pz), rand(0, Math.PI * 2)); }

  // --- broadcast compound (the "comms base") ---
  const bc = buildBroadcastTower(world, at(L.commsPlaza));
  info.terminal = bc.terminal; info.cells = bc.cells;
  info.posters.push(...(bc.posters || [])); info.supplyCaches.push(...(bc.supplyCaches || [])); info.destructibles.push(...(bc.destructibles || []));
  buildTowerCluster(world, at(L.commsPlaza), 12, 95, { avoid: (x, z) => world.terrain.floorDistance(x, z) < 6, minHeight: 24, maxHeight: 46 });

  // --- rooftop pad (extraction) ---
  const pad = buildRooftopPad(world, at(L.extractionCenter));
  info.extraction = pad.extraction;
  buildTowerCluster(world, at(L.extractionCenter), 10, 78, { avoid: (x, z) => world.terrain.floorDistance(x, z) < 6, minHeight: 20, maxHeight: 44 });
  for (let i = 0; i < 4; i++) { const a = rand(0, Math.PI * 2), r = rand(30, 50); const px = L.extractionCenter.pos.x + Math.cos(a) * r, pz = L.extractionCenter.pos.z + Math.sin(a) * r; if (world.terrain.isFloor(px, pz, -0.5)) placeStreetCover(world, info, new THREE.Vector3(px, ground(px, pz), pz), rand(0, Math.PI * 2)); }
  container(world, M(96, 270).setY(ground(M(96, 270).x, M(96, 270).z)), 0.4);

  // --- a few lit lamps near the objectives (point-light budget is culled to 26 anyway) ---
  for (const loc of [L.jammerGateSouth, L.commsGateSouth, L.extractionApproach, L.canyonJunction]) streetLamp(world, at(loc).add(new THREE.Vector3(3, 0, 3)), { color: '#00e5ff', light: true });
  // wider city skyline beyond the playable edges
  for (let i = 0; i < 40; i++) { const mx = rand(10, 390), my = rand(10, 390); const p = M(mx, my); if (world.terrain.floorDistance(p.x, p.z) < 9) continue; buildTower(world, p.setY(ground(p.x, p.z)), rand(0, Math.PI * 2), { height: rand(18, 48), width: rand(8, 14), color: pick(NEON), antenna: Math.random() < 0.25 }); }

  try { buildHorizon(world); } catch (e) { console.warn('[level] horizon failed', e); }
  try { dressLantern(world, info, { hoverWreck, dumpster, cableSpool, trafficBarrier, neonSign, holoBillboard, streetLamp }); } catch (e) { console.warn('[level] dressing failed', e); }
  try { buildLanternStory(world, info); } catch (e) { console.warn('[level] story layer failed', e); }
  world.level = info;
  return info;
}
