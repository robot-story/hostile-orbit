// Prop builders for Blacksite Meridian: cover objects, wrecks, signage, utility props, rocks.
// Every builder is `(world, position, yaw = 0, opts = {}) => result`, adds meshes to `world.props`,
// and registers colliders via world.addBox/addCyl with the correct `material` tag so gunplay/cover
// systems classify surfaces correctly. `position.y` must already be resolved against the terrain
// (world.terrain.getHeight) by the caller — builders never hardcode y.
// Geometries are cached by exact dimensions so repeated crates/containers/etc share GPU buffers.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { Tex } from '../render/textures.js';
import { rand, randInt, pick, clamp } from '../core/mathx.js';

const _geoCache = new Map();
function boxGeo(w, h, d) { const k = `b:${w}:${h}:${d}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return _geoCache.get(k); }
function cylGeo(rt, rb, h, seg = 12) { const k = `c:${rt}:${rb}:${h}:${seg}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg)); return _geoCache.get(k); }
function icoGeo(r, detail = 1) { const k = `i:${r}:${detail}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.IcosahedronGeometry(r, detail)); return _geoCache.get(k); }
function planeGeo(w, h) { const k = `p:${w}:${h}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.PlaneGeometry(w, h)); return _geoCache.get(k); }
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; }
function box(w, h, d, mat, shadow = true) { return mesh(boxGeo(w, h, d), mat, shadow); }
function cyl(rt, rb, h, mat, seg = 12, shadow = true) { return mesh(cylGeo(rt, rb, h, seg), mat, shadow); }

let _posterIdx = 0;
const SLOGANS = [
  ['A Cleaner Tomorrow, Together.', 'MERIDIAN COMMONWEALTH'],
  ['Freedom Is Always Listening.', 'MERIDIAN COMMONWEALTH'],
  ['Your Sacrifice Has Been Pre-Approved.', 'MERIDIAN COMMONWEALTH'],
  ['Compliance Creates Choice.', 'MERIDIAN COMMONWEALTH'],
  ['Every Citizen Is Unique. Approved Variations Apply.', 'MERIDIAN COMMONWEALTH'],
  ['The Future Needs Fewer Questions.', 'MERIDIAN COMMONWEALTH'],
  ['Peace Through Superior Customer Service.', 'MERIDIAN COMMONWEALTH'],
  ['Privacy Is Where Disloyalty Grows.', 'MERIDIAN COMMONWEALTH'],
  ['Your Opinion Matters. Please Select From The Available Options.', 'MERIDIAN COMMONWEALTH'],
  ['Meridian: Building Tomorrow Over The Remains Of Today.', 'MERIDIAN COMMONWEALTH'],
];
export function randomSlogan() { return SLOGANS[_posterIdx++ % SLOGANS.length]; }

function place(g, position, yaw) { g.position.copy(position); g.rotation.y = yaw; }

// ---------------------------------------------------------------- crates ---
export function crate(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const mat = opts.mat || Mat.panel(randInt(0, 3));
  const body = box(1.2, 1.2, 1.2, mat); body.position.y = 0.6; g.add(body);
  const stripe = box(1.24, 0.12, 1.24, Mat.hazard()); stripe.position.y = 0.08; g.add(stripe);
  const light = box(0.8, 0.05, 0.05, Mat.neon(COLORS.cyan, 2), false); light.position.set(0, 0.95, 0.61); g.add(light);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.6, position.z), { x: 0.62, y: 0.6, z: 0.62 }, yaw, { material: 'metal', mesh: body });
  return { group: g, collider };
}

export function crateStack(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const n = opts.count || randInt(2, 3);
  let y = 0;
  const colliders = [];
  for (let i = 0; i < n; i++) {
    const ox = i > 0 ? rand(-0.15, 0.15) : 0, oz = i > 0 ? rand(-0.15, 0.15) : 0;
    const mat = Mat.panel(randInt(0, 3));
    const body = box(1.15, 1.1, 1.15, mat); body.position.set(ox, y + 0.55, oz); g.add(body);
    if (i === n - 1) { const stripe = box(1.2, 0.1, 1.2, Mat.hazard()); stripe.position.set(ox, y + 0.06, oz); g.add(stripe); }
    place(g, position, yaw);
    world.props.add(g);
    colliders.push(world.addBox(new THREE.Vector3(position.x + ox, position.y + y + 0.55, position.z + oz), { x: 0.58, y: 0.55, z: 0.58 }, yaw, { material: 'metal', mesh: body }));
    y += 1.1;
  }
  return { group: g, colliders };
}

