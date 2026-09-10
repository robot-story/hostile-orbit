// Player robot frames: three procedural designs that ride on the standard soldier rig (bones drive rigid parts, so the
// animator, IK, weapon sockets and gore fallbacks are untouched). Each frame has its own locomotion flavour handled by
// `model.motion` (called every frame with the ground velocity):
//   a  OUTRIDER  torso on a single monowheel; spins, banks into turns, counterweights swing
//   b  HALO      legless torso on a ring of thrusters; hovers, tilts into motion, flames scale with speed
//   c  BULWARK   heavy biped; servo walk, amber joint rings pulse on footfalls
// Armour tiles come from OpenAI-generated seamless textures in public/textures/gen/tex_robot_*.jpg.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { damp, clamp } from '../core/mathx.js';

const _loader = new THREE.TextureLoader();
const _base = (import.meta.env.BASE_URL || './') + 'textures/gen/';
const _tex = {};
function tile(id, repeat = 1) {
  const key = id + ':' + repeat;
  if (!_tex[key]) { const t = _loader.load(_base + id + '.jpg'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(repeat, repeat); _tex[key] = t; }
  return _tex[key];
}
const _mats = {};
function armour(kind, tint = '#ffffff') {
  const key = kind + tint;
  if (_mats[key]) return _mats[key];
  const spec = { ceramic: ['tex_robot_ceramic', 0.55, 0.15, 2.2], carbon: ['tex_robot_carbon', 0.6, 0.45, 2.0], gunmetal: ['tex_robot_gunmetal', 0.5, 0.7, 1.8] }[kind];
  const m = new THREE.MeshStandardMaterial({ map: tile(spec[0], spec[3]), roughness: spec[1], metalness: spec[2], color: tint });
  _mats[key] = m; return m;
}
const neon = (c, i = 1.6) => Mat.neon(c, i);
const neonOwn = (c, i = 1.6) => Mat.neon(c, i).clone(); // animated per instance
const glowOwn = (c, o) => Mat.glowAdditive(c, o).clone();
const dark = () => Mat.darkMetal();

// ------------------------------------------------------------------ part helpers (bone-local placement)
function add(bone, mesh, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  mesh.position.set(...pos); mesh.rotation.set(...rot); if (scale !== 1) mesh.scale.setScalar(scale);
  mesh.castShadow = true; mesh.receiveShadow = true; bone.add(mesh); return mesh;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sphere = (r, m, seg = 20) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
const torus = (R, r, m, seg = 40) => new THREE.Mesh(new THREE.TorusGeometry(R, r, 10, seg), m);
const capsule = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m);
/** Chamfered plate: a box with its edges bevelled by scaling a second, slightly smaller box outward. */
function plate(w, h, d, m, bevel = 0.02) { const g = new THREE.Group(); g.add(box(w - bevel * 2, h, d - bevel * 2, m)); g.add(box(w, h - bevel * 2, d - bevel * 2, m)); g.add(box(w - bevel * 2, h - bevel * 2, d, m)); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }
/** Inset light channel: a dark groove plate with a thin emissive core recessed into it (reads as light escaping a seam). */
function channel(len, c, i = 0.85, wide = 0.026) { const g = new THREE.Group(); const groove = box(len + 0.02, wide, 0.02, new THREE.MeshStandardMaterial({ color: '#0a0b0e', roughness: 0.9 })); groove.position.z = -0.004; g.add(groove); const core = box(len, wide * 0.42, 0.012, neon(c, i)); core.castShadow = false; core.position.z = 0.004; g.add(core); return g; }
const strip = (len, c, thick = 0.018, i = 1.8) => { const s = box(len, thick, thick * 0.7, neon(c, i)); s.castShadow = false; return s; };

/** Shared arm build: layered upper arm, forearm plate with a light channel, articulated hand block. */
function buildArms(B, P) {
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    // shoulder pauldron
    add(B['shoulder' + side], plate(0.28, 0.16, 0.3, P.primary, 0.025), [sx * 0.07, 0.05, 0]);
    add(B['shoulder' + side], strip(0.16, P.accent), [sx * 0.05, 0.115, 0.06], [0, 0, 0]);
    // upper arm: capsule core + outer plate
    add(B['upperArm' + side], capsule(0.075, 0.16, P.secondary), [0, -0.15, 0]);
    add(B['upperArm' + side], plate(0.11, 0.2, 0.13, P.primary, 0.015), [sx * 0.035, -0.16, 0]);
    // elbow joint ring
    const ring = add(B['forearm' + side], torus(0.055, 0.016, neonOwn(P.joint, 1.4), 24), [0, 0.0, 0], [0, Math.PI / 2, 0]); ring.castShadow = false; P.joints.push(ring);
    // forearm: box + channel light + wrist collar
    add(B['forearm' + side], box(0.12, 0.24, 0.14, P.secondary), [0, -0.14, 0]);
    add(B['forearm' + side], plate(0.12, 0.18, 0.08, P.primary, 0.015), [0, -0.13, 0.05]);
    add(B['forearm' + side], strip(0.16, P.accent, 0.014), [0, -0.13, 0.095], [0, 0, Math.PI / 2]);
    add(B['forearm' + side], cyl(0.05, 0.055, 0.04, dark(), 12), [0, -0.26, 0]);
    // hand
    add(B['hand' + side], box(0.08, 0.1, 0.09, P.secondary), [0, -0.05, 0.01]);
    for (let f = 0; f < 3; f++) add(B['hand' + side], box(0.02, 0.06, 0.02, dark()), [-0.025 + f * 0.025, -0.12, 0.03], [0.5, 0, 0]);
  }
}

