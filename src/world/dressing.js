// Curated set dressing: hand-authored vignettes that tell the story of each map, layered on top of the
// procedural corridor scatter. Everything here is static (merged by the merge pass) except barrels/posters
// which gameplay mutates. Helpers: ground-conforming decals (scorch, tyre tracks), cable runs, and the
// vignette functions themselves. All positions come from map coordinates via M() so they land on the floor.
import * as THREE from 'three';
import { M } from './terrain.js';
import { Mat, COLORS } from '../render/materials.js';
import {
  crate, crateStack, container, barrier, sandbagWall, wreckedTransport, wreckedTruck, barrel, ammoCache, lightTower,
  billboard, posterFrame, antennaMast, rockCluster,
} from '../models/props.js';
import { buildWallSegment, buildGate, buildWatchtower, buildPylon } from '../models/buildings.js';
import { blackGlassTree, glowPool, boneArch, sporeField, membranePlant } from '../models/alien.js';
import { rand, pick } from '../core/mathx.js';
import { giantHolo, skyTether } from '../models/city.js';

// ---------------------------------------------------------------- shared decal materials (cached, batch-friendly)
let _scorchTex = null, _trackTex = null;
function scorchTexture() {
  if (_scorchTex) return _scorchTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(8,6,6,0.95)'); g.addColorStop(0.45, 'rgba(20,12,10,0.8)'); g.addColorStop(0.75, 'rgba(40,20,14,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  // cracked glow ring (alien energy released by the strike)
  ctx.strokeStyle = 'rgba(155,77,255,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([6, 9]); ctx.beginPath(); ctx.arc(128, 128, 70, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.5})`; const a = Math.random() * Math.PI * 2, r = Math.random() * 110; ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + Math.random() * 5, 2 + Math.random() * 5); }
  _scorchTex = new THREE.CanvasTexture(c); _scorchTex.colorSpace = THREE.SRGBColorSpace; return _scorchTex;
}
function trackTexture() {
  if (_trackTex) return _trackTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 32);
  for (const y of [5, 23]) { for (let x = 0; x < 128; x += 6) { ctx.fillStyle = `rgba(30,18,12,${0.35 + Math.random() * 0.3})`; ctx.fillRect(x, y, 4, 5); } }
  _trackTex = new THREE.CanvasTexture(c); _trackTex.wrapS = THREE.RepeatWrapping; _trackTex.colorSpace = THREE.SRGBColorSpace; return _trackTex;
}
let _scorchMat = null, _trackMat = null;
const scorchMat = () => _scorchMat || (_scorchMat = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
const trackMat = () => _trackMat || (_trackMat = new THREE.MeshBasicMaterial({ map: trackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));

/** Ground-conforming scorch mark (old orbital strike / crash burn). */
export function scorchDecal(world, pos, radius = 3, opts = {}) {
  const seg = 6; const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = pos.x + p.getX(i), z = pos.z + p.getZ(i); p.setXYZ(i, p.getX(i), world.terrain.getHeight(x, z) - pos.y + 0.04, p.getZ(i)); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, scorchMat()); m.position.set(pos.x, pos.y, pos.z); m.rotation.y = opts.yaw || rand(0, Math.PI * 2); m.renderOrder = 1; m.receiveShadow = false;
  world.props.add(m);
  if (opts.rubble !== false) rockCluster(world, new THREE.Vector3(pos.x + rand(-1, 1) * radius * 0.7, pos.y, pos.z + rand(-1, 1) * radius * 0.7), rand(0, 6.28), { count: 3 });
  return m;
}

/** Tyre tracks / painted lane: a ribbon following the ground between map points. */
export function groundStrip(world, pts, width = 2.2, opts = {}) {
  const wp = pts.map(([mx, my]) => M(mx, my));
  const verts = [], uvs = [], idx = []; let dist = 0;
  for (let i = 0; i < wp.length; i++) {
    const a = wp[Math.max(0, i - 1)], b = wp[Math.min(wp.length - 1, i + 1)];
    const dir = new THREE.Vector3().subVectors(b, a).normalize(); const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    if (i > 0) dist += wp[i].distanceTo(wp[i - 1]);
    for (const side of [-1, 1]) { const x = wp[i].x + perp.x * width * 0.5 * side, z = wp[i].z + perp.z * width * 0.5 * side; verts.push(x, world.terrain.getHeight(x, z) + 0.035, z); uvs.push(dist / (width * 2.4), side > 0 ? 1 : 0); }
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, opts.material || trackMat()); m.renderOrder = 1; world.props.add(m); return m;
}

/** Sagging cable between two world points (power/comms runs). */
export function cableRun(world, a, b, opts = {}) {
  const sag = opts.sag ?? Math.max(0.6, a.distanceTo(b) * 0.08);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const geo = new THREE.TubeGeometry(curve, 14, opts.radius || 0.05, 6, false);
  const m = new THREE.Mesh(geo, opts.neon ? Mat.neon(opts.neon, 1.2) : Mat.darkMetal()); m.castShadow = false; world.props.add(m); return m;
}

// ---------------------------------------------------------------- helpers
const onFloor = (world, x, z, margin = -0.6) => world.terrain.isFloor(x, z, margin);
function at(world, mx, my) { const p = M(mx, my); p.y = world.terrain.getHeight(p.x, p.z); return p; }
function facing(fromMap, toMap) { const a = M(...fromMap), b = M(...toMap); return Math.atan2(-(b.x - a.x), -(b.z - a.z)); }
function pushRes(info, res) { if (!res) return; if (res.destructible) info.destructibles.push(res.destructible); if (res.supplyCache) info.supplyCaches.push(res.supplyCache); if (res.poster) info.posters.push(res.poster); if (res.posters) info.posters.push(...res.posters); }

/** A Commonwealth frigate that did not make orbit: a 70 m hull ploughed into the canyon rim, still lit. */
export function crashedFrigate(world, pos, yaw = 0) {
  const g = new THREE.Group();
  const hullMat = Mat.panel(2), dark = Mat.darkMetal();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(70, 9, 13), hullMat); hull.position.set(0, 4, 0); g.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(6.5, 16, 6), hullMat); nose.rotation.z = -Math.PI / 2; nose.position.set(43, 4, 0); g.add(nose);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 8), dark); bridge.position.set(-14, 11, 0); g.add(bridge);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 1.2), dark); fin.position.set(-28, 12, 0); fin.rotation.z = 0.3; g.add(fin);
  for (const zz of [-4.5, 4.5]) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 12, 12), dark); eng.rotation.z = Math.PI / 2; eng.position.set(-38, 3, zz); g.add(eng); const glow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), Mat.neon('#ff7a1a', 0.8)); glow.rotation.y = -Math.PI / 2; glow.position.set(-44.2, 3, zz); g.add(glow); }
  for (let i = 0; i < 6; i++) { const strip = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 0.25), Mat.neon('#00e5ff', 1.4)); strip.position.set(-30 + i * 12, 8.7, 6.7); g.add(strip); const s2 = strip.clone(); s2.position.z = -6.7; g.add(s2); }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 26), hullMat); wing.position.set(10, 1, 14); wing.rotation.x = 0.35; g.add(wing);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.copy(pos); g.rotation.set(-0.12, yaw, 0.22); // ploughed in nose-down, listing
  world.props.add(g);
  world.addBox(new THREE.Vector3(pos.x, pos.y + 5, pos.z), { x: 36, y: 6, z: 8 }, yaw, { material: 'metal', cover: true });
  for (let i = 0; i < 5; i++) { const sx = pos.x + Math.cos(yaw) * (30 + i * 10) + rand(-6, 6), sz = pos.z - Math.sin(yaw) * (30 + i * 10) + rand(-6, 6); scorchDecal(world, new THREE.Vector3(sx, world.terrain.getHeight(sx, sz), sz), rand(2.5, 4.5)); }
  return g;
}