// -------------------------------------------------------------- container ---
export function container(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const w = 6, h = 2.6, d = 2.4;
  const mat = Mat.panel(randInt(0, 3));
  const body = box(w, h, d, mat); body.position.y = h / 2; g.add(body);
  const ribInterval = 0.75;
  for (let x = -w / 2 + ribInterval; x < w / 2; x += ribInterval) {
    const rib = box(0.06, h - 0.1, 0.03, Mat.darkMetal(), false); rib.position.set(x, h / 2, d / 2 + 0.02); g.add(rib);
  }
  const doorFrame = box(0.15, h, 0.15, Mat.darkMetal()); doorFrame.position.set(w / 2 - 0.08, h / 2, 0); g.add(doorFrame);
  const strip = box(0.06, h - 0.3, 0.06, Mat.neon(opts.faction === 'legion' ? COLORS.redOrange : COLORS.cyan, 2.4), false);
  strip.position.set(-w / 2 + 0.1, h / 2, d / 2 + 0.03); g.add(strip);
  if (opts.poster !== false && Math.random() < 0.5) {
    const [slogan, sub] = randomSlogan();
    const pw = 2.0, ph = 1.6;
    const p = mesh(planeGeo(pw, ph), Mat.poster(slogan, sub, opts.faction === 'legion' ? COLORS.redOrange : COLORS.cyan, _posterIdx));
    p.rotation.y = Math.PI / 2; p.position.set(w / 2 + 0.01, h / 2, 0);
    g.add(p);
    opts.postersOut && opts.postersOut.push(p);
  }
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + h / 2, position.z), { x: w / 2, y: h / 2, z: d / 2 }, yaw, { material: 'metal', mesh: body });
  return { group: g, collider };
}

// --------------------------------------------------------------- barrier ---
export function barrier(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const w = 2.4, h = 1.1, dBot = 0.6, dTop = 0.3;
  const lower = box(w, h * 0.6, dBot, Mat.concrete()); lower.position.y = h * 0.3; g.add(lower);
  const upper = box(w, h * 0.4, dTop, Mat.concrete()); upper.position.y = h * 0.6 + h * 0.2; g.add(upper);
  const stripe = box(w + 0.02, 0.12, dBot + 0.02, Mat.hazard()); stripe.position.y = 0.5; g.add(stripe);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + h / 2, position.z), { x: w / 2, y: h / 2, z: dBot / 2 }, yaw, { material: 'concrete', mesh: lower });
  return { group: g, collider };
}

// ------------------------------------------------------------ sandbagWall ---
export function sandbagWall(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const len = opts.length || 3;
  const h = 0.9;
  const n = Math.max(3, Math.round(len / 0.7));
  const mat = Mat.concrete();
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    for (let row = 0; row < 2; row++) {
      const bag = mesh(icoGeo(0.36, 0), mat);
      bag.scale.set(1.1, 0.55, 0.75);
      bag.position.set(x + (row % 2 ? 0.15 : -0.1), 0.22 + row * 0.36, 0);
      g.add(bag);
    }
  }
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + h / 2, position.z), { x: len / 2, y: h / 2, z: 0.45 }, yaw, { material: 'concrete', mesh: g });
  return { group: g, collider };
}

