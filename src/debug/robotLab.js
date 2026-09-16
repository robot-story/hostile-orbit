// Local art/animation review using the exact gameplay builders and animator.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSoldier } from '../models/soldier.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';
import { preloadHollow } from '../models/hollow.js';
import { Enemy } from '../entities/enemy.js';
import { Player } from '../entities/player.js';
import { input } from '../core/input.js';
import { CharacterAnimator } from '../entities/animator.js';

const variants = { 'KESTREL-7 / Cyan': '#00e5ff', 'BASTION-4 / Amber': '#ffb020', 'WRAITH-3 / Violet': '#c44dff', 'JOLT-9 / Lime': '#7dff5a' };
const actions = ['idle', 'patrol', 'forward', 'reverse', 'strafe', 'sprint', 'aim', 'fire', 'reload', 'crouch', 'cover', 'peek', 'blindfire', 'roll', 'transform', 'rolledfire', 'grind', 'vault', 'flight', 'land', 'interact', 'hit', 'dead'];
function stateFor(action, t) {
  const u = (t % 3) / 3;
  const s = { speed: 0, sprint: 0, crouch: 0, aim: 0, strafe: 0, forward: 1, cover: null, robotic: true };
  if (['forward', 'reverse', 'strafe', 'sprint'].includes(action)) s.speed = action === 'sprint' ? 1 : 0.45;
  if (action === 'reverse') s.forward = -1;
  if (action === 'strafe') s.strafe = 1;
  if (action === 'sprint') s.sprint = 1;
  if (['aim', 'fire', 'peek', 'blindfire'].includes(action)) s.aim = 1;
  if (action === 'grind') { s.grind = true; s.speed = 0.8; s.aim = 1; }
  if (action === 'transform') s.speed = 0.8;
  if (action === 'rolledfire') { s.speed = 0.8; s.aim = 1; }
  if (action === 'patrol') s.weaponLow = 1;
  if (action === 'reload') s.reload = u;
  if (action === 'crouch') s.crouch = 1;
  if (['cover', 'peek', 'blindfire'].includes(action)) s.cover = { high: true, peek: action === 'peek' ? 1 : 0, blind: action === 'blindfire' };
  if (['roll', 'transform', 'vault'].includes(action)) s[action] = u;
  if (action === 'flight') s.jet = 1;
  if (action === 'land') s.land = Math.max(0, 1 - (t % 2) * 4);
  if (action === 'interact') s.interact = true;
  if (action === 'dead') s.dead = true;
  return s;
}

