// Menu backdrop: one persistent scene with three interior "sets" 400m apart, switched by a short eased camera move.
// Owns everything it builds; never mutates the shared Mat/Tex caches (clones materials that must animate independently).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat, COLORS } from './materials.js';
import { Tex } from './textures.js';
import { createSky, createCelestials } from './sky.js';
import { buildSoldier } from '../models/soldier.js';
import { CharacterAnimator } from '../entities/animator.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';
import { clamp, lerp, damp, smoothstep, rand, randInt } from '../core/mathx.js';

const GAP = 400; // metres between set origins along +x

// ---------------------------------------------------------------- geometry helpers
function bakedGeo(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2]));
  geo.applyMatrix4(m);
  return geo;
}
function box(w, h, d, pos, rot, scale) { return bakedGeo(new THREE.BoxGeometry(w, h, d), pos, rot, scale); }
function cyl(r1, r2, h, seg, pos, rot, scale) { return bakedGeo(new THREE.CylinderGeometry(r1, r2, h, seg), pos, rot, scale); }

/** Merge a list of pre-baked geometries into one mesh; disposes the source pieces. */
function merge(parts, material) {
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(g, material);
  return mesh;
}

// ---------------------------------------------------------------- disposal bookkeeping
// Only geometries/materials WE create (not the shared Mat.*/Tex.* caches) go in here.
function makeBag() {
  const geos = new Set(), mats = new Set();
  return {
    geo(g) { geos.add(g); return g; },
    mat(m) { mats.add(m); return m; },
    mesh(m) { if (m.geometry) geos.add(m.geometry); if (m.material) mats.add(m.material); return m; },
    disposeAll() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      geos.clear(); mats.clear();
    },
  };
}

