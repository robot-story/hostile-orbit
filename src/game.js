// Game orchestrator: boot, menus, session lifecycle (deploy → play → results), pause, reinforcement pods, checkpoints.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { input, keyLabel } from './core/input.js';
import { settings } from './core/settings.js';
import { save } from './core/save.js';
import { events } from './core/events.js';
import { audio } from './audio/audio.js';
import { World } from './world/world.js';
import { buildLevel } from './world/level.js';
import { M, worldToMap } from './world/terrain.js';
import { clamp, formatTime } from './core/mathx.js';
import { Player } from './entities/player.js';
import { FX } from './fx/fx.js';
import { Hud } from './ui/hud.js';
import { Combat } from './gameplay/combat.js';
import { Director } from './gameplay/director.js';
import { Projectiles } from './gameplay/projectiles.js';
import { Abilities } from './gameplay/abilities.js';
import { Mission } from './gameplay/mission.js';
import { DropPod } from './gameplay/pods.js';
import { WEAPONS, GRENADE, INJECTOR, ARMOUR, ABILITIES, DIFFICULTIES, DROP_ZONES } from './gameplay/weapons.js';
import { SQUAD_COLORS, MAX_PLAYERS } from './net/protocol.js';
import { net, MSG } from './net/net.js';
import { createMenus } from './ui/menus.js';
import { createMenuScene } from './render/menuScene.js';
import { mergeStaticProps } from './world/merge.js';
import { startShowcase } from './debug/showcase.js';
import { Transport } from './net/transport.js';
import { NetSync } from './net/netsync.js';

