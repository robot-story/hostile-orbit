// Minimal pooled effects with the full FX contract as no-op/simple fallbacks. Replaced by fx/fx.js when available.
import * as THREE from 'three';
import { Tex } from '../render/textures.js';
import { events } from '../core/events.js';

export class FxLite {
  constructor(world) {
    this.world = world;
    this.tracers = []; this.sparks = [];
    const tg = new THREE.PlaneGeometry(1, 0.05);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: '#8ff0ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(tg, this.tracerMat.clone()); m.visible = false; world.fxGroup.add(m); this.tracers.push({ m, t: 0, life: 0 }); }
    const sg = new THREE.PlaneGeometry(0.35, 0.35);
    this.sparkMat = new THREE.MeshBasicMaterial({ map: Tex.glow(), color: '#ffc36a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.bloodMat = new THREE.MeshBasicMaterial({ map: Tex.dot(), color: '#7a0d16', transparent: true, depthWrite: false });
    for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(sg, this.sparkMat); m.visible = false; world.fxGroup.add(m); this.sparks.push({ m, t: 0, life: 0, v: new THREE.Vector3() }); }
    this.flash = new THREE.PointLight('#8ff0ff', 0, 12, 2); world.fxGroup.add(this.flash);
    this.flashT = 0;
  }
  _spark(p, v, life, mat, size = 1) { const s = this.sparks.find(x => x.life <= 0); if (!s) return; s.m.visible = true; s.m.material = mat; s.m.position.copy(p); s.life = life; s.t = 0; s.v.copy(v); s.size = size; }
  tracer(from, to, color, width = 0.03) {
    if (this.camera && from.distanceTo(this.camera.position) > 90 && to.distanceTo(this.camera.position) > 90) return;
    const t = this.tracers.find(x => x.life <= 0); if (!t) return;
    const d = new THREE.Vector3().subVectors(to, from); const L = d.length(); d.normalize();
    // short streak that travels from -> to
    t.from = from.clone(); t.dir = d; t.len = L; t.speed = 320; t.streak = Math.min(7, L * 0.5); t.pos = 0;
    t.m.visible = true; t.m.scale.set(t.streak, width / 0.05, 1);
    t.m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
    t.life = L / t.speed + 0.02; t.t = 0; if (color) t.m.material.color.set(color);
  }
  impact(p, n) { for (let i = 0; i < 4; i++) this._spark(p.clone().addScaledVector(n, 0.05), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4).addScaledVector(n, 3), 0.25 + Math.random() * 0.2, this.sparkMat); }
  sparksBurst(p, n, count = 12) { for (let i = 0; i < count; i++) this._spark(p, new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6).addScaledVector(n, 3), 0.3 + Math.random() * 0.3, this.sparkMat); }
  blood(p, n, d, amount = 1) { const c = Math.round(10 * amount); for (let i = 0; i < c; i++) this._spark(p, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3).addScaledVector(d, 2 + Math.random() * 3), 0.5 + Math.random() * 0.4, this.bloodMat, 0.6); }
  muzzleFlash(p) { this.flash.position.copy(p); this.flash.intensity = 40; this.flashT = 0.05; }
  muzzle(p) { this.muzzleFlash(p); }
  explosion(p, r) { this.sparksBurst(p, new THREE.Vector3(0, 1, 0), 40); this.flash.position.copy(p); this.flash.intensity = 200; this.flashT = 0.15; events.emit('fx:shake', Math.min(1, r / 8), p); }
  gibs(p, d) { this.blood(p, new THREE.Vector3(0, 1, 0), d, 4); }
  ragdoll(model, opts) { model.root.rotation.x = -Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); model.root.position.y += 0.3; setTimeout(() => model.root.parent?.remove(model.root), 12000); return null; }
  limb() {} hitFlash() {} shell() {} bloodPool() {} smokeColumn() {} beam() {} dust() {} podTrail() {} clear() {}
  warningZone() { return { setPosition() {}, remove() {} }; } marker() { return { setPosition() {}, remove() {} }; }
  update(dt, camera) {
    this.camera = camera;
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; t.pos = Math.min(t.len, t.pos + t.speed * dt); t.m.position.copy(t.from).addScaledVector(t.dir, Math.max(t.streak * 0.5, t.pos - t.streak * 0.5)); if (t.life <= 0) t.m.visible = false; }
    for (const s of this.sparks) if (s.life > 0) { s.life -= dt; s.t += dt; s.v.y -= 12 * dt; s.m.position.addScaledVector(s.v, dt); s.m.quaternion.copy(camera.quaternion); s.m.scale.setScalar(Math.max(0.05, s.life * 2 * (s.size || 1))); if (s.life <= 0) s.m.visible = false; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; }
  }
}
