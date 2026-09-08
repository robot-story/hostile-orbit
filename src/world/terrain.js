// Heightfield terrain carved from the Blacksite Meridian tactical map layout.
// Map coords: (mx, my) in [0,400]^2, my up = north. World: x = mx - 200, z = 200 - my (north = -z).
import * as THREE from 'three';
import { fbm2, smoothstep, clamp, lerp } from '../core/mathx.js';
import { Tex } from '../render/textures.js';

export const MAP_SIZE = 400;
export const mapToWorld = (mx, my) => ({ x: mx - 200, z: 200 - my });
export const worldToMap = (x, z) => ({ mx: x + 200, my: 200 - z });
export const M = (mx, my, y = 0) => new THREE.Vector3(mx - 200, y, 200 - my);

// Walkable floor definition (in map coordinates)
export const FLOOR = {
  circles: [
    { c: [200, 45], r: 40, name: 'dropzone' },
    { c: [70, 320], r: 52, name: 'jammer' },
    { c: [330, 250], r: 58, name: 'extraction' },
    { c: [200, 130], r: 26, name: 'canyon_junction' },
  ],
  rects: [
    { min: [118, 282], max: [292, 392], name: 'comms' },
    { min: [255, 330], max: [330, 380], name: 'detention' },
  ],
  corridors: [
    { pts: [[200, 45], [200, 130], [200, 200], [200, 285]], w: 24, name: 'main' },
    { pts: [[180, 88], [140, 112], [116, 150], [106, 200], [112, 245], [100, 280], [85, 298]], w: 17, name: 'high', lift: 3 },
    { pts: [[222, 72], [252, 96], [268, 140], [270, 195], [276, 238], [296, 262]], w: 12, name: 'trench', lift: -2.6 },
    { pts: [[110, 300], [128, 320]], w: 18, name: 'jammer_comms' },
    { pts: [[285, 320], [305, 292]], w: 18, name: 'comms_extraction' },
    { pts: [[248, 258], [276, 240]], w: 10, name: 'trench_ext' },
    // enemy roads (reinforcement paths, red arrows)
    { pts: [[40, 60], [26, 150], [22, 260], [40, 330], [60, 372]], w: 11, name: 'west_road' },
    { pts: [[370, 90], [380, 180], [372, 280], [360, 360]], w: 11, name: 'east_road' },
    { pts: [[150, 392], [150, 400]], w: 14, name: 'north_gate_w' },
    { pts: [[240, 392], [240, 400]], w: 14, name: 'north_gate_e' },
    { pts: [[40, 60], [120, 40], [160, 45]], w: 11, name: 'sw_road' },
    { pts: [[370, 90], [300, 50], [240, 45]], w: 11, name: 'se_road' },
    { pts: [[22, 260], [40, 300]], w: 11, name: 'west_link' },
    { pts: [[372, 280], [388, 250]], w: 11, name: 'east_link' },
  ],
};

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp((wx * vx + wy * vy) / l2, 0, 1) : 0;
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Returns {d: distance to floor edge (0 inside), lift: floor height offset} */
export function floorField(mx, my) {
  let best = Infinity, lift = 0;
  for (const c of FLOOR.circles) {
    const d = Math.hypot(mx - c.c[0], my - c.c[1]) - c.r;
    if (d < best) { best = d; lift = 0; }
  }
  for (const r of FLOOR.rects) {
    const dx = Math.max(r.min[0] - mx, 0, mx - r.max[0]);
    const dy = Math.max(r.min[1] - my, 0, my - r.max[1]);
    const d = Math.hypot(dx, dy) + (dx === 0 && dy === 0 ? -Math.min(mx - r.min[0], r.max[0] - mx, my - r.min[1], r.max[1] - my) : 0);
    if (d < best) { best = d; lift = 0; }
  }
  for (const co of FLOOR.corridors) {
    for (let i = 0; i < co.pts.length - 1; i++) {
      const d = segDist(mx, my, co.pts[i][0], co.pts[i][1], co.pts[i + 1][0], co.pts[i + 1][1]) - co.w / 2;
      if (d < best) { best = d; lift = co.lift || 0; }
    }
  }
  return { d: best, lift };
}

export function baseFloorHeight(mx, my) {
  // Gentle rise to the north, plus large soft undulation
  return 6.5 * smoothstep(60, 330, my) + (fbm2(mx * 0.008, my * 0.008, 3) - 0.5) * 1.6;
}

export function terrainHeightMap(mx, my) {
  const { d, lift } = floorField(mx, my);
  const floor = baseFloorHeight(mx, my);
  const ridgeNoise = fbm2(mx * 0.025 + 3.1, my * 0.025 + 7.7, 4);
  const ridge = 13 + ridgeNoise * 14;
  const wallT = smoothstep(0, 20, d);
  // Trench lift: lower floor with sharp walls
  const liftT = lift < 0 ? (1 - smoothstep(0, 3, d)) : (1 - smoothstep(0, 10, d));
  let h = floor + wallT * ridge + lift * liftT;
  // rocky detail on rock, subtle on floor
  const detail = (fbm2(mx * 0.12, my * 0.12, 3) - 0.5);
  h += detail * lerp(0.35, 4.0, wallT);
  // Edge of map: high walls
  const edge = Math.min(mx, my, 400 - mx, 400 - my);
  h += smoothstep(14, 0, edge) * 30;
  return h;
}

