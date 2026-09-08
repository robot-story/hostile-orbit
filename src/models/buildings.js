// Structures: drop zone pad, pylons, jammer outpost, comms base, detention, extraction platform.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { crate, crateStack, container, barrier, sandbagWall, lightTower, terminal as terminalProp, posterFrame, billboard, ammoCache, barrel } from './props.js';
import { rand, randInt } from '../core/mathx.js';

const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, seg, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; m.receiveShadow = true; return m; };
const meshOf = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; };
/** yaw (matching the collider/mesh rotation.y convention used by solidBox) that points local +X along world dir (dx,dz). */
const yawAlong = (dx, dz) => Math.atan2(-dz, dx);

/** Add a mesh to world and register a matching box collider (axis-aligned in local yaw). */
export function solidBox(world, parent, center, size, yaw, mat, opts = {}) {
  const m = box(size.x, size.y, size.z, mat);
  m.position.copy(center); m.rotation.y = yaw;
  parent.add(m);
  const c = world.addBox(center, { x: size.x / 2, y: size.y / 2, z: size.z / 2 }, yaw, { mesh: m, ...opts });
  return { mesh: m, collider: c };
}
export function neonStrip(len, thick = 0.08, color = COLORS.cyan, intensity = 2.5) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, thick), Mat.neon(color, intensity));
  return m;
}
export function pointGlow(color, intensity, distance, decay = 2) {
  const l = new THREE.PointLight(color, intensity, distance, decay);
  l.castShadow = false;
  return l;
}

/** Light pylon: tall dark mast with vertical neon tube. */
export function buildPylon(world, pos, height = 9, color = COLORS.cyan) {
  const g = new THREE.Group();
  const base = box(1.4, 0.6, 1.4, Mat.panel(1)); base.position.y = 0.3; g.add(base);
  const mast = box(0.5, height, 0.5, Mat.darkMetal()); mast.position.y = height / 2 + 0.6; g.add(mast);
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.16, height * 0.7, 0.16), Mat.neon(color, 3)); tube.position.set(0.34, height * 0.55 + 0.6, 0); g.add(tube);
  const tube2 = tube.clone(); tube2.position.x = -0.34; g.add(tube2);
  const cap = box(0.9, 0.3, 0.9, Mat.panel(0)); cap.position.y = height + 0.75; g.add(cap);
  const light = pointGlow(color, 14, 26); light.position.y = height * 0.6; g.add(light);
  g.position.copy(pos);
  world.props.add(g);
  world.addBox(new THREE.Vector3(pos.x, pos.y + height / 2, pos.z), { x: 0.35, y: height / 2, z: 0.35 }, 0, { material: 'metal', cover: false, mesh: mast });
  return g;
}

/** Drop zone: circular landing pad with chevron emblem, ring lights, four pylons, crates. */
export function buildDropZone(world, center) {
  const g = new THREE.Group();
  const y = world.terrain.getHeight(center.x, center.z);
  const pad = cyl(16, 17, 0.5, 48, Mat.concrete()); pad.position.set(center.x, y + 0.2, center.z); g.add(pad);
  world.addCyl(new THREE.Vector3(center.x, y + 0.2, center.z), 16.5, 0.5, { material: 'concrete', cover: false, blocksNav: false });
  // ring lights
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.25), Mat.neon(COLORS.cyan, 2.5));
    l.position.set(center.x + Math.cos(a) * 15.2, y + 0.48, center.z + Math.sin(a) * 15.2); l.rotation.y = -a; g.add(l);
  }
  const inner = new THREE.Mesh(new THREE.RingGeometry(9.6, 10, 64), Mat.neonBasic(COLORS.cyan)); inner.rotation.x = -Math.PI / 2; inner.position.set(center.x, y + 0.47, center.z); g.add(inner);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), Mat.emblemDecal('#cfd6da')); emblem.rotation.x = -Math.PI / 2; emblem.position.set(center.x, y + 0.465, center.z); emblem.receiveShadow = true; g.add(emblem);
  world.props.add(g);
  for (const [dx, dz] of [[-20, -14], [20, -14], [-20, 14], [20, 14]]) {
    const p = new THREE.Vector3(center.x + dx, world.terrain.getHeight(center.x + dx, center.z + dz), center.z + dz);
    buildPylon(world, p, 9);
  }
  return g;
}

