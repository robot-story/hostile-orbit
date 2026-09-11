// Neon City (night, dark moon): dark concrete/gunmetal towers, cyan/magenta/amber neon strips,
// holographic billboards, wet-asphalt-ready street dressing, Commonwealth propaganda everywhere.
// Every builder is `(world, position, yaw = 0, opts = {})` (objective builders take `center` only),
// adds meshes under `world.props`, and registers colliders via world.addBox/addCyl so the player
// cannot walk through them. Geometries/materials are cached by exact params so the static merge
// pass (src/world/merge.js) can batch dozens of towers/props sharing a material into few draw calls.
import * as THREE from 'three';
import { HOLO_ART } from './props.js';
let _holoArtIdx = 0;
import { Mat, COLORS } from '../render/materials.js';
import { Tex } from '../render/textures.js';
import { registerBreakable } from '../world/breakables.js';
import { rand, randInt, pick } from '../core/mathx.js';
import { pointGlow, buildWallSegment, buildGate, buildWatchtower } from './buildings.js';
import { terminal as terminalProp, ammoCache, barrel, crate, container, barrier as concreteBarrier } from './props.js';

const MAGENTA = '#ff3fd8';
const NEON_COLORS = ['#00e5ff', MAGENTA, '#ffb020'];

const _geoCache = new Map();
function boxGeo(w, h, d) { const k = `b:${w}:${h}:${d}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return _geoCache.get(k); }
function cylGeo(rt, rb, h, seg = 10) { const k = `c:${rt}:${rb}:${h}:${seg}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg)); return _geoCache.get(k); }
function planeGeo(w, h) { const k = `p:${w}:${h}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.PlaneGeometry(w, h)); return _geoCache.get(k); }
function icoGeo(r, detail = 0) { const k = `i:${r}:${detail}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.IcosahedronGeometry(r, detail)); return _geoCache.get(k); }
function ringGeo(ri, ro, seg = 24) { const k = `r:${ri}:${ro}:${seg}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.RingGeometry(ri, ro, seg)); return _geoCache.get(k); }
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; }
function box(w, h, d, mat, shadow = true) { return mesh(boxGeo(w, h, d), mat, shadow); }
function cyl(rt, rb, h, mat, seg = 10, shadow = true) { return mesh(cylGeo(rt, rb, h, seg), mat, shadow); }
function place(g, position, yaw) { g.position.copy(position); g.rotation.y = yaw; }

// One shared emissive "window" material per neon colour (never cloned per tower).
const _winMatCache = new Map();
function windowMat(hex) {
  if (!_winMatCache.has(hex)) _winMatCache.set(hex, new THREE.MeshStandardMaterial({ color: '#0b0c10', emissive: hex, emissiveIntensity: 1.7, roughness: 0.4, metalness: 0.15, toneMapped: true }));
  return _winMatCache.get(hex);
}
const WINDOW_SIZES = [[0.9, 1.3], [1.1, 1.6], [1.3, 1.9]];

let _cityPosterIdx = 0;
const CITY_SLOGANS = [
  ['Curfew Is Just A Bedtime For Adults.', 'MERIDIAN COMMONWEALTH'],
  ['Neon Is Cheaper Than Streetlights. You\'re Welcome.', 'MERIDIAN COMMONWEALTH'],
  ['Report Unusual Silence.', 'MERIDIAN COMMONWEALTH'],
  ['Your Building Has Been Rated: Sufficient.', 'MERIDIAN COMMONWEALTH'],
  ['Loyalty Points Never Expire (Terms Apply).', 'MERIDIAN COMMONWEALTH'],
  ['The Night Sky Is Restricted Airspace.', 'MERIDIAN COMMONWEALTH'],
];
function citySlogan() { return CITY_SLOGANS[_cityPosterIdx % CITY_SLOGANS.length]; }

// ------------------------------------------------------------------- tower ---
/** Neon skyscraper block: 1-2 stacked dark boxes, corner neon strips, shared emissive windows. */
export function buildTower(world, pos, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const height = opts.height ?? rand(14, 40);
  const width = opts.width ?? rand(6, 11);
  const depth = opts.depth ?? width * rand(0.75, 1);
  const color = opts.color || pick(NEON_COLORS);
  const mat = Mat.panel(randInt(0, 3));
  const y0 = world.terrain.getHeight(pos.x, pos.z);
  const colliders = [];

  const twoBlock = height > 22 && Math.random() < 0.6;
  const h1 = twoBlock ? height * rand(0.55, 0.72) : height;
  const body = box(width, h1, depth, mat); body.position.y = h1 / 2; g.add(body);
  colliders.push(world.addBox(new THREE.Vector3(pos.x, y0 + h1 / 2, pos.z), { x: width / 2, y: h1 / 2, z: depth / 2 }, yaw, { material: 'concrete', mesh: body }));

  let topY = h1;
  if (twoBlock) {
    const w2 = width * rand(0.55, 0.75), d2 = depth * rand(0.55, 0.75), h2 = height - h1;
    const body2 = box(w2, h2, d2, mat); body2.position.y = h1 + h2 / 2; g.add(body2);
    colliders.push(world.addBox(new THREE.Vector3(pos.x, y0 + h1 + h2 / 2, pos.z), { x: w2 / 2, y: h2 / 2, z: d2 / 2 }, yaw, { material: 'concrete', mesh: body2 }));
    topY = height;
  }

  // corner neon strips (2-4)
  const stripCount = randInt(2, 4);
  const stripMat = Mat.neon(color, 2.2);
  for (let i = 0; i < stripCount; i++) {
    const cx = (i % 2 === 0 ? -1 : 1) * (width / 2 - 0.08);
    const cz = (i < 2 ? -1 : 1) * (depth / 2 - 0.08);
    const strip = cyl(0.06, 0.06, h1 * 0.85, stripMat, 4, false);
    strip.position.set(cx, h1 * 0.5, cz);
    g.add(strip);
  }

  // shared emissive window panels
  const wMat = windowMat(color);
  const winCount = Math.round((randInt(3, 5)) * 2.2);
  for (let i = 0; i < winCount; i++) {
    const [ww, wh] = pick(WINDOW_SIZES);
    const win = mesh(planeGeo(ww, wh), wMat, false);
    const side = randInt(0, 3);
    const wy = rand(2, Math.max(2.5, h1 - 2));
    if (side === 0) win.position.set(0, wy, depth / 2 + 0.03);
    else if (side === 1) { win.position.set(0, wy, -depth / 2 - 0.03); win.rotation.y = Math.PI; }
    else if (side === 2) { win.position.set(width / 2 + 0.03, wy, 0); win.rotation.y = Math.PI / 2; }
    else { win.position.set(-width / 2 - 0.03, wy, 0); win.rotation.y = -Math.PI / 2; }
    g.add(win);
  }

  if (opts.antenna !== false && Math.random() < 0.6) {
    const aH = rand(1.5, 4);
    const antenna = cyl(0.05, 0.1, aH, Mat.darkMetal(), 6); antenna.position.y = topY + aH / 2; g.add(antenna);
    const beacon = mesh(icoGeo(0.1), Mat.neon(COLORS.red, 3), false); beacon.position.y = topY + aH + 0.08; g.add(beacon);
  }

  g.position.set(pos.x, y0, pos.z); g.rotation.y = yaw;
  world.props.add(g);
  return { group: g, colliders };
}

/** Scatter `count` towers around pos, skipping spots where opts.avoid(x,z) is true. */
export function buildTowerCluster(world, pos, count, radius, opts = {}) {
  const towers = [];
  let attempts = 0;
  while (towers.length < count && attempts < count * 5) {
    attempts++;
    const a = Math.random() * Math.PI * 2, r = rand(radius * 0.12, radius);
    const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
    if (opts.avoid && opts.avoid(x, z)) continue;
    const y = world.terrain.getHeight(x, z);
    const height = rand(opts.minHeight ?? 14, opts.maxHeight ?? 40);
    towers.push(buildTower(world, new THREE.Vector3(x, y, z), Math.random() * Math.PI * 2, { height }));
  }
  return { towers };
}

// -------------------------------------------------------------- street dressing ---
/** Burnt-out hover car, dead neon. Cover height ~1.1m. */
export function hoverWreck(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = Mat.darkMetal();
  const hull = box(4, 0.9, 2, bodyMat); hull.position.y = 0.6; g.add(hull);
  const cabin = box(2.2, 0.6, 1.7, Mat.panel(1)); cabin.position.set(-0.3, 1.25, 0); g.add(cabin);
  const skirt = box(4.2, 0.3, 2.2, Mat.darkMetal()); skirt.position.y = 0.18; g.add(skirt);
  const deadNeon = mesh(boxGeo(2.6, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: '#1a1a1c', emissive: '#3a1020', emissiveIntensity: 0.45 }), false);
  deadNeon.position.set(0, 0.95, 1.02); g.add(deadNeon);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.6, position.z), { x: 2, y: 0.6, z: 1.05 }, yaw, { material: 'metal', walkableTop: false, mesh: hull });
  return { group: g, collider };
}

/** Noodle/vending kiosk with an emissive menu screen. */
export function kiosk(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const body = box(1.6, 1.1, 1.0, Mat.panel(2)); body.position.y = 0.55; g.add(body);
  const roof = box(1.9, 0.1, 1.3, Mat.darkMetal()); roof.position.y = 1.18; g.add(roof);
  const screen = mesh(planeGeo(0.7, 0.5), Mat.screen(randInt(0, 3)), false);
  screen.position.set(0, 0.75, 0.51); g.add(screen);
  const strip = cyl(0.05, 0.05, 1.7, Mat.neon(pick(NEON_COLORS), 2.2), 4, false); strip.position.set(0.82, 0.6, 0.5); g.add(strip);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.55, position.z), { x: 0.82, y: 0.55, z: 0.52 }, yaw, { material: 'metal', mesh: body });
  return { group: g, collider };
}

/** Concrete planter with a dead neon-blue plant. */
export function planter(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const pot = cyl(0.55, 0.65, 0.6, Mat.concrete()); pot.position.y = 0.3; g.add(pot);
  const stalk = cyl(0.04, 0.07, 1.0, Mat.darkMetal(), 5); stalk.position.y = 1.0; g.add(stalk);
  const bulb = mesh(icoGeo(0.22, 0), new THREE.MeshStandardMaterial({ color: '#0a1216', emissive: COLORS.cyanDim, emissiveIntensity: 0.90, roughness: 0.6 }), false);
  bulb.position.y = 1.5; g.add(bulb);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addCyl(new THREE.Vector3(position.x, position.y + 0.3, position.z), 0.65, 0.6, { material: 'concrete', mesh: pot });
  return { group: g, collider };
}

/** Striped jersey/traffic barrier. */
export function trafficBarrier(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const lower = box(2.2, 0.6, 0.5, Mat.concrete()); lower.position.y = 0.3; g.add(lower);
  const upper = box(2.0, 0.5, 0.28, Mat.concrete()); upper.position.y = 0.85; g.add(upper);
  const stripe = box(2.22, 0.14, 0.52, Mat.hazard()); stripe.position.y = 0.55; g.add(stripe);
  const strip = box(1.8, 0.05, 0.05, Mat.neon(COLORS.amber, 2), 4, false); strip.position.set(0, 1.05, 0.15); g.add(strip);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.55, position.z), { x: 1.1, y: 0.55, z: 0.26 }, yaw, { material: 'concrete', mesh: lower });
  return { group: g, collider };
}

/** Bus-stop style transit shelter (roof, not walkable). */
export function transitShelter(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const backWall = box(3.2, 1.9, 0.1, Mat.panel(0), false); backWall.position.set(0, 0.95, -0.6); g.add(backWall);
  const roof = box(3.4, 0.1, 1.5, Mat.darkMetal()); roof.position.set(0, 2.05, 0); g.add(roof);
  const colliders = [];
  for (const dx of [-1.5, 1.5]) {
    const post = box(0.14, 2.0, 0.14, Mat.darkMetal()); post.position.set(dx, 1.0, 0.55); g.add(post);
    colliders.push(world.addBox(new THREE.Vector3(position.x + dx, position.y + 1.0, position.z + 0.55), { x: 0.07, y: 1.0, z: 0.07 }, yaw, { material: 'metal', cover: false, mesh: post }));
  }
  const bench = box(2.6, 0.4, 0.4, Mat.panel(1)); bench.position.set(0, 0.42, -0.2); g.add(bench);
  const strip = box(3.0, 0.05, 0.05, Mat.neon(pick(NEON_COLORS), 2.2), 4, false); strip.position.set(0, 2.0, 0.7); g.add(strip);
  place(g, position, yaw);
  world.props.add(g);
  const wallCollider = world.addBox(new THREE.Vector3(position.x, position.y + 0.95, position.z - 0.6), { x: 1.6, y: 0.95, z: 0.06 }, yaw, { material: 'metal', mesh: backWall });
  const benchCollider = world.addBox(new THREE.Vector3(position.x, position.y + 0.42, position.z - 0.2), { x: 1.3, y: 0.22, z: 0.2 }, yaw, { material: 'metal', mesh: bench });
  colliders.push(wallCollider, benchCollider);
  return { group: g, collider: wallCollider, colliders };
}

/** Industrial cable spool. */
export function cableSpool(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const flangeMat = Mat.darkMetal();
  const top = cyl(0.7, 0.7, 0.06, flangeMat); top.position.y = 0.85; g.add(top);
  const bottom = top.clone(); bottom.position.y = 0.06; g.add(bottom);
  const core = cyl(0.16, 0.16, 0.79, Mat.panel(3), 8); core.position.y = 0.455; g.add(core);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const rib = box(0.06, 0.79, 0.1, Mat.darkMetal(), false); rib.position.set(Math.cos(a) * 0.68, 0.455, Math.sin(a) * 0.68); rib.rotation.y = -a; g.add(rib);
  }
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addCyl(new THREE.Vector3(position.x, position.y + 0.45, position.z), 0.72, 0.9, { material: 'metal', mesh: top });
  return { group: g, collider };
}

/** Street dumpster. */
export function dumpster(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const mat = Mat.panel(randInt(0, 3));
  const body = box(2.0, 1.1, 1.1, mat); body.position.y = 0.55; g.add(body);
  const lid = box(2.1, 0.08, 1.2, Mat.darkMetal()); lid.position.set(0, 1.14, 0); lid.rotation.x = -0.15; g.add(lid);
  const stripe = box(2.02, 0.1, 1.12, Mat.hazard()); stripe.position.y = 0.15; g.add(stripe);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.55, position.z), { x: 1.02, y: 0.55, z: 0.57 }, yaw, { material: 'metal', mesh: body });
  return { group: g, collider };
}

// ------------------------------------------------------------------ signage ---
/** Wall/pole mounted neon sign with 1-2 poster panels. The poster mesh has its own material instance
 * (gameplay may swap it later) and is flagged noMerge. */
export function neonSign(world, pos, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || pick(NEON_COLORS);
  const [defSlogan, defSub] = citySlogan(); _cityPosterIdx++;
  const text = opts.text || defSlogan, sub = opts.sub || defSub;
  const mount = opts.mount || 'pole';
  const w = opts.w || 2.0, h = opts.h || 1.3;
  let posters = [];
  if (mount === 'pole') {
    const pole = box(0.14, 3.0, 0.14, Mat.darkMetal()); pole.position.y = 1.5; g.add(pole);
    const frame = box(w + 0.1, h + 0.1, 0.08, Mat.darkMetal(), false); frame.position.set(0, 2.4, 0); g.add(frame);
    const p1 = mesh(planeGeo(w, h), Mat.poster(text, sub, color, _cityPosterIdx++));
    p1.position.set(0, 2.4, 0.05); p1.userData.noMerge = true; g.add(p1); posters.push(p1);
    if (opts.double) {
      const p2 = mesh(planeGeo(w, h), Mat.poster(text, sub, color, _cityPosterIdx++));
      p2.position.set(0, 2.4, -0.05); p2.rotation.y = Math.PI; p2.userData.noMerge = true; g.add(p2); posters.push(p2);
    }
    place(g, pos, yaw);
    world.props.add(g);
    const collider = world.addBox(new THREE.Vector3(pos.x, pos.y + 1.5, pos.z), { x: 0.15, y: 1.5, z: 0.15 }, yaw, { material: 'metal', cover: false, mesh: pole });
    return { group: g, poster: posters[0], posters, collider };
  }
  // wall mount
  const frame = box(w + 0.1, h + 0.1, 0.06, Mat.darkMetal(), false); g.add(frame);
  const p1 = mesh(planeGeo(w, h), Mat.poster(text, sub, color, _cityPosterIdx++));
  p1.position.z = 0.04; p1.userData.noMerge = true; g.add(p1); posters.push(p1);
  place(g, pos, yaw);
  world.props.add(g);
  return { group: g, poster: p1, posters };
}

/** Large floating holographic billboard on a pylon; flickers over time. */
export function holoBillboard(world, pos, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || pick(NEON_COLORS);
  const y0 = world.terrain.getHeight(pos.x, pos.z);
  const mastH = opts.mastHeight ?? 9;
  const mast = cyl(0.3, 0.4, mastH, Mat.darkMetal()); mast.position.y = mastH / 2; g.add(mast);
  const w = opts.w || 6, h = opts.h || 3.4;
  const [slogan, sub] = citySlogan(); _cityPosterIdx++;
  const useArt = opts.art ?? (Math.random() < 0.5);
  const posterMat = useArt ? Mat.posterImage(HOLO_ART[_holoArtIdx++ % HOLO_ART.length], { holo: true }).clone() : Mat.poster(opts.text || slogan, opts.sub || sub, color, _cityPosterIdx++);
  posterMat.transparent = true; posterMat.opacity = 0.82; posterMat.side = THREE.DoubleSide; posterMat.depthWrite = false;
  const poster = mesh(planeGeo(w, h), posterMat, false);
  poster.position.y = mastH + h / 2 + 0.4; poster.position.z = 0.06; poster.userData.noMerge = true; g.add(poster); // in front of the backing plate, never inside it
  const frame = box(w + 0.2, h + 0.2, 0.06, Mat.darkMetal(), false); frame.position.y = poster.position.y; frame.position.z = -0.02; g.add(frame);
  const glow = pointGlow(color, 6, 12); glow.position.y = poster.position.y; if (opts.light) g.add(glow);
  place(g, new THREE.Vector3(pos.x, y0, pos.z), yaw);
  g.userData.noMerge = true;
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(pos.x, y0 + mastH / 2, pos.z), { x: 0.4, y: mastH / 2, z: 0.4 }, yaw, { material: 'metal', cover: false, mesh: mast });
  const phase = rand(0, Math.PI * 2);
  const animated = { update: (dt) => { poster.material.opacity = 0.7 + Math.sin(performance.now() * 0.003 + phase) * 0.08 + (Math.random() < 0.01 ? -0.3 : 0); } };
  world.addUpdatable(animated);
  return { group: g, poster, collider, animated };
}

/** Thin street lamp; a PointLight is added only when opts.light is true (global 26-light cap). */
let _poolTex = null; const _poolMats = new Map();
function lightPoolMat(color) {
  if (!_poolTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); _poolTex = new THREE.CanvasTexture(c); }
  if (!_poolMats.has(color)) _poolMats.set(color, new THREE.MeshBasicMaterial({ map: _poolTex, color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  return _poolMats.get(color);
}
export function streetLamp(world, pos, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || COLORS.cyan;
  const h = opts.height ?? 5;
  const y0 = world.terrain.getHeight(pos.x, pos.z);
  const base = cyl(0.14, 0.18, 0.3, Mat.darkMetal()); base.position.y = 0.15; g.add(base);
  const pole = cyl(0.06, 0.09, h, Mat.darkMetal(), 6); pole.position.y = h / 2; g.add(pole);
  const arm = box(0.06, 0.06, 0.7, Mat.darkMetal(), false); arm.position.set(0, h, 0.35); g.add(arm);
  const head = mesh(icoGeo(0.14, 0), Mat.neon(color, 2.4), false); head.position.set(0, h - 0.05, 0.68); g.add(head);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), lightPoolMat(color)); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.05, 0.68); pool.renderOrder = 2; g.add(pool);
  place(g, new THREE.Vector3(pos.x, y0, pos.z), 0);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(pos.x, y0 + h / 2, pos.z), { x: 0.12, y: h / 2, z: 0.12 }, 0, { material: 'metal', cover: false, mesh: pole });
  registerBreakable(world, { hp: 140, position: new THREE.Vector3(pos.x, y0 + 1, pos.z), radius: 1.2, parts: [], colliders: [collider], material: 'metal', kind: 'lamp', light: g.getObjectByProperty('isPointLight', true) || null, onBreak: (b, d) => { g.rotation.z = 0.35 * (d.x >= 0 ? -1 : 1); g.rotation.x = 0.25 * (d.z >= 0 ? -1 : 1); g.traverse((o) => { if (o.material?.emissive) { o.material = o.material.clone(); o.material.emissiveIntensity = 0; } }); } });
  let light = null;
  if (opts.light) { light = pointGlow(color, 7, 14); light.position.set(pos.x, y0 + h - 0.05, pos.z + 0.68); world.props.add(light); }
  return { group: g, collider, light };
}

// ---------------------------------------------------------------- objectives ---

/** Transit plaza: the drop zone. Circular pad with landing-ring markings, low walls/benches, 2 pylons. */
export function buildTransitPlaza(world, center) {
  const g = new THREE.Group();
  const y = world.terrain.getHeight(center.x, center.z);
  const pad = cyl(15, 15, 0.5, Mat.concrete(), 40); pad.position.set(0, 0.2, 0); g.add(pad);
  world.addCyl(new THREE.Vector3(center.x, y + 0.2, center.z), 15.5, 0.5, { material: 'concrete', cover: false, blocksNav: false });
  const ringMat = Mat.neon(COLORS.cyan, 2.4);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const l = box(1.1, 0.06, 0.24, ringMat, false);
    l.position.set(Math.cos(a) * 13.8, 0.48, Math.sin(a) * 13.8); l.rotation.y = -a; g.add(l);
  }
  const ring = mesh(ringGeo(9, 9.4), Mat.neonBasic(MAGENTA), false);
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.47, 0); g.add(ring);
  const emblem = mesh(planeGeo(9, 9), Mat.emblemDecal('#cfd6da'), false);
  emblem.rotation.x = -Math.PI / 2; emblem.position.set(0, 0.465, 0); emblem.receiveShadow = true; g.add(emblem);
  g.position.set(center.x, y, center.z);
  world.props.add(g);
  // low walls / benches ring
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const px = center.x + Math.cos(a) * 18, pz = center.z + Math.sin(a) * 18;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    trafficBarrier(world, p, a + Math.PI / 2);
  }
  for (const [dx, dz] of [[-19, -13], [19, 13]]) {
    const px = center.x + dx, pz = center.z + dz;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    holoBillboard(world, p, Math.atan2(-(-dz), -dx) + Math.PI / 2, { color: pick(NEON_COLORS), mastHeight: 8 });
  }
  return { group: g };
}

/**
 * Substation: PRIMARY OBJECTIVE 1. Fenced compound around a central signal spire (tower with a ring
 * of magenta emitters and a slowly rotating dish), transformer blocks (cover), two charge points.
 */
export function buildSubstation(world, center) {
  const g = new THREE.Group(); // spire group only — gameplay topples this
  const y = world.terrain.getHeight(center.x, center.z);
  const outerR = 24;
  const gateAngle = 0;
  const gateWidth = 5;
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, amid = (a0 + a1) / 2;
    const d = Math.abs(((amid - gateAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (d < gateWidth / outerR) continue;
    const p0 = new THREE.Vector3(center.x + Math.cos(a0) * outerR, 0, center.z + Math.sin(a0) * outerR);
    const p1 = new THREE.Vector3(center.x + Math.cos(a1) * outerR, 0, center.z + Math.sin(a1) * outerR);
    buildWallSegment(world, p0, p1, { height: 1.9, thick: 0.15, material: 'metal', mat: Mat.gunMetal(), neonColor: COLORS.violet });
  }
  const gp = new THREE.Vector3(center.x + Math.cos(gateAngle) * outerR, 0, center.z + Math.sin(gateAngle) * outerR);
  buildGate(world, gp, gateAngle, gateWidth, { color: COLORS.violet, height: 2.6 });

  // transformer blocks (cover) scattered inside the fence
  const colliders = [];
  const transformerCount = randInt(5, 6);
  for (let i = 0; i < transformerCount; i++) {
    const a = (i / transformerCount) * Math.PI * 2 + rand(-0.2, 0.2);
    const r = rand(outerR * 0.4, outerR * 0.75);
    const px = center.x + Math.cos(a) * r, pz = center.z + Math.sin(a) * r;
    const py = world.terrain.getHeight(px, pz);
    const tg = new THREE.Group();
    const tw = rand(1.6, 2.2), th = rand(1.4, 1.8), td = rand(1.4, 1.8);
    const tmat = Mat.panel(randInt(0, 3));
    const body = box(tw, th, td, tmat); body.position.y = th / 2; tg.add(body);
    const coil = cyl(0.3, 0.3, th * 0.7, Mat.darkMetal(), 8); coil.position.set(0, th * 0.65, td / 2 + 0.2); tg.add(coil);
    const warn = box(tw + 0.02, 0.1, td + 0.02, Mat.hazard()); warn.position.y = 0.05; tg.add(warn);
    place(tg, new THREE.Vector3(px, py, pz), rand(0, Math.PI * 2));
    world.props.add(tg);
    colliders.push(world.addBox(new THREE.Vector3(px, py + th / 2, pz), { x: tw / 2, y: th / 2, z: td / 2 }, tg.rotation.y, { material: 'metal', mesh: body }));
  }

  // central signal spire
  const towerHeight = 20;
  const mast = cyl(0.8, 1.2, towerHeight, Mat.darkMetal(), 12); mast.position.set(center.x, y + towerHeight / 2, center.z); world.props.add(mast);
  const collider = world.addCyl(new THREE.Vector3(center.x, y + towerHeight / 2, center.z), 1.2, towerHeight, { material: 'metal', mesh: mast });
  const emitters = [];
  for (let i = 0; i < 3; i++) {
    const ringY = y + 4.5 + i * 5;
    const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.violet, emissive: '#ff3fd8', emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.3 });
    const ring = mesh(new THREE.TorusGeometry(2.0 - i * 0.15, 0.12, 8, 20), ringMat, false);
    ring.rotation.x = Math.PI / 2; ring.position.set(center.x, ringY, center.z);
    world.props.add(ring); emitters.push(ring);
  }
  const dish = cyl(2.0, 0.3, 1.0, Mat.panel(0), 12);
  dish.position.set(center.x, y + towerHeight + 0.6, center.z); dish.rotation.x = 1.1; world.props.add(dish);
  const warnLight = pointGlow(COLORS.violet, 10, 20); warnLight.position.set(center.x, y + towerHeight, center.z); world.props.add(warnLight);

  const towers = [];
  for (const a of [gateAngle + 1.1, gateAngle - 1.1]) {
    const px = center.x + Math.cos(a) * (outerR - 3), pz = center.z + Math.sin(a) * (outerR - 3);
    towers.push(buildWatchtower(world, new THREE.Vector3(px, 0, pz), 0, { color: COLORS.violet }));
  }

  const chargePoints = [
    new THREE.Vector3(center.x + 3, y + 1.2, center.z),
    new THREE.Vector3(center.x - 3, y + 1.2, center.z),
  ];
  const anim = { update: () => { const t = performance.now() * 0.001; for (let i = 0; i < emitters.length; i++) emitters[i].material.emissiveIntensity = 1.6 + Math.sin(t * 2 + i * 1.3) * 1.0; dish.rotation.y = t * 0.4; } };
  world.addUpdatable(anim);
  world.props.add(g);
  return { group: g, collider, colliders, emitters, dish, position: new THREE.Vector3(center.x, y, center.z), chargePoints, towers, animated: anim, hum: null };
}

/**
 * Broadcast tower compound: PRIMARY OBJECTIVE 2 + secondary. Perimeter walls with a south gate
 * (open) and a solid north side, an inner courtyard with cover, a control building housing the
 * upload terminal, a re-education block with two cells, propaganda posters, supply caches and
 * destructible fuel cells.
 */
export function buildBroadcastTower(world, center) {
  const g = new THREE.Group();
  const y0 = world.terrain.getHeight(center.x, center.z);
  const halfX = 70, halfZ = 45;
  const v = (dx, dz) => new THREE.Vector3(center.x + dx, 0, center.z + dz);
  const gateW = 6;

  // south gate (open), north side fully closed
  buildWallSegment(world, v(-halfX, halfZ), v(-gateW / 2, halfZ), { height: 3, material: 'metal', mat: Mat.gunMetal(), neonColor: COLORS.cyan });
  buildWallSegment(world, v(gateW / 2, halfZ), v(halfX, halfZ), { height: 3, material: 'metal', mat: Mat.gunMetal(), neonColor: COLORS.cyan });
  buildGate(world, v(0, halfZ), Math.PI / 2, gateW, { color: COLORS.cyan, height: 4 });
  buildWallSegment(world, v(-halfX, -halfZ), v(halfX, -halfZ), { height: 3, material: 'metal', mat: Mat.gunMetal(), neonColor: MAGENTA });
  buildWallSegment(world, v(-halfX, -halfZ), v(-halfX, halfZ), { height: 3, material: 'metal', mat: Mat.gunMetal(), neonColor: COLORS.cyan });
  buildWallSegment(world, v(halfX, -halfZ), v(halfX, halfZ), { height: 3, material: 'metal', mat: Mat.gunMetal(), neonColor: COLORS.cyan });

  // control building: open front housing the terminal, 12 x 6(h) x 8
  const bldgW = 12, bldgH = 6, bldgD = 8, wallT = 0.4, doorW = 4;
  const bldgCenter = new THREE.Vector3(center.x, 0, center.z - 16);
  const by = world.terrain.getHeight(bldgCenter.x, bldgCenter.z);
  const northWall = box(bldgW, bldgH, wallT, Mat.panel(1)); northWall.position.set(bldgCenter.x, by + bldgH / 2, bldgCenter.z - bldgD / 2); world.props.add(northWall);
  world.addBox(northWall.position.clone(), { x: bldgW / 2, y: bldgH / 2, z: wallT / 2 }, 0, { material: 'metal', mesh: northWall });
  const eastWall = box(wallT, bldgH, bldgD, Mat.panel(1)); eastWall.position.set(bldgCenter.x + bldgW / 2, by + bldgH / 2, bldgCenter.z); world.props.add(eastWall);
  world.addBox(eastWall.position.clone(), { x: wallT / 2, y: bldgH / 2, z: bldgD / 2 }, 0, { material: 'metal', mesh: eastWall });
  const westWall = box(wallT, bldgH, bldgD, Mat.panel(1)); westWall.position.set(bldgCenter.x - bldgW / 2, by + bldgH / 2, bldgCenter.z); world.props.add(westWall);
  world.addBox(westWall.position.clone(), { x: wallT / 2, y: bldgH / 2, z: bldgD / 2 }, 0, { material: 'metal', mesh: westWall });
  const roof = box(bldgW, 0.3, bldgD, Mat.panel(2)); roof.position.set(bldgCenter.x, by + bldgH + 0.15, bldgCenter.z); world.props.add(roof);
  const doorStrip1 = cyl(0.05, 0.05, bldgH * 0.7, Mat.neon(COLORS.cyan, 2), 6, false); doorStrip1.position.set(bldgCenter.x - doorW / 2, by + bldgH * 0.5, bldgCenter.z + bldgD / 2); world.props.add(doorStrip1);
  const doorStrip2 = doorStrip1.clone(); doorStrip2.position.x = bldgCenter.x + doorW / 2; world.props.add(doorStrip2);

  const termPos = new THREE.Vector3(bldgCenter.x, by, bldgCenter.z - bldgD / 2 + 1.6);
  const term = terminalProp(world, termPos, Math.PI, { variant: 2 });
  const holo = mesh(planeGeo(2.4, 1.8), Mat.hologram(COLORS.cyan), false);
  holo.position.set(bldgCenter.x, by + 2.0, bldgCenter.z - bldgD / 2 + 0.25); holo.rotation.y = Math.PI; world.props.add(holo);
  const info = { group: g, terminal: { position: termPos, collider: term.collider, mesh: term.mesh } };

  // broadcast mast behind the control building
  const towerPos = new THREE.Vector3(bldgCenter.x + 12, 0, bldgCenter.z - 6);
  const ty = world.terrain.getHeight(towerPos.x, towerPos.z);
  const towerH = 32;
  const tmast = cyl(0.5, 0.9, towerH, Mat.darkMetal(), 10); tmast.position.set(towerPos.x, ty + towerH / 2, towerPos.z); world.props.add(tmast);
  world.addCyl(new THREE.Vector3(towerPos.x, ty + towerH / 2, towerPos.z), 0.9, towerH, { material: 'metal', mesh: tmast });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const strip = cyl(0.04, 0.04, towerH * 0.85, Mat.neon(i % 2 ? COLORS.cyan : (MAGENTA), 2.2), 4, false);
    strip.position.set(towerPos.x + Math.cos(a) * 0.95, ty + towerH * 0.5, towerPos.z + Math.sin(a) * 0.95);
    world.props.add(strip);
  }
  const towerLight = pointGlow(MAGENTA, 8, 20); towerLight.position.set(towerPos.x, ty + towerH, towerPos.z); world.props.add(towerLight);
  info.tower = { position: new THREE.Vector3(towerPos.x, ty, towerPos.z), height: towerH };

  // signage
  const b1 = holoBillboard(world, v(-6, halfZ - 8), Math.PI, { text: 'MERIDIAN BROADCAST HUB K-11', sub: 'RESTRICTED ACCESS', color: COLORS.cyan, mastHeight: 7 });
  const posters = [b1.poster];

  // re-education block, east side, two cells
  const detCenter = v(58, -14);
  const dy0 = world.terrain.getHeight(detCenter.x, detCenter.z);
  const detW = 13, detH = 3, detD = 8;
  const detBody = box(detW, detH, detD, Mat.panel(3)); detBody.position.set(detCenter.x, dy0 + detH / 2, detCenter.z); world.props.add(detBody);
  world.addBox(detBody.position.clone(), { x: detW / 2, y: detH / 2, z: detD / 2 }, 0, { material: 'concrete', mesh: detBody });
  const cells = [];
  for (const side of [-1, 1]) {
    const cellX = detCenter.x + side * 3.2;
    const cellPos = new THREE.Vector3(cellX, dy0, detCenter.z + detD / 2 - 1.8);
    const doorMesh = box(2.1, 2.1, 0.06, Mat.glowAdditive(MAGENTA, 0.35), false);
    doorMesh.position.set(cellX, dy0 + 1.05, detCenter.z + detD / 2 + 0.01);
    world.props.add(doorMesh);
    const consolePosition = new THREE.Vector3(cellX + side * 0.9, dy0, detCenter.z + detD / 2 + 0.7);
    terminalProp(world, consolePosition, Math.PI, { variant: 1 });
    cells.push({ position: cellPos, consolePosition, doorMesh, rescued: false });
  }
  info.cells = cells;

  const p2 = neonSign(world, new THREE.Vector3(detCenter.x + detW / 2 + 0.05, dy0 + 1.6, detCenter.z), Math.PI / 2, { text: 'COMPLIANCE IS COMFORT', color: COLORS.amber, mount: 'wall' });
  posters.push(p2.poster);

  // courtyard dressing: cover, supply caches, destructibles
  const supplyCaches = [];
  const destructibles = [];
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * (halfX - 20);
    const px = center.x + Math.cos(a) * r, pz = center.z + Math.sin(a) * r;
    if (Math.abs(px - bldgCenter.x) < 8 && Math.abs(pz - bldgCenter.z) < 6) continue;
    if (Math.abs(px - detCenter.x) < 9 && Math.abs(pz - detCenter.z) < 6) continue;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    const roll = Math.random();
    if (roll < 0.22) crate(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.38) container(world, p, Math.random() * Math.PI * 2, { postersOut: posters });
    else if (roll < 0.55) concreteBarrier(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.68) trafficBarrier(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.8) dumpster(world, p, Math.random() * Math.PI * 2);
    else if (roll < 0.9) { const r2 = ammoCache(world, p, Math.random() * Math.PI * 2); supplyCaches.push(r2.supplyCache); }
    else { const r2 = barrel(world, p, Math.random() * Math.PI * 2); destructibles.push(r2.destructible); }
  }
  // ensure 2-3 supply caches and 2-4 destructibles minimum
  while (supplyCaches.length < 2) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 10;
    const px = center.x + Math.cos(a) * r, pz = center.z + Math.sin(a) * r;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    const r2 = ammoCache(world, p, Math.random() * Math.PI * 2); supplyCaches.push(r2.supplyCache);
  }
  while (destructibles.length < 2) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 10;
    const px = center.x + Math.cos(a) * r, pz = center.z + Math.sin(a) * r;
    const p = new THREE.Vector3(px, world.terrain.getHeight(px, pz), pz);
    const r2 = barrel(world, p, Math.random() * Math.PI * 2); destructibles.push(r2.destructible);
  }
  info.posters = posters;
  info.supplyCaches = supplyCaches;
  info.destructibles = destructibles;
  world.props.add(g);
  return info;
}

/** Rooftop extraction pad: raised circular deck (walkable) with two walkable ramps, edge lights, holo sign. */
export function buildRooftopPad(world, center) {
  const g = new THREE.Group();
  const y = world.terrain.getHeight(center.x, center.z);
  const R = 14, deckH = 2.2;
  const deck = cyl(R, R, 0.5, Mat.concrete(), 32); deck.position.set(0, deckH - 0.25, 0); g.add(deck);
  const deckCollider = world.addCyl(new THREE.Vector3(center.x, y + deckH - 0.25, center.z), R, 0.5, { material: 'concrete', walkableTop: true, blocksNav: false, mesh: deck });
  const emblem = mesh(planeGeo(9, 9), Mat.emblemDecal('#00e5ff'), false);
  emblem.rotation.x = -Math.PI / 2; emblem.position.set(0, deckH + 0.01, 0); g.add(emblem);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const l = box(0.9, 0.06, 0.2, Mat.neon(COLORS.cyan, 2.4), false);
    l.position.set(Math.cos(a) * (R - 0.6), deckH + 0.02, Math.sin(a) * (R - 0.6)); l.rotation.y = -a; g.add(l);
  }
  g.position.set(center.x, y, center.z);
  world.props.add(g);

  // two walkable ramps built from stacked walkable steps
  const rampColliders = [];
  for (const ang of [Math.PI, Math.PI / 2]) {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      const stepY = deckH * t;
      const dist = R - 0.5 + (1 - t) * 5.5;
      const sx = center.x + Math.cos(ang) * dist, sz = center.z + Math.sin(ang) * dist;
      const stepMesh = box(2.6, 0.4, 1.6, Mat.concrete());
      stepMesh.position.set(sx, y + stepY - 0.2, sz); stepMesh.rotation.y = ang;
      world.props.add(stepMesh);
      rampColliders.push(world.addBox(new THREE.Vector3(sx, y + stepY - 0.2, sz), { x: 1.3, y: 0.2, z: 0.8 }, ang, { material: 'concrete', walkableTop: true, mesh: stepMesh }));
    }
  }

  // holo EXTRACTION sign
  const signPos = new THREE.Vector3(center.x, y, center.z + R + 1);
  holoBillboard(world, signPos, Math.PI, { text: 'EXTRACTION', sub: 'AWAIT DROPSHIP', color: COLORS.cyan, mastHeight: deckH + 2, w: 5, h: 1.8, light: true });

  return { group: g, extraction: { center: new THREE.Vector3(center.x, y + deckH - 0.02, center.z), radius: R }, deckCollider, rampColliders };
}

/** Colossal hologram hovering over a plaza: the Commonwealth's face on the sky. Slowly turns and flickers. */
export function giantHolo(world, pos, opts = {}) {
  const w = opts.w || 34, h = opts.h || 19, y = (opts.height ?? 58);
  const mat = Mat.posterImage(opts.art || HOLO_ART[0], { holo: true }).clone(); mat.opacity = 0.7; mat.fog = false; mat.depthTest = true;
  const plane = new THREE.Mesh(planeGeo(w, h), mat); plane.position.set(pos.x, pos.y + y, pos.z); plane.userData.noMerge = true; plane.renderOrder = 12; world.props.add(plane);
  // dark projection plate behind the art so the picture is never an additive smear over stars, plus fine scanlines
  const plate = new THREE.Mesh(planeGeo(w + 0.4, h + 0.4), new THREE.MeshBasicMaterial({ color: '#03070c', transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, fog: false })); plate.position.z = -0.15; plate.renderOrder = 11; plane.add(plate);
  const scan = new THREE.Mesh(planeGeo(w, h), new THREE.MeshBasicMaterial({ map: Tex.holoGrid().clone(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, color: opts.color || '#00e5ff' })); scan.material.map.needsUpdate = true; scan.material.map.repeat.set(6, 3); scan.material.map.wrapS = scan.material.map.wrapT = THREE.RepeatWrapping; scan.position.z = 0.1; scan.renderOrder = 13; plane.add(scan);
  const frame = new THREE.Mesh(new THREE.EdgesGeometry(planeGeo(w + 0.6, h + 0.6)), new THREE.LineBasicMaterial({ color: opts.color || '#00e5ff', transparent: true, opacity: 0.35 })); plane.add(frame);
  // projector beams from four ground pylons to the corners
  const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]];
  const beams = [];
  for (const [cx, cy] of corners) { const gx = pos.x + Math.sign(cx) * 14, gz = pos.z + (cy < 0 ? -1 : 1) * 10; const g0 = new THREE.Vector3(gx, world.terrain.getHeight(gx, gz), gz); buildPylon(world, g0, 4, opts.color || '#00e5ff'); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 1, 5, 1, true), Mat.glowAdditive(opts.color || '#00e5ff', 0.22)); b.userData.noMerge = true; world.props.add(b); beams.push({ b, g0: g0.clone().setY(g0.y + 4), cx, cy }); }
  const anim = { t: Math.random() * 10, update: (dt) => { anim.t += dt; plane.rotation.y = Math.sin(anim.t * 0.15) * 0.35; mat.opacity = 0.5 + Math.sin(anim.t * 6) * 0.05 + (Math.random() < 0.02 ? -0.25 : 0); const q = plane.quaternion; for (const it of beams) { const c = new THREE.Vector3(it.cx, it.cy, 0).applyQuaternion(q).add(plane.position); const mid = c.clone().add(it.g0).multiplyScalar(0.5); const len = c.distanceTo(it.g0); it.b.position.copy(mid); it.b.scale.set(1, len, 1); it.b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(it.g0).normalize()); } } };
  world.addUpdatable(anim);
  return { plane, anim };
}

/** Orbital tether: a cable from a spire straight up out of the atmosphere, ringed with climbing lights. */
export function skyTether(world, pos, opts = {}) {
  const H = opts.height || 700, color = opts.color || '#ff3fd8';
  const g = new THREE.Group();
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, H, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#1a1c24', roughness: 0.7, metalness: 0.6, emissive: color, emissiveIntensity: 0.12, side: THREE.DoubleSide, fog: false })); cable.position.y = H / 2; g.add(cable);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1.4, 0.12, 6, 20), Mat.neon(color, 1.4), 14); const m = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) { m.makeRotationX(Math.PI / 2); m.setPosition(0, 6 + i * (H / 14), 0); rings.setMatrixAt(i, m); } rings.instanceMatrix.needsUpdate = true; g.add(rings);
  g.position.set(pos.x, pos.y, pos.z); g.userData.noMerge = true; world.props.add(g);
  const anim = { t: 0, update: (dt) => { anim.t += dt; rings.position.y = (anim.t * 6) % (H / 14); } };
  world.addUpdatable(anim);
  return { group: g, anim };
}