/** Shared torso core (spine/chest) with per-design plating on top. */
function buildCore(B, P) {
  // pelvis block on the root bone with hip joint caps: closes the gap between abdomen and whatever carries the frame
  add(B.root, box(0.34, 0.2, 0.28, P.secondary), [0, -0.06, 0]);
  add(B.root, plate(0.3, 0.1, 0.12, P.primary, 0.015), [0, -0.05, 0.14]);
  add(B.root, strip(0.22, P.accent, 0.012, 1.2), [0, -0.12, 0.2]);
  for (const sx of [-1, 1]) { const hip = cyl(0.07, 0.07, 0.1, dark(), 12); hip.rotation.z = Math.PI / 2; hip.position.set(sx * 0.16, -0.08, 0); hip.castShadow = true; B.root.add(hip); }
  add(B.spine, box(0.36, 0.22, 0.26, P.secondary), [0, 0.02, 0]);              // abdomen
  add(B.spine, strip(0.2, P.accent, 0.012, 1.2), [0, 0.0, 0.115]);
  add(B.chest, box(0.5, 0.32, 0.32, P.secondary), [0, 0.1, 0]);                // ribcage block
  add(B.chest, plate(0.22, 0.24, 0.14, P.secondary, 0.02), [0, 0.1, -0.16]);  // backpack
  add(B.chest, cyl(0.05, 0.05, 0.16, dark(), 8), [-0.1, 0.12, -0.24], [0.2, 0, 0]);
  add(B.chest, cyl(0.05, 0.05, 0.16, dark(), 8), [0.1, 0.12, -0.24], [0.2, 0, 0]);
  add(B.neck, cyl(0.07, 0.08, 0.1, dark(), 12), [0, 0.0, 0]);
}

// ------------------------------------------------------------------ bevelled geometry + decals (OUTRIDER grade)
const _bevelCache = new Map();
/** Real chamfered plate: rounded-rect extrusion with bevel, centred, depth along local Z. */
function bevelBox(w, h, d, m, bevel = 0.02, r = 0.02) {
  const key = `bb:${w}:${h}:${d}:${bevel}:${r}`;
  let g = _bevelCache.get(key);
  if (!g) {
    const sh = new THREE.Shape(); const x = -w / 2 + bevel, y = -h / 2 + bevel, W = w - bevel * 2, H = h - bevel * 2;
    sh.moveTo(x + r, y); sh.lineTo(x + W - r, y); sh.quadraticCurveTo(x + W, y, x + W, y + r); sh.lineTo(x + W, y + H - r); sh.quadraticCurveTo(x + W, y + H, x + W - r, y + H); sh.lineTo(x + r, y + H); sh.quadraticCurveTo(x, y + H, x, y + H - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
    g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 }); g.center(); g.computeVertexNormals();
    _bevelCache.set(key, g);
  }
  return new THREE.Mesh(g, m);
}
/** Hexagonal plate (flat-top), depth along local Z. */
function hexPlate(rad, d, m, bevel = 0.012) {
  const key = `hx:${rad}:${d}:${bevel}`; let g = _bevelCache.get(key);
  if (!g) { const sh = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; if (i) sh.lineTo(px, py); else sh.moveTo(px, py); } sh.closePath(); g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 }); g.center(); g.computeVertexNormals(); _bevelCache.set(key, g); }
  return new THREE.Mesh(g, m);
}
/** Lathe profile helper: points as [radius, y] pairs. */
function lathe(pts, m, seg = 28) { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.computeVertexNormals(); return new THREE.Mesh(g, m); }
/** Tube along a curve of points. */
function tube(points, radius, m, seg = 16) { const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal', 0.5); return new THREE.Mesh(new THREE.TubeGeometry(c, seg, radius, 8, false), m); }
/** Canvas decal (transparent) painted onto a small plane floating just off a surface. */
function decal(kind, color, w, h) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w); const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  if (kind === 'unit') { x.fillStyle = color; x.font = '900 150px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('07', c.width / 2, c.height / 2 + 6); x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '700 30px Arial'; x.fillText('ORBITAL ASSAULT', c.width / 2, c.height - 22); }
  else if (kind === 'chevron') { x.fillStyle = color; x.lineWidth = 26; x.strokeStyle = color; x.beginPath(); x.moveTo(30, 40); x.lineTo(c.width / 2, c.height - 40); x.lineTo(c.width - 30, 40); x.stroke(); }
  else if (kind === 'hazard') { for (let i = -2; i < 10; i++) { x.fillStyle = i % 2 ? '#111' : '#f2c744'; x.beginPath(); x.moveTo(i * 40, 0); x.lineTo(i * 40 + 40, 0); x.lineTo(i * 40 + 20, c.height); x.lineTo(i * 40 - 20, c.height); x.closePath(); x.fill(); } }
  else if (kind === 'tech') { x.strokeStyle = color; x.lineWidth = 4; for (let i = 0; i < 6; i++) { x.globalAlpha = 0.35 + (i % 3) * 0.2; x.strokeRect(12 + i * 38, 14 + (i % 2) * 20, 26, c.height - 40); } x.globalAlpha = 1; x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '700 22px Arial'; x.fillText('MC-7 // OUTRIDER', 14, c.height - 10); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, emissive: color, emissiveMap: t, emissiveIntensity: kind === 'hazard' ? 0 : 0.35 }));
  mesh.castShadow = false; return mesh;
}