export class Terrain {
  constructor(res = 2) {
    this.res = res;
    this.n = Math.floor(MAP_SIZE / res) + 1;
    this.heights = new Float32Array(this.n * this.n);
    this.floorDist = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const mx = i * res, my = j * res;
      this.heights[j * this.n + i] = terrainHeightMap(mx, my);
      this.floorDist[j * this.n + i] = floorField(mx, my).d;
    }
    this.mesh = this._buildMesh();
  }
  /** Height at world (x,z) */
  getHeight(x, z) {
    const { mx, my } = worldToMap(x, z);
    const fx = clamp(mx / this.res, 0, this.n - 1.001), fy = clamp(my / this.res, 0, this.n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const n = this.n, H = this.heights;
    const h00 = H[j * n + i], h10 = H[j * n + i + 1], h01 = H[(j + 1) * n + i], h11 = H[(j + 1) * n + i + 1];
    return lerp(lerp(h00, h10, u), lerp(h01, h11, u), v);
  }
  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.6;
    const hl = this.getHeight(x - e, z), hr = this.getHeight(x + e, z), hd = this.getHeight(x, z - e), hu = this.getHeight(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
  slope(x, z) { const n = this.getNormal(x, z); return 1 - n.y; }
  floorDistance(x, z) {
    const { mx, my } = worldToMap(x, z);
    const i = clamp(Math.round(mx / this.res), 0, this.n - 1), j = clamp(Math.round(my / this.res), 0, this.n - 1);
    return this.floorDist[j * this.n + i];
  }
  isFloor(x, z, margin = 0) { return this.floorDistance(x, z) <= margin; }
  /** Ray march against heightfield. Returns distance or -1. */
  raycast(o, d, maxDist, step = 0.75) {
    let t = 0;
    let prevAbove = o.y - this.getHeight(o.x, o.z);
    if (prevAbove < 0) return 0;
    while (t < maxDist) {
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > 200 || Math.abs(z) > 200) return -1;
      const above = y - this.getHeight(x, z);
      if (above <= 0) {
        // refine
        let lo = t - step, hi = t;
        for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; const a = o.y + d.y * mid - this.getHeight(o.x + d.x * mid, o.z + d.z * mid); if (a <= 0) hi = mid; else lo = mid; }
        return hi;
      }
      // adaptive: bigger steps when high above ground
      if (above > 6 && d.y > -0.2) step = Math.min(3, step * 1.3);
    }
    return -1;
  }
  _buildMesh() {
    const n = this.n, size = MAP_SIZE;
    const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const vein = new Float32Array(pos.count);
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const h = this.getHeight(x, z);
      pos.setY(k, h);
      const fd = this.floorDistance(x, z);
      const rockT = smoothstep(2, 16, fd);
      const nz = fbm2(x * 0.05, z * 0.05, 3);
      // dust orange floor -> dark basalt rock
      c.setRGB(0.98 + nz * 0.1, 0.80 + nz * 0.1, 0.62 + nz * 0.08);
      const rock = new THREE.Color(0.30 + nz * 0.12, 0.26 + nz * 0.08, 0.25 + nz * 0.06);
      c.lerp(rock, rockT);
      // slight brighter dust on top ridges
      if (h > 20) c.lerp(new THREE.Color(0.45, 0.28, 0.18), smoothstep(20, 32, h) * 0.5);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
      // neon veins only in floor cracks and along rock bases, patchy
      const patch = fbm2(x * 0.02 + 11, z * 0.02 + 5, 2);
      // sparse glowing patches: mostly along canyon floors near rock bases
      vein[k] = (patch > 0.62 ? (patch - 0.62) * 4 : 0) * (1 - rockT * 0.7) * (fd < 8 && fd > -40 ? 1 : 0.15) * 0.55;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aVein', new THREE.BufferAttribute(vein, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: Tex.terrain(), vertexColors: true, roughness: 0.96, metalness: 0.0, emissive: '#ffffff', emissiveMap: Tex.veins(), emissiveIntensity: 1.0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aVein; varying float vVein; varying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVein = aVein; vWPos = (modelMatrix * vec4(position,1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vVein; varying vec3 vWPos; uniform float uTime;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vWPos.x * 0.15 + vWPos.z * 0.11); totalEmissiveRadiance *= vVein * pulse;`);
      mat.userData.shader = shader;
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain';
    mesh.userData.update = (t) => { if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t; };
    return mesh;
  }
}
