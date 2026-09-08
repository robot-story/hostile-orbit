// Alien flora/fauna dressing: luminous membrane plants, black-glass trees, drifting spores,
// bone-circuit arches, glowing pools. Purely decorative (mostly no colliders — thin stalks/roots
// only where they'd otherwise look like they float). Kept along route edges and around the jammer
// outpost per the art direction (Commonwealth/Legion hardware sits visually "on top" of this layer).
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { Tex } from '../render/textures.js';
import { rand, randInt, pick } from '../core/mathx.js';

const _geoCache = new Map();
function boxGeo(w, h, d) { const k = `b:${w}:${h}:${d}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return _geoCache.get(k); }
function cylGeo(rt, rb, h, seg = 6) { const k = `c:${rt}:${rb}:${h}:${seg}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg)); return _geoCache.get(k); }
function coneGeo(r, h, seg = 6) { const k = `k:${r}:${h}:${seg}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.ConeGeometry(r, h, seg)); return _geoCache.get(k); }
function circleGeo(r, seg = 20) { const k = `o:${r}:${seg}`; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CircleGeometry(r, seg)); return _geoCache.get(k); }
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; }

/** Translucent luminous membrane plant: thin stalk + petal-cone/planes that sway per-frame. */
export function membranePlant(world, position, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || pick([COLORS.green, COLORS.violet]);
  const h = rand(1.0, 2.4);
  const stalk = mesh(cylGeo(0.03, 0.06, h, 5), Mat.blackGlass(), false);
  stalk.position.y = h / 2; g.add(stalk);
  const petals = [];
  const petalMat = Mat.alienMembrane(color);
  const nPetals = randInt(3, 6);
  for (let i = 0; i < nPetals; i++) {
    const pw = rand(0.25, 0.55), ph = rand(0.5, 1.1);
    const petal = mesh(new THREE.PlaneGeometry(pw, ph), petalMat, false);
    const a = (i / nPetals) * Math.PI * 2 + rand(-0.3, 0.3);
    petal.position.set(0, h * rand(0.6, 1.0), 0);
    petal.rotation.y = a;
    petal.rotation.x = -0.5 - rand(0, 0.4);
    petal.geometry.translate(0, ph / 2, 0);
    g.add(petal); petals.push(petal);
  }
  const glow = new THREE.PointLight(color, 1.2, 3, 2); glow.position.y = h; glow.castShadow = false; g.add(glow);
  g.position.copy(position);
  const phase = rand(0, Math.PI * 2);
  world.props.add(g);
  const anim = { update: (dt) => { const t = performance.now() * 0.001 + phase; for (const p of petals) p.rotation.z = Math.sin(t * 0.8 + p.position.y) * 0.12; } };
  world.addUpdatable(anim);
  return { group: g, animated: anim };
}

/** Black glass tree: tapered trunk of stacked cylinders with thin violet emissive "veins" inside. */
export function blackGlassTree(world, position, opts = {}) {
  const g = new THREE.Group();
  const height = opts.height || rand(4, 9);
  const segs = 4;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const segH = height / segs;
    const rBot = 0.5 * (1 - i / segs) + 0.08;
    const rTop = 0.5 * (1 - (i + 1) / segs) + 0.06;
    const seg = mesh(cylGeo(rTop, rBot, segH, 7), Mat.blackGlass());
    seg.position.y = y + segH / 2;
    seg.rotation.y = rand(0, 1);
    g.add(seg);
    const vein = mesh(cylGeo(0.02, 0.025, segH * 0.95, 4), Mat.neon(COLORS.violet, 2.2), false);
    vein.position.set(rand(-0.06, 0.06), y + segH / 2, rand(-0.06, 0.06));
    g.add(vein);
    y += segH;
  }
  // sparse branches near the top
  for (let i = 0; i < randInt(2, 4); i++) {
    const branch = mesh(cylGeo(0.03, 0.12, height * 0.3, 5), Mat.blackGlass());
    branch.position.y = y - rand(0, height * 0.3);
    branch.rotation.set(rand(0.6, 1.1), rand(0, 6.28), 0);
    g.add(branch);
  }
  const light = new THREE.PointLight(COLORS.violet, 1.6, 5, 2); light.position.y = height * 0.6; light.castShadow = false; g.add(light);
  g.position.copy(position);
  world.props.add(g);
  const collider = world.addCyl(new THREE.Vector3(position.x, position.y + height * 0.15, position.z), 0.4, height * 0.3, { material: 'rock', mesh: g, cover: false });
  return { group: g, collider };
}

/** Flat glowing pool: additive disc, slightly above ground to avoid z-fighting with terrain. */
export function glowPool(world, position, opts = {}) {
  const r = opts.radius || rand(1.2, 3.2);
  const color = opts.color || COLORS.violet;
  const disc = mesh(circleGeo(r, 24), Mat.glowAdditive(color, 0.4), false);
  disc.rotation.x = -Math.PI / 2;
  disc.position.copy(position); disc.position.y += 0.04;
  world.props.add(disc);
  const ring = mesh(new THREE.RingGeometry(r * 0.94, r, 24), Mat.glowAdditive(color, 0.6), false);
  ring.rotation.x = -Math.PI / 2; ring.position.copy(disc.position); ring.position.y += 0.01;
  world.props.add(ring);
  return { mesh: disc };
}

/** Alien bone-circuit arch: pair of curved rib-like struts meeting overhead, thin glowing conduits. */
export function boneArch(world, position, yaw = 0, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || COLORS.violet;
  const h = opts.height || 5.5, span = opts.span || 3.4;
  const boneMat = Mat.blackGlass();
  const segCount = 6;
  for (const side of [-1, 1]) {
    let prev = new THREE.Vector3(side * span / 2, 0, 0);
    for (let i = 1; i <= segCount; i++) {
      const t = i / segCount;
      const x = side * span / 2 * (1 - t * t);
      const y = h * Math.sin(t * Math.PI / 2);
      const cur = new THREE.Vector3(x, y, 0);
      const mid = prev.clone().add(cur).multiplyScalar(0.5);
      const dir = cur.clone().sub(prev);
      const len = dir.length();
      const seg = mesh(cylGeo(0.1 * (1 - t * 0.6), 0.12 * (1 - (t - 1 / segCount) * 0.6), len, 6), boneMat);
      seg.position.copy(mid);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.add(seg);
      const vein = mesh(cylGeo(0.02, 0.02, len * 0.9, 4), Mat.neon(color, 2), false);
      vein.position.copy(mid); vein.quaternion.copy(seg.quaternion);
      g.add(vein);
      prev = cur;
    }
  }
  const light = new THREE.PointLight(color, 2.5, 7, 2); light.position.y = h * 0.85; light.castShadow = false; g.add(light);
  g.position.copy(position); g.rotation.y = yaw;
  world.props.add(g);
  return { group: g };
}

/** Floating spore particle cloud (additive glow sprites) drifting slowly upward/around a center. */
export function sporeField(world, center, opts = {}) {
  const count = opts.count || 60;
  const radius = opts.radius || 8;
  const color = new THREE.Color(opts.color || COLORS.violet);
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const bases = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r, y = center.y + Math.random() * 4;
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    bases[i * 3] = x; bases[i * 3 + 1] = y; bases[i * 3 + 2] = z;
    speeds[i] = 0.15 + Math.random() * 0.3;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ size: 0.35, map: Tex.glow(), color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  world.props.add(points);
  const phase = Math.random() * 10;
  const anim = {
    update: (dt) => {
      const t = performance.now() * 0.001 + phase;
      const pos = geo.attributes.position;
      for (let i = 0; i < count; i++) {
        const bx = bases[i * 3], by = bases[i * 3 + 1], bz = bases[i * 3 + 2];
        const sp = speeds[i];
        pos.setXYZ(i,
          bx + Math.sin(t * sp + i) * 1.2,
          by + ((t * sp * 0.4) % 4),
          bz + Math.cos(t * sp * 0.8 + i) * 1.2);
      }
      pos.needsUpdate = true;
    },
  };
  world.addUpdatable(anim);
  return { points, animated: anim };
}
