// Over-the-shoulder third-person camera with collision, aim zoom, shoulder switching, trauma shake and recoil.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/mathx.js';
import { settings } from '../core/settings.js';

const _dir = new THREE.Vector3(), _pivot = new THREE.Vector3(), _desired = new THREE.Vector3(), _q = new THREE.Quaternion(), _off = new THREE.Vector3();

export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera; this.world = world;
    this.yaw = 0; this.pitch = -0.12;
    this.shoulder = 1;             // 1 right, -1 left
    this.shoulderBlend = 1;
    this.aim = 0;                  // 0..1 blend
    this.sprint = 0; this.crouch = 0; this.cover = 0;
    this.dist = 2.6; this.curDist = 2.6;
    this.trauma = 0; this.shakeT = 0;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.fovBase = settings.data.fov;
    this.fovTarget = this.fovBase;
    this.peekOffset = 0; this.peekCur = 0;
    this.deathMode = false;
    this.position = new THREE.Vector3();
    this.lookDir = new THREE.Vector3(0, 0, -1);
    this.pivotWorld = new THREE.Vector3();
    this.hitDist = Infinity;
    this.lastMouse = { dx: 0, dy: 0 };
  }
  setYawFromDir(x, z) { this.yaw = Math.atan2(-x, -z); }
  /** Apply mouse look */
  look(dx, dy) {
    const base = 0.0021 * settings.data.mouseSensitivity * lerp(1, settings.data.aimSensitivity, this.aim);
    this.yaw -= dx * base;
    this.pitch -= dy * base * (settings.data.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.15, 0.95);
  }
  addRecoil(pitch, yaw) { this.recoilPitch += pitch; this.recoilYaw += yaw; }
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount * settings.data.screenShake); }
  /** Forward direction (ignoring recoil) used for aiming */
  get forward() { return this.lookDir; }
  update(dt, target) {
    // target: { position (feet), height (eye pivot height), aim, sprint, crouch, cover:{peek, high}|null, dead }
    this.aim = damp(this.aim, target.aim ? 1 : 0, 12, dt);
    this.sprint = damp(this.sprint, target.sprint ? 1 : 0, 6, dt);
    this.crouch = damp(this.crouch, target.crouch ? 1 : 0, 8, dt);
    this.cover = damp(this.cover, target.cover ? 1 : 0, 8, dt);
    this.shoulderBlend = damp(this.shoulderBlend, this.shoulder, 10, dt);
    // recoil recovery
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.shakeT += dt * 30;
    const sh = this.trauma * this.trauma;
    const shakeYaw = sh * 0.06 * (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.7) * 0.5);
    const shakePitch = sh * 0.05 * (Math.cos(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1) * 0.5);
    const shakeRoll = sh * 0.03 * Math.sin(this.shakeT * 2.1);
    const yaw = this.yaw + this.recoilYaw + shakeYaw;
    const pitch = this.pitch + this.recoilPitch + shakePitch;
    // pivot (over the character's shoulder area)
    const h = lerp(target.height ?? 1.55, 1.15, this.crouch);
    _pivot.set(target.position.x, target.position.y + h, target.position.z);
    // offsets in camera space
    const sideNormal = 0.68, sideAim = 0.62, sideSprint = 0.6, sideCover = 0.85;
    const distNormal = 2.9, distAim = (target.zoom && target.zoom < 0.5) ? 0.9 : 1.9, distSprint = 3.5, distCover = 3.1;
    let side = lerp(sideNormal, sideAim, this.aim); side = lerp(side, sideSprint, this.sprint * (1 - this.aim)); side = lerp(side, sideCover, this.cover * (1 - this.aim) * 0.8);
    let dist = lerp(distNormal, distAim, this.aim); dist = lerp(dist, distSprint, this.sprint * (1 - this.aim)); dist = lerp(dist, distCover, this.cover * (1 - this.aim));
    let up = lerp(0.12, 0.05, this.aim) + this.sprint * 0.1;
    if (target.dead) { dist = 4.5; up = 1.2; side = 0.2; }
    // peek shifts the pivot sideways around the cover edge
    const peek = target.cover?.peek || 0;
    this.peekOffset = target.cover ? peek * 0.85 * this.aim : 0;
    this.peekCur = damp(this.peekCur, this.peekOffset, 10, dt);
    _q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    _off.set(side * this.shoulderBlend + this.peekCur, up, dist).applyQuaternion(_q);
    _desired.copy(_pivot).add(_off);
    // collision: sphere cast from pivot toward desired
    _dir.copy(_desired).sub(_pivot); const L = _dir.length(); _dir.divideScalar(L || 1);
    const hit = this.world.raycast(_pivot, _dir, L + 0.25, { entities: false, terrainStep: 0.35 });
    let allowed = L;
    if (hit) allowed = Math.max(0.3, hit.dist - 0.28);
    // also keep above terrain
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 6, dt);
    this.position.copy(_pivot).addScaledVector(_dir, this.curDist);
    const groundY = this.world.terrain.getHeight(this.position.x, this.position.z) + 0.35;
    if (this.position.y < groundY) this.position.y = groundY;
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(_q);
    this.camera.rotateZ(shakeRoll);
    this.pivotWorld.copy(_pivot);
    // look direction (from the un-shaken yaw/pitch, from camera through crosshair)
    this.lookDir.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ'));
    // FOV
    const fovBase = settings.data.fov;
    const zoom = target.zoom ?? 0.72;
    this.fovTarget = lerp(fovBase, fovBase * zoom, this.aim) + this.sprint * 6 * (1 - this.aim);
    this.camera.fov = damp(this.camera.fov, this.fovTarget, 10, dt);
    this.camera.updateProjectionMatrix();
    this.camera.userData.focus = _pivot;
  }
  /** Aim ray: origin at camera, through the crosshair. */
  aimRay(out) { out.origin.copy(this.camera.position); out.direction.copy(this.lookDir); return out; }
}