const BASE = import.meta.env.BASE_URL || './';
const MENU_BG = { main: 'hero_main', operation: 'operation', multiplayer: 'lobby', armoury: 'armoury', record: 'record', settings: 'settings', results: 'results', failed: 'failed', pause: null, loadout: null };

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas; this.ui = uiRoot;
    this.renderer = new Renderer(canvas);
    input.attach(canvas);
    this.clock = new THREE.Clock();
    this.camera = new THREE.PerspectiveCamera(settings.data.fov, 1, 0.1, 2500);
    this.mode = 'boot'; // boot | menu | loading | drop | play | pause | results
    this.paused = false;
    this.world = null; this.session = null;
    this.fpsEl = null; this._fpsAcc = 0; this._fpsN = 0;
    this.lastConfig = null; this.lastResults = null;
    this.god = !new URLSearchParams(location.search).has('mortal'); // TESTING default; F10 toggles
    this.time = 0;
    events.on('settings:changed', (k, v) => { if (k === 'fov') this.camera.fov = v; if (k === 'showFps') this._fps(v); if (k === 'fullscreen') this.setFullscreen(v); if (k === 'hudScale') document.documentElement.style.setProperty('--hud-scale', v); });
    events.on('input:keydown', (code) => this.onKey(code));
    events.on('mission:end', (r) => this.endMission(r));
    events.on('menu:open', (name) => this.onMenuOpen(name));
    events.on('toast', (t, k) => this.menus?.toast(t, k));
    events.on('objective:banner', (b) => this.menus?.banner(b.title, b.sub));
    events.on('hud:interact', (d) => { if (!this.menus) return; if (d) this.menus.showInteract(`[${keyLabel(settings.data.binds.interact)}] ${d.text}`, d.progress); else this.menus.hideInteract(); });
    events.on('fx:shake', (a) => this.localPlayer?.cam.shake(a));
    events.on('fx:flash', (v) => this.renderer.whiteFlash(v));
    events.on('player:damaged', ({ dmg }) => { if (dmg > 0) this.renderer.damageFlash(Math.min(0.9, dmg / 40)); });
    events.on('player:heal', () => this.renderer.healFlash(0.5));
    net.on(MSG.REQ_HIT, (info, from) => this.session?.combat.applyHit(info, from));
  }
  get localPlayer() { return this.session?.player || null; }
  get players() { return this.session?.players || []; }
  get director() { return this.session?.director; }
  get combat() { return this.session?.combat; }
  get projectiles() { return this.session?.projectiles; }
  get abilities() { return this.session?.abilities; }
  get mission() { return this.session?.mission; }
  get fx() { return this.session?.fx; }
  get difficulty() { return this.session?.difficulty || DIFFICULTIES.veteran; }

  // ---------------- boot ----------------
  boot() {
    document.documentElement.style.setProperty('--hud-scale', settings.data.hudScale);
    this._fps(settings.data.showFps);
    this._buildBackgroundLayer();
    this.menus = createMenus(this._buildApi(), this.ui);
    if (new URLSearchParams(location.search).has('showcase')) { startShowcase(this); this.loop(); this.startWatchdog(); return; }
    this._buildBoot();
    this.loop();
    this.startWatchdog();
  }
  _fps(on) { if (on && !this.fpsEl) { this.fpsEl = document.createElement('div'); this.fpsEl.className = 'fps'; this.ui.appendChild(this.fpsEl); } else if (!on && this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; } }
  setFullscreen(on) { try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ } }
  _buildBackgroundLayer() {
    const bg = document.createElement('div'); bg.id = 'menubg';
    bg.innerHTML = `<div class="img a"></div><div class="img b"></div><div class="aurora"></div><div class="fleet"></div><div class="glow"></div><div class="dust"></div><div class="scan"></div>`;
    // drifting fleet silhouettes across the window region
    const fleet = bg.querySelector('.fleet');
    for (let i = 0; i < 7; i++) { const s = document.createElement('i'); s.style.setProperty('--y', `${18 + Math.random() * 30}%`); s.style.setProperty('--d', `${70 + Math.random() * 60}s`); s.style.setProperty('--s', `${0.5 + Math.random() * 0.9}`); s.style.setProperty('--delay', `${-Math.random() * 90}s`); fleet.appendChild(s); }
    // mouse parallax
    window.addEventListener('mousemove', (e) => { if (!bg.classList.contains('on')) return; const x = (e.clientX / window.innerWidth - 0.5), y = (e.clientY / window.innerHeight - 0.5); bg.style.setProperty('--px', `${-x * 14}px`); bg.style.setProperty('--py', `${-y * 8}px`); });
    this.canvas.insertAdjacentElement('afterend', bg);
    const css = document.createElement('style');
    css.textContent = `
      #menubg{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .5s;overflow:hidden;background:#02070b}
      #menubg.on{opacity:1}
      #menubg .img{position:absolute;inset:-4%;background-size:cover;background-position:center;opacity:0;transition:opacity .9s ease;animation:kb 40s ease-in-out infinite alternate;translate:var(--px,0) var(--py,0)}
      #menubg .aurora{position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(120,60,255,.10) 42%,rgba(0,255,190,.12) 50%,rgba(120,60,255,.08) 58%,transparent 70%);background-size:220% 100%;mix-blend-mode:screen;animation:aurora 14s ease-in-out infinite alternate;opacity:.8}
      @keyframes aurora{0%{background-position:0% 0;filter:hue-rotate(0deg)}100%{background-position:100% 0;filter:hue-rotate(40deg)}}
      #menubg .fleet{position:absolute;top:0;bottom:0;left:38%;right:0;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
      #menubg .fleet i{position:absolute;left:-12%;top:var(--y);width:calc(70px * var(--s));height:calc(9px * var(--s));background:linear-gradient(90deg,#0b1218,#1a232c 60%,#0b1218);border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.6);opacity:.85;animation:fleet var(--d) linear infinite;animation-delay:var(--delay);filter:blur(.3px)}
      #menubg .fleet i::after{content:'';position:absolute;right:-4px;top:30%;width:6px;height:40%;background:#7fe9ff;box-shadow:0 0 8px #7fe9ff,0 0 16px #00e5ff}
      #menubg .fleet i::before{content:'';position:absolute;left:30%;top:-40%;width:30%;height:40%;background:#141c24}
      @keyframes fleet{from{transform:translateX(0)}to{transform:translateX(80vw)}}
      #menubg .img.show{opacity:1}
      @keyframes kb{0%{transform:scale(1) translate(0,0)}100%{transform:scale(1.07) translate(-1.2%,0.8%)}}
      #menubg .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 70% 60%,rgba(255,120,40,.10),transparent 55%),radial-gradient(ellipse at 20% 30%,rgba(0,229,255,.10),transparent 50%);animation:glowpulse 6s ease-in-out infinite;mix-blend-mode:screen}
      @keyframes glowpulse{0%,100%{opacity:.6}50%{opacity:1}}
      #menubg .dust{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(180,240,255,.9) 0 1px,transparent 1.5px),radial-gradient(circle,rgba(255,200,150,.7) 0 1px,transparent 1.5px);background-size:190px 160px,260px 210px;background-position:0 0,80px 40px;opacity:.35;animation:dust 60s linear infinite}
      @keyframes dust{to{background-position:-380px 320px,-520px 420px}}
      #menubg .scan{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(0,0,0,0) 0 3px,rgba(0,0,0,.12) 3px 4px);opacity:.5}
      #menubg .flash{position:absolute;inset:0;background:radial-gradient(circle at var(--fx,60%) var(--fy,40%),rgba(255,180,90,.35),transparent 30%);animation:bgflash .9s ease-out forwards}
      @keyframes bgflash{0%{opacity:1}100%{opacity:0}}
    `;
    document.head.appendChild(css);
    this.bgEl = bg; this.bgWhich = 'a'; this.bgCurrent = null;
    // occasional orbital bombardment flashes on the planet
    setInterval(() => { if (!bg.classList.contains('on') || Math.random() < 0.4) return; const f = document.createElement('div'); f.className = 'flash'; f.style.setProperty('--fx', `${40 + Math.random() * 45}%`); f.style.setProperty('--fy', `${35 + Math.random() * 40}%`); bg.appendChild(f); setTimeout(() => f.remove(), 1000); }, 2600);
  }
  setBackground(name) {
    if (!name) { this.bgEl.classList.remove('on'); this.bgCurrent = null; return; }
    this.bgEl.classList.add('on');
    if (this.bgCurrent === name) return;
    this.bgCurrent = name;
    const next = this.bgWhich === 'a' ? 'b' : 'a';
    const el = this.bgEl.querySelector('.img.' + next), old = this.bgEl.querySelector('.img.' + this.bgWhich);
    el.style.backgroundImage = `url(${BASE}textures/menus/${name}.jpg)`; el.classList.add('show'); old.classList.remove('show');
    this.bgWhich = next;
  }
  _buildBoot() {
    // No authorise gate: go straight to the main menu; the audio context unlocks on the first user gesture.
    const unlock = () => { audio.init().then(() => events.emit('audio:ready')); audio.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this.showMainMenu();
  }
  showMainMenu() {
    this.mode = 'menu';
    input.setGameplay(false);
    if (!this._inviteChecked) { this._inviteChecked = true; if (this.checkInviteLink()) return; }
    this.menus.show('main');
  }
  ensureMenuScene() { if (!this.menuScene) { this.menuScene = createMenuScene(this.renderer.renderer); } return this.menuScene; }
  onMenuOpen(name) {
    const bg = MENU_BG[name];
    if (name === 'loadout') { this.setBackground(null); const ms = this.ensureMenuScene(); ms.setMode('loadout'); ms.setWeapon(save.profile.loadout.primary); this.renderer.setScene(ms.scene, ms.camera); this.renderMenuScene = true; }
    else if (name === 'pause') { /* keep gameplay scene visible, dimmed by the overlay */ }
    else { this.renderMenuScene = false; if (bg !== undefined) this.setBackground(bg); }
  }
  // ---------------- API for menus ----------------
  _buildApi() {
    const self = this;
    return {
      settings, save, events, WEAPONS, GRENADE, INJECTOR, ARMOUR, ABILITIES, DIFFICULTIES, DROP_ZONES, SQUAD_COLORS, MAX_PLAYERS, keyLabel, input,
      ui: { click: () => audio.ui('ui_click'), hover: () => audio.ui('ui_hover', { volume: 0.5 }), back: () => audio.ui('ui_back'), confirm: () => audio.ui('ui_confirm'), deploy: () => audio.ui('ui_deploy'), error: () => audio.ui('ui_error'), tab: () => audio.ui('ui_tab', { volume: 0.5 }) },
      say: (id) => audio.say(id, { priority: 2 }),
      music: (state) => audio.setMusicState(state),
      hasOperation: () => save.hasOperation,
      continueOperation: () => self.continueOperation(),
      startDeployment: (cfg) => self.startDeployment(cfg),
      preview: { setMode: (m) => { if (m === 'loadout') self.onMenuOpen('loadout'); }, setWeapon: (id) => self.menuScene?.setWeapon(id), rotate: (d) => self.menuScene?.rotate(d), setArmour: (id) => self.menuScene?.setArmour?.(id) },
      resume: () => self.resume(), restartCheckpoint: () => self.restartFromCheckpoint(), abortToOrbit: () => self.abortToOrbit(), quit: () => { try { window.close(); } catch { /* ignore */ } self.abortToOrbit(); },
      setFullscreen: (v) => self.setFullscreen(v),
      mp: self.mpApi(),
      getLastResults: () => self.lastResults,
    };
  }
  mpApi() {
    const self = this;
    const t = () => (self.transport ||= new Transport());
    const myLoadout = () => save.profile.loadout;
    return {
      host: async (name) => { settings.set('playerName', name || settings.data.playerName); const r = await t().host(name || settings.data.playerName, myLoadout()); self.onLobbyState(); return r; },
      join: async (code, name) => { settings.set('playerName', name || settings.data.playerName); const r = await t().join(code, name || settings.data.playerName, myLoadout()); self.onLobbyState(); return r; },
      leave: () => { self.transport?.close(); self.transport = null; events.emit('lobby:update', self.mpApi().state()); },
      setReady: (r) => t().setReady(r, myLoadout()), setLoadout: (l) => t().setLoadout(l), setSettings: (s) => t().setSettings(s), start: () => self.hostStartMission(),
      state: () => self.transport ? self.transport.state() : { players: [], settings: {}, code: null, link: null, connected: false, isHost: true, error: null, phase: 'lobby' },
    };
  }
  onLobbyState() {
    if (this._lobbyBound) return; this._lobbyBound = true;
    net.on(MSG.START, (m) => { if (!net.isHost) this.startDeployment({ difficulty: m.settings.difficulty, dropZone: m.settings.dropZone, loadout: save.profile.loadout, seed: m.seed }); });
    events.on('mp:disconnected', () => { if (this.mode === 'play' || this.mode === 'drop') { this.menus.toast('CONNECTION TO HOST LOST', 'warn'); } });
  }
  /** Host: launch the mission for the whole lobby (called from the loadout DEPLOY when all are ready). */
  hostStartMission() {
    const t = this.transport; if (!t || !net.isHost) return;
    const notReady = t.players.filter(p => p.connected && !p.isHost && !p.ready);
    if (notReady.length) { this.menus.toast(`WAITING FOR: ${notReady.map(p => p.name).join(', ')}`, 'warn'); return; }
    const seed = (Math.random() * 1e9) | 0;
    t.setPhase('mission');
    net.send(MSG.START, { seed, settings: t.settings, players: t.players }, { reliable: true });
    this.startDeployment({ difficulty: t.settings.difficulty, dropZone: t.settings.dropZone, loadout: save.profile.loadout, seed });
  }
  /** Auto-join from an invite link (?join=CODE). */
  checkInviteLink() {
    const code = new URLSearchParams(location.search).get('join');
    if (!code) return false;
    this.menus.show('multiplayer', { joinCode: code.toUpperCase() });
    setTimeout(async () => { try { await this.mpApi().join(code, settings.data.playerName); this.menus.toast('JOINED SQUAD LOBBY', 'unlock'); } catch (e) { this.menus.toast(String(e.message || e), 'warn'); } }, 400);
    return true;
  }
  // ---------------- session lifecycle ----------------
  buildSession(config) {
    this.teardownSession();
    this.world = new World();
    const lv = buildLevel(this.world);
    // protect gameplay-mutated meshes from the static merge
    const dynamic = [];
    if (lv.jammer?.group) lv.jammer.group.userData.noMerge = true;
    for (const d of (lv.destructibles || [])) { if (d.mesh?.traverse) d.mesh.traverse(o => dynamic.push(o)); else if (d.mesh) dynamic.push(d.mesh); }
    for (const c of (lv.cells || [])) if (c.doorMesh) dynamic.push(c.doorMesh);
    for (const pm of (lv.posters || [])) dynamic.push(pm);
    for (const a of (lv.animated || [])) { if (!a) continue; if (a.mesh) dynamic.push(a.mesh); if (a.group) a.group.userData.noMerge = true; if (a.root) a.root.userData.noMerge = true; if (a.isObject3D) a.userData.noMerge = true; if (Array.isArray(a.meshes)) dynamic.push(...a.meshes); }
    mergeStaticProps(this.world, dynamic);
    this.world.finalize();
    const s = this.session = {};
    s.config = config; s.difficulty = DIFFICULTIES[config.difficulty] || DIFFICULTIES.veteran;
    s.fx = new FX(this.world);
    s.combat = new Combat(this); s.projectiles = new Projectiles(this); s.director = new Director(this, 7); s.abilities = new Abilities(this);
    s.player = new Player(this, this.camera, s.fx, config.loadout); s.player.color = SQUAD_COLORS[net.slot] || SQUAD_COLORS[0]; s.player.name = settings.data.playerName; s.player.id = net.localId;
    this.world.entities.set(s.player.id, s.player);
    s.players = [s.player];
    s.mission = new Mission(this);
    s.director.rng = (() => { let x = (config.seed || 7) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })();
    s.netsync = net.transport ? new NetSync(this) : null;
    s.hud = new Hud(this.ui); s.hud.setLives(s.mission.lives, s.mission.lives); s.hud.show(false);
    this.renderer.setScene(this.world.scene, this.camera); this.renderMenuScene = false; this.setBackground(null);
    this.time = 0;
    return s;
  }
  teardownSession() {
    if (!this.session) return;
    const s = this.session;
    s.netsync?.dispose(); s.mission?.dispose(); s.hud?.dispose(); s.fx?.clear?.(); s.director?.clear?.(); s.abilities?.clear?.(); s.projectiles?.clear?.();
    this.session = null; this.world = null;
    audio.stopVoice(); audio.setMuffle(0);
  }
  dropPositionFor(config) {
    const dz = DROP_ZONES[config.dropZone] || DROP_ZONES.main;
    const p = M(dz.mapX, dz.mapY, 0); const slot = net.slot || 0; p.x += (slot === 1 ? -3.5 : slot === 2 ? 3.5 : 0); p.z += slot ? 2.5 : 0; const w = this.world.nav.nearestWalkable(p.x, p.z, 20) || p; p.set(w.x, 0, w.z); p.y = this.world.groundHeight(p.x, p.z); return p;
  }
  async startDeployment(config) {
    this.lastConfig = config;
    save.setLoadout({ ...config.loadout, difficulty: config.difficulty, dropZone: config.dropZone });
    this.menus.hide(); this.setBackground(null);
    this.mode = 'loading';
    await this.showLoading('PREPARING DEPLOYMENT');
    this.buildSession(config);
    this.hideLoading();
    audio.say('ship_deploy', { priority: 3 });
    audio.say('voss_briefing', { priority: 3, delay: 3 });
    this.dropSequence(this.dropPositionFor(config), () => { this.session.mission.start(); });
  }
  async continueOperation() {
    const cp = save.profile.operationInProgress; if (!cp) return;
    const config = { difficulty: cp.difficulty || save.profile.loadout.difficulty, dropZone: save.profile.loadout.dropZone, loadout: cp.loadout || save.profile.loadout };
    this.lastConfig = config;
    this.menus.hide(); this.setBackground(null); this.mode = 'loading';
    await this.showLoading('RESTORING OPERATION');
    this.buildSession(config);
    this.hideLoading();
    const p = cp.position ? new THREE.Vector3(...cp.position) : this.dropPositionFor(config);
    p.y = this.world.groundHeight(p.x, p.z);
    this.session.mission.active = true;
    this.session.mission.setupInteractables(); this.session.mission.setupGarrisons(); this.session.mission.setupSideMissions();
    this.dropSequence(p, () => { this.session.mission.restore(cp); this.session.hud.setLives(this.session.mission.lives, this.session.difficulty.lives); audio.say('ship_welcome', { priority: 2 }); });
  }
  showLoading(text) {
    return new Promise((res) => {
      let el = document.getElementById('loading');
      if (!el) { el = document.createElement('div'); el.id = 'loading'; el.innerHTML = `<div class="ltxt"></div><div class="lbar"><i></i></div>`; this.ui.appendChild(el); const css = document.createElement('style'); css.textContent = `#loading{position:absolute;inset:0;background:radial-gradient(ellipse at center,#06202a 0%,#000 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:60}#loading .ltxt{font-size:16px;letter-spacing:.4em;color:var(--cyan);text-transform:uppercase}#loading .lbar{width:360px;height:3px;background:rgba(0,229,255,.15);margin-top:20px;overflow:hidden}#loading .lbar i{display:block;height:100%;width:40%;background:var(--cyan);box-shadow:0 0 12px var(--cyan);animation:lslide 1s ease-in-out infinite alternate}@keyframes lslide{from{margin-left:0}to{margin-left:60%}}`; document.head.appendChild(css); }
      el.style.display = 'flex'; el.querySelector('.ltxt').textContent = text;
      setTimeout(res, 120); // never wait on rAF: hidden tabs do not get frames
    });
  }
  hideLoading() { const el = document.getElementById('loading'); if (el) el.style.display = 'none'; }
  /** Cinematic pod drop that ends with the player standing at `target`. */
  dropSequence(target, onDone) {
    const s = this.session; const p = s.player;
    this.mode = 'drop';
    p.model.root.visible = false; p.spawnAt(target, Math.PI * 0 + (target.z > 0 ? 0 : Math.PI));
    const overlay = this.menus.showDropSequence(['DEPLOYMENT AUTHORISED', 'POD SEPARATION', 'ATMOSPHERIC ENTRY', 'IMPACT IMMINENT']);
    audio.setMusicState('deploy'); audio.playStinger('stinger_drop', 0.9);
    audio.setAmbience({ ambience_wind: 0.2 });
    const pod = new DropPod(this, target, { kind: 'player', owner: p.id, duration: 4.2, delay: 0.8, onLand: () => { overlay.setStep(3); this.renderer.whiteFlash(0.6); }, onOpen: () => { p.model.root.visible = true; p.respawn(target, p.yaw); p.position.copy(target).add(new THREE.Vector3(Math.sin(p.yaw) * -3.4, 0, Math.cos(p.yaw) * -3.4)); p.position.y = this.world.groundHeight(p.position.x, p.position.z); overlay.remove(); this.beginPlay(); onDone?.(); } });
    this.dropPod = pod; this.dropT = 0; this.dropOverlay = overlay;
    s.hud.show(false);
  }
  updateDrop(dt) {
    const pod = this.dropPod; if (!pod) return;
    this.dropT += dt;
    pod.update(dt);
    const ov = this.dropOverlay;
    if (ov) { if (this.dropT > 1.2) ov.setStep(1); if (this.dropT > 2.6) ov.setStep(2); const remain = Math.ceil(Math.max(0, pod.duration - Math.max(0, pod.t))); if (remain !== this._lastCountdown) { this._lastCountdown = remain; ov.setCountdown?.(remain); } }
    // camera: chase the pod from above/behind, then swing to ground level at impact
    const k = clamp(pod.t / pod.duration, 0, 1);
    const podPos = pod.position;
    const behind = new THREE.Vector3(6 + k * 4, 6 - k * 3, 10 - k * 2);
    const camPos = podPos.clone().add(behind);
    if (pod.landed) { const t = clamp(pod.openT / 1.2, 0, 1); camPos.set(pod.target.x + 4, pod.target.y + 3, pod.target.z + 8).lerp(new THREE.Vector3(pod.target.x + 1.5, pod.target.y + 2, pod.target.z + 4), t); }
    this.camera.position.lerp(camPos, Math.min(1, dt * (pod.landed ? 3 : 8)));
    this.camera.lookAt(podPos.x, podPos.y + (pod.landed ? 1.5 : 2), podPos.z);
    this.camera.userData.focus = podPos;
    this.camera.fov = 70; this.camera.updateProjectionMatrix();
    if (!pod.landed && pod.t > 0) this.localPlayer.cam.shake(0.02 * k);
    if (pod.doneSignal && !pod.opened) pod.opened = true;
  }
  beginPlay() {
    this.mode = 'play'; this.paused = false;
    input.setGameplay(true);
    const p = this.session.player;
    p.cam.yaw = p.yaw; p.cam.pitch = -0.12;
    this.session.hud.show(true);
    this.dropPod = null;
    audio.setMuffle(0);
  }
  /** Player death → reinforcement pod. */
  launchPlayerPod(player, target) {
    if (!this.session) return;
    const s = this.session; const overlay = this.menus.showDropSequence(['WORKFORCE CONTINUITY SOLUTION', 'REPLACEMENT BODY DISPATCHED', 'ATMOSPHERIC ENTRY', 'IMPACT IMMINENT']);
    this.mode = 'drop'; input.setGameplay(false);
    player.model.root.visible = false; player.position.copy(target);
    audio.playStinger('stinger_drop', 0.7);
    this.dropPod = new DropPod(this, target, { kind: 'player', owner: player.id, duration: 3.6, delay: 0.4, onOpen: () => { player.respawn(target.clone(), player.cam.yaw); player.position.add(new THREE.Vector3(Math.sin(player.cam.yaw) * -3.4, 0, Math.cos(player.cam.yaw) * -3.4)); player.position.y = this.world.groundHeight(player.position.x, player.position.z); overlay.remove(); this.beginPlay(); events.emit('lives:changed', s.mission.lives); } });
    this.dropT = 0; this.dropOverlay = overlay;
    s.hud.show(false);
  }
  updateLockHint() {
    if (!this.lockHint) { this.lockHint = document.createElement('div'); this.lockHint.id = 'lockhint'; this.lockHint.textContent = 'CLICK TO ENGAGE CONTROLS'; this.ui.appendChild(this.lockHint); }
    const need = this.mode === 'play' && !input.locked && !input.lockUnavailable;
    if (!need && this.lockHint.classList.contains('on')) this.lockHint.classList.remove('on');
    this.lockHint.classList.toggle('on', need);
  }
  // ---------------- pause / end ----------------
  onKey(code) {
    if (code === 'F10') { this.god = !this.god; this.menus?.toast(this.god ? 'GOD MODE ON' : 'GOD MODE OFF', 'warn'); }
    if (code === 'Escape') { if (this.mode === 'play') this.pause(); else if (this.mode === 'pause') this.resume(); }
    if (code === (settings.data.binds.map || 'KeyM') && (this.mode === 'play')) { this.mapOpen = !this.mapOpen; if (!this.mapOpen) this.menus.hideTacticalMap(); }
  }
  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause'; this.paused = true; input.setGameplay(false); this.lockHint?.classList.remove('on');
    audio.setMuffle(0.7);
    const m = this.session.mission;
    this.menus.openPause({ objective: m.objectiveText, time: formatTime(m.time) });
  }
  resume() {
    if (this.mode !== 'pause') return;
    this.menus.closePause(); this.menus.hide();
    this.mode = 'play'; this.paused = false; input.setGameplay(true);
    audio.setMuffle(0);
  }
  abortToOrbit() {
    this.menus.closePause?.();
    this.teardownSession();
    if (this.transport?.connected) { this.transport.setPhase('lobby'); this.mode = 'menu'; input.setGameplay(false); this.menus.show('multiplayer'); return; }
    this.mode = 'menu'; input.setGameplay(false);
    audio.setAmbience({ ambience_ship: 0.5 });
    this.showMainMenu();
  }
  async restartFromCheckpoint() {
    const cp = save.profile.operationInProgress;
    this.menus.closePause?.(); this.menus.hide();
    if (!cp) { const cfg = this.lastConfig || { difficulty: save.profile.loadout.difficulty, dropZone: save.profile.loadout.dropZone, loadout: save.profile.loadout }; return this.startDeployment(cfg); }
    return this.continueOperation();
  }
  endMission(result) {
    this.lastResults = result;
    if (net.isHost && net.transport?.peerCount) { net.send(MSG.EV_MISSION, { result: result.success ? 'complete' : 'failed', stats: result }, { reliable: true }); this.transport?.setPhase('results'); }
    input.setGameplay(false); this.mode = 'results'; this.lockHint?.classList.remove('on');
    this.session?.hud.show(false);
    this.menus.hideInteract?.();
    const succeeded = result.success;
    // keep the world rendering behind a fade, then switch to the results backdrop (timer-driven; the world is torn down at the end)
    this.renderer.fx.fade = 0;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1500);
      this.renderer.fx.fade = k;
      if (k < 1) { setTimeout(step, 40); return; }
      try { this.teardownSession(); } catch (e) { console.error('[game] teardown failed', e); this.session = null; this.world = null; }
      this.renderer.fx.fade = 0;
      try { this.setBackground(succeeded ? 'results' : 'failed'); if (succeeded) this.menus.showResults(result); else this.menus.showFailed(result); }
      catch (e) { console.error('[game] results screen failed', e); this.showMainMenu(); }
    };
    step();
  }
  // ---------------- main loop ----------------
  loop() {
    requestAnimationFrame(() => this.loop());
    this.tick();
  }
  /** Watchdog: when the tab is throttled (hidden pane/background), keep simulating via timers. */
  startWatchdog() {
    if (this._watchdog) return;
    this._lastTick = performance.now();
    // Worker timers keep firing when the page is hidden/throttled (main-thread timers and rAF do not).
    try {
      const src = 'setInterval(() => postMessage(0), 50);';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = () => { if (performance.now() - this._lastTick > 120) this.tick(); };
      this._watchdog = w;
    } catch { this._watchdog = setInterval(() => { if (performance.now() - this._lastTick > 200) this.tick(); }, 100); }
  }
  tick() {
    this._lastTick = performance.now();
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.fpsEl) { this._fpsAcc += dt; this._fpsN++; if (this._fpsAcc > 0.5) { this.fpsEl.textContent = `${Math.round(this._fpsN / this._fpsAcc)} FPS`; this._fpsAcc = 0; this._fpsN = 0; } }
    const s = this.session;
    if (s && this.world) {
      if (this.mode === 'play') {
        this.time += dt;
        s.player.update(dt);
        this.world.nav.update();
        s.director.update(dt); s.projectiles.update(dt); s.abilities.update(dt); s.mission.update(dt); s.netsync?.update(dt);
        s.hud.update(s.player, this, dt);
        this.updateLockHint();
        this.renderer.fx.lowHealth = s.player.health < 30 && !s.player.dead ? 1 - s.player.health / 30 : 0;
        if (this.mapOpen) { const pm = worldToMap(s.player.position.x, s.player.position.z); const om = s.mission.markers.length && s.hud.objMarker?.pos ? worldToMap(s.hud.objMarker.pos.x, s.hud.objMarker.pos.z) : null; this.menus.showTacticalMap({ x: pm.mx, y: pm.my, yaw: s.player.cam.yaw }, om ? { x: om.mx, y: om.my } : null, []); }
      } else if (this.mode === 'drop') {
        this.time += dt; this.updateDrop(dt); s.director.update(dt); s.projectiles.update(dt); s.mission.update(dt); s.abilities.update(dt); s.netsync?.update(dt);
      } else if (this.mode === 'pause' || this.mode === 'results') {
        // frozen world; still animate materials
      }
      s.fx.update(dt, this.camera);
      this.world.update(dt, this.camera);
      audio.updateListener(this.camera);
    } else if (this.mode === 'showcase' && this.showcaseUpdate) { this.showcaseUpdate(dt); this.renderer.render(dt); input.endFrame(); return;
    } else if (this.renderMenuScene && this.menuScene) {
      this.menuScene.update(dt);
      audio.updateListener(this.menuScene.camera);
    }
    audio.update(dt);
    if (this.mode !== 'boot' && (s || this.renderMenuScene)) this.renderer.render(dt);
    input.endFrame();
  }
}