// --------------------------------------------------------------- wrecks ---
export function wreckedTransport(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const flicker = new THREE.MeshStandardMaterial({ color: COLORS.redOrange, emissive: COLORS.redOrange, emissiveIntensity: 1.6, roughness: 0.5 });
  const hull = box(10, 3, 3.4, Mat.darkMetal()); hull.rotation.z = 0.12; hull.position.set(0, 1.6, 0); g.add(hull);
  const nose = mesh(cylGeo(0, 1.6, 3, 8), Mat.darkMetal()); nose.rotation.z = Math.PI / 2; nose.position.set(5.6, 1.9, 0); g.add(nose);
  const tail = box(3.2, 2, 3, Mat.panel(2)); tail.rotation.z = -0.35; tail.position.set(-5.5, 2.6, 0.4); g.add(tail);
  const wingL = box(4.2, 0.25, 1.4, Mat.darkMetal()); wingL.rotation.set(0, 0.3, 0.5); wingL.position.set(-1, 2.6, 2.3); g.add(wingL);
  for (const [dx, dz] of [[2, 1.5], [-2.5, -1.4]]) {
    const glow = box(0.5, 0.1, 0.1, flicker, false); glow.position.set(dx, 1.9, dz); g.add(glow);
  }
  place(g, position, yaw);
  world.props.add(g);
  const colliders = [
    world.addBox(new THREE.Vector3(position.x, position.y + 1.6, position.z), { x: 5, y: 1.5, z: 1.6 }, yaw, { material: 'metal', mesh: hull }),
    world.addBox(new THREE.Vector3(position.x - 5.3, position.y + 2.4, position.z + 0.4), { x: 1.5, y: 1, z: 1.5 }, yaw, { material: 'metal', mesh: tail }),
  ];
  const animated = { update: (dt) => { flicker.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.006 + position.x) * 0.6 + (Math.random() < 0.02 ? -1 : 0); } };
  world.addUpdatable(animated);
  return { group: g, colliders, animated };
}

export function wreckedTruck(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const body = box(4.2, 1.6, 2, Mat.panel(1)); body.rotation.z = 0.15; body.position.set(0, 1, 0); g.add(body);
  const cab = box(1.6, 1.4, 1.9, Mat.darkMetal()); cab.position.set(1.6, 1.5, 0); g.add(cab);
  for (const dx of [-1.4, 1.2]) {
    const wheel = mesh(cylGeo(0.5, 0.5, 0.4, 10), Mat.darkMetal());
    wheel.rotation.x = Math.PI / 2; wheel.position.set(dx, 0.5, 1.05); g.add(wheel);
    const wheel2 = wheel.clone(); wheel2.position.z = -1.05; g.add(wheel2);
  }
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 1, position.z), { x: 2.2, y: 1, z: 1.1 }, yaw, { material: 'metal', mesh: body });
  return { group: g, collider };
}

// --------------------------------------------------------------- barrel ---
export function barrel(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#7a1f10', roughness: 0.55, metalness: 0.4, emissive: COLORS.redOrange, emissiveIntensity: 0.15 });
  const body = cyl(0.42, 0.42, 0.9, mat); body.position.y = 0.45; g.add(body);
  const cap = cyl(0.44, 0.44, 0.06, Mat.darkMetal()); cap.position.y = 0.9; g.add(cap);
  const warn = mesh(planeGeo(0.5, 0.5), Mat.hazard()); warn.rotation.x = -Math.PI / 2; warn.position.y = 0.94; g.add(warn);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addCyl(new THREE.Vector3(position.x, position.y + 0.45, position.z), 0.45, 0.9, { material: 'metal', mesh: body });
  const destructible = { type: 'barrel', position: position.clone(), collider, mesh: body, radius: 4, damage: 60 };
  collider.destructible = destructible;
  return { group: g, collider, destructible };
}

// ----------------------------------------------------------- ammoCache ---
export function ammoCache(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const crateBody = box(1.4, 0.7, 1.0, Mat.panel(0)); crateBody.position.y = 0.35; g.add(crateBody);
  const lid = box(1.4, 0.08, 1.0, Mat.panel(0)); lid.position.set(0, 0.72, -0.55); lid.rotation.x = -0.9; g.add(lid);
  for (let i = 0; i < 4; i++) {
    const b = box(0.22, 0.35, 0.6, Mat.neon(COLORS.cyan, 1.6));
    b.position.set(-0.5 + i * 0.32, 0.55 + (i % 2) * 0.05, 0.1); g.add(b);
  }
  const light = new THREE.PointLight(COLORS.cyan, 3, 6, 2); light.position.y = 0.8; light.castShadow = false; g.add(light);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.35, position.z), { x: 0.72, y: 0.35, z: 0.52 }, yaw, { material: 'metal', mesh: crateBody });
  const supplyCache = { position: position.clone(), collider };
  return { group: g, collider, supplyCache };
}

