// World: scene, lighting, terrain, colliders, nav, cover, entity registry, physics queries.
import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { ColliderWorld, BoxCollider, CylinderCollider } from './colliders.js';
import { NavGrid } from './navgrid.js';
import { CoverSystem } from './cover.js';
import { createSky, createCelestials } from '../render/sky.js';
import { settings } from '../core/settings.js';
import { events } from '../core/events.js';
import { updateMaterials } from '../render/materials.js';

const _q = [];
const _hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0, collider: null, material: 'dirt', entity: null, zone: null };

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2c8a90');
    this.scene.fog = new THREE.FogExp2('#b8683c', 0.0038);
    this.time = 0;
    this.terrain = new Terrain(2);
    this.scene.add(this.terrain.mesh);
    this.colliders = new ColliderWorld(8);
    this.cover = new CoverSystem(this);
    this.nav = null; // built after level
    this.entities = new Map(); // id -> entity (players, enemies, pods, turrets, destructibles)
    this.nextId = 1;
    this.updatables = new Set();
    this.hitTargets = []; // entities with hitboxes
    this.dynamicMeshes = [];
    this._setupLights();
    this.sky = createSky();
    this.scene.add(this.sky);
    this.celestials = createCelestials();
    this.scene.add(this.celestials);
    this.props = new THREE.Group(); this.props.name = 'props'; this.scene.add(this.props);
    this.fxGroup = new THREE.Group(); this.fxGroup.name = 'fx'; this.scene.add(this.fxGroup);
    this.actors = new THREE.Group(); this.actors.name = 'actors'; this.scene.add(this.actors);
    events.on('renderer:quality', () => this._applyShadowQuality());
  }
  _setupLights() {
    this.hemi = new THREE.HemisphereLight('#6fd8dc', '#9a6a52', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffc08a', 2.2);
    this.sun.position.set(-60, 130, 70);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.near = 5; s.camera.far = 320;
    s.camera.left = -55; s.camera.right = 55; s.camera.top = 55; s.camera.bottom = -55;
    s.bias = -0.0006; s.normalBias = 0.03;
    this.sunTarget = new THREE.Object3D(); this.scene.add(this.sunTarget); this.sun.target = this.sunTarget;
    this.scene.add(this.sun);
    this.ambientFill = new THREE.AmbientLight('#2a4a54', 0.5);
    this.scene.add(this.ambientFill);
    this._applyShadowQuality();
  }
  _applyShadowQuality() {
    const q = settings.qualityLevel;
    const size = [512, 1024, 2048, 4096][q];
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.sun.castShadow = settings.data.shadows && q >= 1;
  }
  allocId() { return this.nextId++; }
  register(entity) { if (entity.id == null) entity.id = this.allocId(); this.entities.set(entity.id, entity); if (entity.hitboxes) this.hitTargets.push(entity); return entity; }
  unregister(entity) { this.entities.delete(entity.id); const i = this.hitTargets.indexOf(entity); if (i >= 0) this.hitTargets.splice(i, 1); }
  addBox(center, half, yaw = 0, opts = {}) { return this.colliders.add(new BoxCollider(center, half, yaw, opts)); }
  addCyl(center, radius, height, opts = {}) { return this.colliders.add(new CylinderCollider(center, radius, height, opts)); }
  removeCollider(c) { this.colliders.remove(c); this.cover.removeForCollider(c); this.nav?.rebuildRegion(c.center.x, c.center.z, (c.radiusXZ || 2) + 3); }
  finalize() {
    this.cover.build();
    this.nav = new NavGrid(this, 2);
    this.cullLights(26);
  }
  /** Keep only the strongest N static point lights (shader cost scales with light count). */
  cullLights(maxLights) {
    const lights = [];
    this.props.traverse((o) => { if (o.isPointLight) lights.push(o); });
    if (lights.length <= maxLights) return;
    lights.sort((a, b) => (b.intensity * b.distance) - (a.intensity * a.distance));
    for (let i = maxLights; i < lights.length; i++) lights[i].parent?.remove(lights[i]);
    console.info(`[world] culled ${lights.length - maxLights} of ${lights.length} static point lights`);
  }
  /** Highest standable surface under (x,z) given the current feet y (steps up to stepH allowed). */
  groundHeight(x, z, y = 1e9, stepH = 0.55, radius = 0.35) {
    let g = this.terrain.getHeight(x, z);
    this.colliders.query(x, z, radius, _q);
    for (const c of _q) {
      if (!c.walkableTop) continue;
      if (c.top <= y + stepH && c.top > g && c.containsXZ(x, z, radius * 0.6)) {
        // must be roughly above the top (not below the box)
        if (y >= c.minY - 0.2) g = c.top;
      }
    }
    return g;
  }
  /** Resolve capsule (feet at pos, radius r, height h) against colliders (XZ only). Mutates pos. Returns hit info list. */
  resolveCapsule(pos, r, h, out = []) {
    out.length = 0;
    this.colliders.query(pos.x, pos.z, r + 0.5, _q);
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const c of _q) {
        if (c.maxY <= pos.y + 0.55 && c.walkableTop) continue; // low enough to step on
        if (c.minY >= pos.y + h) continue; // above head
        const res = c.resolveCircle(pos.x, pos.z, r);
        if (res) { pos.x = res.x; pos.z = res.z; out.push({ collider: c, nx: res.nx, nz: res.nz }); any = true; }
      }
      if (!any) break;
    }
    return out;
  }
  /** Ceiling/head check */
  headroom(pos, h) {
    this.colliders.query(pos.x, pos.z, 0.4, _q);
    let ceil = Infinity;
    for (const c of _q) if (c.minY > pos.y + 0.3 && c.minY < ceil && c.containsXZ(pos.x, pos.z, 0.3)) ceil = c.minY;
    return ceil - pos.y;
  }
  /**
   * Raycast vs terrain, colliders and entity hitboxes.
   * opts: { ignoreEntity, entities: bool, colliders: bool, terrain: bool, mask(fn) }
   * Returns hit object (shared, copy if you keep it) or null.
   */
  raycast(origin, dir, maxDist = 300, opts = {}) {
    let best = maxDist, bestKind = null;
    let bn = _hit.normal.set(0, 1, 0), bc = null, bmat = 'dirt', bent = null, bzone = null;
    if (opts.terrain !== false) {
      const t = this.terrain.raycast(origin, dir, maxDist, opts.terrainStep || 0.75);
      if (t >= 0 && t < best) { best = t; bestKind = 'terrain'; }
    }
    if (opts.colliders !== false) {
      this.colliders.queryRay(origin, dir, best, _q);
      for (const c of _q) {
        if (opts.mask && !opts.mask(c)) continue;
        const r = c.raycast(origin, dir, best);
        if (r && r.t < best) { best = r.t; bestKind = 'collider'; bc = c; bn.set(r.nx, r.ny, r.nz); bmat = c.material; }
      }
    }
    if (opts.entities !== false) {
      for (const e of this.hitTargets) {
        if (e === opts.ignoreEntity || e.dead && !opts.includeDead) continue;
        if (opts.entityFilter && !opts.entityFilter(e)) continue;
        // broad phase sphere
        const p = e.hitCenter || e.position;
        const ox = p.x - origin.x, oy = p.y - origin.y, oz = p.z - origin.z;
        const tca = ox * dir.x + oy * dir.y + oz * dir.z;
        if (tca < -e.hitRadius || tca - e.hitRadius > best) continue;
        const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
        if (d2 > e.hitRadius * e.hitRadius) continue;
        const hit = e.raycastHitboxes(origin, dir, best);
        if (hit && hit.t < best) { best = hit.t; bestKind = 'entity'; bent = e; bzone = hit.zone; bn.copy(hit.normal || dir).negate(); bmat = hit.material || 'flesh'; }
      }
    }
    if (!bestKind) return null;
    _hit.dist = best; _hit.kind = bestKind; _hit.collider = bc; _hit.entity = bent; _hit.zone = bzone; _hit.material = bmat;
    _hit.point.copy(origin).addScaledVector(dir, best);
    if (bestKind === 'terrain') { this.terrain.getNormal(_hit.point.x, _hit.point.z, _hit.normal); _hit.material = 'dirt'; if (this.terrain.floorDistance(_hit.point.x, _hit.point.z) > 6) _hit.material = 'rock'; }
    return _hit;
  }
  /** Line of sight between two points (colliders + terrain only). */
  hasLOS(a, b, opts = {}) {
    const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); if (L < 0.01) return true; d.divideScalar(L);
    const h = this.raycast(a, d, L - 0.05, { entities: false, terrainStep: opts.terrainStep || 1.5, mask: opts.mask });
    return !h;
  }
  addUpdatable(o) { this.updatables.add(o); }
  removeUpdatable(o) { this.updatables.delete(o); }
  update(dt, camera) {
    this.time += dt;
    this.sky.userData.update(this.time);
    this.celestials.userData.update(this.time, dt);
    this.terrain.mesh.userData.update(this.time);
    updateMaterials(this.time);
    if (camera) {
      this.sky.position.set(camera.position.x, 0, camera.position.z);
      this.celestials.position.set(camera.position.x, 0, camera.position.z);
      // shadow follows camera focus
      const f = camera.userData.focus || camera.position;
      this.sunTarget.position.set(f.x, f.y, f.z);
      this.sun.position.set(f.x - 60, f.y + 130, f.z + 70);
    }
    for (const u of this.updatables) u.update(dt);
  }
}