/** Straight fortification wall segment between two world XZ points (y resolved from terrain). */
export function buildWallSegment(world, start, end, opts = {}) {
  const height = opts.height ?? 2.6, thick = opts.thick ?? 0.4;
  const dx = end.x - start.x, dz = end.z - start.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return null;
  const yaw = yawAlong(dx, dz);
  const midX = (start.x + end.x) / 2, midZ = (start.z + end.z) / 2;
  const y = world.terrain.getHeight(midX, midZ);
  const center = new THREE.Vector3(midX, y + height / 2, midZ);
  const mat = opts.mat || Mat.panel(2);
  const { mesh: m, collider } = solidBox(world, world.props, center, { x: len, y: height, z: thick }, yaw, mat, { material: opts.material || 'concrete' });
  const stripe = box(len, 0.14, thick + 0.02, Mat.hazard()); stripe.position.set(midX, y + 0.08, midZ); stripe.rotation.y = yaw; world.props.add(stripe);
  const topStrip = cyl(0.04, 0.04, len * 0.92, 4, Mat.neon(opts.neonColor || COLORS.cyan, 2)); topStrip.rotation.z = Math.PI / 2; topStrip.rotation.y = yaw; topStrip.position.set(midX, y + height - 0.15, midZ); topStrip.castShadow = false; world.props.add(topStrip);
  return { mesh: m, collider, start: start.clone(), end: end.clone(), height };
}

/** A gate opening: two lit pillars + overhead beam marking a gap left in a wall ring. No collider blocks the opening. */
export function buildGate(world, center, yaw, width = 6, opts = {}) {
  const g = new THREE.Group();
  const along = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const h = opts.height ?? 3.6;
  const color = opts.color || COLORS.cyan;
  for (const s of [-1, 1]) {
    const px = center.x + along.x * (width / 2) * s, pz = center.z + along.z * (width / 2) * s;
    const y = world.terrain.getHeight(px, pz);
    const pillar = box(0.6, h, 0.6, Mat.panel(1)); pillar.position.set(px, y + h / 2, pz); world.props.add(pillar); g.add(pillar);
    world.addBox(new THREE.Vector3(px, y + h / 2, pz), { x: 0.3, y: h / 2, z: 0.3 }, 0, { material: 'metal', mesh: pillar });
    const strip = cyl(0.05, 0.05, h * 0.75, 6, Mat.neon(color, 2.4)); strip.position.set(px, y + h * 0.55, pz); strip.castShadow = false; world.props.add(strip);
    const beacon = pointGlow(color, 5, 9); beacon.position.set(px, y + h + 0.3, pz); world.props.add(beacon);
  }
  const midY = world.terrain.getHeight(center.x, center.z);
  const beam = box(width + 0.8, 0.4, 0.5, Mat.darkMetal()); beam.position.set(center.x, midY + h + 0.2, center.z); beam.rotation.y = yaw; world.props.add(beam);
  return { group: g };
}