/** Alien bone cathedral: ribs the size of buildings arching over a route. */
export function boneCathedral(world, pts, opts = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = M(...pts[i]), b = M(...pts[i + 1]); const n = Math.max(1, Math.round(a.distanceTo(b) / (opts.spacing || 26)));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; const p = a.clone().lerp(b, t); p.y = world.terrain.getHeight(p.x, p.z); const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)) + Math.PI / 2; boneArch(world, p, yaw, { height: rand(opts.minH || 16, opts.maxH || 24) }); }
  }
}

/** Raised firing platform: steel deck on legs with a stair run, low rails and an edge light. Deck and steps are
 *  walkable colliders (0.5 m rises fit the 0.55 m step height), so it is a real vantage point, not set dressing. */
export function platform(world, pos, opts = {}) {
  const w = opts.w || 8, d = opts.d || 6, h = opts.h || 2.4, yaw = opts.yaw || 0, color = opts.color || COLORS.cyan;
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = yaw; g.userData.noMerge = false;
  const deckMat = Mat.panel(1), dark = Mat.darkMetal();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), deckMat); deck.position.y = h - 0.15; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), dark); leg.position.set(sx * (w / 2 - 0.3), h / 2 - 0.15, sz * (d / 2 - 0.3)); leg.castShadow = true; g.add(leg); const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.9, 0.08), dark); brace.position.set(sx * (w / 2 - 0.3), h / 2 - 0.15, sz * (d / 2 - 0.3) * 0.4); brace.rotation.x = sz * 0.5; g.add(brace); }
  // rails on three sides (the stair side stays open), neon edge strip under the deck lip
  for (const side of [[0, -1, w], [0, 1, w], [-1, 0, d]]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(side[2] - 0.2, 0.05, 0.05), dark); rail.position.set(side[0] * (w / 2 - 0.05), h + 0.95, side[1] * (d / 2 - 0.05)); if (side[0]) rail.rotation.y = Math.PI / 2; g.add(rail); for (let k = -1; k <= 1; k++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), dark); post.position.set(side[0] ? side[0] * (w / 2 - 0.05) : k * (w / 2 - 0.4), h + 0.5, side[1] ? side[1] * (d / 2 - 0.05) : k * (d / 2 - 0.4)); g.add(post); } }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.05), Mat.neon(color, 1.6)); lip.position.set(0, h - 0.32, d / 2 + 0.02); lip.castShadow = false; g.add(lip);
  const lip2 = lip.clone(); lip2.position.z = -d / 2 - 0.02; g.add(lip2);
  world.props.add(g);
  const c = Math.cos(yaw), sn = Math.sin(yaw); const wp = (lx, lz) => new THREE.Vector3(pos.x + lx * c + lz * sn, 0, pos.z - lx * sn + lz * c);
  const colliders = [world.addBox(wp(0, 0).setY(pos.y + h - 0.15), { x: w / 2, y: 0.15, z: d / 2 }, yaw, { material: 'metal', walkableTop: true, mesh: deck })];
  // stair run off the +x side: rises of 0.4 (the step limit is 0.55 and the ground under the run can sit a few cm low), runs of 0.6
  const steps = Math.ceil(h / 0.4);
  for (let i = 0; i < steps; i++) { const top = Math.min(h, (i + 1) * 0.4); const lx = w / 2 + 0.3 + (steps - 1 - i) * 0.6; const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, top + 0.12, 2.2), i % 2 ? deckMat : dark); step.position.set(lx, top / 2 - 0.06, 0); step.castShadow = true; step.receiveShadow = true; g.add(step); colliders.push(world.addBox(wp(lx, 0).setY(pos.y + top / 2 - 0.06), { x: 0.3, y: top / 2 + 0.06, z: 1.1 }, yaw, { material: 'metal', walkableTop: true, mesh: step })); }
  return { group: g, colliders };
}