// ------------------------------------------------------------------ A. OUTRIDER (monowheel) -- the protagonist frame
function buildOutrider(model, opts = {}) {
  const B = model.bones; const N = opts.neon || COLORS.cyan;
  const ceramic = armour('ceramic'), carbon = armour('carbon'), gun = armour('gunmetal'), gunLight = armour('gunmetal', '#b9bec8'), slate = armour('gunmetal', '#6a7486');
  const P = { primary: ceramic, secondary: carbon, accent: N, joint: N, joints: [] };
  const glow = (i = 2) => neonOwn(N, i); const glowS = (i = 2) => neon(N, i);
  model.neonColor = N;
  // ---- pelvis + abdomen: three tapering segment bands with a glow channel down the spine
  add(B.root, bevelBox(0.44, 0.18, 0.34, carbon, 0.025, 0.04), [0, -0.02, 0]);
  for (const sx of [-1, 1]) add(B.root, bevelBox(0.08, 0.26, 0.3, carbon, 0.015, 0.03), [sx * 0.19, -0.16, 0]); // saddle cheeks hanging beside the tyre
  add(B.root, bevelBox(0.34, 0.12, 0.06, slate, 0.015, 0.03), [0, -0.03, 0.17]);
  for (const sx of [-1, 1]) { add(B.root, bevelBox(0.1, 0.2, 0.3, ceramic, 0.02, 0.04), [sx * 0.29, -0.04, 0]); add(B.root, strip(0.16, N, 0.012, 1.4), [sx * 0.345, -0.04, 0.02], [0, 0, 0]).rotation.y = Math.PI / 2; }
  for (const sx of [-1, 1]) { const hip = lathe([[0.04, -0.06], [0.08, -0.06], [0.09, -0.02], [0.09, 0.02], [0.08, 0.06], [0.04, 0.06]], gun, 16); hip.rotation.z = Math.PI / 2; hip.position.set(sx * 0.19, -0.08, 0); add(B.root, hip); }
  for (let i = 0; i < 3; i++) add(B.spine, bevelBox(0.3 + i * 0.03, 0.07, 0.24 + i * 0.015, i % 2 ? slate : carbon, 0.012), [0, -0.03 + i * 0.075, 0]); // waist tapers up into the chest
  add(B.spine, channel(0.14, N, 1.6), [0, 0.02, 0.15], [0, 0, Math.PI / 2]);
  // hip fairings: canted ceramic trapezoids from the saddle down past the wheel top, hazard decal on the inner face
  for (const sx of [-1, 1]) { add(B.root, bevelBox(0.2, 0.4, 0.09, ceramic, 0.02, 0.04), [sx * 0.31, -0.28, 0.02], [0, 0, sx * -0.22]); add(B.root, bevelBox(0.16, 0.34, 0.05, carbon, 0.015), [sx * 0.29, -0.28, 0.0], [0, 0, sx * -0.22]); add(B.root, channel(0.3, N, 1.6, 0.02), [sx * 0.355, -0.28, 0.04], [0, 0, Math.PI / 2 + sx * -0.22]); add(B.root, decal('hazard', N, 0.1, 0.03), [sx * 0.33, -0.44, 0.07], [0, 0, sx * -0.22]); }
  // ---- chest: rib block, angled upper plate, lower plate, collar, hex reactor with a recess ring, side ribs
  add(B.chest, bevelBox(0.44, 0.34, 0.28, carbon, 0.025), [0, 0.1, 0]);
  add(B.chest, bevelBox(0.44, 0.18, 0.09, ceramic, 0.025, 0.03), [0, 0.225, 0.14], [0.22, 0, 0]);
  add(B.chest, bevelBox(0.4, 0.16, 0.08, slate, 0.025, 0.03), [0, 0.0, 0.15], [-0.2, 0, 0]);
  add(B.chest, bevelBox(0.22, 0.04, 0.18, gun, 0.01), [0, 0.28, 0.0]);                                   // collar (low, leaves the neck visible)
  add(B.chest, hexPlate(0.085, 0.05, gun), [0, 0.11, 0.2]);                                                // reactor housing
  const reactor = add(B.chest, hexPlate(0.055, 0.02, glow(1.4)), [0, 0.11, 0.225]); reactor.castShadow = false; model.reactor = reactor;
  const reactorRing = add(B.chest, torus(0.068, 0.006, glowS(1.4), 6), [0, 0.11, 0.228]); reactorRing.castShadow = false; model.reactorRing = reactorRing;
  for (const sx of [-1, 1]) { for (let i = 0; i < 3; i++) add(B.chest, bevelBox(0.04, 0.05, 0.22, i === 1 ? ceramic : gun, 0.008), [sx * (0.27 + i * 0.0), 0.0 + i * 0.075, -0.02]); }
  add(B.chest, channel(0.28, N), [0, 0.19, 0.205], [0.22, 0, 0]); add(B.chest, channel(0.16, N), [0, -0.045, 0.205], [-0.2, 0, 0]);
  for (const sx of [-1, 1]) add(B.chest, channel(0.22, N, 1.6), [sx * 0.255, 0.1, 0.02], [0, sx * Math.PI / 2, Math.PI / 2]);
  // back: spine ridge with glow channel, backpack block with twin vent stacks and a hazard decal
  add(B.chest, bevelBox(0.28, 0.3, 0.14, carbon, 0.02), [0, 0.1, -0.2]);
  add(B.chest, bevelBox(0.08, 0.34, 0.04, gun, 0.008), [0, 0.1, -0.28]);
  add(B.chest, strip(0.26, N, 0.01, 1.4), [0, 0.1, -0.3], [0, 0, Math.PI / 2]);
  for (const sx of [-1, 1]) { const vent = lathe([[0.02, 0], [0.05, 0], [0.055, 0.03], [0.05, 0.15], [0.03, 0.17]], gunLight, 12); vent.position.set(sx * 0.1, 0.18, -0.26); vent.rotation.x = 0.35; add(B.chest, vent); const hot = cyl(0.028, 0.028, 0.01, glowS(1.2), 10); hot.position.set(sx * 0.1, 0.34, -0.31); hot.castShadow = false; B.chest.add(hot); }
  add(B.chest, decal('hazard', N, 0.14, 0.03), [0, -0.05, -0.275], [0, Math.PI, 0]);
  add(B.neck, cyl(0.06, 0.075, 0.16, carbon, 14), [0, 0.02, 0]);
  add(B.neck, torus(0.065, 0.008, glowS(1.2), 20), [0, 0.06, 0], [Math.PI / 2, 0, 0]).castShadow = false;
  // ---- helmet: lathe dome with brow, visor slit recessed and glowing, cheek plates, ear pods, antenna nub
  add(B.head, bevelBox(0.25, 0.15, 0.25, ceramic, 0.03, 0.06), [0, 0.19, -0.01]);                             // crown
  add(B.head, bevelBox(0.23, 0.12, 0.2, carbon, 0.02, 0.04), [0, 0.07, -0.02]);                                // jaw / base shell
  add(B.head, bevelBox(0.24, 0.16, 0.05, ceramic, 0.02, 0.03), [0, 0.11, 0.12], [-0.3, 0, 0]);                 // face plate, raked back
  add(B.head, bevelBox(0.28, 0.05, 0.14, ceramic, 0.015, 0.03), [0, 0.2, 0.1], [0.25, 0, 0]);                  // brow overhang
  add(B.head, hexPlate(0.05, 0.03, carbon), [0, 0.11, 0.15]);                                                   // visor recess
  const visor = add(B.head, hexPlate(0.024, 0.012, glow(1.1)), [0, 0.11, 0.163]); visor.castShadow = false; model.visor = visor;
  add(B.head, channel(0.16, N, 2.2, 0.018), [0, 0.135, 0.15], [-0.3, 0, 0]);                                    // visor slit
  for (const sx of [-1, 1]) { add(B.head, bevelBox(0.06, 0.12, 0.14, carbon, 0.01), [sx * 0.15, 0.09, 0.02]); const ear = lathe([[0, 0], [0.035, 0], [0.04, 0.02], [0.03, 0.035], [0, 0.035]], gun, 14); ear.rotation.z = sx * -Math.PI / 2; ear.position.set(sx * 0.18, 0.12, -0.01); add(B.head, ear); const earL = cyl(0.016, 0.016, 0.008, glowS(1.6), 10); earL.rotation.z = Math.PI / 2; earL.position.set(sx * 0.215, 0.12, -0.01); earL.castShadow = false; B.head.add(earL); }
  add(B.head, bevelBox(0.04, 0.03, 0.04, gun, 0.006), [-0.09, 0.275, -0.06]);                                   // sensor mast base
  add(B.head, cyl(0.007, 0.009, 0.07, gun, 6), [-0.09, 0.32, -0.06]);
  add(B.head, sphere(0.011, glowS(2), 8), [-0.09, 0.36, -0.06]).castShadow = false;
  // ---- shoulders: double-shell pauldrons, unit decal (L) and chevron (R), light rail
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1; const sh = B['shoulder' + side];
    add(sh, sphere(0.075, gun, 16), [sx * 0.02, 0.0, 0]);                                                   // shoulder ball joint
    add(sh, bevelBox(0.26, 0.15, 0.3, ceramic, 0.03, 0.05), [sx * 0.08, 0.07, 0], [0, 0, sx * 0.18]);
    add(sh, bevelBox(0.18, 0.09, 0.2, slate, 0.02, 0.03), [sx * 0.08, -0.04, 0]);
    add(sh, channel(0.22, N, 1.8), [sx * 0.1, 0.152, 0.03], [Math.PI / 2, 0, sx * 0.18]);
    add(sh, decal(side === 'L' ? 'unit' : 'chevron', N, 0.14, 0.14), [sx * 0.275, 0.06, 0.0], [0, sx * Math.PI / 2, 0]);
    // upper arm: capsule core, bevel plate, piston pair to the elbow
    const ua = B['upperArm' + side];
    add(ua, capsule(0.07, 0.14, carbon), [0, -0.15, 0]);
    add(ua, bevelBox(0.12, 0.2, 0.14, ceramic, 0.015, 0.02), [sx * 0.03, -0.16, 0]);
    for (const pz of [-0.05, 0.05]) add(ua, cyl(0.012, 0.012, 0.2, gunLight, 8), [sx * -0.055, -0.2, pz]);
    // elbow: joint ring + cap
    const fa = B['forearm' + side];
    const ring = add(fa, torus(0.06, 0.014, glow(1.4), 24), [0, 0, 0], [0, Math.PI / 2, 0]); ring.castShadow = false; P.joints.push(ring);
    add(fa, cyl(0.055, 0.055, 0.14, gun, 12), [0, 0, 0], [0, 0, Math.PI / 2]);
    // forearm gauntlet: core, bevel plate with three vent slats, light channel, wrist collar
    add(fa, box(0.11, 0.24, 0.13, carbon), [0, -0.14, 0]);
    add(fa, bevelBox(0.13, 0.2, 0.06, ceramic, 0.015, 0.02), [0, -0.13, 0.07]);
    for (let i = 0; i < 3; i++) add(fa, box(0.09, 0.012, 0.01, gun), [0, -0.07 - i * 0.03, 0.105]);
    add(fa, strip(0.16, N, 0.012, 1.6), [sx * 0.065, -0.13, 0.02], [0, 0, Math.PI / 2]);
    add(fa, lathe([[0.045, -0.03], [0.06, -0.03], [0.06, 0.0], [0.05, 0.03]], gun, 12), [0, -0.26, 0]);
    // hand: palm block, four fingers, thumb
    const ha = B['hand' + side];
    add(ha, bevelBox(0.1, 0.1, 0.1, carbon, 0.012, 0.02), [0, -0.05, 0.01]);                                  // glove palm
    add(ha, bevelBox(0.09, 0.04, 0.06, ceramic, 0.008), [0, -0.02, -0.04]);                                    // knuckle plate
    for (let f = 0; f < 4; f++) { add(ha, box(0.022, 0.06, 0.024, gun), [-0.036 + f * 0.024, -0.12, 0.04], [0.5, 0, 0]); add(ha, box(0.02, 0.04, 0.022, gunLight), [-0.036 + f * 0.024, -0.16, 0.07], [1.0, 0, 0]); }
    add(ha, box(0.026, 0.06, 0.026, gun), [sx * 0.058, -0.07, 0.045], [0.7, 0, sx * 0.6]);
  }
  // ---- monowheel: lathe tyre with tread grooves, 24 tread blocks, emissive rim, dished hub with five bevelled spokes,
  //      caliper, mudguard arc, fork arms as tubes from the seat to the axle knuckles, counterweight pods behind.
  model.hideLimb('legL'); model.hideLimb('legR');
  const R = 0.64; model.ballRadius = R; model.ballRootY = R * 2 - 0.4; B.root.position.y = model.ballRootY; model.root.updateWorldMatrix(true, true);
  const wheel = new THREE.Group(); wheel.name = 'wheel';
  const rubber = new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.88, metalness: 0.02 });
  const tyre = lathe([[R - 0.2, -0.13], [R - 0.06, -0.13], [R - 0.01, -0.09], [R, -0.04], [R, 0.04], [R - 0.01, 0.09], [R - 0.06, 0.13], [R - 0.2, 0.13]], rubber, 48); tyre.rotation.z = Math.PI / 2; wheel.add(tyre);
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; for (const sx of [-1, 1]) { const t = box(0.09, 0.06, 0.02, rubber); t.position.set(sx * 0.06, Math.sin(a) * (R + 0.004), Math.cos(a) * (R + 0.004)); t.rotation.x = -a; t.rotation.z = sx * 0.3; wheel.add(t); } }
  const groove = torus(R + 0.002, 0.012, new THREE.MeshStandardMaterial({ color: '#0b0c0f', roughness: 0.95 }), 56); groove.rotation.y = Math.PI / 2; wheel.add(groove);
  const rim = torus(R - 0.16, 0.02, glowS(1.6), 56); rim.rotation.y = Math.PI / 2; rim.castShadow = false; wheel.add(rim);
  const rimDark = torus(R - 0.16, 0.03, gun, 56); rimDark.rotation.y = Math.PI / 2; rimDark.position.x = 0; wheel.add(rimDark);
  const hub = lathe([[0, -0.15], [0.1, -0.15], [0.15, -0.12], [0.2, -0.06], [0.2, 0.06], [0.15, 0.12], [0.1, 0.15], [0, 0.15]], gunLight, 24); hub.rotation.z = Math.PI / 2; wheel.add(hub);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const spoke = bevelBox(0.05, R - 0.32, 0.06, gun, 0.01); spoke.position.set(0, Math.sin(a) * (R - 0.26) * 0.5, Math.cos(a) * (R - 0.26) * 0.5); spoke.rotation.x = -a + Math.PI / 2; spoke.rotation.y = 0; wheel.add(spoke); const led = box(0.07, 0.02, 0.04, glowS(1.8)); led.position.set(0.15, Math.sin(a) * 0.12, Math.cos(a) * 0.12); led.rotation.x = -a; led.castShadow = false; wheel.add(led); }
  const cap = lathe([[0, 0.14], [0.06, 0.14], [0.07, 0.17], [0.05, 0.19], [0, 0.19]], glow(1.6), 16); cap.rotation.z = Math.PI / 2; cap.castShadow = false; wheel.add(cap); const cap2 = cap.clone(); cap2.rotation.z = -Math.PI / 2; wheel.add(cap2);
  const roll = new THREE.Group(); roll.add(wheel); roll.position.y = R;
  const rig = new THREE.Group(); rig.name = 'ballRig'; rig.add(roll);
  // yoke (does not spin): seat dish, fork tubes, knuckles, caliper, mudguard, counterweights, tail lamp
  const collar = new THREE.Group(); collar.name = 'collar';
  add(collar, lathe([[0.1, -0.04], [0.3, -0.04], [0.33, 0.04], [0.28, 0.14], [0.2, 0.18], [0.1, 0.18]], gun, 24), [0, 0.0, 0]);
  add(collar, bevelBox(0.36, 0.16, 0.3, carbon, 0.02, 0.04), [0, 0.14, -0.06]);
  add(collar, torus(0.2, 0.012, glowS(1.6), 32), [0, 0.11, 0], [Math.PI / 2, 0, 0]).castShadow = false;
  for (const sx of [-1, 1]) {
    add(collar, tube([[sx * 0.2, 0.02, 0.0], [sx * 0.32, -0.1, 0.05], [sx * 0.33, -R * 0.55, 0.06], [sx * 0.26, -R * 1.02, 0.0]], 0.03, gun, 14));
    add(collar, bevelBox(0.05, R * 1.05, 0.16, gunLight, 0.008, 0.02), [sx * 0.33, -R * 0.5, 0.03], [0, 0, sx * 0.06]); // fork blade
    add(collar, channel(R * 0.7, N, 1.0, 0.018), [sx * 0.36, -R * 0.5, 0.03], [0, sx * Math.PI / 2, Math.PI / 2]);
    add(collar, lathe([[0.03, -0.06], [0.1, -0.06], [0.11, -0.02], [0.11, 0.02], [0.1, 0.06], [0.03, 0.06]], gun, 16), [sx * 0.26, -R * 1.02, 0], [0, 0, Math.PI / 2]);
    add(collar, torus(0.075, 0.008, glowS(1.4), 20), [sx * 0.33, -R * 1.02, 0], [0, Math.PI / 2, 0]).castShadow = false;
    add(collar, decal('tech', N, 0.12, 0.05), [sx * 0.345, -R * 0.45, 0.06], [0, sx * Math.PI / 2, 0]);
  }
  const guardPivot = new THREE.Group(); guardPivot.rotation.y = Math.PI / 2; guardPivot.position.y = 0; collar.add(guardPivot);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.035, 8, 40, Math.PI * 0.58), carbon); guard.rotation.z = Math.PI * 0.06; guard.scale.set(1, 1, 2.6); guard.castShadow = true; guardPivot.add(guard); // in the pivot's XY = the wheel plane; +x there is the model's -z (rear)
  const guardLip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.11, 0.008, 6, 40, Math.PI * 0.58), glowS(1.6)); guardLip.rotation.z = Math.PI * 0.06; guardLip.castShadow = false; guardPivot.add(guardLip);
  const shield = new THREE.Group(); shield.rotation.z = Math.PI * 0.62; shield.scale.set(0.001, 0.001, 3.2); guardPivot.add(shield);
  const shieldArc = new THREE.Mesh(new THREE.TorusGeometry(R + 0.09, 0.045, 8, 48, Math.PI * 0.75), carbon); shieldArc.castShadow = true; shield.add(shieldArc);
  const shieldLip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.145, 0.009, 6, 48, Math.PI * 0.75), glowS(1.8)); shieldLip.castShadow = false; shield.add(shieldLip);
  const caliper = bevelBox(0.08, 0.14, 0.1, gunLight, 0.01); caliper.position.set(0.22, -R * 0.75, -0.16); collar.add(caliper);
  for (const sx of [-1, 1]) add(collar, tube([[sx * 0.2, 0.1, -0.1], [sx * 0.12, 0.2, -0.35], [sx * 0.06, 0.12, -0.56]], 0.02, gun, 8)); // mudguard brackets
  const cw = [];
  for (const sx of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(sx * 0.17, 0.0, -0.2); arm.add(add(new THREE.Group(), tube([[0, 0, 0], [sx * 0.05, -0.03, -0.1], [sx * 0.06, -0.05, -0.18]], 0.035, gun, 10))); const pod = lathe([[0, -0.12], [0.07, -0.12], [0.1, -0.06], [0.1, 0.07], [0.07, 0.12], [0, 0.12]], carbon, 16); pod.rotation.x = Math.PI / 2; pod.position.set(sx * 0.07, -0.05, -0.3); arm.add(pod); const cap = bevelBox(0.12, 0.12, 0.04, ceramic, 0.01, 0.03); cap.position.set(sx * 0.07, -0.05, -0.43); arm.add(cap); const lamp = sphere(0.022, neonOwn(COLORS.redOrange, 1.1), 10); lamp.position.set(sx * 0.07, -0.05, -0.45); lamp.castShadow = false; arm.add(lamp); const ring = torus(0.085, 0.008, glowS(1.2), 20); ring.position.set(sx * 0.07, -0.05, -0.19); ring.castShadow = false; arm.add(ring); collar.add(arm); cw.push(arm); }
  collar.position.y = R; rig.add(collar);
  model.root.add(rig);
  model.ball = wheel; model.ballRig = rig; model.ballCollar = collar; model.wheel = wheel; model.counterweights = cw; model.robot = 'a'; model.joints = P.joints;
  let lean = 0, spinV = 0, fold = 0, popT = 0;
  model.motion = (vx, vz, dt, land, rootYaw, crouch) => {
    const fx = Math.sin(rootYaw), fz = Math.cos(rootYaw); const fwd = vx * fx + vz * fz; const lat = vx * -Math.cos(rootYaw) + vz * Math.sin(rootYaw); // model front is local +z; lateral is +toward its right
    spinV = damp(spinV, fwd, 12, dt); wheel.rotation.x += spinV * dt / R;
    // cover fold: the torso curls down into the wheel behind a shield arc; aiming or firing pops it straight back up
    const st = model.animState || {}; const firing = (model.animator?.recoil || 0) > 0.05 || (st.aim || 0) > 0.5 || st.cover?.blind;
    if (firing) popT = 0.7; else popT -= dt;
    const want = st.cover ? (popT > 0 ? 0 : 1) : (crouch ? 0.45 : 0);
    fold = damp(fold, want, want > fold ? 4.5 : 16, dt); // slow curl in, servo-fast pop out
    if (fold > 0.001) {
      const q = Math.round(fold * 14) / 14 * 0.7 + fold * 0.3; // slightly stepped, like servos settling
      const arm = st.cover ? q : 0; // crouch only hunkers the torso; arms stay on the rifle
      B.root.position.y -= q * 0.42; B.spine.rotation.x += q * 0.6; B.chest.rotation.x += q * 1.45; B.head.rotation.x += q * 0.95;
      const ws = model.animator?.weaponSocket; if (ws && st.cover) { ws.rotation.x += arm * 1.35; ws.rotation.y -= arm * 0.5; ws.position.y -= arm * 0.12; ws.position.z -= arm * 0.08; } // rifle stows along the chest
      for (const side of ['L', 'R']) { B['upperArm' + side].rotation.x += arm * 1.3; B['upperArm' + side].rotation.z += (side === 'L' ? -1 : 1) * arm * 0.4; B['forearm' + side].rotation.x += arm * 1.6; }
      for (let i = 0; i < 2; i++) cw[i].rotation.y += (i ? -1 : 1) * arm * 1.3;
    }
    model.fold = fold; shield.scale.set(Math.max(0.001, fold), Math.max(0.001, fold), 3.2);
    lean = damp(lean, clamp(lat * 0.09, -0.35, 0.35), 6, dt); rig.rotation.z = lean; rig.rotation.x = clamp(fwd * 0.012, -0.08, 0.08);
    for (let i = 0; i < 2; i++) cw[i].rotation.y = lean * (i ? -1.6 : 1.6) + Math.sin(performance.now() * 0.002 + i) * 0.04;
    const t = performance.now() * 0.001; const sp = Math.abs(fwd);
    reactor.material.emissiveIntensity = 1.3 + Math.sin(t * 6) * 0.25 + sp * 0.05; reactorRing.rotation.z = t * 0.8;
    const jt = 0.9 + sp * 0.05 + (land || 0) * 1.2; for (const j of P.joints) j.material.emissiveIntensity = jt;
    if (model.visor) model.visor.material.emissiveIntensity = 1.1 + (Math.sin(t * 1.7) > 0.97 ? -0.8 : 0); // occasional blink
    void crouch;
  };
  return model;
}

