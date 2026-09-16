import { generatedTextureUrl, surfaceTexture } from '../render/surfaces.js';
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
export function floorField(mx, my, floor = FLOOR) {
  let best = Infinity, lift = 0;
  for (const c of floor.circles) {
    const d = Math.hypot(mx - c.c[0], my - c.c[1]) - c.r;
    if (d < best) { best = d; lift = c.lift || 0; }
  }
  for (const r of floor.rects) {
    const dx = Math.max(r.min[0] - mx, 0, mx - r.max[0]);
    const dy = Math.max(r.min[1] - my, 0, my - r.max[1]);
    const d = Math.hypot(dx, dy) + (dx === 0 && dy === 0 ? -Math.min(mx - r.min[0], r.max[0] - mx, my - r.min[1], r.max[1] - my) : 0);
    if (d < best) { best = d; lift = r.lift || 0; }
  }
  for (const co of floor.corridors) {
    for (let i = 0; i < co.pts.length - 1; i++) {
      const d = segDist(mx, my, co.pts[i][0], co.pts[i][1], co.pts[i + 1][0], co.pts[i + 1][1]) - co.w / 2;
      if (d < best) { best = d; lift = co.lift || 0; }
    }
  }
  return { d: best, lift };
}

export function baseFloorHeight(mx, my, style = 'canyon') {
  if (style === 'city') return 1.2 * smoothstep(60, 330, my) + (fbm2(mx * 0.008, my * 0.008, 3) - 0.5) * 0.35;
  // Gentle rise to the north, plus large soft undulation
  return 6.5 * smoothstep(60, 330, my) + (fbm2(mx * 0.008, my * 0.008, 3) - 0.5) * 1.6;
}

export function terrainHeightMap(mx, my, map = null) {
  const style = map?.terrain?.style || 'canyon';
  const { d, lift } = floorField(mx, my, map?.floor || FLOOR);
  const floor = baseFloorHeight(mx, my, style);
  const ridgeNoise = fbm2(mx * 0.025 + 3.1, my * 0.025 + 7.7, 4);
  // authored features: berms and craters on the floor for cover and vantage, pinnacles on the mesas for skyline
  let feat = 0;
  const F = map?.terrain?.features; if (F) for (const f of F) {
    const dist = Math.hypot(mx - f.mx, my - f.my); if (dist > f.r * 1.6) continue;
    const t = 1 - smoothstep(f.r * 0.25, f.r, dist);
    if (f.type === 'mound') feat += f.h * t * t * (3 - 2 * t);
    else if (f.type === 'crater') { const bowl = 1 - smoothstep(0, f.r * 0.85, dist); const rim = Math.exp(-Math.pow((dist - f.r * 0.95) / (f.r * 0.22), 2)); feat += -f.h * bowl + f.h * 0.45 * rim; }
    else if (f.type === 'pinnacle') { const k = 1 - smoothstep(0, f.r, dist); feat += f.h * k * k; }
    else if (f.type === 'ramp') { const ax = (mx - f.mx) * f.dir[0] + (my - f.my) * f.dir[1]; const lat = Math.abs((mx - f.mx) * f.dir[1] - (my - f.my) * f.dir[0]); const w = 1 - smoothstep(f.w * 0.6, f.w, lat); if (ax >= 0 && ax <= f.r) feat += f.h * (ax / f.r) * w; else if (ax > f.r && ax < f.r + 1.5) feat += f.h * (1 - (ax - f.r) / 1.5) * w; }
    else if (f.type === 'berm') { const along = f.dir ? Math.abs((mx - f.mx) * f.dir[1] - (my - f.my) * f.dir[0]) : dist; const k = 1 - smoothstep(f.w * 0.3, f.w, along); const len = f.dir ? Math.abs((mx - f.mx) * f.dir[0] + (my - f.my) * f.dir[1]) : 0; feat += f.h * k * (1 - smoothstep(f.r * 0.7, f.r, len)); }
  }
  // Trench lift: lower floor with sharp walls
  const liftT = lift < 0 ? (1 - smoothstep(0, 3, d)) : (1 - smoothstep(0, 10, d));
  if (style === 'city') {
    // urban blocks: steep plateaus (building footprints) instead of rounded canyon walls
    const block = 4 + Math.floor(ridgeNoise * 3) * 2.5;
    const wallT = smoothstep(0, 4, d);
    const liftT = lift < 0 ? (1 - smoothstep(0, 2.5, d)) : (1 - smoothstep(0, 8, d));
    let h = floor + wallT * block + lift * liftT + feat + (fbm2(mx * 0.12, my * 0.12, 2) - 0.5) * lerp(0.15, 0.6, wallT);
    const edge = Math.min(mx, my, 400 - mx, 400 - my);
    h += smoothstep(14, 0, edge) * 30;
    return h;
  }
  const ridge = 13 + ridgeNoise * 14;
  const wallT = smoothstep(0, 20, d);
  let h = floor + wallT * ridge + lift * liftT + feat;
  // rocky detail on rock, subtle on floor
  const detail = (fbm2(mx * 0.12, my * 0.12, 3) - 0.5);
  h += detail * lerp(0.35, 4.0, wallT);
  // Edge of map: high walls
  const edge = Math.min(mx, my, 400 - mx, 400 - my);
  h += smoothstep(14, 0, edge) * 30;
  return h;
}