/** Elevated watchtower: 4 legs + walkable deck + railing + a light. */
export function buildWatchtower(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const h = opts.height ?? 5;
  const legOffsets = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const legColliders = [];
  for (const [ox, oz] of legOffsets) {
    const lx = position.x + ox, lz = position.z + oz;
    const ly = world.terrain.getHeight(lx, lz);
    const leg = box(0.25, h, 0.25, Mat.darkMetal()); leg.position.set(lx, ly + h / 2, lz); world.props.add(leg);
    legColliders.push(world.addBox(new THREE.Vector3(lx, ly + h / 2, lz), { x: 0.15, y: h / 2, z: 0.15 }, 0, { material: 'metal', cover: false, mesh: leg }));
  }
  const y0 = world.terrain.getHeight(position.x, position.z);
  const deckY = y0 + h;
  const deck = box(2.8, 0.3, 2.8, Mat.panel(1)); deck.position.set(position.x, deckY, position.z); world.props.add(deck);
  const deckCollider = world.addBox(new THREE.Vector3(position.x, deckY, position.z), { x: 1.4, y: 0.15, z: 1.4 }, 0, { material: 'metal', walkableTop: true, mesh: deck });
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const rail = box(2.8, 0.7, 0.06, Mat.darkMetal(), false);
    rail.position.set(position.x + Math.sin(a) * 1.4, deckY + 0.5, position.z + Math.cos(a) * 1.4);
    rail.rotation.y = a; world.props.add(rail);
  }
  const light = pointGlow(opts.color || COLORS.redOrange, 6, 14); light.position.set(position.x, deckY + 1.2, position.z); world.props.add(light);
  g.position.copy(position);
  return { group: g, deckCollider, legColliders, deckPosition: new THREE.Vector3(position.x, deckY + 0.15, position.z) };
}

/**
 * Jammer outpost: concentric fortified compound around `center` (world Vector3, y ignored — resolved
 * from terrain). Outer ring wall with 2 gates, inner ring of barriers/crates, two watchtowers, and a
 * ~18m central jammer tower with 3 pulsing red-orange emitter rings + dish, registered for gameplay
 * destruction via the returned collider/emitters/chargePoints.
 */
export function buildJammerOutpost(world, center) {
  const g = new THREE.Group();
  const y = world.terrain.getHeight(center.x, center.z);
  const outerR = 34, innerR = 15;
  const gateAngles = [0.35, Math.PI + 0.55];
  const gateWidth = 7;
  const segs = 22;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, amid = (a0 + a1) / 2;
    let skip = false;
    for (const ga of gateAngles) { const d = Math.abs(((amid - ga + Math.PI) % (Math.PI * 2)) - Math.PI); if (d < (gateWidth / outerR)) skip = true; }
    if (skip) continue;
    const p0 = new THREE.Vector3(center.x + Math.cos(a0) * outerR, 0, center.z + Math.sin(a0) * outerR);
    const p1 = new THREE.Vector3(center.x + Math.cos(a1) * outerR, 0, center.z + Math.sin(a1) * outerR);
    buildWallSegment(world, p0, p1, { height: 2.6, material: 'metal', neonColor: COLORS.redOrange });
  }
  for (const ga of gateAngles) {
    const gp = new THREE.Vector3(center.x + Math.cos(ga) * outerR, 0, center.z + Math.sin(ga) * outerR);
    buildGate(world, gp, ga, gateWidth, { color: COLORS.redOrange });
  }
  const innerCount = 12;
  for (let i = 0; i < innerCount; i++) {
    const a = (i / innerCount) * Math.PI * 2;
    const px = center.x + Math.cos(a) * innerR, pz = center.z + Math.sin(a) * innerR;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    if (Math.random() < 0.5) barrier(world, p, a + Math.PI / 2);
    else crate(world, p, Math.random() * Math.PI * 2);
  }
  const towers = [];
  for (const a of [gateAngles[0] + 0.9, gateAngles[1] - 0.9]) {
    const px = center.x + Math.cos(a) * (outerR - 3), pz = center.z + Math.sin(a) * (outerR - 3);
    towers.push(buildWatchtower(world, new THREE.Vector3(px, 0, pz), 0, { color: COLORS.redOrange }));
  }
  // central jammer tower
  const towerHeight = 18;
  const mast = cyl(0.9, 1.3, towerHeight, 12, Mat.darkMetal()); mast.position.set(center.x, y + towerHeight / 2, center.z); world.props.add(mast);
  const collider = world.addCyl(new THREE.Vector3(center.x, y + towerHeight / 2, center.z), 1.3, towerHeight, { material: 'metal', mesh: mast });
  const emitters = [];
  for (let i = 0; i < 3; i++) {
    const ringY = y + 4 + i * 4.5;
    const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.redOrange, emissive: COLORS.redOrange, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.3 });
    const ring = meshOf(new THREE.TorusGeometry(2.15 - i * 0.15, 0.12, 8, 20), ringMat, false);
    ring.rotation.x = Math.PI / 2; ring.position.set(center.x, ringY, center.z);
    world.props.add(ring);
    emitters.push(ring);
  }
  const dish = cyl(2.2, 0.3, 1.1, 12, Mat.panel(0));
  dish.position.set(center.x, y + towerHeight + 0.6, center.z); dish.rotation.x = 1.15; world.props.add(dish);
  const warnLight = pointGlow(COLORS.red, 12, 22); warnLight.position.set(center.x, y + towerHeight, center.z); world.props.add(warnLight);
  const chargePoints = [
    new THREE.Vector3(center.x + 2.4, y + 1.2, center.z),
    new THREE.Vector3(center.x - 2.4, y + 1.2, center.z),
  ];
  const anim = { update: () => { const t = performance.now() * 0.001; for (let i = 0; i < emitters.length; i++) emitters[i].material.emissiveIntensity = 1.6 + Math.sin(t * 2 + i * 1.3) * 1.0; } };
  world.addUpdatable(anim);
  world.props.add(g);
  return { group: g, collider, emitters, dish, position: new THREE.Vector3(center.x, y, center.z), chargePoints, towers, animated: anim };
}