// ------------------------------------------------------------------ B. HALO (hover ring)
function buildHalo(model) {
  const B = model.bones; const P = { primary: armour('carbon'), secondary: armour('gunmetal', '#9aa0aa'), accent: COLORS.cyan, joint: COLORS.cyan, joints: [] };
  buildCore(B, P); buildArms(B, P);
  // layered chest: three stepped carbon plates with cyan seam lines, orange chevrons on the pauldrons
  for (let i = 0; i < 3; i++) add(B.chest, plate(0.44 - i * 0.06, 0.09, 0.1, P.primary, 0.02), [0, 0.02 + i * 0.09, 0.15 + i * 0.01], [0.1, 0, 0]);
  add(B.chest, strip(0.3, P.accent, 0.012), [0, 0.07, 0.215]); add(B.chest, strip(0.22, P.accent, 0.012), [0, 0.16, 0.22]);
  for (const sx of [-1, 1]) { const chev = box(0.08, 0.03, 0.02, neon('#ff8a1f', 1.6)); chev.position.set(sx * 0.29, 0.29, 0.08); chev.rotation.z = sx * 0.6; chev.castShadow = false; B.chest.add(chev); }
  // dome helmet with a wide visor band
  add(B.head, sphere(0.165, P.primary, 24), [0, 0.1, 0]);
  const band = add(B.head, torus(0.135, 0.02, neon(P.accent, 2.4), 32), [0, 0.11, 0.02], [Math.PI / 2, 0, 0]); band.castShadow = false; band.scale.set(1, 1, 0.55); band.position.z = 0.03;
  add(B.head, box(0.22, 0.06, 0.16, P.secondary), [0, -0.01, -0.02]);
  // hover skirt: ring + six thruster pods with flames, hung from the pelvis so it floats with the torso
  model.hideLimb('legL'); model.hideLimb('legR');
  model.ballRadius = 0.42; model.ballRootY = 0.98; B.root.position.y = model.ballRootY; model.root.updateWorldMatrix(true, true);
  const skirt = new THREE.Group(); skirt.name = 'skirt'; skirt.position.y = -0.1;
  const ring = torus(0.4, 0.12, P.primary, 40); ring.rotation.x = Math.PI / 2; skirt.add(ring);
  const top = cyl(0.42, 0.34, 0.1, P.secondary, 24); top.position.y = 0.09; skirt.add(top);
  const lip = torus(0.47, 0.012, neon(P.accent, 1.8), 40); lip.rotation.x = Math.PI / 2; lip.position.y = 0.05; lip.castShadow = false; skirt.add(lip);
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2; const pod = new THREE.Group(); pod.position.set(Math.cos(a) * 0.34, -0.12, Math.sin(a) * 0.34); pod.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    const bell = cyl(0.07, 0.1, 0.22, P.secondary, 12); bell.position.y = -0.02; pod.add(bell);
    const throat = cyl(0.06, 0.06, 0.02, neon(P.accent, 2.5), 12); throat.position.y = -0.14; throat.castShadow = false; pod.add(throat);
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.085, 0.42, 10, 1, true), glowOwn(P.accent, 0.55)); flame.position.y = -0.36; flame.castShadow = false; pod.add(flame);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.04, 0.3, 8, 1, true), glowOwn('#ffffff', 0.5)); core.position.y = -0.3; core.castShadow = false; pod.add(core);
    skirt.add(pod); flames.push({ flame, core, a });
  }
  B.root.add(skirt);
  model.skirt = skirt; model.flames = flames; model.robot = 'b';
  let tiltX = 0, tiltZ = 0, thrust = 0;
  model.motion = (vx, vz, dt, land, rootYaw, crouch) => {
    const c = Math.cos(rootYaw), s = Math.sin(rootYaw); const lx = vx * c - vz * s, lz = vx * s + vz * c; // into root-local
    const sp = Math.hypot(vx, vz);
    tiltX = damp(tiltX, clamp(lz * 0.05, -0.28, 0.28), 5, dt); tiltZ = damp(tiltZ, clamp(-lx * 0.05, -0.28, 0.28), 5, dt);
    skirt.rotation.set(tiltX, 0, tiltZ);
    thrust = damp(thrust, 0.55 + sp * 0.12 + (land || 0) * 0.8 - crouch * 0.3, 8, dt);
    const t = performance.now() * 0.001;
    for (const f of flames) { const flick = 0.85 + Math.sin(t * 37 + f.a * 9) * 0.1 + Math.sin(t * 61 + f.a * 3) * 0.05; const k = thrust * flick; f.flame.scale.set(k * 0.9, k, k * 0.9); f.core.scale.set(k, k * 1.1, k); f.flame.material.opacity = clamp(0.3 + k * 0.3, 0, 0.9); }
  };
  return model;
}