/** Grind rail: a tube along a curve on posts, registered with the world so a rolled frame can ride it. */
export function grindRail(world, mapPts, opts = {}) {
  const h = opts.height ?? 1.4, color = opts.color || COLORS.cyan;
  const pts = mapPts.map(([mx, my, dy]) => { const p = M(mx, my); p.y = world.terrain.getHeight(p.x, p.z) + h + (dy || 0); return p; });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const length = curve.getLength(); const samples = curve.getSpacedPoints(Math.max(8, Math.round(length / 1.2)));
  const g = new THREE.Group(); g.userData.noMerge = true;
  const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, Math.round(length / 0.8)), 0.07, 8, false), new THREE.MeshStandardMaterial({ color: '#c8ced8', roughness: 0.35, metalness: 0.9 })); rail.castShadow = true; g.add(rail);
  const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, Math.round(length / 0.8)), 0.022, 6, false), Mat.neon(color, 1.8)); glow.position.y = 0.09; glow.castShadow = false; g.add(glow);
  const postMat = Mat.darkMetal();
  for (let i = 0; i < samples.length; i += 3) { const s = samples[i]; const gy = world.terrain.getHeight(s.x, s.z); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, s.y - gy, 8), postMat); post.position.set(s.x, (s.y + gy) / 2, s.z); post.castShadow = true; g.add(post); const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 10), postMat); foot.position.set(s.x, gy + 0.04, s.z); g.add(foot); }
  world.props.add(g);
  world.rails.push({ curve, samples, length });
  return { group: g, curve };
}

