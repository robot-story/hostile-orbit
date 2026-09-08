// Static collision world: Y-rotated boxes and vertical cylinders + terrain. Custom queries (no physics lib).
import * as THREE from 'three';
import { clamp } from '../core/mathx.js';

let nextColliderId = 1;

export class BoxCollider {
  /** center: Vector3 (box center), half: {x,y,z}, yaw radians */
  constructor(center, half, yaw = 0, opts = {}) {
    this.id = nextColliderId++;
    this.type = 'box';
    this.center = center.clone();
    this.half = { x: half.x, y: half.y, z: half.z };
    this.yaw = yaw;
    this.cos = Math.cos(yaw); this.sin = Math.sin(yaw);
    this.material = opts.material || 'metal';
    this.cover = opts.cover ?? (half.y * 2 >= 0.8 && half.y * 2 <= 2.8 && Math.max(half.x, half.z) >= 0.5);
    this.walkableTop = opts.walkableTop ?? true;
    this.blocksNav = opts.blocksNav ?? true;
    this.destructible = opts.destructible || null;
    this.mesh = opts.mesh || null;
    this.tag = opts.tag || '';
    this.enabled = true;
    const r = Math.hypot(half.x, half.z);
    this.radiusXZ = r;
    this.minY = center.y - half.y; this.maxY = center.y + half.y;
  }
  get top() { return this.maxY; }
  /** world -> local XZ */
  toLocal(x, z) { const dx = x - this.center.x, dz = z - this.center.z; return { x: dx * this.cos + dz * this.sin, z: -dx * this.sin + dz * this.cos }; }
  toWorldDir(lx, lz) { return { x: lx * this.cos - lz * this.sin, z: lx * this.sin + lz * this.cos }; }
  containsXZ(x, z, pad = 0) { const l = this.toLocal(x, z); return Math.abs(l.x) <= this.half.x + pad && Math.abs(l.z) <= this.half.z + pad; }
  /** Push a circle (x,z,r) out of the box footprint. Returns {x,z,pushed, nx, nz} */
  resolveCircle(x, z, r) {
    const l = this.toLocal(x, z);
    const cx = clamp(l.x, -this.half.x, this.half.x), cz = clamp(l.z, -this.half.z, this.half.z);
    let dx = l.x - cx, dz = l.z - cz;
    let d2 = dx * dx + dz * dz;
    if (d2 > r * r) return null;
    let nx, nz, push;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = r - d; }
    else {
      // inside: push out through the nearest face
      const px = this.half.x - Math.abs(l.x), pz = this.half.z - Math.abs(l.z);
      if (px < pz) { nx = Math.sign(l.x) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(l.z) || 1; push = pz + r; }
    }
    const wd = this.toWorldDir(nx, nz);
    return { x: x + wd.x * push, z: z + wd.z * push, nx: wd.x, nz: wd.z, push };
  }
  /** Ray vs OBB. Returns {t, nx, ny, nz} or null */
  raycast(o, d, maxT) {
    // transform into local space
    const ox = o.x - this.center.x, oy = o.y - this.center.y, oz = o.z - this.center.z;
    const lox = ox * this.cos + oz * this.sin, loz = -ox * this.sin + oz * this.cos;
    const ldx = d.x * this.cos + d.z * this.sin, ldz = -d.x * this.sin + d.z * this.cos;
    let tmin = 0, tmax = maxT, axis = -1, sign = 0;
    const O = [lox, oy, loz], D = [ldx, d.y, ldz], H = [this.half.x, this.half.y, this.half.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-9) { if (Math.abs(O[i]) > H[i]) return null; continue; }
      const inv = 1 / D[i];
      let t1 = (-H[i] - O[i]) * inv, t2 = (H[i] - O[i]) * inv;
      let s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (axis < 0) return null; // started inside
    let n = [0, 0, 0]; n[axis] = sign;
    // local normal -> world
    const wn = this.toWorldDir(n[0], n[2]);
    return { t: tmin, nx: axis === 1 ? 0 : wn.x, ny: axis === 1 ? n[1] : 0, nz: axis === 1 ? 0 : wn.z };
  }
  /** Closest point on the box surface from world point (XZ only, at given y) */
  closestSurfaceXZ(x, z) {
    const l = this.toLocal(x, z);
    const cx = clamp(l.x, -this.half.x, this.half.x), cz = clamp(l.z, -this.half.z, this.half.z);
    const w = this.toWorldDir(cx, cz);
    return { x: this.center.x + w.x, z: this.center.z + w.z };
  }
}

