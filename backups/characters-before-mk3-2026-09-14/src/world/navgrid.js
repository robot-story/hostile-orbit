// Grid A* pathfinding over the terrain + colliders. 2 m cells, 8-neighbour, LOS-smoothed paths.
import { MAP_SIZE } from './terrain.js';

class MinHeap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

export class NavGrid {
  constructor(world, cell = 2) {
    this.world = world;
    this.cell = cell;
    this.n = Math.floor(MAP_SIZE / cell);
    this.walk = new Uint8Array(this.n * this.n); // 1 walkable
    this.cost = new Float32Array(this.n * this.n); // extra cost (near walls)
    this.height = new Float32Array(this.n * this.n);
    this.build();
    this.budget = 6; // paths per frame
    this.queue = [];
  }
  idx(ix, iz) { return iz * this.n + ix; }
  toCell(x, z) { return { ix: Math.floor((x + 200) / this.cell), iz: Math.floor((z + 200) / this.cell) }; }
  toWorld(ix, iz) { return { x: (ix + 0.5) * this.cell - 200, z: (iz + 0.5) * this.cell - 200 }; }
  inBounds(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.n && iz < this.n; }
  isWalkable(ix, iz) { return this.inBounds(ix, iz) && this.walk[this.idx(ix, iz)] === 1; }
  isWalkableWorld(x, z) { const c = this.toCell(x, z); return this.isWalkable(c.ix, c.iz); }
  build() {
    const t = this.world.terrain;
    const q = [];
    for (let iz = 0; iz < this.n; iz++) for (let ix = 0; ix < this.n; ix++) {
      const { x, z } = this.toWorld(ix, iz);
      const h = t.getHeight(x, z);
      this.height[this.idx(ix, iz)] = h;
      // slope check using neighbors
      const hx = t.getHeight(x + this.cell, z), hz = t.getHeight(x, z + this.cell);
      const hx2 = t.getHeight(x - this.cell, z), hz2 = t.getHeight(x, z - this.cell);
      const steep = Math.max(Math.abs(hx - h), Math.abs(hz - h), Math.abs(hx2 - h), Math.abs(hz2 - h)) > 1.35;
      let ok = !steep && Math.abs(x) < 196 && Math.abs(z) < 196;
      if (ok) {
        this.world.colliders.query(x, z, this.cell * 0.75, q);
        for (const c of q) {
          if (!c.blocksNav) continue;
          if (c.minY > h + 2.0) continue; // overhead
          if (c.top < h + 0.45 && c.walkableTop) continue; // low step
          if (c.containsXZ(x, z, this.cell * 0.55)) { ok = false; break; }
        }
      }
      this.walk[this.idx(ix, iz)] = ok ? 1 : 0;
    }
    // wall proximity cost so paths hug centers a little
    for (let iz = 1; iz < this.n - 1; iz++) for (let ix = 1; ix < this.n - 1; ix++) {
      if (!this.walk[this.idx(ix, iz)]) continue;
      let blocked = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.walk[this.idx(ix + dx, iz + dz)]) blocked++;
      this.cost[this.idx(ix, iz)] = blocked * 0.6;
    }
  }
  /** Rebuild walkability in a region (after destructible removed / pod landed) */
  rebuildRegion(x, z, r) {
    const c0 = this.toCell(x - r, z - r), c1 = this.toCell(x + r, z + r);
    const t = this.world.terrain, q = [];
    for (let iz = Math.max(0, c0.iz); iz <= Math.min(this.n - 1, c1.iz); iz++) for (let ix = Math.max(0, c0.ix); ix <= Math.min(this.n - 1, c1.ix); ix++) {
      const w = this.toWorld(ix, iz); const h = t.getHeight(w.x, w.z);
      const hx = t.getHeight(w.x + this.cell, w.z), hz = t.getHeight(w.x, w.z + this.cell);
      let ok = Math.max(Math.abs(hx - h), Math.abs(hz - h)) <= 1.35;
      if (ok) { this.world.colliders.query(w.x, w.z, this.cell * 0.75, q); for (const c of q) { if (!c.blocksNav || c.minY > h + 2 || (c.top < h + 0.45 && c.walkableTop)) continue; if (c.containsXZ(w.x, w.z, this.cell * 0.55)) { ok = false; break; } } }
      this.walk[this.idx(ix, iz)] = ok ? 1 : 0;
    }
  }
  nearestWalkable(x, z, maxR = 12) {
    const c = this.toCell(x, z);
    if (this.isWalkable(c.ix, c.iz)) return { x, z };
    const rc = Math.ceil(maxR / this.cell);
    let best = null, bd = Infinity;
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const ix = c.ix + dx, iz = c.iz + dz;
      if (!this.isWalkable(ix, iz)) continue;
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = this.toWorld(ix, iz); }
    }
    return best;
  }
  randomWalkableNear(x, z, r, tries = 12) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isWalkableWorld(px, pz)) return { x: px, z: pz };
    }
    return this.nearestWalkable(x, z, r);
  }
  /** Grid line-of-walk check (Bresenham over cells) */
  lineWalkable(ax, az, bx, bz) {
    const a = this.toCell(ax, az), b = this.toCell(bx, bz);
    let x0 = a.ix, y0 = a.iz; const x1 = b.ix, y1 = b.iz;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 600; guard++) {
      if (!this.isWalkable(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; if (!this.isWalkable(x0, y0 - sy) && !this.isWalkable(x0 - sx, y0)) { /* corner */ } }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return false;
  }
  /** A* from world (ax,az) to (bx,bz). Returns array of {x,z} or null. */
  findPath(ax, az, bx, bz, maxIter = 9000) {
    const s0 = this.nearestWalkable(ax, az, 10), g0 = this.nearestWalkable(bx, bz, 10);
    if (!s0 || !g0) return null;
    const s = this.toCell(s0.x, s0.z), g = this.toCell(g0.x, g0.z);
    if (s.ix === g.ix && s.iz === g.iz) return [{ x: bx, z: bz }];
    const n = this.n;
    const gScore = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const open = new MinHeap();
    const si = this.idx(s.ix, s.iz), gi = this.idx(g.ix, g.iz);
    const h = (ix, iz) => { const dx = Math.abs(ix - g.ix), dz = Math.abs(iz - g.iz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    gScore[si] = 0; open.push({ i: si, ix: s.ix, iz: s.iz, f: h(s.ix, s.iz) });
    let iter = 0, found = false, bestI = si, bestH = Infinity;
    while (open.size && iter++ < maxIter) {
      const cur = open.pop();
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      if (cur.i === gi) { found = true; break; }
      const hh = h(cur.ix, cur.iz); if (hh < bestH) { bestH = hh; bestI = cur.i; }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cur.ix + dx, nz = cur.iz + dz;
        if (!this.isWalkable(nx, nz)) continue;
        if (dx && dz && (!this.isWalkable(cur.ix + dx, cur.iz) || !this.isWalkable(cur.ix, cur.iz + dz))) continue; // no corner cutting
        const ni = this.idx(nx, nz);
        if (closed[ni]) continue;
        const step = (dx && dz ? Math.SQRT2 : 1) + this.cost[ni] + Math.abs(this.height[ni] - this.height[cur.i]) * 0.8;
        const tg = gScore[cur.i] + step;
        if (tg < gScore[ni]) { gScore[ni] = tg; came[ni] = cur.i; open.push({ i: ni, ix: nx, iz: nz, f: tg + h(nx, nz) }); }
      }
    }
    const endI = found ? gi : bestI;
    const cells = [];
    for (let i = endI; i !== -1; i = came[i]) { cells.push(i); if (cells.length > 5000) break; }
    cells.reverse();
    let pts = cells.map(i => this.toWorld(i % n, Math.floor(i / n)));
    if (found) pts[pts.length - 1] = { x: bx, z: bz };
    // smoothing: greedy LOS
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineWalkable(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    return out.length ? out : [pts[pts.length - 1]];
  }
  /** Async-ish request with per-frame budget. cb(path|null) */
  request(ax, az, bx, bz, cb) { this.queue.push({ ax, az, bx, bz, cb }); }
  update() {
    let n = 0;
    while (this.queue.length && n < this.budget) { const r = this.queue.shift(); n++; let p = null; try { p = this.findPath(r.ax, r.az, r.bx, r.bz); } catch (e) { console.warn('[nav]', e); } r.cb(p); }
  }
}
