// Pooled GPU-friendly particle systems (THREE.Points + custom ShaderMaterial) and
// pooled InstancedMesh debris (shells, gibs, chunks) with simple CPU physics.
// Everything here is allocation-free per frame: fixed typed arrays, round-robin reuse.
import * as THREE from 'three';

const VERT = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = max(0.001, -mv.z);
    gl_PointSize = clamp(aSize * uScale / d, 1.0, 400.0);
  }
`;
const FRAG = `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, 1.0) * t;
    gl_FragColor.a *= vAlpha;
    if (gl_FragColor.a <= 0.003) discard;
  }
`;

/**
 * One pooled Points system of a fixed style (e.g. "sparks"). Spawn writes into
 * typed arrays; update() integrates physics on CPU and pushes to buffer attributes.
 */
export class ParticleField {
  constructor(world, capacity, texture, opts = {}) {
    this.world = world;
    this.capacity = capacity;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.growth = new Float32Array(capacity);
    this.active = new Uint8Array(capacity);
    this.alpha = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uScale: { value: 420 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    world.fxGroup.add(this.points);
    this.maxActive = 0;
  }

  /** Spawn one particle. Returns its slot index. */
  spawn({ pos, vel, life = 0.5, size = 0.3, color = '#ffffff', gravity = 0, drag = 0, growth = 0 }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = pos.x; this.pos[i3 + 1] = pos.y; this.pos[i3 + 2] = pos.z;
    this.vel[i3] = vel ? vel.x : 0; this.vel[i3 + 1] = vel ? vel.y : 0; this.vel[i3 + 2] = vel ? vel.z : 0;
    const c = _c.set(color);
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.size[i] = size; this.baseSize[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.gravity[i] = gravity; this.drag[i] = drag; this.growth[i] = growth;
    this.active[i] = 1;
    return i;
  }

  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.active[i] = 0; this.size[i] = 0; continue;
      }
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.gravity[i] * dt;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = Math.max(0, this.baseSize[i] + this.growth[i] * (this.maxLife[i] - this.life[i]));
      if (this.groundCheck && this.world.terrain) {
        const gh = this.world.terrain.getHeight(this.pos[i3], this.pos[i3 + 2]);
        if (this.pos[i3 + 1] <= gh) {
          this.groundCheck.cb(this.pos[i3], gh, this.pos[i3 + 2], i);
          this.active[i] = 0; this.size[i] = 0; this.life[i] = 0;
        }
      }
    }
    // pack alpha = life fraction (fade out over last 30%) into the aAlpha attribute buffer
    const alphaAttr = this.geo.attributes.aAlpha.array;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) { alphaAttr[i] = 0; continue; }
      const f = this.life[i] / this.maxLife[i];
      alphaAttr[i] = f > 0.3 ? 1 : Math.max(0, f / 0.3);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.setDrawRange(0, this.capacity);
  }
}
const _c = new THREE.Color();

/**
 * Pooled InstancedMesh debris with simple gravity + ground-bounce physics.
 * Good for shells, gibs, chunks, armour plates.
 */
export class InstancedDebris {
  constructor(world, geometry, material, capacity, opts = {}) {
    this.world = world;
    this.capacity = capacity;
    this.cursor = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!opts.castShadow;
    world.fxGroup.add(this.mesh);
    this.pos = Array.from({ length: capacity }, () => new THREE.Vector3());
    this.vel = Array.from({ length: capacity }, () => new THREE.Vector3());
    this.angVel = Array.from({ length: capacity }, () => new THREE.Vector3());
    this.quat = Array.from({ length: capacity }, () => new THREE.Quaternion());
    this.scale = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.bounce = new Float32Array(capacity).fill(0.35);
    this.active = new Uint8Array(capacity);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, _zeroM.clone().makeScale(0, 0, 0));
    this._m = new THREE.Matrix4();
    if (opts.perInstanceColor) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    }
  }
  spawn({ pos, vel, angVel, life = 4, scale = 1, bounce = 0.35, color }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (color && this.mesh.instanceColor) {
      _c2.set(color);
      this.mesh.instanceColor.setXYZ(i, _c2.r, _c2.g, _c2.b);
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.pos[i].copy(pos);
    this.vel[i].copy(vel || _zero);
    this.angVel[i].set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    if (angVel) this.angVel[i].copy(angVel);
    this.quat[i].identity();
    this.scale[i] = scale;
    this.life[i] = life; this.maxLife[i] = life;
    this.bounce[i] = bounce;
    this.active[i] = 1;
    return i;
  }
  update(dt) {
    const terrain = this.world.terrain;
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.mesh.setMatrixAt(i, _zeroM.identity().makeScale(0, 0, 0));
        continue;
      }
      const p = this.pos[i], v = this.vel[i];
      v.y -= 14 * dt;
      p.addScaledVector(v, dt);
      const gh = terrain ? terrain.getHeight(p.x, p.z) : 0;
      if (p.y <= gh) {
        p.y = gh;
        if (v.y < 0) v.y = -v.y * this.bounce[i];
        v.x *= 0.6; v.z *= 0.6;
        this.angVel[i].multiplyScalar(0.5);
      }
      const av = this.angVel[i];
      if (av.lengthSq() > 0.0001) {
        _q2.setFromAxisAngle(_axis.copy(av).normalize(), av.length() * dt);
        this.quat[i].multiply(_q2);
      }
      let s = this.scale[i];
      const f = this.life[i] / this.maxLife[i];
      if (f < 0.15) s *= f / 0.15; // shrink out at the very end instead of popping
      this._m.compose(p, this.quat[i], _one.setScalar(s));
      this.mesh.setMatrixAt(i, this._m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    for (let i = 0; i < this.capacity; i++) { this.active[i] = 0; this.mesh.setMatrixAt(i, _zeroM.identity().makeScale(0, 0, 0)); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const _zero = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _zeroM = new THREE.Matrix4();
const _q2 = new THREE.Quaternion();
const _axis = new THREE.Vector3(0, 1, 0);
const _c2 = new THREE.Color();
