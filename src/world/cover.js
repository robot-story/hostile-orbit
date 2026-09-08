// Cover points generated from colliders. Shared by the player snap system and enemy AI.
import * as THREE from 'three';

export class CoverPoint {
  constructor(pos, dir, collider, height, opts = {}) {
    this.pos = pos;             // world position the character stands at (feet)
    this.dir = dir;             // unit XZ vector pointing INTO the cover (from character toward the box)
    this.collider = collider;
    this.height = height;       // 'low' (aim over) | 'high'
    this.leftEdge = !!opts.leftEdge;   // can peek left (from character's POV facing the cover)
    this.rightEdge = !!opts.rightEdge;
    this.faceIndex = opts.faceIndex ?? 0;
    this.t = opts.t ?? 0;       // param along the face
    this.faceLen = opts.faceLen ?? 1;
    this.occupant = null;
    this.lastUsed = 0;
  }
}

export class CoverSystem {
  constructor(world) { this.world = world; this.points = []; this.cell = 10; this.grid = new Map(); }
  _key(ix, iz) { return ix * 100003 + iz; }
  build() {
    this.points.length = 0; this.grid.clear();
    for (const c of this.world.colliders.all) {
      if (!c.cover || !c.enabled) continue;
      if (c.type === 'box') this._boxPoints(c); else this._cylPoints(c);
    }
    for (const p of this.points) { const k = this._key(Math.floor(p.pos.x / this.cell), Math.floor(p.pos.z / this.cell)); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(p); }
  }
  removeForCollider(c) {
    this.points = this.points.filter(p => p.collider !== c);
    this.grid.clear();
    for (const p of this.points) { const k = this._key(Math.floor(p.pos.x / this.cell), Math.floor(p.pos.z / this.cell)); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(p); }
  }
  _boxPoints(c) {
    const h = c.maxY - c.minY;
    const groundAt = (x, z) => this.world.terrain.getHeight(x, z);
    const heightClass = (gy) => (c.top - gy <= 1.45 ? 'low' : 'high');
    const stand = 0.62; // distance from face
    const faces = [
      { n: [1, 0], len: c.half.z, off: c.half.x },   // +x face (local)
      { n: [-1, 0], len: c.half.z, off: c.half.x },
      { n: [0, 1], len: c.half.x, off: c.half.z },
      { n: [0, -1], len: c.half.x, off: c.half.z },
    ];
    faces.forEach((f, fi) => {
      const L = f.len * 2;
      if (L < 0.9) return;
      const count = Math.max(1, Math.floor(L / 1.3));
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..1 along face
        const along = t * (f.len - 0.45);
        const lx = f.n[0] * (f.off + stand) + f.n[1] * along;
        const lz = f.n[1] * (f.off + stand) + f.n[0] * along;
        const w = c.toWorldDir(lx, lz);
        const x = c.center.x + w.x, z = c.center.z + w.z;
        const gy = groundAt(x, z);
        if (c.top - gy < 0.75 || c.minY - gy > 0.6) continue; // too low here or floating
        if (!this.world.terrain.isFloor(x, z, 4) && this.world.terrain.slope(x, z) > 0.35) continue;
        const dn = c.toWorldDir(-f.n[0], -f.n[1]);
        const dir = new THREE.Vector3(dn.x, 0, dn.z).normalize();
        const p = new CoverPoint(new THREE.Vector3(x, gy, z), dir, c, heightClass(gy), {
          leftEdge: count === 1 || i === 0 ? true : false,
          rightEdge: count === 1 || i === count - 1 ? true : false,
          faceIndex: fi, t, faceLen: L,
        });
        // "left" from the character's POV facing the cover: character's left = cross(up, dir) = (dir.z, 0, -dir.x)
        // Determine which end is left: compute whether along direction matches left vector
        const alongW = c.toWorldDir(f.n[1], f.n[0]);
        const leftX = dir.z, leftZ = -dir.x;
        const alongIsLeft = alongW.x * leftX + alongW.z * leftZ > 0;
        if (count > 1) { if (alongIsLeft) { p.leftEdge = i === count - 1; p.rightEdge = i === 0; } else { p.leftEdge = i === 0; p.rightEdge = i === count - 1; } }
        this.points.push(p);
      }
    });
  }
  _cylPoints(c) {
    const count = Math.max(4, Math.floor((c.radius * 6.28) / 1.5));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = c.center.x + Math.cos(a) * (c.radius + 0.62), z = c.center.z + Math.sin(a) * (c.radius + 0.62);
      const gy = this.world.terrain.getHeight(x, z);
      if (c.top - gy < 0.75) continue;
      const dir = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
      this.points.push(new CoverPoint(new THREE.Vector3(x, gy, z), dir, c, c.top - gy <= 1.45 ? 'low' : 'high', { leftEdge: true, rightEdge: true }));
    }
  }
  query(x, z, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell), z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    const r2 = r * r;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const arr = this.grid.get(this._key(ix, iz)); if (!arr) continue; for (const p of arr) { const dx = p.pos.x - x, dz = p.pos.z - z; if (dx * dx + dz * dz <= r2) out.push(p); } }
    return out;
  }
  /** Player snap: nearest point within radius whose dir roughly matches desired facing (or any if facing null) */
  findSnap(pos, facing, radius = 2.6) {
    const pts = this.query(pos.x, pos.z, radius);
    let best = null, bs = Infinity;
    for (const p of pts) {
      if (Math.abs(p.pos.y - pos.y) > 1.2) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      let score = d;
      if (facing) { const dot = facing.x * p.dir.x + facing.z * p.dir.z; if (dot < 0.2) continue; score -= dot * 1.2; }
      if (score < bs) { bs = score; best = p; }
    }
    return best;
  }
  /** Enemy cover search: points near `pos` (within r) that block LOS to threat, unoccupied. */
  findCover(pos, threat, r = 18, opts = {}) {
    const pts = this.query(pos.x, pos.z, r);
    const minDist = opts.minDistToThreat ?? 6, maxDist = opts.maxDistToThreat ?? 45;
    let best = null, bs = -Infinity;
    const now = performance.now();
    for (const p of pts) {
      if (p.occupant && p.occupant !== opts.self) continue;
      if (now - p.lastUsed < 1500 && p.occupant !== opts.self) continue;
      const tx = threat.x - p.pos.x, tz = threat.z - p.pos.z; const td = Math.hypot(tx, tz) || 1;
      if (td < minDist || td > maxDist) continue;
      const facing = (tx / td) * p.dir.x + (tz / td) * p.dir.z;
      if (facing < 0.55) continue; // cover must be between point and threat
      const dSelf = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      let score = facing * 3 - dSelf * 0.12 - Math.abs(td - (opts.preferredDist ?? 18)) * 0.05;
      if (opts.flank && opts.flankDir) { const fd = (p.pos.x - threat.x) * opts.flankDir.x + (p.pos.z - threat.z) * opts.flankDir.z; score += fd * 0.08; }
      if (p.height === 'low' && opts.preferLow) score += 0.5;
      if (score > bs) { bs = score; best = p; }
    }
    return best;
  }
}
