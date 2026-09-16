import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { compactRigid } from './robots.js';
import { clamp, damp } from '../core/mathx.js';

let template, loading;
export function preloadHollow() {
  return loading ||= new GLTFLoader().loadAsync((import.meta.env.BASE_URL || './') + 'models/hollow.glb').then(gltf => {
    template = gltf.scene.getObjectByName('hollow');
    if (!template) throw new Error('Hollow model is missing its named assembly');
    template.position.set(0, 0, 0); template.rotation.set(0, 0, 0);
    // Batch once, before cloning for squads. Joint groups remain independent.
    template.traverse(o => { if (o.children.length && !o.isMesh) o.userData.dynamic = true; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    compactRigid(template);
    return template;
  });
}
export const hollowReady = () => !!template;

export function applyHollow(model) {
  if (!template) return model;
  const source = template.clone(true), B = model.bones, nodes = new Map(); source.traverse(o => nodes.set(o.name, o));
  const get = n => nodes.get(n), mount = (o, bone, pos = [0, 0, 0]) => { o.removeFromParent(); o.position.set(...pos); o.rotation.set(0, 0, 0); bone.add(o); };
  for (const m of model.meshes) m.visible = false;
  for (const b of Object.values(B)) b.rotation.set(0, 0, 0);
  B.root.position.y = 0.98; B.spine.position.set(0, 0.12, -0.055); B.chest.position.set(0, 0.24, 0.055);
  B.neck.position.set(0, 0.40, -0.035); B.head.position.set(0, 0.26, 0.035);
  const hub = get('hub'), head = get('head'), neck = get('neck'), halo = get('halo');
  mount(head, B.head); mount(neck, B.neck); mount(get('spine'), B.spine); mount(get('thorax'), B.chest); mount(get('yoke'), B.chest, [0, 0.38, 0]); mount(hub, B.root);
  mount(halo, B.head, [0, 0.21, -0.02]);
  const cannon = get('fused_cannon');
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const s = side.toLowerCase();
    B['shoulder' + side].position.set(sign * 0.235, 0.32, 0); B['upperArm' + side].position.set(sign * 0.012, -0.06, 0);
    B['forearm' + side].position.set(0, side === 'L' ? -0.4 : -0.32, 0); B['hand' + side].position.set(0, side === 'L' ? -0.458 : -0.318, 0);
    if (side === 'L') mount(get('hand_l'), B.handL);
    else mount(cannon, B.handR, [0, 0, 0.02]);
    mount(get('elbow_' + s), B['forearm' + side]); mount(get('upper_' + s), B['upperArm' + side]); mount(get('arm_' + s), B['shoulder' + side]);
  }
  // Floating shards/tethers stay on the chest; the three legs stay on the hub.
  for (const o of [...source.children]) { model.root.updateMatrixWorld(true); source.updateMatrixWorld(true); B.chest.attach(o); }
  model.root.scale.setScalar(0.9); model.hollow = true; model.legion = 'rifleman'; model.robot = 'legion:hollow';
  const glowMats = new Map();
  model.root.traverse(o => { if (o.isMesh && !model.meshes.includes(o) && /neon/.test(o.material.name)) { if (!glowMats.has(o.material)) glowMats.set(o.material, o.material.clone()); o.material = glowMats.get(o.material); } });
  const parts = []; model.root.traverse(o => { if (o.isMesh && !model.meshes.includes(o)) parts.push(o); });
  model.custom = { get visible() { return parts[0]?.visible ?? true; }, set visible(v) { parts.forEach(o => { o.visible = v; }); } }; model.customMeshes = parts;
  model.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), partBounds = new THREE.Box3();
  for (const o of parts) { o.geometry.computeBoundingBox(); partBounds.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); bounds.union(partBounds); }
  const groundOffset = -bounds.min.y / 0.9;
  B.root.position.y += groundOffset; model.root.updateMatrixWorld(true);
  const legs = Array.from({length:3}, (_, i) => {
    const upper = get('femur_' + i), knee = get('knee_' + i), foot = get('foot_' + i);
    return { upper, knee, foot, hip: get('leg_' + i), rest: model.root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())), yaw: get('leg_' + i).rotation.y, toes: [0,1,2].map(j => get(`toe_${i}_${j}`)), index:i };
  });
  model.tripodLegs = legs;
  const muzzle = new THREE.Object3D(); muzzle.name = 'hollow_muzzle'; muzzle.position.set(0, 0, 0.5); cannon.add(muzzle);
  const ejector = new THREE.Object3D(); ejector.position.set(0.05, 0.04, 0.06); cannon.add(ejector);
  cannon.userData.muzzle = muzzle; cannon.userData.ejector = ejector; model.integratedWeapon = cannon;
  const cannonRest = cannon.position.clone();
  const oldDispose = model.dispose.bind(model); model.dispose = () => { oldDispose(); glowMats.forEach(m => m.dispose()); };
  const target = new THREE.Vector3(), parentInv = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), down = new THREE.Vector3(0,-1,0), vector = new THREE.Vector3();
  let phase = 0, time = 0, speed = 0, collapse = 0;
  model.motion = (vx, vz, dt, land = 0, yaw = 0) => {
    const s = model.animState || {}, a = model.animator; time += dt;
    speed = damp(speed, s.dead ? 0 : Math.hypot(vx, vz), 8, dt); phase += speed * dt / 1.5;
    collapse = damp(collapse, s.dead ? 1 : 0, 4, dt);
    const lx = vx * Math.cos(yaw) - vz * Math.sin(yaw), lz = vx * Math.sin(yaw) + vz * Math.cos(yaw), len = Math.hypot(lx,lz) || 1;
    const stride = Math.min(0.5, speed * 0.12), bob = Math.sin(phase * Math.PI * 6) * Math.min(0.025, speed * 0.008);
    B.root.position.y = 0.98 + groundOffset + bob - (s.crouch || 0) * 0.16 - collapse * 0.6;
    B.root.rotation.z = Math.sin(phase * Math.PI * 2) * Math.min(0.06, speed * 0.014) + collapse * 0.35;
    B.chest.rotation.z += Math.sin(time * 1.9) * 0.02; B.head.rotation.y += Math.sin(time * 0.7) * 0.12 * (1 - (s.aim || 0));
    halo.rotation.set(0.12 + Math.sin(time * 1.3) * 0.06, time * 0.14, Math.sin(time * 0.9) * 0.08);
    model.root.updateMatrixWorld(true);
    for (const leg of legs) {
      // 25% swing, 75% stance, offset by a third: two feet always support the body.
      const cycle = (phase + leg.index / 3) % 1, swing = cycle < 0.25, u = swing ? cycle / 0.25 : (cycle - 0.25) / 0.75;
      const along = swing ? -0.5 + u * u * (3 - 2 * u) : 0.5 - u;
      target.copy(leg.rest); target.x += lx / len * stride * along; target.z += lz / len * stride * along;
      const lift = swing ? Math.sin(u * Math.PI) * Math.min(0.2, speed * 0.06) : 0;
      target.y += lift;
      if (s.groundAt) { const wx = target.x * Math.cos(yaw) + target.z * Math.sin(yaw), wz = -target.x * Math.sin(yaw) + target.z * Math.cos(yaw); target.y += clamp(s.groundAt(wx * 0.9, wz * 0.9) - s.groundAt(0,0), -0.25, 0.3) / 0.9; }
      model.root.localToWorld(target); parentInv.copy(leg.upper.parent.matrixWorld).invert(); target.applyMatrix4(parentInv).sub(leg.upper.position);
      const L1 = 0.42, L2 = 0.46, d = clamp(target.length(), 0.14, L1 + L2 - 0.006);
      const bend = -(Math.PI - Math.acos(clamp((L1*L1+L2*L2-d*d)/(2*L1*L2),-1,1)));
      vector.set(0,-L1-L2*Math.cos(bend),-L2*Math.sin(bend));
      leg.upper.quaternion.setFromUnitVectors(vector.normalize(), target.normalize()); leg.knee.rotation.set(bend,0,0);
      leg.foot.parent.updateWorldMatrix(true,false); leg.foot.parent.getWorldQuaternion(q).invert(); model.root.getWorldQuaternion(q2); q2.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),leg.yaw)); leg.foot.quaternion.copy(q.multiply(q2));
      leg.toes.forEach((toe,j) => { toe.rotation.x = swing ? lift * (1.5+j*0.2) : 0; });
    }
    // The cannon is fused to the wrist. Aim its real muzzle along the actor's sightline.
    B.upperArmL.rotation.x = 0.15 - (s.aim || 0) * 0.55 + Math.sin(phase * Math.PI * 2) * Math.min(0.18, speed * 0.04);
    B.forearmL.rotation.x = -0.35 - (s.aim || 0) * 0.2;
    B.upperArmR.rotation.x = -0.95 - (s.aim || 0) * 0.15 + collapse * 1.25; B.forearmR.rotation.x = -0.75 + (a?.recoil || 0) * 0.16 + collapse * 0.5;
    B.handR.rotation.set(0,0,0); B.handR.updateWorldMatrix(true,false);
    B.handR.getWorldQuaternion(q).invert(); model.root.getWorldQuaternion(q2); q2.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -(a?.aimPitch || 0) * 0.6 + collapse * 0.85)); cannon.quaternion.copy(q.multiply(q2));
    cannon.position.copy(cannonRest); cannon.position.y += (a?.recoil || 0) * 0.025;
    for (const m of glowMats.values()) m.emissiveIntensity = s.dead ? 0.08 : 0.8 + Math.sin(time*4)*0.14 + (a?.recoil || 0)*1.2;
  };
  return model;
}