export async function startRobotLab() {
  const enemyMode = new URLSearchParams(location.search).has('enemy');
  if (enemyMode) await preloadHollow();
  document.title = 'OUTRIDER Mk III — Character workshop';
  document.getElementById('ui').innerHTML = '';
  const style = document.createElement('style'); style.textContent = `
    body{margin:0;background:#111923;font:13px system-ui;color:#dce7ed} #gl{position:fixed;inset:0;width:100%;height:100%}
    .lab{position:fixed;top:24px;left:24px;width:235px;padding:22px;background:#101923ed;border:1px solid #344550;border-radius:12px;z-index:100;box-shadow:0 12px 40px #0006}
    .lab h1{font-size:23px;margin:5px 0 6px;letter-spacing:-.6px}.lab p{color:#99adb9;line-height:1.5;margin:8px 0 18px}.lab small{letter-spacing:2px;color:#67d7e6}.lab label{display:block;margin-top:15px;color:#aebcc5}
    .lab select,.lab button{width:100%;padding:9px;margin-top:6px;border:1px solid #415362;border-radius:6px;background:#1c2a36;color:#edf5f7;font:inherit}.lab button{cursor:pointer}.lab button:hover{border-color:#67d7e6}.lab output{display:block;color:#9ce8bd;margin-top:15px;line-height:1.5;white-space:pre-wrap}.lab footer{margin-top:16px;color:#8da5b2;font-size:11px}.lab a{color:#67d7e6}
    .lab-status{position:fixed;bottom:24px;right:24px;padding:12px 18px;background:#101923db;border-radius:6px;color:#b9cbd5;font:12px monospace}
  `; document.head.append(style);
  const panel = document.createElement('section'); panel.className = 'lab'; panel.innerHTML = `
    <small>HOSTILE ORBIT / WORKSHOP</small><h1>OUTRIDER Mk III</h1><p>Articulated field chassis.<br>Drag to orbit · scroll to zoom.</p>
    <label>Character<select id="lab-face">${Object.keys(variants).map(n => `<option>${n}</option>`).join('')}</select></label>
    <label>Weapon<select id="lab-weapon">${Object.keys(WEAPON_BUILDERS).map(n => `<option value="${n}" ${n === 'viper' ? 'selected' : ''}>${n.toUpperCase()}</option>`).join('')}</select></label>
    <label>Animation<select id="lab-action">${actions.map(n => `<option>${n}</option>`).join('')}</select></label>
    <button id="lab-pause">Pause animation</button><button id="lab-lineup">Show all four characters</button><button id="lab-test">Run animation checks</button>
    <output id="lab-result"></output><footer><a href="/">Open game</a> · <a href="?robotlab&characters=legacy">Original characters</a></footer>`;
  document.body.append(panel);
  const status = document.createElement('div'); status.className = 'lab-status'; document.body.append(status);
  const $ = id => document.getElementById('lab-' + id);
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202c39'); scene.fog = new THREE.Fog('#202c39', 15, 35);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 70); camera.position.set(2.6, 2.15, 4.3);
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(-0.35, 0.94, 0); controls.enableDamping = true; controls.minDistance = 1.2; controls.maxDistance = 16;
  scene.add(new THREE.HemisphereLight('#d6ecff', '#566070', 2.0));
  const key = new THREE.DirectionalLight('#fff0db', 2.6); key.position.set(3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; key.shadow.bias = -0.0003; scene.add(key);
  const rim = new THREE.DirectionalLight('#80c9ed', 3); rim.position.set(-3, 3, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color:'#263341', roughness:0.86, metalness:0.12 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(20, 40, '#526979', '#344554'); grid.position.y = 0.002; grid.material.transparent = true; grid.material.opacity = 0.3; scene.add(grid);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 7), new THREE.MeshStandardMaterial({color:'#718694', metalness:0.85, roughness:0.28})); rail.position.set(0.2, 0.09, 0); rail.castShadow = true; rail.visible = false; scene.add(rail);
  const sparkPositions = new Float32Array(36 * 3), sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({color:'#ffbf61', size:0.024, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false})); sparks.visible = false; scene.add(sparks);
  let rigs = [], lineup = false, paused = false, time = 0, fireTime = 0;
  function rebuild() {
    for (const { model, weapon } of rigs) { scene.remove(model.root); model.dispose(); weapon.userData.dispose?.(); }
    rigs = (lineup ? Object.values(variants) : [variants[$('face').value]]).map((color, i) => {
      const model = enemyMode ? buildSoldier('legion', { legion: 'rifleman', custom: null }) : buildSoldier('vanguard', { robot: 'a', neon: color });
      const animator = new CharacterAnimator(model), weapon = model.integratedWeapon || WEAPON_BUILDERS[$('weapon').value](color); if (!model.integratedWeapon) animator.weaponSocket.add(weapon);
      model.root.position.x = lineup ? (i - 1.5) * 1.5 : 0.2; scene.add(model.root);
      const flash = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.19, 6), new THREE.MeshBasicMaterial({color:'#ffcd86', transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, depthWrite:false})); flash.rotation.x = Math.PI / 2; flash.position.z = 0.07; flash.visible = false; weapon.userData.muzzle.add(flash);
      return { model, animator, weapon, flash, flashLife:0 };
    });
    time = 0;
  }
  $('face').onchange = rebuild; $('weapon').onchange = rebuild; $('action').onchange = () => { time = 0; };
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume animation' : 'Pause animation'; };
  $('lineup').onclick = () => { lineup = !lineup; $('lineup').textContent = lineup ? 'Show selected character' : 'Show all four characters'; camera.position.set(lineup ? 3.5 : 2.6, lineup ? 2.8 : 2.15, lineup ? 9 : 4.3); controls.target.set(lineup ? -0.6 : -0.35, 0.94, 0); rebuild(); };
  $('test').onclick = () => {
    if (enemyMode) {
      const errors = [], model = rigs[0].model, a = rigs[0].animator;
      for (const action of ['idle','forward','reverse','strafe','sprint','aim','fire','reload','crouch','hit','dead']) {
        for (let f=0; f<120; f++) { const s = stateFor(action, f/30); a.update(1/30,s); model.motion(s.strafe*3,s.speed*6*s.forward,1/30,0,0); model.root.updateMatrixWorld(true); if (model.tripodLegs.some(l => !l.foot.matrixWorld.elements.every(Number.isFinite))) errors.push(action + ': invalid leg transform'); }
      }
      let shotOrigin;
      const world = { actors:new THREE.Group(), props:new THREE.Group(), pickups:[], entities:new Map(), register() {}, unregister() {}, groundHeight:()=>0, raycast:()=>null };
      const game = {world,fx:{muzzleFlash:p=>{shotOrigin=p.clone();},tracer(){}},time:0,difficulty:{enemyHp:1,enemyDmg:1,accuracy:1}};
      const e = new Enemy(game,'rifleman',new THREE.Vector3()); e.anim.update(1/30,stateFor('idle',0)); e.model.motion(0,0,1/30,0,Math.PI); e.model.root.updateMatrixWorld(true);
      if (!e.model.hollow || e.weaponModel !== e.model.integratedWeapon) errors.push('Common enemy not using integrated cannon');
      for (const l of e.model.tripodLegs) {
        const p = l.foot.getWorldPosition(new THREE.Vector3()), outward = new THREE.Vector3(p.x,0,p.z).normalize(); const start = p.clone().addScaledVector(outward,0.8);
        if (!e.raycastHitboxes(start,outward.negate(),1.6)) errors.push('Leg ' + l.index + ': no hitbox');
      }
      const hp=e.health; e.takeDamage(10,{zone:'head'}); if (e.health >= hp) errors.push('Damage did not reduce health');
      e.target={position:new THREE.Vector3(0,0,10)}; e.distToTarget=10; e.fireShot();
      if (!shotOrigin || shotOrigin.distanceTo(e.weaponModel.userData.muzzle.getWorldPosition(new THREE.Vector3()))>0.001) errors.push('Shot did not originate at cannon muzzle');
      e.die({dir:[0,0,1]});
      if(e.removed || !e.dead || !e.weaponModel.visible)errors.push('Tripod death must retain articulated body and cannon');
      for(let f=0;f<300;f++)e.update(1/30);
      if(!e.removed)errors.push('Dead body not cleaned up');
      rebuild(); $('result').textContent = errors.length ? [...new Set(errors)].join('\n') : '11 enemy animation cycles passed.\nThree leg hitboxes passed.\nFused cannon firing origin passed.\nDamage, death and cleanup passed.'; return;
    }
    const errors = [], savedWeapon = $('weapon').value; let cases = 0;
    const model = rigs[0].model, a = rigs[0].animator;
    for (const id of Object.keys(WEAPON_BUILDERS)) {
      const w = WEAPON_BUILDERS[id](); a.weaponSocket.clear(); a.weaponSocket.add(w);
      if (!w.userData.muzzle || !w.userData.gripR || !w.userData.gripL) errors.push(id + ': missing socket');
      for (const action of actions) {
        for (let f = 0; f < 45; f++) { const s = stateFor(action, f / 15); model.sprintBall = ['transform', 'rolledfire'].includes(action); if (f % 12 === 0 && action === 'fire') a.kick(); a.update(1 / 30, s); model.motion?.(s.strafe * 4, s.speed * 6 * s.forward, 1 / 30, s.land || 0, 0, s.crouch); }
        model.root.updateMatrixWorld(true); let bad = false; model.root.traverse(o => { if (!o.matrixWorld.elements.every(Number.isFinite)) bad = true; });
        if (bad) errors.push(id + '/' + action + ': non-finite transform');
        cases++;
      }
    }
    const oldEnabled=input.enabled, oldButtons=input.mouseButtons, oldPressed=input.mousePressed;
    try {
      input.enabled=true; input.mouseButtons=new Set([0]); input.mousePressed=new Set([0]);
      for (const state of ['normal','roll','vault']) {
        let shots=0;
        const actor={weapon:{def:{auto:true,mag:30},ammo:30,reserve:0},model:{mk3:true,sprintBall:true},state,fireT:0,bloom:0,reloadT:-1,injectors:0,fire(){shots++;}};
        Player.prototype.updateWeapon.call(actor,1/60);
        if (shots !== (state==='vault'?0:1)) errors.push(state+': gameplay fire gate failed');
      }
    } finally { input.enabled=oldEnabled; input.mouseButtons=oldButtons; input.mousePressed=oldPressed; }
    $('weapon').value = savedWeapon; rebuild();
    $('result').textContent = errors.length ? errors.join('\n') : `${cases} weapon / animation cases passed.\nAll muzzle and hand sockets present.\nAll part transforms finite.\nRolling fire gameplay gate passed.`;
  };
  if (enemyMode) { document.title='HOLLOW — Character workshop'; panel.querySelector('h1').textContent = 'HOLLOW / RIFLEMAN'; $('face').innerHTML='<option>HOLLOW / Tripod</option>'; $('weapon').innerHTML='<option>FUSED CANNON</option>'; $('face').disabled = true; $('weapon').disabled = true; $('lineup').hidden=true; }
  rebuild();
  let then = performance.now();
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min((now - then) / 1000, 0.05); then = now;
    if (!paused) {
      time += dt; fireTime += dt; const action = $('action').value, s = stateFor(action, time);
      for (const rig of rigs) {
        const { model, animator, flash } = rig;
        model.sprintBall = ['transform', 'rolledfire'].includes(action);
        if (['fire', 'blindfire', 'rolledfire'].includes(action) && fireTime > 0.18) { animator.kick(0.7); rig.flashLife = 0.05; }
        rig.flashLife -= dt; flash.visible = rig.flashLife > 0;
        if (action === 'hit' && fireTime > 1.2) animator.hitReact(0.7, 1);
        animator.update(dt, s); model.motion?.(s.strafe * 4, s.speed * 6 * s.forward, dt, s.land || 0, 0, s.crouch);
        model.root.position.y = ['vault', 'flight'].includes(action) ? 0.5 + Math.sin(time * 2) * 0.2 : action === 'grind' ? 0.18 : 0;
      }
      if (fireTime > (action === 'hit' ? 1.2 : 0.18)) fireTime = 0;
      rail.visible = sparks.visible = action === 'grind';
      for (let i = 0; i < 36; i++) { const age = (time * 2 + i / 36) % 1; sparkPositions[i * 3] = 0.2 + Math.sin(i * 12.3) * age * 0.35; sparkPositions[i * 3 + 1] = 0.19 + Math.sin(age * Math.PI) * (0.12 + i % 4 * 0.03); sparkPositions[i * 3 + 2] = -age * 1.5; } sparkGeometry.attributes.position.needsUpdate = true;
    }
    const w = window.innerWidth, h = window.innerHeight; if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    controls.update(); renderer.render(scene, camera);
    status.textContent = `${$('action').value.toUpperCase()} / ${paused ? 'PAUSED' : 'LIVE'}   ·   ${renderer.info.render.triangles.toLocaleString()} triangles   ·   ${renderer.info.render.calls} draws`;
  }
  requestAnimationFrame(frame);
}