/**
 * Comms base: raised main plaza reached by 3 stair steps, central command building with an interior
 * terminal room, a 30m comms tower, perimeter walls with a south main gate + north gate, an east-side
 * detention block with two cells, and a dressed courtyard. Returns { group, terminal, cells, extraction:undefined, ... }.
 */
export function buildCommsBase(world, center) {
  const g = new THREE.Group();
  const y0 = world.terrain.getHeight(center.x, center.z);
  const halfX = 80, halfZ = 50;
  const v = (dx, dz) => new THREE.Vector3(center.x + dx, 0, center.z + dz);
  const gateW = 6;

  // perimeter walls with south (+z) and north (-z) gates
  buildWallSegment(world, v(-halfX, halfZ), v(-gateW / 2, halfZ), { height: 3, material: 'concrete', neonColor: COLORS.cyan });
  buildWallSegment(world, v(gateW / 2, halfZ), v(halfX, halfZ), { height: 3, material: 'concrete', neonColor: COLORS.cyan });
  buildGate(world, v(0, halfZ), Math.PI / 2, gateW, { color: COLORS.cyan, height: 4 });
  buildWallSegment(world, v(-halfX, -halfZ), v(-gateW / 2, -halfZ), { height: 3, material: 'concrete', neonColor: COLORS.cyan });
  buildWallSegment(world, v(gateW / 2, -halfZ), v(halfX, -halfZ), { height: 3, material: 'concrete', neonColor: COLORS.cyan });
  buildGate(world, v(0, -halfZ), Math.PI / 2, gateW, { color: COLORS.cyan, height: 4 });
  buildWallSegment(world, v(-halfX, -halfZ), v(-halfX, halfZ), { height: 3, material: 'concrete', neonColor: COLORS.cyan });
  buildWallSegment(world, v(halfX, -halfZ), v(halfX, halfZ), { height: 3, material: 'concrete', neonColor: COLORS.cyan });

  // raised plaza (walkable) + 3-step stair on the south (gate) side
  const plazaHalfX = 15, plazaHalfZ = 12;
  const plazaY = y0 + 1.5;
  const plazaMesh = box(plazaHalfX * 2, 0.3, plazaHalfZ * 2, Mat.concrete());
  plazaMesh.position.set(center.x, plazaY - 0.15, center.z); world.props.add(plazaMesh);
  const plazaCollider = world.addBox(new THREE.Vector3(center.x, plazaY - 0.15, center.z), { x: plazaHalfX, y: 0.15, z: plazaHalfZ }, 0, { material: 'concrete', walkableTop: true, mesh: plazaMesh });
  for (let i = 0; i < 3; i++) {
    const stepZ = plazaHalfZ + 0.6 + (2 - i) * 1.2;
    const stepTop = 0.5 * (i + 1);
    const step = box(6, 0.5, 1.2, Mat.concrete());
    step.position.set(center.x, y0 + stepTop - 0.25, center.z + stepZ); world.props.add(step);
    world.addBox(new THREE.Vector3(center.x, y0 + stepTop - 0.25, center.z + stepZ), { x: 3, y: 0.25, z: 0.6 }, 0, { material: 'concrete', walkableTop: true, mesh: step });
  }

  // central command building: 12 x 6(h) x 8, south doorway 3m wide
  const bldgW = 12, bldgH = 6, bldgD = 8, wallT = 0.4, doorW = 3;
  const bldgCenter = new THREE.Vector3(center.x, 0, center.z - 18);
  const by = world.terrain.getHeight(bldgCenter.x, bldgCenter.z);
  const segW = (bldgW - doorW) / 2;
  const southLeft = box(segW, bldgH, wallT, Mat.panel(1)); southLeft.position.set(bldgCenter.x - doorW / 2 - segW / 2, by + bldgH / 2, bldgCenter.z + bldgD / 2); world.props.add(southLeft);
  world.addBox(southLeft.position.clone(), { x: segW / 2, y: bldgH / 2, z: wallT / 2 }, 0, { material: 'metal', mesh: southLeft });
  const southRight = box(segW, bldgH, wallT, Mat.panel(1)); southRight.position.set(bldgCenter.x + doorW / 2 + segW / 2, by + bldgH / 2, bldgCenter.z + bldgD / 2); world.props.add(southRight);
  world.addBox(southRight.position.clone(), { x: segW / 2, y: bldgH / 2, z: wallT / 2 }, 0, { material: 'metal', mesh: southRight });
  const northWall = box(bldgW, bldgH, wallT, Mat.panel(1)); northWall.position.set(bldgCenter.x, by + bldgH / 2, bldgCenter.z - bldgD / 2); world.props.add(northWall);
  world.addBox(northWall.position.clone(), { x: bldgW / 2, y: bldgH / 2, z: wallT / 2 }, 0, { material: 'metal', mesh: northWall });
  const eastWall = box(wallT, bldgH, bldgD, Mat.panel(1)); eastWall.position.set(bldgCenter.x + bldgW / 2, by + bldgH / 2, bldgCenter.z); world.props.add(eastWall);
  world.addBox(eastWall.position.clone(), { x: wallT / 2, y: bldgH / 2, z: bldgD / 2 }, 0, { material: 'metal', mesh: eastWall });
  const westWall = box(wallT, bldgH, bldgD, Mat.panel(1)); westWall.position.set(bldgCenter.x - bldgW / 2, by + bldgH / 2, bldgCenter.z); world.props.add(westWall);
  world.addBox(westWall.position.clone(), { x: wallT / 2, y: bldgH / 2, z: bldgD / 2 }, 0, { material: 'metal', mesh: westWall });
  const roof = box(bldgW, 0.3, bldgD, Mat.panel(2)); roof.position.set(bldgCenter.x, by + bldgH + 0.15, bldgCenter.z); world.props.add(roof);
  const doorStrip = cyl(0.05, 0.05, bldgH * 0.7, 6, Mat.neon(COLORS.cyan, 2)); doorStrip.castShadow = false;
  doorStrip.position.set(bldgCenter.x - doorW / 2, by + bldgH * 0.5, bldgCenter.z + bldgD / 2); world.props.add(doorStrip);
  const doorStrip2 = doorStrip.clone(); doorStrip2.position.x = bldgCenter.x + doorW / 2; world.props.add(doorStrip2);

  // interior terminal + holographic screen
  const termPos = new THREE.Vector3(bldgCenter.x, by, bldgCenter.z - bldgD / 2 + 1.6);
  const term = terminalProp(world, termPos, Math.PI, { variant: 1 });
  const holo = meshOf(new THREE.PlaneGeometry(2.2, 1.6), Mat.hologram(COLORS.cyan), false);
  holo.position.set(bldgCenter.x, by + 1.9, bldgCenter.z - bldgD / 2 + 0.25); holo.rotation.y = Math.PI; world.props.add(holo);
  const info = { group: g, terminal: { position: termPos, collider: term.collider, mesh: term.mesh } };

  // 30m comms tower with dishes and cyan/red strips
  const towerPos = new THREE.Vector3(bldgCenter.x + 14, 0, bldgCenter.z - 4);
  const ty = world.terrain.getHeight(towerPos.x, towerPos.z);
  const towerH = 30;
  const tmast = cyl(0.5, 0.9, towerH, 10, Mat.darkMetal()); tmast.position.set(towerPos.x, ty + towerH / 2, towerPos.z); world.props.add(tmast);
  world.addCyl(new THREE.Vector3(towerPos.x, ty + towerH / 2, towerPos.z), 0.9, towerH, { material: 'metal', mesh: tmast });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const strip = cyl(0.04, 0.04, towerH * 0.85, 4, Mat.neon(i % 2 ? COLORS.cyan : COLORS.redOrange, 2.2)); strip.castShadow = false;
    strip.position.set(towerPos.x + Math.cos(a) * 0.95, ty + towerH * 0.5, towerPos.z + Math.sin(a) * 0.95);
    world.props.add(strip);
  }
  for (const [dy, rotX] of [[towerH * 0.68, 0.5], [towerH * 0.88, -0.35]]) {
    const dish = cyl(1.5, 0.15, 0.9, 14, Mat.panel(0)); dish.position.set(towerPos.x, ty + dy, towerPos.z); dish.rotation.x = rotX; world.props.add(dish);
  }
  const towerLight = pointGlow(COLORS.red, 8, 20); towerLight.position.set(towerPos.x, ty + towerH, towerPos.z); world.props.add(towerLight);
  info.tower = { position: new THREE.Vector3(towerPos.x, ty, towerPos.z), height: towerH };

  // signage
  billboard(world, v(-8, halfZ - 6), Math.PI, { slogan: 'MERIDIAN COMMS ARRAY B-07', sub: 'RESTRICTED ACCESS', accent: COLORS.cyan });
  posterFrame(world, new THREE.Vector3(bldgCenter.x + bldgW / 2 + 0.05, by + 1.6, bldgCenter.z), Math.PI / 2, { slogan: 'K4 STRENGTH THROUGH A HIGHER ORBIT', sub: 'MERIDIAN COMMONWEALTH', accent: COLORS.redOrange });

  // detention block on the east side, two cells with force-field doors
  const detCenter = v(72, -16);
  const dy0 = world.terrain.getHeight(detCenter.x, detCenter.z);
  const detW = 14, detH = 3, detD = 8;
  const detBody = box(detW, detH, detD, Mat.panel(3)); detBody.position.set(detCenter.x, dy0 + detH / 2, detCenter.z); world.props.add(detBody);
  world.addBox(detBody.position.clone(), { x: detW / 2, y: detH / 2, z: detD / 2 }, 0, { material: 'concrete', mesh: detBody });
  const cells = [];
  for (const side of [-1, 1]) {
    const cellX = detCenter.x + side * 3.4;
    const cellPos = new THREE.Vector3(cellX, dy0, detCenter.z + detD / 2 - 1.8);
    const doorMesh = box(2.2, 2.2, 0.06, Mat.glowAdditive(COLORS.red, 0.35), false);
    doorMesh.position.set(cellX, dy0 + 1.1, detCenter.z + detD / 2 + 0.01);
    world.props.add(doorMesh);
    const consolePosition = new THREE.Vector3(cellX + side * 0.9, dy0, detCenter.z + detD / 2 + 0.7);
    terminalProp(world, consolePosition, Math.PI, { variant: 3 });
    cells.push({ position: cellPos, doorMesh, consolePosition });
  }
  info.cells = cells;

  // courtyard dressing: crates, containers, barriers, terminals, posters
  const posters = [];
  const supplyCaches = [];
  const destructibles = [];
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * (halfX - 22);
    const px = center.x + Math.cos(a) * r, pz = center.z + Math.sin(a) * r;
    if (Math.abs(px - bldgCenter.x) < 8 && Math.abs(pz - bldgCenter.z) < 6) continue;
    if (Math.abs(px - detCenter.x) < 9 && Math.abs(pz - detCenter.z) < 6) continue;
    if (Math.abs(px - center.x) < plazaHalfX + 1 && Math.abs(pz - center.z) < plazaHalfZ + 1) continue;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    const roll = Math.random();
    if (roll < 0.2) crate(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.35) container(world, p, Math.random() * Math.PI * 2, { postersOut: posters });
    else if (roll < 0.53) barrier(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.64) crateStack(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.75) sandbagWall(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.85) posterFrame(world, p, Math.random() * Math.PI * 2, { postersOut: posters });
    else if (roll < 0.93) { const r2 = ammoCache(world, p, Math.random() * Math.PI * 2); supplyCaches.push(r2.supplyCache); }
    else { const r2 = barrel(world, p, Math.random() * Math.PI * 2); destructibles.push(r2.destructible); }
  }
  info.posters = posters;
  info.supplyCaches = supplyCaches;
  info.destructibles = destructibles;
  world.props.add(g);
  return info;
}

