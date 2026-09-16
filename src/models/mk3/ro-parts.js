import * as THREE from 'three';
import { makeMaterials, decalMaterial } from './ro-textures.js';

export const M = makeMaterials();
export const DECAL = { unit: decalMaterial('unit'), chevron: decalMaterial('chevron'), hazard: decalMaterial('hazard'), stencil: decalMaterial('stencil'), serial: decalMaterial('serial'), tally: decalMaterial('tally'), scuff: decalMaterial('scuff') };

/* ---------- geometry helpers ---------- */
const _cache = new Map();
export function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Chamfered plate: rounded-rect profile extruded on z, bevelled on both faces. */
export function plateGeo(w, h, d, r = 0.02, bev = 0.008) {
  const key = `p${w},${h},${d},${r},${bev}`;
  if (!_cache.has(key)) {
    const b = Math.min(bev, d / 2 - 0.0005);
    const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(d / 2 - b));
    g.computeVertexNormals();
    _cache.set(key, g);
  }
  return _cache.get(key);
}
export function box(w, h, d) { const k = `b${w},${h},${d}`; if (!_cache.has(k)) _cache.set(k, new THREE.BoxGeometry(w, h, d)); return _cache.get(k); }
export function cyl(rt, rb, h, seg = 24, open = false) { const k = `c${rt},${rb},${h},${seg},${open}`; if (!_cache.has(k)) _cache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)); return _cache.get(k); }
/** Open cylindrical shell segment — axis along y, arc from thetaStart. */
export function shell(r, h, thetaStart, thetaLength, seg = 32) { const k = `sh${r},${h},${thetaStart},${thetaLength},${seg}`; if (!_cache.has(k)) _cache.set(k, new THREE.CylinderGeometry(r, r, h, seg, 1, true, thetaStart, thetaLength)); return _cache.get(k); }
export function sph(r, seg = 28, ring = 18, ps = 0, pl = Math.PI) { const k = `s${r},${seg},${ring},${ps},${pl}`; if (!_cache.has(k)) _cache.set(k, new THREE.SphereGeometry(r, seg, ring, 0, Math.PI * 2, ps, pl)); return _cache.get(k); }
export function torus(r, t, seg = 40, rad = 12, arc = Math.PI * 2) { const k = `t${r},${t},${seg},${rad},${arc}`; if (!_cache.has(k)) _cache.set(k, new THREE.TorusGeometry(r, t, rad, seg, arc)); return _cache.get(k); }
export function plane(w, h) { const k = `pl${w},${h}`; if (!_cache.has(k)) _cache.set(k, new THREE.PlaneGeometry(w, h)); return _cache.get(k); }

export function add(parent, name, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function group(parent, name, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = name; g.position.set(...pos); g.rotation.set(...rot);
  parent.add(g); return g;
}
export function glowMesh(parent, name, geo, pos, rot, scale) {
  const m = add(parent, name, geo, M.glow, pos, rot, scale);
  m.castShadow = false;
  return m;
}
export function decal(parent, name, kind, w, h, pos, rot = [0, 0, 0]) {
  const m = add(parent, name, plane(w, h), DECAL[kind], pos, rot);
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
/** Flexible hose between two local points. */
export function cable(parent, name, a, b, sag = 0.06, r = 0.011) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2 - sag * 0.4];
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b)]);
  return add(parent, name, new THREE.TubeGeometry(curve, 20, r, 10, false), M.carbon);
}
/** Row of rivets along a local axis. */
export function rivets(parent, name, n, from, step, r = 0.008) {
  for (let i = 0; i < n; i++) add(parent, `${name}_${i}`, cyl(r, r, 0.012, 10), M.metal,
    [from[0] + step[0] * i, from[1] + step[1] * i, from[2] + step[2] * i], [Math.PI / 2, 0, 0]);
}