// ---------------------------------------------------------- lightTower ---
export function lightTower(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || COLORS.cyan;
  const height = 8;
  const base = box(1, 0.4, 1, Mat.panel(1)); base.position.y = 0.2; g.add(base);
  const mast = cyl(0.18, 0.24, height, Mat.darkMetal()); mast.position.y = height / 2 + 0.4; g.add(mast);
  const panel = box(1.6, 0.9, 0.12, new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: 2 }));
  panel.position.set(0, height + 0.5, 0); panel.rotation.x = -0.3; g.add(panel);
  const light = new THREE.PointLight(color, 10, 22, 2); light.position.set(0, height + 0.3, 0.6); light.castShadow = false; g.add(light);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + height / 2 + 0.4, position.z), { x: 0.28, y: height / 2 + 0.2, z: 0.28 }, yaw, { material: 'metal', cover: false, mesh: mast });
  return { group: g, collider, light };
}

// ------------------------------------------------------------ billboard ---
export function billboard(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const [slogan, sub] = opts.slogan ? [opts.slogan, opts.sub || 'MERIDIAN COMMONWEALTH'] : randomSlogan();
  const accent = opts.accent || COLORS.cyan;
  const w = 4, h = 3;
  for (const dx of [-1.6, 1.6]) {
    const post = box(0.2, 4.2, 0.2, Mat.darkMetal()); post.position.set(dx, 2.1, 0); g.add(post);
  }
  const frame = box(w + 0.2, h + 0.2, 0.12, Mat.darkMetal()); frame.position.set(0, 3.4, 0); g.add(frame);
  const p = mesh(planeGeo(w, h), Mat.poster(slogan, sub, accent, _posterIdx++));
  p.position.set(0, 3.4, 0.1); g.add(p);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 2.1, position.z), { x: 0.3, y: 2.1, z: 0.3 }, yaw, { material: 'metal', cover: false, mesh: g });
  opts.postersOut && opts.postersOut.push(p);
  return { group: g, collider, poster: p };
}

// ---------------------------------------------------------- posterFrame ---
export function posterFrame(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const [slogan, sub] = opts.slogan ? [opts.slogan, opts.sub || 'MERIDIAN COMMONWEALTH'] : randomSlogan();
  const accent = opts.accent || COLORS.cyan;
  const w = opts.w || 2.4, h = opts.h || 3;
  const frame = box(w + 0.1, h + 0.1, 0.06, Mat.darkMetal(), false); frame.position.z = -0.02; g.add(frame);
  const p = mesh(planeGeo(w, h), Mat.poster(slogan, sub, accent, _posterIdx++));
  g.add(p);
  place(g, position, yaw);
  world.props.add(g);
  opts.postersOut && opts.postersOut.push(p);
  return { group: g, poster: p };
}

// -------------------------------------------------------------- terminal ---
export function terminal(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const stand = box(0.5, 1.0, 0.4, Mat.panel(1)); stand.position.y = 0.5; g.add(stand);
  const screen = box(0.5, 0.5, 0.06, Mat.screen(opts.variant || 0));
  screen.position.set(0, 1.15, 0.15); screen.rotation.x = -0.5; g.add(screen);
  const light = new THREE.PointLight(COLORS.cyan, 1.5, 4, 2); light.position.y = 1.2; light.castShadow = false; g.add(light);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + 0.5, position.z), { x: 0.3, y: 0.5, z: 0.24 }, yaw, { material: 'metal', mesh: stand });
  return { group: g, collider, mesh: screen };
}

