// Pooled decal quads (blood splats, scorch marks, bullet holes) placed just above
// a surface and oriented to its normal. Round-robin recycled; oldest is evicted when full.
import * as THREE from 'three';

const PLANE = new THREE.PlaneGeometry(1, 1);
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 0, 1);
const _spin = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export class DecalPool {
  constructor(world, capacity = 300) {
    this.world = world;
    this.capacity = capacity;
    this.cursor = 0;
    this.slots = [];
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        toneMapped: false, opacity: 0,
      });
      const mesh = new THREE.Mesh(PLANE, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      world.fxGroup.add(mesh);
      this.slots.push({ mesh, mat, life: 0, maxLife: 1, baseOpacity: 1 });
    }
  }
  /** Place a decal. normal defaults to world up. */
  spawn(point, normal, { texture, color = '#ffffff', size = 1, life = 60, opacity = 1, emissive = null, emissiveIntensity = 0 } = {}) {
    const s = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    const n = normal && normal.lengthSq() > 0.001 ? normal : _up;
    s.mesh.position.copy(point).addScaledVector(n, 0.015);
    _q.setFromUnitVectors(_up, n);
    _axis.copy(n);
    _spin.setFromAxisAngle(_axis, Math.random() * Math.PI * 2);
    _q.multiply(_spin);
    s.mesh.quaternion.copy(_q);
    s.mesh.scale.set(size, size, size);
    s.mat.map = texture || null;
    s.mat.color.set(color);
    s.mat.opacity = opacity;
    s.baseOpacity = opacity;
    s.life = life; s.maxLife = life;
    s.mesh.visible = true;
    s.mat.needsUpdate = true;
    return s;
  }
  update(dt) {
    for (const s of this.slots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const f = s.life / s.maxLife;
      s.mat.opacity = f < 0.15 ? s.baseOpacity * (f / 0.15) : s.baseOpacity;
    }
  }
  clear() {
    for (const s of this.slots) { s.life = 0; s.mesh.visible = false; }
  }
}