// ------------------------------------------------------------------ C. BULWARK (heavy walker)
function buildBulwark(model) {
  const B = model.bones; const P = { primary: armour('ceramic', '#d8d4c8'), secondary: armour('gunmetal'), accent: COLORS.cyan, joint: '#ff8a1f', joints: [] };
  buildCore(B, P); buildArms(B, P);
  // tank chest: wide ceramic plates, grille, thick pauldrons
  add(B.chest, plate(0.56, 0.26, 0.16, P.primary, 0.03), [0, 0.14, 0.12], [0.12, 0, 0]);
  add(B.chest, plate(0.5, 0.14, 0.12, P.primary, 0.03), [0, -0.04, 0.14]);
  for (let i = 0; i < 3; i++) add(B.chest, strip(0.16 - i * 0.03, P.accent, 0.014, 2), [0, 0.02 + i * 0.035, 0.21]);
  for (const sx of [-1, 1]) { add(B['shoulder' + (sx > 0 ? 'L' : 'R')], plate(0.3, 0.2, 0.32, P.primary, 0.035), [sx * 0.09, 0.08, 0]); }
  // squat sensor head with three eyes, no visible neck
  add(B.head, plate(0.3, 0.2, 0.28, P.primary, 0.03), [0, 0.07, 0.02]);
  for (let i = 0; i < 3; i++) { const eye = sphere(0.02, neon(P.accent, 2.6), 8); eye.position.set(-0.05 + i * 0.05, 0.08, 0.145); eye.castShadow = false; B.head.add(eye); }
  add(B.head, box(0.2, 0.06, 0.1, P.secondary), [0, -0.03, 0.06]);
  // heavy legs: thigh block + knee cap, shin with pistons, wide foot; amber joint rings that pulse on footfalls
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    add(B['thigh' + side], box(0.2, 0.36, 0.22, P.secondary), [0, -0.22, 0]);
    add(B['thigh' + side], plate(0.24, 0.26, 0.1, P.primary, 0.02), [0, -0.2, 0.13]);
    add(B['thigh' + side], plate(0.08, 0.28, 0.2, P.primary, 0.015), [sx * 0.13, -0.2, 0]);
    add(B['thigh' + side], cyl(0.03, 0.03, 0.3, dark(), 8), [sx * 0.11, -0.28, -0.06], [0.2, 0, 0]);
    const knee = add(B['shin' + side], torus(0.08, 0.02, neonOwn(P.joint, 1.3), 24), [0, 0.0, 0], [0, Math.PI / 2, 0]); knee.castShadow = false; P.joints.push(knee);
    add(B['shin' + side], cyl(0.08, 0.08, 0.1, dark(), 12), [0, 0, 0], [0, 0, Math.PI / 2]);
    add(B['shin' + side], box(0.16, 0.34, 0.16, P.secondary), [0, -0.24, 0]);
    add(B['shin' + side], plate(0.2, 0.3, 0.08, P.primary, 0.02), [0, -0.22, 0.11]);
    add(B['shin' + side], plate(0.06, 0.26, 0.16, P.primary, 0.015), [sx * 0.11, -0.24, 0]);
    for (const px of [-0.09, 0.09]) add(B['shin' + side], cyl(0.022, 0.022, 0.3, armour('gunmetal', '#c0c4cc'), 8), [px, -0.2, -0.08]);
    add(B['foot' + side], box(0.22, 0.1, 0.34, P.secondary), [0, -0.05, 0.05]);
    add(B['foot' + side], plate(0.2, 0.06, 0.16, P.primary, 0.015), [0, 0.0, 0.14]);
    add(B['foot' + side], strip(0.18, P.accent, 0.012, 1.2), [0, -0.07, 0.22]);
  }
  model.robot = 'c'; model.joints = P.joints;
  let pulse = 0, lastPhase = 0;
  model.motion = (vx, vz, dt, land, rootYaw, crouch) => {
    const sp = Math.hypot(vx, vz);
    // joint rings pulse on each footfall (animator phase crosses a half-turn) and glow harder under load
    const ph = model.animator ? Math.floor(model.animator.phase / Math.PI) : 0; if (ph !== lastPhase && sp > 0.5) { lastPhase = ph; pulse = 1; }
    pulse = damp(pulse, 0, 6, dt);
    const it = 1.1 + pulse * 1.6 + sp * 0.05 + (land || 0) * 1.5;
    for (const j of P.joints) j.material.emissiveIntensity = it;
    void rootYaw; void crouch;
  };
  return model;
}