// ---------------------------------------------------------------- MERIDIAN vignettes
export function dressMeridian(world, info) {
  const T = world.terrain;
  // 1. Landing camp: the Commonwealth's forward foothold around the pad. Containers form an L, sandbags face the canyon,
  //    light towers mark the pad, tyre tracks lead off north, scorch rings from earlier pods.
  {
    container(world, at(world, 178, 40), 0.15, { faction: 'commonwealth' }); container(world, at(world, 174, 30), Math.PI / 2, { faction: 'commonwealth' });
    pushRes(info, crateStack(world, at(world, 184, 44), 0.4)); pushRes(info, crate(world, at(world, 188, 38), 1.1)); pushRes(info, ammoCache(world, at(world, 182, 36), 0.2)); pushRes(info, crate(world, at(world, 218, 36), 0.7)); pushRes(info, crateStack(world, at(world, 222, 42), 2.1));
    for (const [mx, my, yaw] of [[190, 66, 0], [200, 70, 0], [210, 66, 0]]) sandbagWall(world, at(world, mx, my), yaw, { length: 3.6 });
    lightTower(world, at(world, 170, 45), 0, { color: COLORS.cyan }); lightTower(world, at(world, 230, 45), 0, { color: COLORS.cyan });
    pushRes(info, posterFrame(world, at(world, 222, 30), -Math.PI * 0.8, { stand: true,  slogan: 'A CLEANER TOMORROW, TOGETHER.' }));
    pushRes(info, billboard(world, at(world, 226, 24), -Math.PI * 0.75, { accent: COLORS.cyan }));
    scorchDecal(world, at(world, 214, 52), 3.2, { rubble: false }); scorchDecal(world, at(world, 186, 54), 2.6, { rubble: false });
    groundStrip(world, [[200, 60], [200, 90], [200, 125]], 2.4);
    groundStrip(world, [[204, 60], [206, 95], [204, 128]], 2.4);
  }
  // 2. Canyon junction: an ambushed supply convoy. Wrecks along the road, barriers in a defensive arc that failed,
  //    a fuel-drum fire hazard, and an alien bone arch the road was cut straight through.
  {
    wreckedTruck(world, at(world, 196, 118), 0.35); wreckedTransport(world, at(world, 206, 126), -0.5); wreckedTruck(world, at(world, 192, 134), 2.6);
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; const p = at(world, 200 + Math.cos(a) * 16, 140 + Math.sin(a) * 9); if (onFloor(world, p.x, p.z)) barrier(world, p, a + Math.PI / 2); }
    for (const [mx, my] of [[210, 132], [211.4, 133.2], [209.2, 133.8]]) pushRes(info, barrel(world, at(world, mx, my), rand(0, 6.28)));
    scorchDecal(world, at(world, 200, 124), 4.2); scorchDecal(world, at(world, 190, 132), 2.4);
    boneArch(world, at(world, 200, 150), 0, { height: 10 });
    for (const [mx, my, h] of [[178, 140, 7], [181, 146, 5], [176, 147, 6]]) blackGlassTree(world, at(world, mx, my), { height: h });
    sporeField(world, at(world, 180, 143), { count: 50, radius: 9, color: COLORS.violet });
    pushRes(info, posterFrame(world, at(world, 214, 120), -Math.PI / 2, { stand: true,  slogan: 'YOUR SACRIFICE HAS BEEN PRE-APPROVED.' }));
  }
  // 3. Main route: wayfinding pylons every ~35 m and the scars of the first orbital barrage.
  {
    for (let my = 160; my <= 270; my += 35) { for (const side of [-1, 1]) { const p = at(world, 200 + side * 10.5, my); if (onFloor(world, p.x, p.z, -0.3)) buildPylon(world, p, 3.2, COLORS.cyan); } }
    scorchDecal(world, at(world, 206, 176), 5); scorchDecal(world, at(world, 193, 214), 3.6); scorchDecal(world, at(world, 203, 246), 4.4);
    for (const [mx, my] of [[194, 178], [208, 212], [196, 250]]) rockCluster(world, at(world, mx, my), rand(0, 6.28), { count: 5 });
    pushRes(info, billboard(world, at(world, 213, 232), -Math.PI / 2, { accent: '#ff5a1f' }));
    groundStrip(world, [[200, 128], [199, 170], [201, 215], [200, 260], [200, 284]], 2.4);
  }
  // 4. High route: cliffside walkway. Low guard rails on the drop side, work lights, glow pools in the rock pockets.
  {
    const rail = [[140, 112], [116, 150], [106, 200], [112, 245]];
    for (let i = 0; i < rail.length - 1; i++) { const a = M(...rail[i]), b = M(...rail[i + 1]); const dir = new THREE.Vector3().subVectors(b, a).normalize(); const perp = new THREE.Vector3(-dir.z, 0, dir.x); const off = 7.4; const s = a.clone().addScaledVector(perp, off), e = b.clone().addScaledVector(perp, off); s.y = T.getHeight(s.x, s.z); e.y = T.getHeight(e.x, e.z); if (onFloor(world, s.x, s.z, 0.5) && onFloor(world, e.x, e.z, 0.5)) buildWallSegment(world, s, e, { height: 1.0, thick: 0.1, color: COLORS.cyan }); }
    lightTower(world, at(world, 112, 150), 0, { color: COLORS.cyan, height: 5 }); lightTower(world, at(world, 108, 240), 0, { color: COLORS.cyan, height: 5 });
    glowPool(world, at(world, 100, 175), { radius: 1.8 }); glowPool(world, at(world, 118, 222), { radius: 1.4 });
    for (const [mx, my] of [[99, 160], [97, 210], [104, 262]]) membranePlant(world, at(world, mx, my));
  }
  // 5. Trench: industrial. Pipes run along the wall between pylons, pools of runoff glow in the floor.
  {
    const pipe = [[252, 96], [268, 140], [270, 195], [276, 238]];
    for (let i = 0; i < pipe.length - 1; i++) { const a = at(world, pipe[i][0] + 5, pipe[i][1]); const b = at(world, pipe[i + 1][0] + 5, pipe[i + 1][1]); a.y += 1.4; b.y += 1.4; cableRun(world, a, b, { radius: 0.22, sag: 0.4 }); cableRun(world, a.clone().setY(a.y + 0.5), b.clone().setY(b.y + 0.5), { radius: 0.06, sag: 0.9, neon: COLORS.cyan }); }
    for (const [mx, my, r] of [[262, 120, 2.2], [271, 175, 1.6], [274, 220, 2.6]]) glowPool(world, at(world, mx, my), { radius: r });
    for (const [mx, my] of [[266, 150], [272, 205]]) pushRes(info, crateStack(world, at(world, mx, my), rand(0, 6.28)));
  }
  // 6. Jammer checkpoint: the Legion fortified the southern approach. Twin watchtowers, a gate, staggered barriers,
  //    sandbag arcs, red floodlights, and power cables running from the array down to ground anchors.
  {
    const gateYaw = facing([110, 300], [70, 320]);
    buildGate(world, at(world, 110, 300), gateYaw, 8);
    buildWatchtower(world, at(world, 118, 292), gateYaw); buildWatchtower(world, at(world, 102, 308), gateYaw);
    for (let i = 0; i < 4; i++) { const p = at(world, 122 - i * 4, 286 + i * 3 + (i % 2) * 2); if (onFloor(world, p.x, p.z)) barrier(world, p, gateYaw + (i % 2 ? 0.5 : -0.5)); }
    for (const [mx, my] of [[126, 282], [96, 312]]) sandbagWall(world, at(world, mx, my), gateYaw, { length: 4 });
    lightTower(world, at(world, 128, 294), 0, { color: '#ff5a1f' }); lightTower(world, at(world, 100, 316), 0, { color: '#ff5a1f' });
    const jam = at(world, 70, 320); jam.y += 9;
    for (const [mx, my] of [[92, 306], [50, 338], [84, 342]]) { const g = at(world, mx, my); const top = g.clone(); top.y += 4; buildPylon(world, g, 4, '#ff5a1f'); cableRun(world, jam, top, { radius: 0.07, sag: 3 }); cableRun(world, jam.clone().setY(jam.y - 0.6), top.clone().setY(top.y - 0.3), { radius: 0.03, sag: 3.4, neon: '#ff5a1f' }); }
    pushRes(info, posterFrame(world, at(world, 116, 288), gateYaw + Math.PI, { stand: true,  slogan: 'THE FUTURE NEEDS FEWER QUESTIONS.' }));
    scorchDecal(world, at(world, 112, 296), 3);
  }
  // 7. Comms approach: antenna farm, a mega-billboard shouting at the canyon, container walls and floodlights.
  {
    for (const [mx, my, h] of [[168, 272, 9], [174, 278, 12], [163, 279, 7], [180, 270, 8]]) antennaMast(world, at(world, mx, my), 0, { height: h });
    for (let i = 0; i < 3; i++) { const a = at(world, 165 + i * 4, 272 + i * 3); a.y += 7; const b = at(world, 172 + i * 3, 276 + i * 2); b.y += 6; cableRun(world, a, b, { radius: 0.03, sag: 0.5 }); }
    pushRes(info, billboard(world, at(world, 232, 272), Math.PI * 0.9, { accent: COLORS.cyan })); pushRes(info, billboard(world, at(world, 238, 276), Math.PI * 0.9, { accent: '#ff5a1f' }));
    container(world, at(world, 226, 266), 0.2, { faction: 'legion' }); container(world, at(world, 220, 262), 0.2, { faction: 'legion' });
    lightTower(world, at(world, 190, 280), 0, { color: '#ff5a1f' }); lightTower(world, at(world, 212, 280), 0, { color: '#ff5a1f' });
    for (const [mx, my] of [[184, 268], [186, 269.4]]) pushRes(info, barrel(world, at(world, mx, my), rand(0, 6.28)));
  }
  // 8. Extraction approach: blast walls funnel into the platform, a fuel dump waits to go off, light rows guide the ship.
  {
    for (const side of [-1, 1]) { const s = at(world, 304 + side * 7, 286), e = at(world, 313 + side * 7, 277); buildWallSegment(world, s, e, { height: 1.8, thick: 0.6 }); }
    for (let i = 0; i < 4; i++) { for (const side of [-1, 1]) { const p = at(world, 306 + i * 5 + side * 9, 283 - i * 5); if (onFloor(world, p.x, p.z)) lightTower(world, p, 0, { color: COLORS.cyan, height: 4 }); } }
    for (const [mx, my] of [[344, 232], [345.6, 233.2], [343, 233.9], [344.8, 231]]) pushRes(info, barrel(world, at(world, mx, my), rand(0, 6.28)));
    pushRes(info, posterFrame(world, at(world, 347, 236), Math.PI, { stand: true,  slogan: 'FREEDOM IS ALWAYS LISTENING.' }));
    scorchDecal(world, at(world, 318, 262), 4); scorchDecal(world, at(world, 336, 268), 2.8, { rubble: false });
    boneArch(world, at(world, 356, 236), 1.2, { height: 8 }); blackGlassTree(world, at(world, 352, 266), { height: 8 });
  }
  // 9a. Strategic interiors: the compounds get vantage platforms, container walls, sandbag nests and trench pits so
  //     fights inside them have flanks and height instead of an empty floor.
  {
    // comms base (rect 118..292 x 282..392): four firing platforms, an L of containers around the pit, nests on the mounds
    platform(world, at(world, 142, 322), { yaw: -0.3, h: 2.6, color: '#ff5a1f' }); platform(world, at(world, 266, 304), { yaw: 2.6, h: 2.4, color: '#ff5a1f' });
    platform(world, at(world, 154, 374), { yaw: 1.2, h: 3.0, w: 9, d: 6, color: '#ff5a1f' }); platform(world, at(world, 258, 380), { yaw: -1.9, h: 2.6, color: '#ff5a1f' });
    for (const [mx, my, yaw] of [[184, 312, 0.2], [216, 312, -0.2], [178, 334, Math.PI / 2], [222, 334, Math.PI / 2]]) container(world, at(world, mx, my), yaw, { faction: 'legion' });
    for (const [mx, my, yaw] of [[150, 334, 0.3], [156, 350, -0.4], [244, 356, 0.2], [258, 370, 2.9]]) sandbagWall(world, at(world, mx, my), yaw, { length: 3.6 });
    for (const [mx, my] of [[148, 344], [254, 364], [132, 300], [280, 372]]) pushRes(info, crateStack(world, at(world, mx, my), rand(0, 6.28)));
    for (const [mx, my] of [[134, 386], [278, 288], [126, 296], [286, 384]]) lightTower(world, at(world, mx, my), 0, { color: '#ff5a1f' });
    for (const [mx, my, h] of [[240, 388, 10], [246, 384, 7]]) antennaMast(world, at(world, mx, my), 0, { height: h });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const p = at(world, 200 + Math.cos(a) * 20, 322 + Math.sin(a) * 20); if (onFloor(world, p.x, p.z)) barrier(world, p, a + Math.PI / 2); }
    scorchDecal(world, at(world, 200, 322), 5, { rubble: false }); scorchDecal(world, at(world, 168, 356), 3); scorchDecal(world, at(world, 236, 300), 2.6);
    groundStrip(world, [[128, 300], [200, 300], [284, 300]], 2.2); groundStrip(world, [[200, 288], [200, 320]], 2.2);
    for (const [mx, my] of [[164, 300], [236, 300], [200, 356]]) pushRes(info, barrel(world, at(world, mx, my), rand(0, 6.28)));
    // detention yard (rect 255..330 x 330..380): a watchtower, cell containers, a cage of barriers
    buildWatchtower(world, at(world, 322, 336), Math.PI * 0.75);
    for (const [mx, my, yaw] of [[300, 372, 0], [310, 372, 0], [268, 342, Math.PI / 2]]) container(world, at(world, mx, my), yaw, { faction: 'legion' });
    for (let i = 0; i < 5; i++) { const p = at(world, 284 + i * 6, 352); if (onFloor(world, p.x, p.z)) barrier(world, p, 0); }
    pushRes(info, crateStack(world, at(world, 318, 362), 0.5)); lightTower(world, at(world, 262, 376), 0, { color: '#ff5a1f' });
    platform(world, at(world, 296, 336), { yaw: 0, h: 2.2, w: 7, d: 5, color: '#ff5a1f' });
    // jammer bowl: a sandbag ring on the berm crest with gaps, crates at the four quarters, a platform on the north rim
    for (let i = 0; i < 10; i++) { if (i % 5 === 2) continue; const a = (i / 10) * Math.PI * 2; const p = at(world, 70 + Math.cos(a) * 30, 320 + Math.sin(a) * 30); if (onFloor(world, p.x, p.z)) sandbagWall(world, p, a + Math.PI / 2, { length: 4 }); }
    for (const a of [0.7, 2.3, 3.9, 5.5]) pushRes(info, crateStack(world, at(world, 70 + Math.cos(a) * 24, 320 + Math.sin(a) * 24), a));
    platform(world, at(world, 70, 356), { yaw: Math.PI, h: 2.8, w: 8, d: 5, color: '#ff5a1f' });
    // extraction: nest on the overwatch mound and a platform facing the approach
    for (const yaw of [0.6, 2.2]) sandbagWall(world, at(world, 300 + Math.cos(yaw) * 5, 226 + Math.sin(yaw) * 5), yaw + Math.PI / 2, { length: 3.6 });
    platform(world, at(world, 352, 236), { yaw: -0.8, h: 2.6, color: COLORS.cyan });
  }
  // 9c. Traversal: grind rails along the routes and around the compounds (rolled frames ride them; sparks included)
  grindRail(world, [[196, 150], [194, 175], [196, 205], [199, 235], [198, 262]], { height: 1.5 });
  grindRail(world, [[214, 300], [230, 312], [236, 330], [228, 348], [214, 356]], { height: 1.6, color: '#ff5a1f' });
  grindRail(world, [[300, 270], [312, 258], [326, 252], [342, 254]], { height: 1.4 });
  grindRail(world, [[118, 152], [110, 176], [106, 200], [108, 226]], { height: 1.3 });
  grindRail(world, [[176, 62], [190, 70], [206, 72], [222, 66]], { height: 1.2 });
  // 9b. Propaganda pass: posters cluster where the Commonwealth wants eyes (gates, plazas, the cells).
  {
    const gateY = 0; // poster fronts face south, toward the road
    for (let i = 0; i < 3; i++) { const p = at(world, 191 + i * 2.6, 281); if (onFloor(world, p.x, p.z, -0.5)) pushRes(info, posterFrame(world, p, gateY, { stand: true, w: 2.2, h: 2.8 })); }
    for (let i = 0; i < 3; i++) { const p = at(world, 206 + i * 2.6, 281); if (onFloor(world, p.x, p.z, -0.5)) pushRes(info, posterFrame(world, p, gateY, { stand: true, w: 2.2, h: 2.8 })); }
    pushRes(info, billboard(world, at(world, 216, 330), Math.PI / 2, { accent: COLORS.cyan })); pushRes(info, billboard(world, at(world, 194, 344), -Math.PI / 2, { accent: '#ff5a1f' }));
    for (let i = 0; i < 2; i++) pushRes(info, posterFrame(world, at(world, 250, 350 + i * 3.4), -Math.PI / 2, { stand: true,  slogan: i ? 'REHABILITATION BEGINS WITH SILENCE.' : 'YOUR CELL IS A GIFT.', accent: '#ff5a1f' }));
    for (const [mx, my] of [[124, 288], [96, 304]]) pushRes(info, posterFrame(world, at(world, mx, my), facing([110, 300], [70, 320]) + Math.PI, { stand: true, accent: '#ff5a1f', w: 2, h: 2.6 }));
    pushRes(info, billboard(world, at(world, 300, 292), facing([300, 292], [330, 250]) + Math.PI, { accent: COLORS.cyan })); pushRes(info, billboard(world, at(world, 322, 296), facing([322, 296], [330, 250]) + Math.PI, { accent: COLORS.cyan }));
  }
  // 10. Landmarks: the frigate wreck on the western rim (visible from most of the valley) and the bone cathedral over the trench.
  { const p = M(48, 210); p.y = world.terrain.getHeight(p.x, p.z) - 2; crashedFrigate(world, p, 0.9); }
  boneCathedral(world, [[252, 96], [268, 140], [270, 195], [276, 238]], { spacing: 30, minH: 15, maxH: 22 });
  // 9. Ambient strike scars along the enemy roads so the whole valley reads as a war zone, not a sandbox.
  for (const [mx, my] of [[36, 120], [30, 230], [372, 140], [376, 230], [150, 396], [244, 396]]) { const p = at(world, mx, my); if (onFloor(world, p.x, p.z, 1)) scorchDecal(world, p, rand(2.5, 4)); }
}