export class CylinderCollider {
  constructor(center, radius, height, opts = {}) {
    this.id = nextColliderId++;
    this.type = 'cyl';
    this.center = center.clone();
    this.radius = radius; this.height = height;
    this.minY = center.y - height / 2; this.maxY = center.y + height / 2;
    this.material = opts.material || 'rock';
    this.cover = opts.cover ?? (height >= 0.8 && height <= 2.8 && radius >= 0.5);
    this.walkableTop = opts.walkableTop ?? true;
    this.blocksNav = opts.blocksNav ?? true;
    this.destructible = opts.destructible || null;
    this.mesh = opts.mesh || null;
    this.tag = opts.tag || '';
    this.enabled = true;
    this.radiusXZ = radius;
  }
  get top() { return this.maxY; }
  containsXZ(x, z, pad = 0) { const dx = x - this.center.x, dz = z - this.center.z; return dx * dx + dz * dz <= (this.radius + pad) ** 2; }
  resolveCircle(x, z, r) {
    const dx = x - this.center.x, dz = z - this.center.z; const d2 = dx * dx + dz * dz; const R = this.radius + r;
    if (d2 > R * R) return null;
    const d = Math.sqrt(d2) || 1e-6; const nx = dx / d, nz = dz / d;
    return { x: this.center.x + nx * R, z: this.center.z + nz * R, nx, nz, push: R - d };
  }
  raycast(o, d, maxT) {
    // infinite cylinder XZ then clip Y
    const ox = o.x - this.center.x, oz = o.z - this.center.z;
    const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - this.radius * this.radius;
    let tSide = Infinity;
    if (a > 1e-9) {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) { const s = Math.sqrt(disc); const t1 = (-b - s) / (2 * a); if (t1 > 0 && t1 < maxT) { const y = o.y + d.y * t1; if (y >= this.minY && y <= this.maxY) tSide = t1; } }
    }
    // caps
    let tCap = Infinity, capN = 0;
    if (Math.abs(d.y) > 1e-9) {
      for (const [yy, n] of [[this.maxY, 1], [this.minY, -1]]) {
        const t = (yy - o.y) / d.y;
        if (t > 0 && t < maxT && t < tCap) { const x = o.x + d.x * t - this.center.x, z = o.z + d.z * t - this.center.z; if (x * x + z * z <= this.radius * this.radius) { tCap = t; capN = n; } }
      }
    }
    if (tSide === Infinity && tCap === Infinity) return null;
    if (tSide < tCap) { const px = o.x + d.x * tSide - this.center.x, pz = o.z + d.z * tSide - this.center.z; const l = Math.hypot(px, pz) || 1; return { t: tSide, nx: px / l, ny: 0, nz: pz / l }; }
    return { t: tCap, nx: 0, ny: capN, nz: 0 };
  }
  closestSurfaceXZ(x, z) { const dx = x - this.center.x, dz = z - this.center.z; const d = Math.hypot(dx, dz) || 1; return { x: this.center.x + dx / d * this.radius, z: this.center.z + dz / d * this.radius }; }
}

/** Spatial hash of colliders for fast region queries. */
export class ColliderWorld {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.all = [];
    this.dynamic = new Set(); // colliders that can move (ragdolls do not collide; this is for doors/pods)
  }
  _key(ix, iz) { return ix * 100003 + iz; }
  _range(c) {
    const r = c.type === 'box' ? c.radiusXZ : c.radius;
    return { x0: Math.floor((c.center.x - r) / this.cell), x1: Math.floor((c.center.x + r) / this.cell), z0: Math.floor((c.center.z - r) / this.cell), z1: Math.floor((c.center.z + r) / this.cell) };
  }
  add(c) {
    this.all.push(c);
    const r = this._range(c);
    for (let ix = r.x0; ix <= r.x1; ix++) for (let iz = r.z0; iz <= r.z1; iz++) { const k = this._key(ix, iz); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c); }
    return c;
  }
  remove(c) {
    const i = this.all.indexOf(c); if (i >= 0) this.all.splice(i, 1);
    const r = this._range(c);
    for (let ix = r.x0; ix <= r.x1; ix++) for (let iz = r.z0; iz <= r.z1; iz++) { const arr = this.grid.get(this._key(ix, iz)); if (arr) { const j = arr.indexOf(c); if (j >= 0) arr.splice(j, 1); } }
    c.enabled = false;
  }
  /** Iterate colliders overlapping circle (x,z,r) */
  query(x, z, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell), z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    const seen = new Set();
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = this.grid.get(this._key(ix, iz)); if (!arr) continue;
      for (const c of arr) { if (!c.enabled || seen.has(c.id)) continue; seen.add(c.id); out.push(c); }
    }
    return out;
  }
  /** Iterate colliders along a ray segment (coarse: cells along the segment) */
  queryRay(o, d, maxT, out = []) {
    out.length = 0;
    const seen = new Set();
    const step = this.cell * 0.9;
    const n = Math.ceil(maxT / step) + 1;
    for (let i = 0; i <= n; i++) {
      const t = Math.min(maxT, i * step);
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
      for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
        const arr = this.grid.get(this._key(ix + ax, iz + az)); if (!arr) continue;
        for (const c of arr) { if (!c.enabled || seen.has(c.id)) continue; seen.add(c.id); out.push(c); }
      }
    }
    return out;
  }
}