export class Terrain {
  constructor(res = 2, map = null) {
    this.res = res; this.map = map; this.floor = map?.floor || FLOOR;
    this.n = Math.floor(MAP_SIZE / res) + 1;
    this.heights = new Float32Array(this.n * this.n);
    this.floorDist = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const mx = i * res, my = j * res;
      this.heights[j * this.n + i] = terrainHeightMap(mx, my, map);
      this.floorDist[j * this.n + i] = floorField(mx, my, this.floor).d;
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
    // Match PlaneGeometry's actual triangles rather than a bilinear patch.
    return u >= v ? h00+(h10-h00)*u+(h11-h10)*v : h00+(h11-h01)*u+(h01-h00)*v;
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
    const T = this.map?.terrain || {};
    const P = { floor: [0.98, 0.80, 0.62], floorNoise: [0.1, 0.1, 0.08], rock: [0.30, 0.26, 0.25], rockNoise: [0.12, 0.08, 0.06], ridge: [0.45, 0.28, 0.18], veinScale: 0.35, ...(T.palette || {}) };
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
      c.setRGB(P.floor[0] + nz * P.floorNoise[0], P.floor[1] + nz * P.floorNoise[1], P.floor[2] + nz * P.floorNoise[2]);
      const rock = new THREE.Color(P.rock[0] + nz * P.rockNoise[0], P.rock[1] + nz * P.rockNoise[1], P.rock[2] + nz * P.rockNoise[2]);
      c.lerp(rock, rockT);
      // macro variation (large patches) and darker crevices on steep faces so rock reads as strata, not clay
      const macro = fbm2(x * 0.012 + 40, z * 0.012 + 17, 2) - 0.5; c.multiplyScalar(1 + macro * 0.22);
      const nrmY = this.getNormal(x, z).y; const steep = 1 - THREE.MathUtils.smoothstep(nrmY, 0.55, 0.9); c.multiplyScalar(1 - steep * 0.5 * (0.5 + rockT * 0.5));
      // sedimentary strata: horizontal bands on the rock faces
      const strata = Math.sin(h * 1.9 + fbm2(x * 0.03, z * 0.03, 2) * 3.0) * 0.5 + 0.5; c.multiplyScalar(1 - rockT * steep * 0.35 * strata + rockT * 0.1 * (strata - 0.5));
      // slight brighter dust on top ridges
      if (h > 20) c.lerp(new THREE.Color(P.ridge[0], P.ridge[1], P.ridge[2]), smoothstep(20, 32, h) * 0.5);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
      // neon veins only in floor cracks and along rock bases, patchy
      const patch = fbm2(x * 0.02 + 11, z * 0.02 + 5, 2);
      // sparse glowing patches: mostly along canyon floors near rock bases
      vein[k] = (patch > 0.62 ? (patch - 0.62) * 4 : 0) * (1 - rockT * 0.7) * (fd < 6 && fd > -14 ? 1 : (fd <= -14 ? 0.45 : 0.08)) * P.veinScale * (1 - steep); // veins run in the ground, not up the cliff faces
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aVein', new THREE.BufferAttribute(vein, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: Tex.terrain(), vertexColors: true, roughness: T.roughness ?? 0.96, metalness: T.metalness ?? 0.0, envMapIntensity: T.envIntensity ?? 1.0, emissive: '#ffffff', emissiveMap: Tex.veins(), emissiveIntensity: T.veinIntensity ?? 1.0 });
    const texId = T.texture || 'tex_terrain', rep = T.repeat || 60;
    new THREE.TextureLoader().load(generatedTextureUrl(texId), (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.repeat.set(rep, rep); mat.map = tex; if (T.tint) mat.color.set(T.tint); mat.needsUpdate = true; }, undefined, () => {});
    // steep faces get their own facade/rock texture projected along the wall (triplanar), the floor keeps the ground tile
    const wallTex = new THREE.Texture(); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    new THREE.TextureLoader().load(generatedTextureUrl(T.wallTexture || (this.map?.terrain?.style === 'city' ? 'tex_city_wall' : 'tex_rock_strata')), (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; mat.userData.pendingWall = tex; if (mat.userData.shader) { mat.userData.shader.uniforms.uWallMap.value = tex; mat.userData.shader.uniforms.uWallOn.value = 1; } }, undefined, () => {});
    const slopeTex = new THREE.Texture(); slopeTex.wrapS = slopeTex.wrapT = THREE.RepeatWrapping;
    new THREE.TextureLoader().load(generatedTextureUrl(T.slopeTexture || (this.map?.terrain?.style === 'city' ? 'tex_concrete' : 'tex_rock')), (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; mat.userData.pendingSlope = tex; if (mat.userData.shader) { mat.userData.shader.uniforms.uSlopeMap.value = tex; mat.userData.shader.uniforms.uSlopeOn.value = 1; } }, undefined, () => {});
    const wallScale = T.wallScale || (this.map?.terrain?.style === 'city' ? 1 / 6 : 1 / 5);
    const wallTint = new THREE.Color(T.wallTint || (this.map?.terrain?.style === 'city' ? '#9aa0ae' : '#d9a06c'));
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCity={value:this.map?.terrain?.style==='city'?1:0};
      shader.uniforms.uPaving={value:surfaceTexture('paving')};
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWallMap = { value: mat.userData.pendingWall || wallTex }; shader.uniforms.uWallOn = { value: mat.userData.pendingWall ? 1 : 0 }; shader.uniforms.uWallScale = { value: wallScale }; shader.uniforms.uWallTint = { value: wallTint }; shader.uniforms.uSlopeMap = { value: mat.userData.pendingSlope || slopeTex }; shader.uniforms.uSlopeOn = { value: mat.userData.pendingSlope ? 1 : 0 };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aVein; varying float vVein; varying vec3 vWPos; varying vec3 vWNrm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVein = aVein; vWPos = (modelMatrix * vec4(position,1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vVein; varying vec3 vWPos; varying vec3 vWNrm; uniform float uTime; uniform sampler2D uWallMap; uniform float uWallOn; uniform float uWallScale; uniform vec3 uWallTint; uniform sampler2D uSlopeMap; uniform float uSlopeOn; uniform float uCity; uniform sampler2D uPaving;')
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec4 floorC = texture2D(map, vMapUv);
            // detail pass: a second sample of the floor tile at 5.3x so the ground never reads as a smooth sheet up close
            vec4 detailC = texture2D(map, vMapUv * 5.3 + vec2(0.37, 0.61));
            floorC.rgb *= mix(vec3(1.0), detailC.rgb * 1.9, 0.08);
            float avenue=uCity*step(-82.,vWPos.z)*step(vWPos.z,128.);
            float sidewalk=avenue*smoothstep(8.5,8.65,abs(vWPos.x))*(1.-smoothstep(13.05,13.2,abs(vWPos.x)));
            floorC=mix(floorC,texture2D(uPaving,vWPos.xz*.5),sidewalk);
            vec3 an = abs(normalize(vWNrm));
            float steep = 1.0 - an.y;
            float slopeW = uSlopeOn * smoothstep(0.16, 0.42, steep);   // revetment / rock on mid slopes
            float wallW = uWallOn * smoothstep(0.55, 0.8, steep);       // built facade on near-vertical faces
            float sideMix = an.x / max(an.x + an.z, 1e-4);
            vec4 sx = texture2D(uSlopeMap, vWPos.zy * uWallScale * 1.6);
            vec4 sz = texture2D(uSlopeMap, vWPos.xy * uWallScale * 1.6);
            vec4 slopeC = mix(sz, sx, sideMix); slopeC.rgb *= mix(vec3(1.0), uWallTint, 0.5);
            vec4 wx = texture2D(uWallMap, vWPos.zy * uWallScale);
            vec4 wz = texture2D(uWallMap, vWPos.xy * uWallScale);
            vec4 wallC = mix(wz, wx, sideMix); wallC.rgb *= uWallTint;
            vec4 groundC = mix(floorC, slopeC, slopeW);
            diffuseColor *= mix(groundC, wallC, wallW);
          #endif`)
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