// ---------------------------------------------------------------- BLACK LANTERN vignettes
export function dressLantern(world, info, cityFns) {
  const { hoverWreck, dumpster, cableSpool, trafficBarrier, neonSign, holoBillboard, streetLamp } = cityFns;
  // Overhead cable webs across Meridian Avenue, hung between tower faces (the city is held together with wire).
  for (const my of [90, 150, 210, 250]) { for (let k = 0; k < 2; k++) { const a = at(world, 184, my + k * 6), b = at(world, 216, my + k * 3); a.y += 7 + k * 1.5; b.y += 7.5 + k; cableRun(world, a, b, { radius: 0.03, sag: 1.2 + k * 0.4, neon: k === 0 ? pick(['#00e5ff', '#ff3fd8']) : undefined }); } }
  // Riot aftermath at Lantern Square: hover-car pile-up, scorch marks, barricades, a fallen sign.
  {
    hoverWreck(world, at(world, 194, 118), 0.6); hoverWreck(world, at(world, 207, 122), -0.9); hoverWreck(world, at(world, 198, 132), 2.2);
    scorchDecal(world, at(world, 200, 124), 4.5, { rubble: false }); scorchDecal(world, at(world, 190, 136), 2.4, { rubble: false });
    for (let i = 0; i < 4; i++) trafficBarrier(world, at(world, 214, 110 + i * 5), 0.3);
    for (const [mx, my] of [[212, 134], [213.2, 135.4]]) pushRes(info, barrel(world, at(world, mx, my), rand(0, 6.28)));
    pushRes(info, neonSign(world, at(world, 186, 128), Math.PI / 2, { text: 'CURFEW IS KINDNESS', sub: 'REPORT UNLIT WINDOWS', color: '#ff3fd8', mount: 'pole' }));
  }
  // Alley clutter at the base of the avenue towers: dumpsters, spools, kiosks glow.
  for (const my of [80, 105, 165, 195, 230, 265]) { for (const side of [-1, 1]) { const p = at(world, 200 + side * 12.5, my); if (!onFloor(world, p.x, p.z, -0.5)) continue; if ((my + side) % 2) dumpster(world, p, side > 0 ? Math.PI / 2 : -Math.PI / 2); else cableSpool(world, p, rand(0, 6.28)); } }
  // Substation checkpoint: barriers and lamps at the gate, cables from the spire to the street.
  {
    for (let i = 0; i < 4; i++) trafficBarrier(world, at(world, 292 - i * 2, 296 + i * 3), 0.9 + (i % 2) * 0.4);
    streetLamp(world, at(world, 296, 292), { color: '#ff3fd8', light: true }); streetLamp(world, at(world, 284, 306), { color: '#ff3fd8', light: true });
    const spire = at(world, 322, 318); spire.y += 12;
    for (const [mx, my] of [[300, 300], [340, 300], [332, 344]]) { const g = at(world, mx, my); const top = g.clone(); top.y += 5; buildPylon(world, g, 5, '#ff3fd8'); cableRun(world, spire, top, { radius: 0.06, sag: 3.5 }); }
    pushRes(info, holoBillboard(world, at(world, 286, 288), facing([286, 288], [300, 300]), { text: 'DISSENT DIMS THE LIGHTS', sub: 'LEGION POWER BOARD', color: '#ff3fd8', light: true }));
  }
  // Traversal: rails down the avenue and around the square
  grindRail(world, [[188, 88], [186, 120], [190, 150], [188, 180], [190, 214]], { height: 1.5, color: '#ff3fd8' });
  grindRail(world, [[214, 96], [216, 130], [212, 160], [214, 190], [212, 226]], { height: 1.5, color: '#00e5ff' });
  grindRail(world, [[186, 300], [196, 312], [212, 314], [222, 302]], { height: 1.6, color: '#ff3fd8' });
  grindRail(world, [[84, 232], [76, 248], [80, 266]], { height: 1.3, color: '#00e5ff' });
  // Second content pass: the avenue is lined with screens; every block has something to say.
  {
    const lines = [['CURFEW 21:00', 'LIGHTS OFF, DOORS LOCKED'], ['REPORT UNLIT WINDOWS', 'LEGION POWER BOARD'], ['SMILE FOR THE LANTERN', 'IT IS WATCHING FOR YOU'], ['RATION CARDS RESET', 'QUEUE WITH DIGNITY'], ['THE MOON IS OURS', 'MERIDIAN COMMONWEALTH'], ['DISSENT DIMS THE LIGHTS', 'STAY BRIGHT']];
    let k = 0;
    for (const my of [100, 140, 180, 220, 255]) { const side = (k % 2) ? -1 : 1; const p = at(world, 200 + side * 14.5, my); if (onFloor(world, p.x, p.z, -0.5)) { const [text, sub] = lines[k % lines.length]; pushRes(info, holoBillboard(world, p, side > 0 ? Math.PI / 2 : -Math.PI / 2, { text, sub, color: k % 3 === 0 ? '#ff3fd8' : k % 3 === 1 ? '#00e5ff' : '#ffb347', mastHeight: 7 + (k % 2) * 3, light: k % 2 === 0 })); } k++; }
    pushRes(info, holoBillboard(world, at(world, 182, 342), Math.PI / 2, { text: 'UPLINK SECURED', sub: 'BY ORDER OF THE BOARD', color: '#00e5ff', mastHeight: 8 }));
    pushRes(info, holoBillboard(world, at(world, 208, 346), -Math.PI / 2, { text: 'SILENCE IS SERVICE', sub: 'COMMS DIRECTORATE', color: '#ff3fd8', mastHeight: 8 }));
    pushRes(info, neonSign(world, at(world, 150, 350), Math.PI / 2, { text: 'HOLDING FACILITY 7', sub: 'VISITING HOURS: NEVER', color: '#ffb347', mount: 'pole' }));
    pushRes(info, holoBillboard(world, at(world, 84, 258), facing([84, 258], [72, 246]), { text: 'EXTRACTION IS A PRIVILEGE', sub: 'NOT A RIGHT', color: '#00e5ff', mastHeight: 6, light: true }));
  }
  // Landmarks: the Commonwealth's face over Lantern Square, and the orbital tether rising from the substation spire.
  giantHolo(world, at(world, 200, 125), { height: 40, color: '#00e5ff' }); // stays under the aurora discs at y=60, which sliced the plane
  { const sp = at(world, 322, 318); sp.y += 14; skyTether(world, sp, { height: 700, color: '#ff3fd8' }); }
  // Rooftop approach: light rows leading to the pad.
  for (let i = 0; i < 4; i++) { for (const side of [-1, 1]) { const p = at(world, 96 - i * 5 + side * 7, 285 - i * 6); if (onFloor(world, p.x, p.z)) streetLamp(world, p, { color: '#00e5ff', light: i === 1 && side > 0 }); } }
}