export const ROBOTS = { a: { id: 'a', name: 'OUTRIDER', build: buildOutrider, blurb: 'Monowheel frame. Fast, banks into turns, counterweight arms.' }, b: { id: 'b', name: 'HALO', build: buildHalo, blurb: 'Hover frame. Six-pod thruster skirt, tilts into motion.' }, c: { id: 'c', name: 'BULWARK', build: buildBulwark, blurb: 'Heavy walker. Servo stride, amber load rings.' } };

/** Decorate a freshly built procedural soldier model (zero pose) with one of the robot frames. */
export function applyRobot(model, kind, opts = {}) {
  const def = ROBOTS[kind]; if (!def || model.custom) return model;
  for (const n in model.bones) model.bones[n].rotation.set(0, 0, 0);
  for (const m of model.meshes) m.visible = false;
  def.build(model, opts);
  model.root.scale.multiplyScalar(kind === 'a' ? 1.0 : 1.18); // OUTRIDER stays near player height so the camera and capsule fit
  // player code toggles `model.custom.visible` for the scope; collect every rigid part so that still works
  const parts = []; model.root.traverse((o) => { if (o.isMesh && !model.meshes.includes(o)) parts.push(o); });
  model.custom = { get visible() { return parts[0]?.visible ?? true; }, set visible(v) { for (const p of parts) p.visible = v; } };
  model.customMeshes = parts; model.robotName = def.name;
  return model;
}

/** Which robot frame the player uses: URL `?robot=a|b|c` wins, then the saved choice, else null (Meshy vanguard body). */
export function selectedRobot() {
  try { const q = new URLSearchParams(location.search).get('robot'); if (q === 'none') return null; if (q && ROBOTS[q]) return q; } catch { /* ignore */ }
  try { const s = localStorage.getItem('hostile-orbit.robot'); if (s === 'none') return null; if (s && ROBOTS[s]) return s; } catch { /* ignore */ }
  return 'a'; // OUTRIDER is the protagonist frame
}