/**
 * Extraction platform: raised hex deck (walkable, non-blocking to nav so enemies/allies can cross),
 * cyan chevron emblem, 6 light pylons, a perimeter wall with 3 openings, floodlight towers, containers.
 */
export function buildExtractionPlatform(world, center) {
  const g = new THREE.Group();
  const y = world.terrain.getHeight(center.x, center.z);
  const R = 22;
  const deck = meshOf(new THREE.CylinderGeometry(R, R, 0.6, 6), Mat.concrete());
  deck.position.set(center.x, y + 0.3, center.z); deck.rotation.y = Math.PI / 6; world.props.add(deck);
  const collider = world.addCyl(new THREE.Vector3(center.x, y + 0.3, center.z), R, 0.6, { material: 'concrete', walkableTop: true, blocksNav: false, mesh: deck });
  const emblem = meshOf(new THREE.PlaneGeometry(14, 14), Mat.emblemDecal('#00e5ff'), false);
  emblem.rotation.x = -Math.PI / 2; emblem.position.set(center.x, y + 0.61, center.z); world.props.add(emblem);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = center.x + Math.cos(a) * (R + 3), pz = center.z + Math.sin(a) * (R + 3);
    buildPylon(world, new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz), 9, COLORS.cyan);
  }
  const wallR = R + 8;
  const openings = [0, 2.1, 4.2];
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, amid = (a0 + a1) / 2;
    let skip = false;
    for (const oa of openings) { const d = Math.abs(((amid - oa + Math.PI) % (Math.PI * 2)) - Math.PI); if (d < (6 / wallR)) skip = true; }
    if (skip) continue;
    const p0 = new THREE.Vector3(center.x + Math.cos(a0) * wallR, 0, center.z + Math.sin(a0) * wallR);
    const p1 = new THREE.Vector3(center.x + Math.cos(a1) * wallR, 0, center.z + Math.sin(a1) * wallR);
    buildWallSegment(world, p0, p1, { height: 2.4, material: 'concrete', neonColor: COLORS.cyan });
  }
  for (const oa of openings) {
    const px = center.x + Math.cos(oa) * (wallR + 2.5), pz = center.z + Math.sin(oa) * (wallR + 2.5);
    lightTower(world, new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz), 0, { color: COLORS.cyan });
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2, r = wallR - 4 - Math.random() * 6;
    const px = center.x + Math.cos(a) * r, pz = center.z + Math.sin(a) * r;
    container(world, new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz), Math.random() * Math.PI * 2);
  }
  world.props.add(g);
  return { group: g, extraction: { center: new THREE.Vector3(center.x, y, center.z), radius: R } };
}