// ---------------------------------------------------------------- custom shader materials
function makeAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vN, vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; varying vec3 vN, vV;
      void main(){
        float fres = pow(1.0 - clamp(abs(dot(vN, vV)), 0.0, 1.0), 2.2);
        vec3 rim = mix(vec3(1.0,0.42,0.08), vec3(0.0,0.85,1.0), clamp(vN.y * 0.5 + 0.5, 0.0, 1.0));
        float breathe = 0.85 + 0.15 * sin(uTime * 0.6);
        gl_FragColor = vec4(rim, fres * 0.55 * breathe);
      }`,
  });
}
function makeDustMaterial(baseSize) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: Tex.dot() }, uColor: { value: new THREE.Color('#bfe8ff') }, uSize: { value: baseSize } },
    vertexShader: `attribute float aSeed; uniform float uTime, uSize; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.08 + aSeed * 6.283) * 1.4;
        p.y += sin(uTime * 0.11 + aSeed * 9.0) * 0.6;
        p.z += cos(uTime * 0.07 + aSeed * 4.0) * 1.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 0.35 + 0.65 * fract(aSeed * 13.7);
        gl_PointSize = uSize * (80.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA * 0.5); }`,
  });
}
function makeTracerMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

// ---------------------------------------------------------------- planet + atmosphere (shared world backdrop)
function buildPlanet(bag) {
  const g = new THREE.Group(); g.name = 'planet';
  const planetMat = bag.mat(new THREE.MeshStandardMaterial({
    map: Tex.planet(), roughness: 1, metalness: 0,
    emissive: '#ffffff', emissiveMap: Tex.planetEmissive(), emissiveIntensity: 1.4,
  }));
  const sphere = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(260, 40, 28)), planetMat);
  // Prefer the generated equirectangular planet texture when present
  new THREE.TextureLoader().load((import.meta.env.BASE_URL || '/') + 'textures/menus/planet_equirect.jpg', (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; planetMat.map = tex; planetMat.emissiveIntensity = 0.6; planetMat.needsUpdate = true; }, undefined, () => {});
  const atmoMat = bag.mat(makeAtmosphereMaterial());
  const atmo = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(272, 32, 22)), atmoMat);
  g.add(sphere, atmo);
  g.position.set(150, -240, -420);
  g.userData.body = sphere; g.userData.atmoMat = atmoMat;
  return g;
}

// ---------------------------------------------------------------- soldier + weapon rig helper
function makeRig(styleName) {
  const model = buildSoldier(styleName);
  const anim = new CharacterAnimator(model);
  return { model, anim, weaponGroup: null, style: styleName };
}
function disposeGroupGeo(group) {
  if (!group) return;
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
function attachWeapon(rig, id) {
  if (rig.weaponGroup) { rig.anim.weaponSocket.remove(rig.weaponGroup); disposeGroupGeo(rig.weaponGroup); rig.weaponGroup = null; }
  const build = WEAPON_BUILDERS[id] || WEAPON_BUILDERS.viper;
  const wg = build();
  rig.anim.weaponSocket.add(wg);
  rig.weaponGroup = wg;
}

// ================================================================== main export
export function createMenuScene(renderer) {
  const bag = makeBag();
  const dpr = (renderer && renderer.getPixelRatio) ? renderer.getPixelRatio() : 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 3000);

  // ---- shared backdrop: sky, celestials, planet, dust ----
  const sky = createSky({ top: '#02060c', mid: '#04121c', horizon: '#0a2a3a', space: 1, aurora: 0.3 });
  scene.add(sky);
  const celestials = createCelestials();
  scene.add(celestials);
  const skyShips = celestials.children.slice(6); // moons(2) + beams(4) precede ships, per sky.js build order

  const planet = buildPlanet(bag);
  scene.add(planet);

  const DUST_N = 300;
  const dustGeo = bag.geo(new THREE.BufferGeometry());
  {
    const pos = new Float32Array(DUST_N * 3), seed = new Float32Array(DUST_N);
    for (let i = 0; i < DUST_N; i++) {
      pos[i * 3 + 0] = rand(-6, 10); pos[i * 3 + 1] = rand(0.1, 4.2); pos[i * 3 + 2] = rand(-8, 4);
      seed[i] = Math.random();
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  }
  const dustMat = bag.mat(makeDustMaterial(3.2 * clamp(dpr, 0.6, 2)));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust); // lives in menu-set local space (origin at world 0)

  // gentle ambient fill for the whole scene (cheap, shared)
  scene.add(new THREE.HemisphereLight('#1a3040', '#04070a', 0.35));

  // fleet engine glows + tracer beams (menu set flavour, but harmless everywhere)
  const glowMat = new THREE.SpriteMaterial({ map: Tex.glow(), color: '#7fe9ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  bag.mat(glowMat);
  for (const ship of skyShips) {
    const spr = new THREE.Sprite(glowMat);
    spr.scale.set(14, 14, 1);
    spr.position.set(-34, 0, 0);
    ship.add(spr);
  }
  const TRACER_N = 3;
  const tracers = [];
  for (let i = 0; i < TRACER_N; i++) {
    const m = bag.mat(makeTracerMaterial(COLORS.orange));
    const mesh = new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.6, 0.6, 1, 5, 1, true)), m);
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0, cd: rand(1.5, 4) });
  }
  const _tp0 = new THREE.Vector3(), _tp1 = new THREE.Vector3(), _tdir = new THREE.Vector3();
  function updateTracers(dt) {
    if (!skyShips.length) return;
    for (const tr of tracers) {
      if (tr.life > 0) {
        tr.life -= dt;
        tr.mesh.material.opacity = Math.max(0, Math.min(1, tr.life * 3)) * 0.7;
        if (tr.life <= 0) tr.mesh.visible = false;
      } else {
        tr.cd -= dt;
        if (tr.cd <= 0) {
          tr.cd = rand(2, 5);
          const a = skyShips[randInt(0, skyShips.length - 1)];
          const b = skyShips[randInt(0, skyShips.length - 1)];
          if (a === b) continue;
          a.getWorldPosition(_tp0); b.getWorldPosition(_tp1);
          const len = _tp0.distanceTo(_tp1);
          if (len < 4 || len > 400) continue;
          tr.mesh.position.copy(_tp0).add(_tp1).multiplyScalar(0.5);
          _tdir.copy(_tp1).sub(_tp0).normalize();
          tr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _tdir);
          tr.mesh.scale.set(0.4, len, 0.4);
          tr.mesh.visible = true;
          tr.life = 0.45;
        }
      }
    }
  }

  // ---- pulsing emissive strip helper: clones the cached neon material so it can animate independently ----
  const pulsers = []; // { mat, base, speed, phase }
  function stripMat(color, intensity, speed = 1.4) {
    const m = Mat.neon(color, intensity).clone();
    bag.mat(m);
    pulsers.push({ mat: m, base: intensity, speed, phase: rand(0, 6.28) });
    return m;
  }
  function updatePulsers(t) {
    for (const p of pulsers) p.mat.emissiveIntensity = p.base * (0.82 + 0.18 * Math.sin(t * p.speed + p.phase));
  }

  // breathing point lights (warm/cool), capped few per set
  const breathers = []; // { light, base, speed, phase }
  function breather(light, base, speed = 0.5) { breathers.push({ light, base, speed, phase: rand(0, 6.28) }); return light; }
  function updateBreathers(t) {
    for (const b of breathers) b.light.intensity = b.base * (0.8 + 0.2 * Math.sin(t * b.speed + b.phase));
  }

  // ============================================================== SET 1: MENU (command deck) — origin (0,0,0)
  const menuGroup = new THREE.Group(); menuGroup.name = 'set:menu'; menuGroup.position.set(0, 0, 0);
  scene.add(menuGroup);
  {
    const darkParts = [], cyanParts = [], orangeParts = [];
    // floor
    darkParts.push(box(12, 0.3, 13, [3.5, -0.15, -2.5]));
    // left-third dark wall (keeps DOM-menu side of frame unlit)
    darkParts.push(box(0.4, 4.3, 13, [-1.8, 2.15, -2.5]));
    // ceiling struts
    for (const z of [-6, -3, 0, 3]) darkParts.push(box(11, 0.2, 0.25, [3.5, 4.3, z]));
    // window frame: outer border + mullions, at z = -8.8
    const wz = -8.8, wx0 = -1, wx1 = 9, wy0 = 0.6, wy1 = 4.2;
    darkParts.push(box(wx1 - wx0 + 0.3, 0.25, 0.3, [(wx0 + wx1) / 2, wy0, wz])); // sill
    darkParts.push(box(wx1 - wx0 + 0.3, 0.25, 0.3, [(wx0 + wx1) / 2, wy1, wz])); // header
    darkParts.push(box(0.25, wy1 - wy0, 0.3, [wx0, (wy0 + wy1) / 2, wz]));
    darkParts.push(box(0.25, wy1 - wy0, 0.3, [wx1, (wy0 + wy1) / 2, wz]));
    darkParts.push(box(0.2, wy1 - wy0, 0.25, [4, (wy0 + wy1) / 2, wz])); // vertical divider
    darkParts.push(box(wx1 - wx0, 0.18, 0.25, [(wx0 + wx1) / 2, 2.4, wz])); // horizontal divider
    cyanParts.push(box(wx1 - wx0 - 0.2, 0.04, 0.05, [(wx0 + wx1) / 2, 2.4, wz + 0.16]));
    cyanParts.push(box(0.04, wy1 - wy0 - 0.2, 0.05, [4, (wy0 + wy1) / 2, wz + 0.16]));
    orangeParts.push(box(wx1 - wx0 - 0.3, 0.03, 0.05, [(wx0 + wx1) / 2, wy0 + 0.08, wz + 0.16]));
    // rail near the window, right two-thirds of the frame
    darkParts.push(box(6.4, 0.08, 0.08, [5.8, 1.0, -7.7]));
    for (let i = 0; i < 6; i++) darkParts.push(box(0.06, 1.0, 0.06, [3 + i * 1.1, 0.5, -7.7]));
    cyanParts.push(box(6.2, 0.03, 0.03, [5.8, 1.02, -7.62]));
    // consoles (bottom-left)
    const consolePos = [[-1.0, 0, -1.0], [-1.0, 0, 0.4], [-0.6, 0, 1.8]];
    const screenMeshes = [];
    consolePos.forEach((p, i) => {
      darkParts.push(box(0.6, 0.9, 0.5, [p[0], 0.45, p[2]]));
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), Mat.screen(i % 4));
      sm.position.set(p[0] + 0.32, 0.75, p[2]); sm.rotation.y = -Math.PI / 2;
      screenMeshes.push(sm);
    });
    // crates (instanced)
    const crateGeo = bag.geo(new THREE.BoxGeometry(0.55, 0.55, 0.55));
    const crateInst = new THREE.InstancedMesh(crateGeo, Mat.panel(0), 5);
    const cratePos = [[-1.3, 0.3, 2.6], [-0.2, 0.3, 3.2], [1.6, 0.3, -0.6], [0.3, 0.3, -1.6], [-1.5, 0.85, 2.6]];
    const cm = new THREE.Matrix4();
    cratePos.forEach((p, i) => { cm.makeTranslation(p[0], p[1], p[2]); crateInst.setMatrixAt(i, cm); });
    crateInst.instanceMatrix.needsUpdate = true;

    const darkMesh = merge(darkParts, Mat.panel(1));
    const cyanMesh = merge(cyanParts, stripMat(COLORS.cyan, 2.4));
    const orangeMesh = merge(orangeParts, stripMat(COLORS.orange, 1.8, 1.0));
    menuGroup.add(darkMesh, cyanMesh, orangeMesh, crateInst, ...screenMeshes);

    // console point lights (capped, 3)
    for (const p of consolePos) {
      const l = new THREE.PointLight(COLORS.cyan, 1.2, 4, 2);
      l.position.set(p[0] + 0.2, 0.9, p[2]);
      menuGroup.add(l);
      breather(l, 1.2, rand(0.6, 1.1));
    }
    // window rim light (breathing warm/cool)
    const rim = new THREE.PointLight('#ffb060', 1.5, 12, 2);
    rim.position.set(6, 2.2, -8);
    menuGroup.add(rim);
    breather(rim, 1.5, 0.3);

    // docked comms-array station, visible through the window
    const stParts = [], stCyan = [];
    stParts.push(box(3, 1.2, 1.2, [0, 0, 0]));
    stParts.push(box(0.3, 3, 0.3, [1.6, 0, 0]));
    stCyan.push(box(2.8, 0.06, 0.06, [0, 0.65, 0.65]));
    stCyan.push(box(2.8, 0.06, 0.06, [0, -0.65, 0.65]));
    const station = new THREE.Group();
    station.add(merge(stParts, Mat.darkMetal()), merge(stCyan, stripMat(COLORS.cyan, 2.0, 0.8)));
    station.position.set(-3, 2.4, -150);
    station.rotation.y = 0.5;
    menuGroup.add(station);

    // soldiers at the rail (primary + 2 lobby-only)
    const menuSoldiers = [makeRig('vanguard'), makeRig('vanguard'), makeRig('vanguard')];
    const railXs = [6.2, 4.6, 7.8];
    menuSoldiers.forEach((rig, i) => {
      rig.model.root.position.set(railXs[i], 0, -7.5);
      rig.model.root.rotation.y = Math.PI;
      rig.visible = i === 0;
      rig.model.root.visible = rig.visible;
      menuGroup.add(rig.model.root);
    });
    menuGroup.userData.soldiers = menuSoldiers;
    menuGroup.userData.headTurn = { cur: 0, target: 0, timer: rand(4, 6) };
  }

  // ============================================================== SET 2: LOADOUT (hangar bay) — origin (GAP,0,0)
  const loadoutGroup = new THREE.Group(); loadoutGroup.name = 'set:loadout'; loadoutGroup.position.set(GAP, 0, 0);
  scene.add(loadoutGroup);
  let loadoutRig, currentWeaponId = 'viper';
  {
    const darkParts = [], cyanParts = [];
    const floorMat = bag.mat(new THREE.MeshStandardMaterial({ map: Tex.metalPanel(1), color: '#8a8f96', roughness: 0.18, metalness: 0.7 }));
    const floor = new THREE.Mesh(bag.geo(new THREE.PlaneGeometry(8, 12)), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -2); floor.receiveShadow = true;
    darkParts.push(box(8.2, 4.2, 0.3, [0, 2.1, -7.9])); // back wall (hazard bay frame sits in front)
    for (const z of [-6, -3, 0, 3]) darkParts.push(box(7.6, 0.2, 0.2, [0, 4.0, z])); // ceiling bars
    cyanParts.push(box(7.4, 0.05, 0.05, [0, 3.98, -6]));
    cyanParts.push(box(7.4, 0.05, 0.05, [0, 3.98, 0]));
    // bay opening with hazard border
    const hazParts = [];
    const bx0 = -2.6, bx1 = 2.6, by0 = 0.4, by1 = 3.6, bz = -7.75;
    hazParts.push(box(bx1 - bx0 + 0.4, 0.3, 0.15, [(bx0 + bx1) / 2, by0, bz]));
    hazParts.push(box(bx1 - bx0 + 0.4, 0.3, 0.15, [(bx0 + bx1) / 2, by1, bz]));
    hazParts.push(box(0.3, by1 - by0, 0.15, [bx0, (by0 + by1) / 2, bz]));
    hazParts.push(box(0.3, by1 - by0, 0.15, [bx1, (by0 + by1) / 2, bz]));
    const hazMesh = merge(hazParts, Mat.hazard());
    // distant ship silhouette through the bay opening
    const shipParts = [box(3, 0.6, 1, [0, 0, 0]), box(0.8, 0.8, 0.6, [-1, 0.5, 0])];
    const shipMesh = merge(shipParts, Mat.darkMetal());
    shipMesh.position.set(1, 1.6, -70);
    // crate rows
    const crateGeo2 = bag.geo(new THREE.BoxGeometry(0.6, 0.6, 0.6));
    const crateInst2 = new THREE.InstancedMesh(crateGeo2, Mat.panel(2), 10);
    let ci = 0; const cm2 = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      cm2.makeTranslation(-2.9, 0.3, -3 + i * 1.1); crateInst2.setMatrixAt(ci++, cm2);
      cm2.makeTranslation(2.9, 0.3 + (i % 2) * 0.62, -3 + i * 1.1); crateInst2.setMatrixAt(ci++, cm2);
    }
    crateInst2.instanceMatrix.needsUpdate = true;
    // stencil poster
    const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), Mat.poster('B-07', 'PREPARE // EQUIP // DEPLOY', '#00e5ff', 9));
    posterMesh.position.set(-3.35, 1.9, -7.7); posterMesh.rotation.y = 0.15;

    const darkMesh2 = merge(darkParts, Mat.darkMetal());
    const cyanMesh2 = merge(cyanParts, stripMat(COLORS.cyan, 2.2));
    loadoutGroup.add(floor, darkMesh2, cyanMesh2, hazMesh, shipMesh, crateInst2, posterMesh);
    // Generated hangar backdrop: when available, hide the blocky hangar props and show the image behind the live character.
    loadoutGroup.userData.props = [darkMesh2, cyanMesh2, hazMesh, shipMesh, crateInst2, posterMesh];
    loadoutGroup.userData.floor = floor;
    new THREE.TextureLoader().load((import.meta.env.BASE_URL || '/') + 'textures/menus/loadout.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.matrixAutoUpdate = true;
      loadoutGroup.userData.backdrop = tex;
      for (const m of loadoutGroup.userData.props) m.visible = false;
      floor.material = new THREE.ShadowMaterial({ opacity: 0.55 }); floor.receiveShadow = true;
      if (mode === 'loadout') { scene.background = tex; scene.traverse((o) => { if (o.name === 'sky' || o.name === 'celestials' || o.name === 'planet' || o.name === 'dust') o.visible = false; }); }
    });

    // lighting
    const key = new THREE.PointLight(COLORS.cyan, 2.2, 10, 2);
    key.position.set(-2.2, 2.2, 2.4); loadoutGroup.add(key); breather(key, 2.2, 0.4);
    const rimL = new THREE.PointLight(COLORS.orange, 1.6, 10, 2);
    rimL.position.set(0.5, 2.4, -2.5); loadoutGroup.add(rimL); breather(rimL, 1.6, 0.35);
    const sun = new THREE.DirectionalLight('#cfefff', 0.9);
    sun.position.set(-3, 6, 3); sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 14;
    sun.shadow.camera.left = -3; sun.shadow.camera.right = 3; sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -3;
    loadoutGroup.add(sun, sun.target);

    loadoutRig = makeRig('vanguard');
    loadoutRig.model.root.position.set(0, 0, 0);
    loadoutRig.model.root.rotation.y = 0; // model faces +z, camera looks down -z at it: default already faces camera
    loadoutRig.model.meshes.forEach((m) => { m.castShadow = true; });
    loadoutGroup.add(loadoutRig.model.root);
    attachWeapon(loadoutRig, currentWeaponId);
  }

  // ============================================================== SET 3: RESULTS (dropship bay) — origin (2*GAP,0,0)
  const resultsGroup = new THREE.Group(); resultsGroup.name = 'set:results'; resultsGroup.position.set(GAP * 2, 0, 0);
  scene.add(resultsGroup);
  let resultsRig;
  {
    const darkParts = [], redParts = [], cyanParts = [];
    darkParts.push(box(4.6, 0.25, 12, [0, -0.1, -2])); // floor
    for (const z of [3, 1, -1, -3, -5]) {
      darkParts.push(box(0.2, 3.6, 0.4, [-2.3, 1.9, z]));
      darkParts.push(box(0.2, 3.6, 0.4, [2.3, 1.9, z]));
      redParts.push(box(0.04, 3.2, 0.04, [-2.18, 1.9, z]));
      cyanParts.push(box(0.04, 3.2, 0.04, [2.18, 1.9, z]));
    }
    darkParts.push(box(4.6, 0.3, 0.3, [0, 3.7, -2])); // ceiling spine
    // seats
    for (const [x, z] of [[-1.8, 1.5], [-1.8, 0.2], [1.8, 1.5], [1.8, 0.2]]) darkParts.push(box(0.6, 0.5, 0.6, [x, 0.35, z]));
    // open rear ramp opening (frame)
    const rz = -6.9, rx0 = -2.1, rx1 = 2.1, ry0 = 0.1, ry1 = 3.4;
    darkParts.push(box(rx1 - rx0 + 0.3, 0.25, 0.3, [(rx0 + rx1) / 2, ry1, rz]));
    darkParts.push(box(0.25, ry1 - ry0, 0.3, [rx0, (ry0 + ry1) / 2, rz]));
    darkParts.push(box(0.25, ry1 - ry0, 0.3, [rx1, (ry0 + ry1) / 2, rz]));
    redParts.push(box(rx1 - rx0, 0.04, 0.05, [(rx0 + rx1) / 2, ry1 - 0.15, rz + 0.16]));

    const darkMesh3 = merge(darkParts, Mat.darkMetal());
    const redMesh3 = merge(redParts, stripMat(COLORS.red, 2.0, 1.6));
    const cyanMesh3 = merge(cyanParts, stripMat(COLORS.cyan, 2.0, 1.6));
    resultsGroup.add(darkMesh3, redMesh3, cyanMesh3);

    const fillR = new THREE.PointLight(COLORS.red, 1.0, 8, 2);
    fillR.position.set(-1.6, 1.8, -1); resultsGroup.add(fillR); breather(fillR, 1.0, 0.7);
    const fillC = new THREE.PointLight(COLORS.cyan, 1.0, 8, 2);
    fillC.position.set(1.6, 1.8, -1); resultsGroup.add(fillC); breather(fillC, 1.0, 0.5);

    resultsRig = makeRig('vanguard');
    resultsRig.model.root.position.set(1.3, 0, 0.6);
    resultsRig.model.root.rotation.y = Math.PI; // back to camera, facing the open ramp
    resultsGroup.add(resultsRig.model.root);
    attachWeapon(resultsRig, currentWeaponId);

    // burning base silhouette beyond the ramp
    const baseParts = [], baseCyan = [];
    const rnd = () => Math.random();
    const fires = [];
    for (let i = 0; i < 6; i++) {
      const x = rand(-40, 40), h = rand(6, 22), z = -80 - rand(0, 60);
      baseParts.push(box(rand(4, 9), h, rand(4, 9), [x, h / 2, z]));
      if (rnd() < 0.6) baseCyan.push(box(rand(2, 5), 0.15, 0.1, [x, rand(1, h - 1), z + rand(2, 4.5)]));
    }
    const baseMesh = merge(baseParts, Mat.darkMetal());
    const baseCyanMesh = baseCyan.length ? merge(baseCyan, stripMat(COLORS.cyan, 1.6, 0.6)) : null;
    resultsGroup.add(baseMesh);
    if (baseCyanMesh) resultsGroup.add(baseCyanMesh);
    const fireLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(COLORS.orange, 3, 30, 2);
      l.position.set(rand(-35, 35), rand(2, 6), -85 - rand(0, 40));
      resultsGroup.add(l);
      fireLights.push({ light: l, base: 3, timer: rand(0, 3) });
    }
    // smoke columns (billboard sprites)
    const smokeMat = bag.mat(new THREE.SpriteMaterial({ map: Tex.smoke(), color: '#889099', transparent: true, opacity: 0.35, depthWrite: false }));
    const smokeSprites = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(smokeMat);
      const bx = rand(-35, 35), bz = -85 - rand(0, 40);
      s.position.set(bx, rand(4, 10), bz);
      s.scale.set(14, 20, 1);
      resultsGroup.add(s);
      smokeSprites.push({ spr: s, baseY: s.position.y, speed: rand(0.3, 0.7), phase: rand(0, 6.28) });
    }
    // occasional distant explosion flash
    const flashLight = new THREE.PointLight('#ffdca0', 0, 60, 2);
    flashLight.position.set(0, 4, -100);
    resultsGroup.add(flashLight);
    resultsGroup.userData.fx = { fireLights, smokeSprites, flashLight, flashTimer: rand(3, 6) };
  }

  // ============================================================== camera rig / mode switching
  const CAM = {
    menu:    { pos: [-1.6, 1.75, 3.3], look: [3.6, 1.35, -9], fov: 40 },
    lobby:   { pos: [-0.6, 1.8, 2.7], look: [5.2, 1.35, -8.6], fov: 42 },
    loadout: { pos: [GAP + 0, 1.35, 5.8], look: [GAP + 0, 1.05, 0], fov: 32 },
    results: { pos: [GAP * 2 + 0, 1.65, 2.6], look: [GAP * 2 + 0.6, 1.3, -7], fov: 38 },
    none:    { pos: [0, 60, 60], look: [0, 0, 0], fov: 40 },
  };
  let mode = 'menu';
  const camFromPos = new THREE.Vector3(), camToPos = new THREE.Vector3(...CAM.menu.pos);
  const camFromLook = new THREE.Vector3(), camToLook = new THREE.Vector3(...CAM.menu.look);
  const curLook = new THREE.Vector3(...CAM.menu.look);
  let camFromFov = CAM.menu.fov, camToFov = CAM.menu.fov;
  let camT = 1; const CAM_DUR = 0.6;

  function setGroupsForMode(m) {
    menuGroup.visible = (m === 'menu' || m === 'lobby');
    loadoutGroup.visible = (m === 'loadout');
    resultsGroup.visible = (m === 'results');
  }
  camera.position.copy(camToPos); camera.fov = camToFov; camera.lookAt(curLook); camera.updateProjectionMatrix();
  setGroupsForMode(mode);

  function setMode(newMode) {
    const target = CAM[newMode] ? newMode : 'none';
    camFromPos.copy(camera.position);
    camFromLook.copy(curLook);
    camFromFov = camera.fov;
    const c = CAM[target];
    camToPos.set(c.pos[0], c.pos[1], c.pos[2]);
    camToLook.set(c.look[0], c.look[1], c.look[2]);
    camToFov = c.fov;
    camT = 0;
    mode = target;
    // show destination immediately so nothing pops in after the flight finishes
    if (target === 'menu' || target === 'lobby') menuGroup.visible = true;
    if (target === 'loadout') loadoutGroup.visible = true;
    scene.background = (target === 'loadout' && loadoutGroup.userData.backdrop) ? loadoutGroup.userData.backdrop : null;
    const hideShared = !!scene.background;
    scene.traverse((o) => { if (o.name === 'sky' || o.name === 'celestials' || o.name === 'planet' || o.name === 'dust') o.visible = !hideShared; });
    if (target === 'results') resultsGroup.visible = true;
    for (const rig of menuGroup.userData.soldiers) rig.model.root.visible = (target === 'lobby') || (rig === menuGroup.userData.soldiers[0]);
  }
  function setWeapon(id) {
    currentWeaponId = WEAPON_BUILDERS[id] ? id : 'viper';
    attachWeapon(loadoutRig, currentWeaponId);
    attachWeapon(resultsRig, currentWeaponId);
  }
  const ARMOUR_STYLES = { vanguard: 'vanguard', rescued: 'rescued' };
  let currentArmour = 'vanguard';
  function setArmour(id) {
    const style = ARMOUR_STYLES[id] || 'vanguard';
    if (style === currentArmour) return;
    currentArmour = style;
    // rebuild the loadout soldier in the new style, preserving pose/weapon/transform
    const oldPos = loadoutRig.model.root.position.clone();
    const oldRotY = loadoutRig.model.root.rotation.y;
    loadoutGroup.remove(loadoutRig.model.root);
    disposeGroupGeo(loadoutRig.weaponGroup);
    loadoutRig.model.dispose();
    loadoutRig = makeRig(style);
    loadoutRig.model.root.position.copy(oldPos);
    loadoutRig.model.root.rotation.y = oldRotY;
    loadoutRig.model.meshes.forEach((m) => { m.castShadow = true; });
    loadoutGroup.add(loadoutRig.model.root);
    attachWeapon(loadoutRig, currentWeaponId);
  }
  function rotate(delta) { loadoutRig.model.root.rotation.y += delta; }

  // ============================================================== per-frame update
  let t = 0;
  const _sway = new THREE.Vector3();
  function update(dt) {
    if (scene.background && scene.background.isTexture) {
      const tex = scene.background; const ca = window.innerWidth / Math.max(1, window.innerHeight), ia = 1.5;
      if (ca > ia) { tex.repeat.set(1, ia / ca); tex.offset.set(0, (1 - ia / ca) / 2); } else { tex.repeat.set(ca / ia, 1); tex.offset.set((1 - ca / ia) / 2, 0); }
    }
    dt = Math.min(dt, 0.05);
    t += dt;
    sky.userData.update(t);
    celestials.userData.update(t, dt);
    dustMat.uniforms.uTime.value = t;
    planet.userData.body.rotation.y += dt * 0.01;
    planet.userData.atmoMat.uniforms.uTime.value = t;
    updatePulsers(t);
    updateBreathers(t);
    updateTracers(dt);

    // menu soldiers idle + head turn on the primary one
    const ms = menuGroup.userData.soldiers;
    for (const rig of ms) if (rig.model.root.visible) rig.anim.update(dt, { speed: 0, sprint: 0, crouch: 0, aim: 0, cover: null, weaponLow: 1 });
    const ht = menuGroup.userData.headTurn;
    ht.timer -= dt;
    if (ht.timer <= 0) { ht.timer = rand(5, 8); ht.target = rand(-0.3, 0.3); }
    ht.cur = damp(ht.cur, ht.target, 2.5, dt);
    ms[0].model.bones.head.rotation.y += ht.cur;

    // loadout + results soldiers
    loadoutRig.anim.update(dt, { speed: 0, sprint: 0, crouch: 0, aim: 0, cover: null, weaponLow: 0 });
    resultsRig.anim.update(dt, { speed: 0, sprint: 0, crouch: 0, aim: 0, cover: null, weaponLow: 1 });

    // results-set fx: flicker fires, rising smoke, occasional flash
    const fx = resultsGroup.userData.fx;
    for (const f of fx.fireLights) {
      f.timer -= dt;
      f.light.intensity = f.base * (0.75 + 0.25 * Math.sin(t * 9 + f.timer * 13));
    }
    for (const s of fx.smokeSprites) {
      s.spr.position.y = s.baseY + ((t * s.speed + s.phase) % 6);
      s.spr.material.opacity = 0.35 * (1 - ((t * s.speed + s.phase) % 6) / 6);
    }
    fx.flashTimer -= dt;
    if (fx.flashTimer <= 0) { fx.flashTimer = rand(4, 9); fx.flashLight.userData.pulse = 0.35; }
    if (fx.flashLight.userData.pulse > 0) {
      fx.flashLight.userData.pulse -= dt * 1.2;
      fx.flashLight.intensity = Math.max(0, fx.flashLight.userData.pulse) * 8;
    }

    // camera transition
    if (camT < 1) {
      camT = Math.min(1, camT + dt / CAM_DUR);
      const e = smoothstep(0, 1, camT);
      camera.position.lerpVectors(camFromPos, camToPos, e);
      curLook.lerpVectors(camFromLook, camToLook, e);
      camera.fov = lerp(camFromFov, camToFov, e);
      camera.updateProjectionMatrix();
      if (camT >= 1) setGroupsForMode(mode);
    } else {
      camera.position.copy(camToPos);
    }
    _sway.set(0, 0, 0);
    if (mode === 'results' && camT >= 1) {
      _sway.set(Math.sin(t * 0.5) * 0.05, Math.sin(t * 0.35) * 0.03, 0);
      camera.position.add(_sway);
    }
    camera.lookAt(curLook);
  }

  function dispose() {
    bag.disposeAll();
    for (const rig of menuGroup.userData.soldiers) rig.model.dispose();
    loadoutRig.model.dispose(); disposeGroupGeo(loadoutRig.weaponGroup);
    resultsRig.model.dispose(); disposeGroupGeo(resultsRig.weaponGroup);
    sky.geometry.dispose(); sky.material.dispose();
    celestials.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    scene.clear();
  }

  return { scene, camera, update, setMode, setWeapon, setArmour, rotate, dispose };
}