// ------------------------------------------------------------ antennaMast ---
export function antennaMast(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const height = opts.height || 10;
  const mast = cyl(0.12, 0.2, height, Mat.darkMetal()); mast.position.y = height / 2; g.add(mast);
  for (let i = 0; i < 3; i++) {
    const arm = box(1.4 - i * 0.3, 0.05, 0.05, Mat.darkMetal(), false); arm.position.y = height - 1 - i * 1.6; g.add(arm);
  }
  const beacon = new THREE.Mesh(icoGeo(0.12, 0), Mat.neon(COLORS.red, 3)); beacon.position.y = height + 0.15; g.add(beacon);
  const light = new THREE.PointLight(COLORS.red, 4, 10, 2); light.position.y = height + 0.15; light.castShadow = false; g.add(light);
  place(g, position, yaw);
  world.props.add(g);
  const collider = world.addBox(new THREE.Vector3(position.x, position.y + height / 2, position.z), { x: 0.2, y: height / 2, z: 0.2 }, yaw, { material: 'metal', cover: false, mesh: mast });
  return { group: g, collider, beacon };
}

// ----------------------------------------------------------------- rocks ---
function rockMesh(scale, matFn) {
  const m = mesh(icoGeo(1, 1), matFn());
  const geo = m.geometry;
  if (!geo.userData.jittered) {
    const pos = geo.attributes.position;
    const rnd = () => (Math.random() - 0.5);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * (1 + rnd() * 0.28), pos.getY(i) * (1 + rnd() * 0.28), pos.getZ(i) * (1 + rnd() * 0.28));
    }
    geo.computeVertexNormals();
    geo.userData.jittered = true;
  }
  m.scale.set(scale.x, scale.y, scale.z);
  return m;
}
function rockBuilder(baseR) {
  return (world, position, yaw = 0, opts = {}) => {
    const g = new THREE.Group();
    const s = baseR * rand(0.85, 1.2);
    const matFn = Math.random() < 0.3 ? Mat.rockDust : Mat.rock;
    const m = rockMesh({ x: s, y: s * rand(0.7, 1.0), z: s }, matFn);
    m.position.y = s * 0.35;
    m.rotation.set(rand(0, 1), rand(0, 6.28), rand(0, 1));
    g.add(m);
    place(g, position, yaw);
    world.props.add(g);
    const collider = world.addCyl(new THREE.Vector3(position.x, position.y + s * 0.35, position.z), s * 0.75, s * 1.1, { material: 'rock', mesh: m });
    return { group: g, collider };
  };
}
export const rockSmall = rockBuilder(0.6);
export const rockMedium = rockBuilder(1.3);
export const rockLarge = rockBuilder(2.4);

export function rockCluster(world, position, yaw = 0, opts = {}) {
  const n = opts.count || randInt(3, 5);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0, 2.2);
    const p = new THREE.Vector3(position.x + Math.cos(a) * d, position.y, position.z + Math.sin(a) * d);
    const fn = pick([rockSmall, rockSmall, rockMedium]);
    parts.push(fn(world, p, rand(0, 6.28)));
  }
  return { parts };
}

/**
 * Scatter decorative (non-colliding) rocks along rock-wall edges using InstancedMesh — cheap for
 * hundreds of instances. `samples` is an array of {x,z,scale?} world-space points already known to
 * sit in/near the rock wall (floorDistance > ~2). No colliders are created (purely visual dressing).
 */
export function buildRockWallInstances(world, samples, opts = {}) {
  if (!samples.length) return null;
  const geo = icoGeo(1, 1);
  if (!geo.userData.jittered) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const rnd = () => (Math.random() - 0.5);
      pos.setXYZ(i, pos.getX(i) * (1 + rnd() * 0.3), pos.getY(i) * (1 + rnd() * 0.3), pos.getZ(i) * (1 + rnd() * 0.3));
    }
    geo.computeVertexNormals();
    geo.userData.jittered = true;
  }
  const mat = Mat.rock();
  const inst = new THREE.InstancedMesh(geo, mat, samples.length);
  inst.castShadow = true; inst.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const scale = p.scale || rand(0.5, 1.8);
    e.set(rand(0, 1), rand(0, 6.28), rand(0, 1));
    q.setFromEuler(e);
    s.set(scale, scale * rand(0.7, 1.0), scale);
    m.compose(new THREE.Vector3(p.x, p.y + scale * 0.3, p.z), q, s);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  world.props.add(inst);
  return inst;
}
