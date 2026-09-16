// Game orchestrator: boot, menus, session lifecycle (deploy → play → results), pause, reinforcement pods, checkpoints.
import { updateBreakables } from './world/breakables.js';
import { updatePickups } from './world/pickups.js';
import * as THREE from 'three';
import { waitForAssets } from './core/assets.js';
import { Renderer } from './render/renderer.js';
import { input, keyLabel } from './core/input.js';
import { settings } from './core/settings.js';
import { save } from './core/save.js';
import { events } from './core/events.js';
import { audio } from './audio/audio.js';
import { World } from './world/world.js';
import { buildLevel } from './world/level.js';
import { MAPS, DEFAULT_MAP } from './world/maps/index.js';
import { DevMenu } from './debug/devmenu.js';
import { preloadCustomModels } from './models/glbSoldier.js';
import { Hints } from './ui/hints.js';
import { QTE } from './gameplay/qte.js';
import { icon } from './ui/components.js';
import { M, worldToMap } from './world/terrain.js';
import { clamp, damp, formatTime } from './core/mathx.js';
import { Player } from './entities/player.js';
import { FX } from './fx/fx.js';
import { Hud } from './ui/hud.js';
import { Combat } from './gameplay/combat.js';
import { Director } from './gameplay/director.js';
import { Projectiles } from './gameplay/projectiles.js';
import { Abilities } from './gameplay/abilities.js';
import { Mission } from './gameplay/mission.js';
import { DropPod, buildPodModel } from './gameplay/pods.js';
import { FRAME_VARIANTS, WEAPONS, GRENADE, INJECTOR, ABILITIES, DIFFICULTIES, DROP_ZONES } from './gameplay/weapons.js';
import { SQUAD_COLORS, MAX_PLAYERS } from './net/protocol.js';
import { net, MSG } from './net/net.js';
import { createMenus } from './ui/menus.js';
import { createMenuScene } from './render/menuScene.js';
import { mergeStaticProps } from './world/merge.js';
import { startShowcase } from './debug/showcase.js';
import { Transport } from './net/transport.js';
import { NetSync } from './net/netsync.js';

const BASE = import.meta.env.BASE_URL || './';
const MENU_BG = { main: 'title_moon', operation: 'operation', multiplayer: 'lobby', armoury: 'armoury', record: 'record', settings: 'settings', results: 'results', failed: 'failed', pause: null, loadout: null };

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
    this.god = false; // Explicitly opt in through the developer menu.
    this.time = 0;
    events.on('settings:changed', (k, v) => { if (k === 'fov') this.camera.fov = v; if (k === 'showFps') this._fps(v); if (k === 'fullscreen') this.setFullscreen(v); if (k === 'hudScale') document.documentElement.style.setProperty('--hud-scale', v); });
    events.on('input:keydown', (code) => this.onKey(code));
    events.on('mission:end', (r) => this.endMission(r));
    events.on('menu:open', (name) => this.onMenuOpen(name));
    events.on('objective:banner', (b) => this.menus?.banner(b.title, b.sub));
    events.on('hud:interact', (d) => { if (!this.menus) return; if (d) this.menus.showInteract(`[${keyLabel(settings.data.binds.interact)}] ${d.text}`, d.progress); else this.menus.hideInteract(); });
    events.on('fx:shake', (a) => this.localPlayer?.cam.shake(a));
    events.on('hud:map-toggle', () => this.toggleTacticalMap());
    events.on('player:kill', () => this.localPlayer?.creditKill?.());
    events.on('player:died', (p, info) => { if (p === this.localPlayer) this.showDeathReport(p, info); });
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
    const pre = preloadCustomModels();
    document.documentElement.style.setProperty('--hud-scale', settings.data.hudScale);
    this._fps(settings.data.showFps);
    this._buildBackgroundLayer();
    this.menus = createMenus(this._buildApi(), this.ui);
    this.menus.onTacticalMapClose(() => this.toggleTacticalMap(false));
    this.dev = new DevMenu(this, this.ui);
    if (new URLSearchParams(location.search).has('showcase')) { pre.then(() => startShowcase(this)); this.loop(); this.startWatchdog(); return; }
    this._buildBoot();
    this.loop();
    this.startWatchdog();
  }
  _fps(on) { if (on && !this.fpsEl) { this.fpsEl = document.createElement('div'); this.fpsEl.className = 'fps'; this.ui.appendChild(this.fpsEl); } else if (!on && this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; } }
  setFullscreen(on) { try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ } }
  _buildBackgroundLayer() {
    const bg = document.createElement('div'); bg.id = 'menubg';
    bg.innerHTML = `<div class="img a"></div><div class="img b"></div><div class="aurora"></div><div class="glow"></div><div class="dust"></div><div class="scan"></div>`;
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
  /** Custom reticle cursor for menus (DOM element that follows the mouse), hidden while gameplay owns the pointer. */
  _buildCursor() {
    const c = document.createElement('div'); c.id = 'cursor'; c.innerHTML = '<i></i>'; document.body.appendChild(c); this.cursorEl = c;
    const move = (e) => { c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; c.classList.add('seen'); };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      c.classList.add('down'); move(e);
      // a stale pointer lock (from a previous session) would swallow menu clicks: release it whenever we are not playing
      if (this.mode !== 'play' && document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* ignore */ } }
    });
    window.addEventListener('pointerup', () => c.classList.remove('down'));
    window.addEventListener('mouseover', (e) => c.classList.toggle('hot', !!e.target.closest?.('button, a, .chip, .load-card, .wp-item, .weapon-card, .marker.selectable, .hd-tab, .tab-btn, .pill-seg, .choice-arrow, .swatch, input, select, [role=button]')));
    events.on('input:lock', (locked) => c.classList.toggle('hidden', locked));
  }
  _buildBoot() {
    // No authorise gate: go straight to the main menu; the audio context unlocks on the first user gesture.
    const unlock = () => { audio.init().then(() => events.emit('audio:ready')); audio.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this._buildCursor();
    this.showTitleCard().then(() => this.showMainMenu());
  }
  /** Animated title card: dark moon key art, HOSTILE ORBIT reveal, press any key -> main menu. */
  showTitleCard() {
    if (new URLSearchParams(location.search).has('join') || new URLSearchParams(location.search).has('notitle')) return Promise.resolve();
    const el = document.createElement('div'); el.id = 'title';
    const base = import.meta.env.BASE_URL || '/';
    el.innerHTML = `<div class="bg" style="background-image:url('${base}textures/menus/title_moon.jpg')"></div><div class="haze"></div><div class="scan"></div>
      <div class="wrap"><div class="kicker">MERIDIAN COMMONWEALTH // ORBITAL ASSAULT DIVISION</div>
        <div class="main-title-wrap reveal"><div class="main-title"><div>HOSTILE</div><div>ORBIT</div></div><div class="main-device"><span class="wing left"></span><span class="emblem">${icon('chevronBig')}</span><span class="wing right"></span></div></div>
        <div class="rule"></div><div class="press">PRESS ANY KEY TO START</div></div>`;
    if (!document.getElementById('title-css')) { const css = document.createElement('style'); css.id = 'title-css'; css.textContent = `
      #title{position:absolute;inset:0;z-index:50;background:#02030a;overflow:hidden;font-family:var(--font);pointer-events:auto;cursor:none}
      #title .bg{position:absolute;inset:-4%;background-size:cover;background-position:center;animation:titleZoom 40s ease-out forwards;filter:saturate(1.05)}
      #title .haze{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 55%,rgba(0,0,0,.75),rgba(0,0,0,.15) 55%,rgba(0,0,0,.6));}
      #title .scan{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px);pointer-events:none}
      #title .wrap{position:absolute;left:8vw;top:50%;transform:translateY(-52%)}
      #title .kicker{font-size:11px;letter-spacing:.42em;color:var(--cyan,#5be3ff);opacity:0;animation:titleFade 1.2s .4s forwards}
      #title .main-title-wrap{align-items:flex-start;text-align:left;margin-top:10px}
      #title .main-title{font-size:min(11vw,124px)!important;text-align:left!important}
      #title .reveal{opacity:0;transform:translateY(22px);filter:blur(8px);animation:titleLetter 1.1s .5s cubic-bezier(.2,.8,.2,1) forwards}
      #title .main-device{margin-top:8px}
      #title .rule{width:0;height:2px;margin:18px 0 22px;background:linear-gradient(90deg,var(--yellow,#f2c744),transparent);animation:titleRule 1.2s 1.9s forwards}
      #title .press{font-size:13px;letter-spacing:.42em;color:#fff;opacity:0;animation:titlePress 1.6s 2.6s infinite}
      #title.out{animation:titleOut .6s forwards}
      @keyframes titleZoom{from{transform:scale(1.06)}to{transform:scale(1)}}
      @keyframes titleFade{to{opacity:1}}
      @keyframes titleLetter{to{opacity:1;transform:none;filter:blur(0)}}
      @keyframes titleRule{to{width:min(38vw,460px)}}
      @keyframes titlePress{0%,100%{opacity:.25}50%{opacity:1}}
      @keyframes titleOut{to{opacity:0;transform:scale(1.04)}}`; document.head.appendChild(css); }
    this.ui.appendChild(el);
    this.mode = 'title';
    return new Promise((resolve) => {
      const go = (e) => { if (e.type === 'keydown' && (e.code === 'F5' || e.code === 'F12' || e.metaKey || e.ctrlKey)) return; window.removeEventListener('keydown', go); window.removeEventListener('pointerdown', go); audio.play?.('ui_confirm', { volume: 0.8 }); el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 620); };
      window.addEventListener('keydown', go); window.addEventListener('pointerdown', go);
    });
  }
  showMainMenu() {
    if (!this._bootMarked) { this._bootMarked = true; try { performance.mark('ho:menu-ready'); console.info('[boot] menu ready at', Math.round(performance.now()), 'ms'); } catch { /* ignore */ } }
    this.mode = 'menu';
    input.setGameplay(false);
    if (!this._inviteChecked) { this._inviteChecked = true; if (this.checkInviteLink()) return; }
    this.menus.show('main');
  }
  ensureMenuScene() { if (!this.menuScene) { this.menuScene = createMenuScene(this.renderer.renderer); } return this.menuScene; }
  onMenuOpen(name) {
    const bg = MENU_BG[name];
    if (name === 'loadout') { this.setBackground(null); const ms = this.ensureMenuScene(); ms.setMode('loadout'); ms.setWeapon(save.profile.loadout.primary); ms.setNeon(save.profile.loadout.neon || '#00e5ff', false); this.renderer.setScene(ms.scene, ms.camera); this.renderMenuScene = true; }
    else if (name === 'pause') { /* keep gameplay scene visible, dimmed by the overlay */ }
    else { this.renderMenuScene = false; if (bg !== undefined) this.setBackground(bg); }
  }
  // ---------------- API for menus ----------------
  _buildApi() {
    const self = this;
    return {
      settings, save, events, WEAPONS, FRAME_VARIANTS, GRENADE, INJECTOR, ABILITIES, DIFFICULTIES, DROP_ZONES, SQUAD_COLORS, MAX_PLAYERS, MAPS, DEFAULT_MAP, keyLabel, input,
      ui: { click: () => audio.ui('ui_click'), hover: () => audio.ui('ui_hover', { volume: 0.5 }), back: () => audio.ui('ui_back'), confirm: () => audio.ui('ui_confirm'), deploy: () => audio.ui('ui_deploy'), error: () => audio.ui('ui_error'), tab: () => audio.ui('ui_tab', { volume: 0.5 }) },
      say: (id) => audio.say(id, { priority: 2 }),
      music: (state) => audio.setMusicState(state),
      hasOperation: () => save.hasOperation,
      continueOperation: () => self.continueOperation(),
      startDeployment: (cfg) => self.startDeployment(cfg),
      preview: { setMode: (m) => { if (m === 'loadout') self.onMenuOpen('loadout'); }, setWeapon: (id) => self.menuScene?.setWeapon(id), setNeon: (c, a) => self.menuScene?.setNeon(c, a), rotate: (d) => self.menuScene?.rotate(d) },
      resume: () => self.resume(), devMenu: () => { self.resume(); self.dev.toggle(true); }, restartCheckpoint: () => self.restartFromCheckpoint(), abortToOrbit: () => self.abortToOrbit(), quit: () => { try { window.close(); } catch { /* ignore */ } self.abortToOrbit(); },
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
    net.on(MSG.START, (m) => { if (!net.isHost) {this.transport.begun=false;this.startDeployment({ difficulty: m.settings.difficulty, dropZone: 'main', map: m.settings.map, loadout: save.profile.loadout, seed: m.seed });} });
    net.on(MSG.RETURN,()=>{if(!net.isHost)this.abortToOrbit(true);});
    events.on('mp:disconnected', () => { if(this._deploymentBusy){this._deploymentCancelled=true;this.transport?._loadReject?.(new Error('Host disconnected'));this.hideLoading();this.abortToOrbit(true);return;}if(this.session){this.teardownSession();this.mode='menu';input.setGameplay(false);this.showMainMenu();this.menus.toast('CONNECTION TO HOST LOST — RETURNED TO ORBIT','warn');} });
  }
  /** Host: launch the mission for the whole lobby (called from the loadout DEPLOY when all are ready). */
  hostStartMission() {
    const t = this.transport; if (!t || !net.isHost || t.phase==='loading'||t.phase==='mission') return;
    const notReady = t.players.filter(p => p.connected && !p.ready);
    if (notReady.length) { this.menus.toast(`WAITING FOR: ${notReady.map(p => p.name).join(', ')}`, 'warn'); return; }
    const seed = (Math.random() * 1e9) | 0;
    t.setPhase('loading');
    net.send(MSG.START, { seed, settings: t.settings, players: t.players }, { reliable: true });
    this.startDeployment({ difficulty: t.settings.difficulty, dropZone: t.settings.dropZone, map: t.settings.map, loadout: save.profile.loadout, seed });
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
    this.dropPod = null; this.intro = null;
    this.teardownSession();
    const map = MAPS[config.map] || MAPS[DEFAULT_MAP]; config.map = map.id;
    this.world = new World(map);
    // Every peer builds the same cover, rocks and collider layout from the seed.
    const originalRandom=Math.random;let levelSeed=(config.seed||7)>>>0;
    Math.random=()=>{levelSeed=(levelSeed*1664525+1013904223)>>>0;return levelSeed/4294967296;};
    let lv;try{lv=buildLevel(this.world);}finally{Math.random=originalRandom;}
    this.menus.setMapImage?.(map.mapImage);
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
    s.player = new Player(this, this.camera, s.fx, config.loadout); s.player.color = SQUAD_COLORS[net.slot] || SQUAD_COLORS[0]; s.player.name = settings.data.playerName; this.world.entities.delete(s.player.id); s.player.id = net.localId;
    this.world.entities.set(s.player.id, s.player);
    s.players = [s.player];
    s.mission = new (map.Mission || Mission)(this);
    s.director.rng = (() => { let x = (config.seed || 7) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })();
    s.netsync = net.transport ? new NetSync(this) : null;
    if(s.netsync)for(const member of net.transport.players)if(member.connected&&member.id!==net.localId)s.netsync.ensureRemote(member.id,{});
    s.hud = new Hud(this.ui, map); s.hud.setLives(s.mission.lives, s.mission.lives); s.hud.show(false);
    this.dev?.onSession();
    s.hints = new Hints(this.ui, this);
    s.qte = new QTE(this, this.ui);
    if (this.world) this.world.game = this;
    this.renderer.setScene(this.world.scene, this.camera); this.renderMenuScene = false; this.setBackground(null);
    this.time = 0;
    return s;
  }
  teardownSession() {
    if (!this.session) return;
    const s = this.session;
    s.qte?.cancel(); s.qte?.el?.remove(); s.qte?.css?.remove(); s.netsync?.dispose(); s.mission?.dispose(); s.hud?.dispose(); s.hints?.dispose(); s.fx?.clear?.(); s.director?.clear?.(); s.abilities?.clear?.(); s.projectiles?.clear?.();
    this.session = null; this.world = null;
    audio.stopVoice(); audio.setMuffle(0);
  }
  dropPositionFor(config) {
    const zones = this.world.map?.dropZones || DROP_ZONES; const dz = zones[config.dropZone] || Object.values(zones)[0];
    const p = M(dz.mapX, dz.mapY, 0); const slot = net.slot || 0; p.x += (slot === 1 ? -3.5 : slot === 2 ? 3.5 : 0); p.z += slot ? 2.5 : 0; const w = this.world.nav.nearestWalkable(p.x, p.z, 20) || p; p.set(w.x, 0, w.z); p.y = this.world.groundHeight(p.x, p.z); return p;
  }
  async startDeployment(config) {
    if (this._deploymentBusy) return;
    input.requestLock(); // Keep the Deploy gesture valid before asynchronous loading.
    this._deploymentBusy = true; this._deploymentCancelled = false;
    try { await this.prepareDeployment(config); }
    catch (error) { this.loadingFailed(error); }
    finally { this._deploymentBusy = false; }
  }
  loadingFailed(error) {
    console.error('[deployment] failed', error);
    this.hideLoading();this.abortToOrbit();
    this.menus.toast('DEPLOYMENT COULD NOT LOAD. PLEASE RETRY.', 'warn');
  }
  async prepareDeployment(config) {
    config.dropZone = 'main';
    config.map = config.map || save.profile.loadout.map || DEFAULT_MAP;
    this.lastConfig = config;
    save.setLoadout({ ...config.loadout, difficulty: config.difficulty, dropZone: config.dropZone, map: config.map || save.profile.loadout.map || DEFAULT_MAP });
    this.menus.hide(); this.setBackground('title_moon'); // same backdrop as the title card: the menu dissolves into the loading screen
    this.mode = 'loading';
    await this.showLoading('PREPARING DEPLOYMENT');
    await preloadCustomModels();
    if(this._deploymentCancelled)throw new Error('Deployment cancelled');
    this.setLoadProgress(0.08, 'BUILDING BATTLESPACE'); await new Promise((r) => setTimeout(r, 0));
    this.buildSession(config);
    this.session.player.spawnAt(this.dropPositionFor(config));
    this.session.mission.prepare();
    this.setLoadProgress(0.45, 'COMPILING MATERIALS'); await new Promise((r) => setTimeout(r, 0));
    const preparingSession=this.session;
    await this.prewarm();
    if(this._deploymentCancelled||this.session!==preparingSession)throw new Error('Deployment cancelled');
    if(this.transport?.connected){this.setLoadProgress(.98,'WAITING FOR SQUAD TO LOAD');await this.transport.waitForSquad();}
    this.setLoadProgress(1, 'DROP POD ARMED'); await new Promise((r) => setTimeout(r, 60));
    audio.say('ship_deploy', { priority: 3 });
    audio.say(this.world.map?.briefingLine || 'voss_briefing', { priority: 3, delay: 2 });
    const target = this.dropPositionFor(config);
    const intro=this.introFlyover(target, () => this.dropSequence(target, () => { this.session.mission.start(); }));
    this.updateIntro(0); this.world.update(0,this.camera); this.renderer.render(0);
    this.hideLoading(); await intro;
  }
  async continueOperation() {
    if (this._deploymentBusy) return;
    input.requestLock();
    this._deploymentBusy = true; this._deploymentCancelled = false;
    try { await this.prepareContinuedOperation(); }
    catch (error) { this.loadingFailed(error); }
    finally { this._deploymentBusy = false; }
  }
  async prepareContinuedOperation() {
    const cp = save.profile.operationInProgress; if (!cp) return;
    const config = { difficulty: cp.difficulty || save.profile.loadout.difficulty, dropZone: save.profile.loadout.dropZone, map: cp.map || save.profile.loadout.map, loadout: cp.loadout || save.profile.loadout };
    this.lastConfig = config;
    this.menus.hide(); this.setBackground('title_moon'); this.mode = 'loading';
    await this.showLoading('RESTORING OPERATION');
    await preloadCustomModels();
    this.buildSession(config);
    const p = cp.position ? new THREE.Vector3(...cp.position) : this.dropPositionFor(config);
    p.y = this.world.groundHeight(p.x, p.z);
    this.session.player.spawnAt(p);this.session.mission.prepare();await this.prewarm();
    this.dropSequence(p, () => { this.session.mission.active=true;this.session.mission.restore(cp); this.session.hud.setLives(this.session.mission.lives, this.session.difficulty.lives); audio.say('ship_welcome', { priority: 2 }); });
    this.updateDrop(0);this.renderer.render(0);this.hideLoading();
  }
  /** Loading screen in the title-card language: dark moon key art, kicker, the HOSTILE ORBIT title block, a status line
   *  that ticks through deployment steps and a progress bar. Shared by PREPARING DEPLOYMENT and RESTORING OPERATION. */
  showLoading(text) {
    return new Promise((res) => {
      let el = document.getElementById('loading');
      const base = import.meta.env.BASE_URL || '/';
      if (!el) {
        el = document.createElement('div'); el.id = 'loading';
        el.innerHTML = `<div class="bg" style="background-image:url('${base}textures/menus/title_moon.jpg')"></div><div class="haze"></div><div class="scan"></div>
          <div class="wrap"><div class="kicker">MERIDIAN COMMONWEALTH // ORBITAL ASSAULT DIVISION</div>
            <div class="main-title-wrap"><div class="main-title"><div>HOSTILE</div><div>ORBIT</div></div><div class="main-device"><span class="wing left"></span><span class="emblem">${icon('chevronBig')}</span><span class="wing right"></span></div></div>
            <div class="rule"></div>
            <div class="ltxt"></div><div class="lstep"></div><div class="lbar"><i></i></div></div>
          <div class="corner tl"></div><div class="corner br"></div><div class="tip"></div>`;
        this.ui.appendChild(el);
        const css = document.createElement('style'); css.textContent = `
          #loading{position:fixed;inset:0;z-index:1000;background:#050a12;overflow:hidden;font-family:var(--font);display:none;opacity:0;transition:opacity .5s ease}
          #loading.vis{opacity:1}
          #loading .bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.45}
          #loading .haze{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 55%,rgba(0,0,0,.78),rgba(0,0,0,.2) 55%,rgba(0,0,0,.65))}
          #loading .scan{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px);pointer-events:none}
          #loading .wrap{position:absolute;left:8vw;top:50%;transform:translateY(-52%)}
          #loading .kicker{font-size:11px;letter-spacing:.42em;color:var(--cyan,#5be3ff)}
          #loading .main-title-wrap{align-items:flex-start;text-align:left;margin-top:10px}
          #loading .main-title{font-size:min(9vw,104px)!important;text-align:left!important}
          #loading .main-device{margin-top:8px}
          #loading .rule{width:min(38vw,460px);height:2px;margin:18px 0 20px;background:linear-gradient(90deg,var(--yellow,#f2c744),transparent)}
          #loading .ltxt{font-size:14px;letter-spacing:.42em;color:#fff;text-transform:uppercase}
          #loading .lstep{font-family:var(--mono);font-size:11px;letter-spacing:.22em;color:rgba(91,227,255,.8);margin-top:8px;height:14px}
          #loading .lbar{width:min(38vw,460px);height:3px;background:rgba(0,229,255,.15);margin-top:14px;overflow:hidden;position:relative}
          #loading .lbar i{display:block;height:100%;width:38%;background:var(--cyan,#00e5ff);box-shadow:0 0 12px var(--cyan,#00e5ff);animation:lslide 1.1s ease-in-out infinite alternate}
          #loading .corner{position:absolute;width:38px;height:38px;border:1px solid rgba(91,227,255,.45)}
          #loading .corner.tl{left:24px;top:24px;border-right:0;border-bottom:0} #loading .corner.br{right:24px;bottom:24px;border-left:0;border-top:0}
          #loading .tip{position:absolute;right:32px;bottom:34px;max-width:38vw;text-align:right;font-size:11px;letter-spacing:.2em;line-height:1.7;color:rgba(232,244,248,.72)}
          @keyframes loadZoom{from{transform:scale(1.06)}to{transform:scale(1)}}
          @keyframes lslide{from{margin-left:0}to{margin-left:62%}}`;
        document.head.appendChild(css);
      }
      el.style.display = 'block'; el.classList.add('vis');el.style.transition='none';el.querySelector('.ltxt').textContent = text;this.setLoadProgress(0,'PREPARING ASSETS');
      const TIPS = ['Hold SPACE to jet. Fuel returns on the ground.', 'Sprint into Legion troopers to ram them. Momentum is a weapon.', 'F to snap to cover. R rolls out of it.', 'M opens the tactical map. Pins are live.', 'Reinforcements are finite. Extraction is not guaranteed.', 'Charge points around the jammer must be held, not touched.', 'Orbital abilities are on cooldown from the moment you land. Plan.', 'Your sacrifice has been pre-approved.'];
      const fv = FRAME_VARIANTS[save.profile.loadout.neon] || FRAME_VARIANTS['#00e5ff']; el.querySelector('.tip').textContent = `FRAME  ${fv.name}  //  ${fv.role}  —  ${fv.blurb}   ·   ` + TIPS[Math.floor(Math.random() * TIPS.length)];
      const steps = text.startsWith('RESTORING') ? ['REACQUIRING TELEMETRY', 'REBUILDING BATTLESPACE', 'RESTORING SQUAD STATE', 'ARMING REINFORCEMENT POD'] : ['AUTHENTICATING DEPLOYMENT ORDER', 'BUILDING BATTLESPACE', 'COMPILING MATERIALS', 'WARMING RECON FEED', 'ARMING DROP POD'];
      const stepEl = el.querySelector('.lstep'); let k = 0; stepEl.textContent = steps[0];
      clearInterval(this._loadStepTimer); this._loadStepTimer = setInterval(() => { k = Math.min(steps.length - 1, k + 1); stepEl.textContent = steps[k]; }, 650);
      setTimeout(res, 120); // never wait on rAF: hidden tabs do not get frames
    });
  }
  setLoadProgress(frac, label) { const el = document.getElementById('loading'); if (!el) return; const bar = el.querySelector('.lbar i'); if (bar) { bar.style.animation = 'none'; bar.style.marginLeft = '0'; bar.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; } if (label) { clearInterval(this._loadStepTimer); const st = el.querySelector('.lstep'); if (st) st.textContent = label; } }
  hideLoading() {
    clearInterval(this._loadStepTimer); const el = document.getElementById('loading'); if (el) { el.style.transition='opacity .5s ease';el.classList.remove('vis'); setTimeout(() => { if (!el.classList.contains('vis')) el.style.display = 'none'; }, 520); }
    this.setBackground(null); }
  /** Cinematic pod drop that ends with the player standing at `target`. */
  /** Warm-up on the loading screen: render the level from every flyover stop so shaders compile and textures upload
   *  before the camera moves. Costs a second or two of loading, saves the hitches during the cinematic. */
  async prewarm() {
    const W=this.world;if(!W)return;
    const began=performance.now(),R=this.renderer,L=W.map.locations,p=this.session.player;
    const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
    this.setLoadProgress(.46,'STAGING LANDING ENCOUNTERS');await yieldFrame();
    const D=this.session.director;
    for(const g of D.garrisons){
      if(g.spawned||p.position.distanceTo(g.center)>g.radius+18)continue;
      g.spawned=true;
      for(const t of g.templates){D.spawnSquad(t.template||t,g.center,{route:t.route,state:t.route?'patrol':'idle',alert:!!g.alert,target:g.alert?p:null});await yieldFrame();}
    }
    const {WEAPON_BUILDERS}=await import('./models/weapons.js');
    const {buildSoldier}=await import('./models/soldier.js');
    const stage=new THREE.Group();stage.position.copy(p.position);W.scene.add(stage);
    const models=[];let k=0;
    for(const id in WEAPON_BUILDERS){const m=WEAPON_BUILDERS[id]();m.position.set((k++%6)*1.1-3,1.2,2);stage.add(m);await yieldFrame();}
    for(const kind of ['rifleman','breacher','suppressor','grenadier']){const m=buildSoldier(kind==='suppressor'?'legionHeavy':'legion',{legion:kind,custom:null});m.root.position.set((k++%6)*1.2-3,0,4);stage.add(m.root);models.push(m);await yieldFrame();}
    this._preparedPodModel=buildPodModel();this._preparedPodModel.position.set(0,0,7);stage.add(this._preparedPodModel);
    this.setLoadProgress(.57,'LOADING SURFACES AND EQUIPMENT');
    await waitForAssets(n=>this.setLoadProgress(.57,n?'LOADING '+n+' MATERIAL ASSETS':'UPLOADING MATERIALS'));
    this.setLoadProgress(.63,'DECODING MISSION AUDIO');await audio.preloadMission();
    const fx=this.session.fx,at=p.position.clone().add(new THREE.Vector3(0,1,2));
    fx.explosion(at,1,'pod');fx.dust(at,1);fx.muzzleFlash(at,new THREE.Vector3(0,0,1));fx.podTrail(at);
    fx.update(.016,this.camera);
    this.setLoadProgress(.68,'COMPILING WORLD AND CHARACTER SHADERS');await yieldFrame();
    W.scene.updateMatrixWorld(true);
    if(R.renderer.compileAsync)await R.renderer.compileAsync(W.scene,this.camera);else R.renderer.compile(W.scene,this.camera);
    // Render while the opaque loading card owns the screen. Keep warmed shared geometry alive.
    const views=[L.extractionCenter,L.commsPlaza,L.jammerCenter,L.canyonJunction,L.dropZone];
    for(let i=0;i<views.length;i++){
      const q=views[i].pos,gy=W.groundHeight(q.x,q.z);
      for(const [dx,dy,dz] of [[-12,40,15],[6,2,8],[-5,1.6,-6]]){this.camera.position.set(q.x+dx,gy+dy,q.z+dz);this.camera.lookAt(q.x,gy+1,q.z);W.update(.016,this.camera);R.render(.016);await yieldFrame();}
      this.setLoadProgress(.72+i*.04,'WARMING SECTOR '+(i+1)+' / '+views.length);
    }
    this.camera.position.copy(p.position).add(new THREE.Vector3(0,3,-5));this.camera.lookAt(at);R.render(.016);await yieldFrame();
    stage.remove(this._preparedPodModel);W.scene.remove(stage);
    // Source geometries/materials are cached and shared by live characters; disposing
    // the staging hierarchy would invalidate their GPU buffers immediately before landing.
    fx.clear();this.renderer.fx.flash=0;
    await waitForAssets();
    this.loadingMetrics={milliseconds:Math.round(performance.now()-began),enemies:D.enemies.length,programs:R.renderer.info.programs.length,ready:true};
    console.info('[deployment] Ready before cinematic',this.loadingMetrics);
    this.setLoadProgress(.98,'LANDING ENCOUNTER READY');
  }
  /** Recon flyover: a letterboxed cinematic sweep over the objectives with telemetry, holographic markers and the
   *  briefing, ending in a 5-to-1 drop countdown over the pad. Doubles as the warm-up pass: every material is rendered
   *  from several angles before play, so the first seconds do not stutter on shader compiles. */
  introFlyover(target, launchPod) {
    const s = this.session; if (!s || !this.world) { launchPod?.(); return Promise.resolve(); }
    const L = this.world.map.locations; const W = this.world; const mk = this.world.map.markers || [];
    const stops = [
      { loc: L.extractionCenter, label: 'EXTRACTION PLATFORM', sub: 'Dropship recovery point. Hold it when the time comes.', h: 52 },
      { loc: L.commsPlaza, label: mk[1]?.label || 'COMMUNICATIONS BASE', sub: mk[1]?.desc || '', h: 48 },
      { loc: L.jammerCenter, label: mk[0]?.label || 'JAMMER OUTPOST', sub: mk[0]?.desc || '', h: 46 },
      { loc: L.canyonJunction, label: 'APPROACH ROUTES', sub: 'High route, main route, trench. Pick your poison.', h: 34 },
      { loc: { pos: target || L.dropZone.pos }, label: 'DROP ZONE', sub: 'Pod inbound. Brace.', h: 26 },
    ];
    const pts = stops.map((st, i) => { const p = st.loc.pos.clone(); p.y = W.groundHeight(p.x, p.z) + st.h; if (i === stops.length - 1) { p.x += 9; p.z += 12; } return p; });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    try { this.renderer.renderer.compile(W.scene, this.camera); } catch { /* ignore */ }
    const el = document.createElement('div'); el.id = 'intro';
    el.innerHTML = `<div class="bar top"></div><div class="bar bottom"></div>
      <div class="feed"><span class="rec"></span>RECON FEED // ${this.world.map.opName || 'OPERATION'}</div>
      <div class="tele"><div>ALT <b class="alt">0000</b> M</div><div>GRID <b class="grid">000.000</b></div><div>SIG <b class="sig">--</b></div></div>
      <div class="capwrap"><div class="cap"></div><div class="sub"></div></div>
      <div class="count"><div class="cl">DEPLOYMENT IN</div><div class="cn"></div></div>
      <div class="skip">PRESS SPACE TO SKIP</div>`;
    if (!document.getElementById('intro-css')) { const css = document.createElement('style'); css.id = 'intro-css'; css.textContent = `
      #intro{position:absolute;inset:0;pointer-events:none;font-family:var(--font)}
      #intro .bar{position:absolute;left:0;right:0;height:11vh;background:#000;transform:scaleY(0);transform-origin:top;animation:introBar .7s ease-out forwards}
      #intro .bar.top{top:0} #intro .bar.bottom{bottom:0;transform-origin:bottom}
      #intro .feed{position:absolute;left:32px;top:12.5vh;font-size:12px;letter-spacing:.3em;color:var(--cyan,#5be3ff);display:flex;align-items:center;gap:10px}
      #intro .rec{width:10px;height:10px;border-radius:50%;background:#ff3b1f;box-shadow:0 0 10px #ff3b1f;animation:introRec 1s steps(2) infinite}
      #intro .tele{position:absolute;right:32px;top:12.5vh;font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:rgba(91,227,255,.8);text-align:right;line-height:1.7}
      #intro .tele b{color:#fff;font-weight:600}
      #intro .capwrap{position:absolute;left:50%;bottom:21vh;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .35s}
      #intro .capwrap.on{opacity:1}
      #intro .cap{font-family:var(--font-title);font-size:28px;letter-spacing:.16em;color:#fff;text-shadow:0 0 22px rgba(0,229,255,.6)}
      #intro .sub{margin-top:6px;font-size:12px;letter-spacing:.18em;color:rgba(232,244,248,.8)}
      #intro .count{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;display:none}
      #intro .count.on{display:block}
      #intro .cl{font-size:12px;letter-spacing:.5em;color:var(--yellow,#f2c744)}
      #intro .cn{font-family:var(--font-title);font-weight:900;font-size:min(22vw,180px);line-height:1;color:#fff;text-shadow:0 0 40px rgba(242,199,68,.55),0 0 90px rgba(0,229,255,.35)}
      #intro .cn.pop{animation:introPop .95s cubic-bezier(.1,.9,.2,1) forwards}
      #intro .skip{position:absolute;right:32px;bottom:12.5vh;font-size:11px;letter-spacing:.3em;color:rgba(255,255,255,.55)}
      @keyframes introRec{to{opacity:.2}}
      @keyframes introBar{to{transform:scaleY(1)}}
      @keyframes introPop{0%{transform:scale(1.7);opacity:0}16%{transform:scale(1);opacity:1}100%{transform:scale(.9);opacity:.9}}`; document.head.appendChild(css); }
    this.ui.appendChild(el);
    s.hud.show(false); this.menus.hide();
    this.mode = 'intro';
    audio.setMusicState('deploy');
    const markers = [];
    return new Promise((resolve) => {
      this.intro = { t: 0, dur: 15, countFrom: 5, launchPod, podStarted: false, target, smoothPos: null, curve, stops, el, cap: el.querySelector('.capwrap'), capT: el.querySelector('.cap'), subT: el.querySelector('.sub'), count: el.querySelector('.count'), cn: el.querySelector('.cn'), alt: el.querySelector('.alt'), grid: el.querySelector('.grid'), sig: el.querySelector('.sig'), lastStop: -1, lastCount: -1, markers, teleT: 0,
        resolve: () => { for (const m of markers) m.remove?.(); el.remove(); const I = this.intro; this.intro = null; this.camera.fov = settings.data.fov; this.camera.rotation.z = 0; this.camera.updateProjectionMatrix(); if (I && !I.podStarted) { I.podStarted = true; I.launchPod?.(); } resolve(); } };
      const skip = (e) => { if ((e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Escape') || !this.intro) return; window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); const I = this.intro; if (I.t < I.dur - I.countFrom - 0.3) { I.t = I.dur - I.countFrom - 0.3; I.smoothPos = null; I.smoothLook = null; } }; // skipping jumps to the pad hold; the pod still lands on the count
      window.addEventListener('keydown', skip); window.addEventListener('pointerdown', skip);
    });
  }
  updateIntro(dt) {
    const I = this.intro; if (!I) return;
    I.t += dt; const u = Math.min(1, I.t / I.dur); const e = u * u * (3 - 2 * u);
    const remain = I.dur - I.t;
    // the pod launches when the countdown starts, so impact lands on zero
    if (!I.podStarted && remain <= I.countFrom + 0.2) { I.podStarted = true; I.launchPod?.(); }
    // drone-shot camera: the path point is a target the camera is damped toward, so frame hitches never become jumps
    const pos = I.curve.getPointAt(e); const ahead = I.curve.getPointAt(Math.min(1, e + 0.045)); const behind = I.curve.getPointAt(Math.max(0, e - 0.02));
    const dir = ahead.clone().sub(behind).setY(0).normalize(); const prev = I.prevDir || dir.clone(); const turn = prev.x * dir.z - prev.z * dir.x; I.prevDir = dir; const rollTarget = THREE.MathUtils.clamp(turn / Math.max(dt, 1e-3) * 0.35, -0.22, 0.22); I.roll = THREE.MathUtils.lerp(I.roll || 0, rollTarget, 1 - Math.exp(-dt * 2.5));
    const drift = new THREE.Vector3(Math.sin(I.t * 0.5) * 0.4, Math.sin(I.t * 0.7) * 0.25, Math.cos(I.t * 0.4) * 0.4);
    if (!I.smoothPos) I.smoothPos = pos.clone();
    const kPos = 1 - Math.exp(-dt * 3.5); I.smoothPos.lerp(pos.clone().add(drift), kPos);
    this.camera.position.copy(I.smoothPos);
    let look = ahead.clone(); look.y -= 28 - u * 8;
    if (I.podStarted && I.target) { look = I.target.clone(); look.y += 1.5; const pod = this.dropPod; if (pod && !pod.landed && pod.t > 0) { const agl = pod.position.y - I.target.y; look.lerp(pod.position, 0.4 * THREE.MathUtils.clamp(1 - agl / 45, 0, 1)); } } // frame the pod only once it is close; never tilt up into the sky
    if (!I.smoothLook) I.smoothLook = look.clone(); I.smoothLook.lerp(look, 1 - Math.exp(-dt * 4));
    { const dx = this.camera.position.x - I.smoothLook.x, dz = this.camera.position.z - I.smoothLook.z; const hd = Math.hypot(dx, dz); if (hd < 6) { const k = hd < 0.01 ? 0 : 6 / hd; this.camera.position.x = I.smoothLook.x + (hd < 0.01 ? 6 : dx * k); this.camera.position.z = I.smoothLook.z + dz * k; } }
    this.camera.up.set(0, 1, 0); this.camera.lookAt(I.smoothLook); this.camera.rotateZ(-I.roll); this.camera.userData.focus = I.smoothLook;
    this.camera.fov = 78 - u * 12; this.camera.updateProjectionMatrix();
    // telemetry
    I.teleT -= dt; if (I.teleT <= 0) { I.teleT = 0.1; const alt = Math.max(0, this.camera.position.y - this.world.groundHeight(this.camera.position.x, this.camera.position.z)); I.alt.textContent = String(Math.round(alt * 10)).padStart(4, '0'); I.grid.textContent = `${(this.camera.position.x + 200).toFixed(1)}.${(200 - this.camera.position.z).toFixed(0)}`; I.sig.textContent = u > 0.55 ? 'JAMMED' : `${Math.round(60 + Math.random() * 30)}%`; I.sig.style.color = u > 0.55 ? '#ff5a1f' : ''; }
    // captions + holographic markers at each stop
    const idx = Math.min(I.stops.length - 1, Math.floor(e * I.stops.length));
    if (idx !== I.lastStop) { I.lastStop = idx; const st = I.stops[idx]; I.capT.textContent = st.label; I.subT.textContent = st.sub || ''; I.cap.classList.add('on'); audio.play('objective_new', { volume: 0.45 }); const mp = st.loc.pos.clone(); mp.y = this.world.groundHeight(mp.x, mp.z) + 2; const m = this.fx?.marker?.(mp, idx === I.stops.length - 1 ? '#f2c744' : '#00e5ff'); if (m) I.markers.push(m); }
    // countdown to impact over the pad
    const n = Math.ceil(remain);
    if (remain <= I.countFrom + 0.999 && n >= 1 && n <= I.countFrom) { I.count.classList.add('on'); I.cap.classList.remove('on'); if (n !== I.lastCount) { I.lastCount = n; I.cn.textContent = String(n); I.cn.classList.remove('pop'); void I.cn.offsetWidth; I.cn.classList.add('pop'); audio.play('countdown_tick', { volume: 0.9, pitch: 1 + (I.countFrom - n) * 0.06 }); events.emit('fx:shake', 0.12); } }
    // Mission actors are already staged; AI remains frozen until deployment completes.
    if (u >= 1 && (!this.dropPod || this.dropPod.landed)) { I.resolve(); } // hold the recon view until the pod is down: no cut to a pod close-up
  }
  dropSequence(target, onDone) {
    const s = this.session; const p = s.player;
    this.mode = 'drop';
    p.model.root.visible = false; p.spawnAt(target, Math.PI * 0 + (target.z > 0 ? 0 : Math.PI));
    const overlay = null; // the recon flyover carries the countdown; no separate black screen
    audio.setMusicState('deploy'); audio.playStinger('stinger_drop', 0.9);
    audio.setAmbience({ ambience_wind: 0.2 });
    const pod = new DropPod(this, target, { model:this._preparedPodModel, kind: 'player', owner: p.id, duration: 4.2, delay: 0.8, onLand: () => { this.renderer.whiteFlash(0.6); }, onOpen: () => { p.model.root.visible = true; p.respawn(target, p.yaw); p.position.copy(target).add(new THREE.Vector3(Math.sin(p.yaw) * -3.4, 0, Math.cos(p.yaw) * -3.4)); p.position.y = this.world.groundHeight(p.position.x, p.position.z); overlay?.remove(); this.beginPlay(); onDone?.(); } });
    this._preparedPodModel=null;
    this.dropPod = pod; this.dropT = 0; this.dropOverlay = overlay;
    s.hud.show(false);
  }
  updateDrop(dt) {
    const pod = this.dropPod; if (!pod) return;
    this.dropT += dt;
    pod.update(dt);
    if (this.intro) { this.updateIntro(dt); return; } // flyover still framing the pad
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
  /** Online squad board: callsign, frame colour, kills and deaths for everyone in the session. */
  _squadBoard() {
    const peers = net.transport?.peerCount || 0; let el = this._boardEl;
    if (!peers) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = this._boardEl = document.createElement('div'); el.id = 'squadboard'; this.ui.appendChild(el); const css = document.createElement('style'); css.textContent = `#squadboard{position:absolute;right:22px;top:88px;min-width:220px;font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:#e8f4f8;background:rgba(3,10,14,.55);border:1px solid rgba(0,229,255,.25);padding:8px 10px;pointer-events:none;z-index:4}#squadboard .t{font-family:var(--font);font-size:10px;letter-spacing:.3em;color:#5be3ff;margin-bottom:6px}#squadboard .r{display:grid;grid-template-columns:10px 1fr 34px 34px;gap:8px;align-items:center;padding:2px 0}#squadboard .d{width:8px;height:8px;border-radius:50%}#squadboard .h{color:rgba(232,244,248,.5)}#squadboard .me{color:#fff}`; document.head.appendChild(css); }
    this._boardT = (this._boardT || 0) - 1; if (this._boardT > 0) return; this._boardT = 30;
    const rows = []; const roster = net.transport?.players || [];
    for (const pl of roster) { const isMe = pl.id === net.localId; const rp = this.session?.netsync?.remotes?.get?.(pl.id); const k = isMe ? (this.session?.combat?.stats.kills || 0) : (rp?.kills || 0); const d = isMe ? (this.session?.combat?.stats.deaths || 0) : (rp?.deaths || 0); const col = SQUAD_COLORS[pl.slot] || '#888'; rows.push({ n: pl.name || 'VANGUARD', k, d, col, isMe }); }
    rows.sort((a, b) => b.k - a.k);
    el.style.display = 'block'; el.innerHTML = `<div class="t">SQUAD</div><div class="r h"><span></span><span>CALLSIGN</span><span>K</span><span>D</span></div>` + rows.map((r) => `<div class="r ${r.isMe ? 'me' : ''}"><span class="d" style="background:${r.col};box-shadow:0 0 8px ${r.col}"></span><span>${r.n}</span><span>${r.k}</span><span>${r.d}</span></div>`).join('');
  }
  _lazyReticle(dt) {
    const p = this.session?.player; if (!p) return; let el = this._lazyEl;
    if (!el) { el = this._lazyEl = document.createElement('div'); el.id = 'lazyret'; el.innerHTML = '<i></i>'; this.ui.appendChild(el); const css = document.createElement('style'); css.textContent = `#lazyret{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:6}#lazyret i{position:absolute;left:-13px;top:-13px;width:26px;height:26px;border:1.5px solid var(--xc,#00e5ff);border-radius:50%;opacity:.7;box-shadow:0 0 6px rgba(0,229,255,.5)}#lazyret.h i{border-color:#ffb347}`; document.head.appendChild(css); }
    const kind = p.weapon?.def?.kind; const weight = { smg: 0.35, pistol: 0.3, rifle: 0.6, shotgun: 0.9, lmg: 1.4, sniper: 1.1, launcher: 1.7, arc: 0.5 }[kind] || 0.6;
    const yaw = p.cam.yaw, pitch = p.cam.pitch; const dy = Math.atan2(Math.sin(yaw - (this._lrY ?? yaw)), Math.cos(yaw - (this._lrY ?? yaw))), dp = pitch - (this._lrP ?? pitch); this._lrY = yaw; this._lrP = pitch;
    const sx = (dy / Math.max(dt, 1e-3)) * 48 * weight, sy = (dp / Math.max(dt, 1e-3)) * 48 * weight;
    this._lrX = damp(this._lrX || 0, Math.max(-140, Math.min(140, -sx)), 5 / weight, dt); this._lrYo = damp(this._lrYo || 0, Math.max(-100, Math.min(100, sy)), 5 / weight, dt);
    const show = this.mode === 'play' && !p.dead && !(p.model?.sprintBall) && !this.paused;
    el.style.display = show ? 'block' : 'none'; el.style.transform = `translate(${this._lrX.toFixed(1)}px, ${this._lrYo.toFixed(1)}px)`; el.classList.toggle('h', weight >= 1.1);
  }
  _speedLines(k) {
    let el = this._speedEl; if (!el) { el = this._speedEl = document.createElement('div'); el.id = 'speedlines'; el.innerHTML = '<div class="sl"></div>'; this.ui.appendChild(el); const css = document.createElement('style'); css.textContent = `#speedlines{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .12s;z-index:5}#speedlines .sl{position:absolute;inset:-20%;background:repeating-conic-gradient(from 0deg at 50% 52%,rgba(255,255,255,0) 0deg 5deg,rgba(200,240,255,.28) 5.6deg 6.2deg,rgba(255,255,255,0) 7deg 12deg);-webkit-mask:radial-gradient(ellipse at 50% 52%,transparent 34%,#000 78%);mask:radial-gradient(ellipse at 50% 52%,transparent 34%,#000 78%);animation:slspin .9s linear infinite}@keyframes slspin{to{transform:rotate(12deg)}}`; document.head.appendChild(css); }
    el.style.opacity = (k * 0.85).toFixed(2);
  }
  /** Systems-online transition: a short frame boot overlay that covers the first frames after landing. */
  bootOverlay(ms = 1400) {
    let el = document.getElementById('bootfx'); if (!el) { el = document.createElement('div'); el.id = 'bootfx'; el.innerHTML = '<div class="scan"></div><div class="txt"><div class="l1">FRAME SYSTEMS</div><div class="l2">ONLINE</div><div class="l3"></div></div>'; this.ui.appendChild(el); const css = document.createElement('style'); css.textContent = `#bootfx{position:absolute;inset:0;pointer-events:none;z-index:8;background:radial-gradient(ellipse at 50% 55%,rgba(0,229,255,.12),rgba(2,3,10,.92) 70%);opacity:1;transition:opacity .35s}#bootfx.off{opacity:0}#bootfx .scan{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(0,229,255,.08) 0 2px,transparent 2px 6px);animation:bootScan .9s linear infinite}#bootfx .txt{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;font-family:var(--font)}#bootfx .l1{font-size:12px;letter-spacing:.5em;color:var(--cyan,#5be3ff)}#bootfx .l2{font-family:var(--font-title);font-size:54px;color:#fff;letter-spacing:.2em;text-shadow:0 0 30px rgba(0,229,255,.6);animation:bootFlick .12s steps(2) infinite}#bootfx .l3{font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:rgba(232,244,248,.7);margin-top:10px}@keyframes bootScan{to{background-position:0 6px}}@keyframes bootFlick{to{opacity:.72}}`; document.head.appendChild(css); }
    el.classList.remove('off'); el.style.display = 'block'; const l3 = el.querySelector('.l3'); const lines = ['GYRO LOCK', 'WHEEL TORQUE NOMINAL', 'WEAPON HANDSHAKE', 'HUD LINK']; let i = 0; l3.textContent = lines[0]; clearInterval(this._bootIv); this._bootIv = setInterval(() => { i++; if (i < lines.length) l3.textContent = lines[i]; }, 260);
    setTimeout(() => { el.classList.add('off'); clearInterval(this._bootIv); setTimeout(() => { el.style.display = 'none'; }, 400); }, ms);
  }
  beginPlay() {
    this.mode = 'play'; this.paused = false; this.bootOverlay(1300);
    input.setGameplay(true);
    const p = this.session.player;
    p.cam.yaw = p.yaw; p.cam.pitch = -0.12;
    this.session.hud.show(true);
    this.dropPod = null;
    audio.setMuffle(0);
  }
  /** Death report: who got you, what this life was worth, and how long until the next frame drops. */
  showDeathReport(p, info = {}) {
    const s = this.session; if (!s) return;
    const st = this.combat?.stats || {}; const ls = p.lifeStart || { kills: 0, damage: 0, t: performance.now() };
    let killer = 'UNKNOWN HOSTILE', weapon = '';
    if (info.attackerId != null) { const e = s.director?.enemies?.find((x) => x.id === info.attackerId) || (s.director?.boss?.id === info.attackerId ? s.director.boss : null); if (e) { killer = e.type?.name || e.name || killer; const wd = e.weaponDef || (e.type?.weapon && WEAPONS[e.type.weapon]); weapon = wd?.name || ''; } }
    if (info.weapon === 'turret') { killer = 'SENTRY TURRET'; weapon = 'AUTOCANNON'; }
    if (info.explosion || info.blast) weapon = weapon || 'BLAST';
    const data = { killer, weapon, zone: info.zone || '', kills: (st.kills || 0) - ls.kills, damage: Math.round((st.damageDealt || 0) - ls.damage), survived: (performance.now() - ls.t) / 1000, streak: st.bestStreak || 0, lives: s.mission?.lives ?? 0, wait: 3.8 };
    this.deathReport?.remove?.(); this.deathReport = this.menus.showDeathReport(data);
  }
  /** Player death -> reinforcement pod. */
  launchPlayerPod(player, target) {
    if (!this.session) return;
    const s = this.session; const overlay = this.deathReport ? this.deathReport.toPod(['REPLACEMENT FRAME DISPATCHED', 'ATMOSPHERIC ENTRY', 'IMPACT IMMINENT']) : this.menus.showDropSequence(['WORKFORCE CONTINUITY SOLUTION', 'REPLACEMENT BODY DISPATCHED', 'ATMOSPHERIC ENTRY', 'IMPACT IMMINENT']);
    this.deathReport = null;
    this.mode = 'drop'; input.setGameplay(false);
    player.model.root.visible = false; player.position.copy(target);
    audio.playStinger('stinger_drop', 0.7);
    this.dropPod = new DropPod(this, target, { kind: 'player', owner: player.id, duration: 3.6, delay: 0.4, onOpen: () => { player.respawn(target.clone(), player.cam.yaw); player.position.add(new THREE.Vector3(Math.sin(player.cam.yaw) * -3.4, 0, Math.cos(player.cam.yaw) * -3.4)); player.position.y = this.world.groundHeight(player.position.x, player.position.z); overlay?.remove(); this.beginPlay(); events.emit('lives:changed', s.mission.lives); } });
    this.dropT = 0; this.dropOverlay = overlay;
    s.hud.show(false);
  }
  /** Dev: capture the next rendered frame to screenshot/auto/<name>.png via tools/shotserver.mjs. */
  snap(name = 'shot') { (this._snapQueue = this._snapQueue || []).push(name); return name; }
  _flushSnap() {
    if (!this._snapQueue?.length) return;
    const name = this._snapQueue.shift();
    try {
      // captures always render at 1280x720 (a hidden pane collapses the canvas to 0x0, and critics want consistent frames)
      const R = this.renderer; const W = 1280, H = 720;
      R.setSize(W, H);
      const cam = this.mode === 'showcase' || this.session ? this.camera : (this.menuScene?.camera || this.camera);
      const prevAspect = cam.aspect; cam.aspect = W / H; cam.updateProjectionMatrix();
      R.render(0);
      const data = this.canvas.toDataURL('image/png');
      cam.aspect = prevAspect; cam.updateProjectionMatrix(); R.resize();
      if (data.length < 64) console.warn('[snap] empty capture', this.canvas.width, this.canvas.height);
      fetch('http://127.0.0.1:5174/shot?name=' + encodeURIComponent(name), { method: 'POST', body: data }).then((r) => r.text()).then((t) => console.info('[snap]', t)).catch(() => {});
    } catch (e) { console.warn('[snap] failed', e); }
  }
  /** Live pins for the tactical map (map coords). */
  tacticalMapState(s) {
    const mp = (v) => { const m = worldToMap(v.x, v.z); return [m.mx, m.my]; };
    const p = s.player; const pm = worldToMap(p.position.x, p.position.z);
    const pins = [];
    const L = this.world.map.locations, lv = this.world.level, mission = s.mission;
    if (s.hud.objMarker?.pos) pins.push({ xy: mp(s.hud.objMarker.pos), kind: 'objective', color: s.hud.objMarker.color, label: s.hud.objMarker.label || 'OBJECTIVE' });
    for (const so of Object.values(mission.side || {})) (so.positions || []).forEach((sp, k) => pins.push({ xy: mp(sp), kind: 'side', label: k === 0 ? so.name : '' }));
    for (const it of mission.interactables.values()) if (it.marker && it.id.startsWith('pickup') && (!it.condition || it.condition(p))) pins.push({ xy: mp(it.position), kind: 'pickup', label: it.label.replace(/^TAKE /, '') });
    if (lv.extraction?.center) pins.push({ xy: mp(lv.extraction.center), kind: 'extract', label: 'EXTRACTION' });
    pins.push({ xy: mp(L.dropZone.pos), kind: 'drop', label: 'DROP ZONE' });
    const players = this.players || [];
    for (const e of (s.director?.enemies || [])) {
      if (e.dead) continue;
      if (e.type?.ally) { pins.push({ xy: mp(e.position), kind: 'ally' }); continue; }
      let near = e.alert > 0.2 || e.isBoss; if (!near) for (const pl of players) if (pl.position.distanceTo(e.position) < 70) { near = true; break; }
      if (near) pins.push({ xy: mp(e.position), kind: e.isBoss ? 'boss' : e.typeId === 'drone' ? 'drone' : 'enemy', label: e.isBoss ? 'WARDEN' : '' });
    }
    const mates = players.filter((pl) => pl !== p && !pl.dead).map((pl) => ({ xy: mp(pl.position), color: pl.color, name: pl.name }));
    return { player: { x: pm.mx, y: pm.my, yaw: p.cam.yaw }, mates, pins };
  }
  toggleTacticalMap(force) {
    if (this.mode !== 'play') return;
    this.mapOpen = force != null ? force : !this.mapOpen;
    input.wantLock = !this.mapOpen;
    if (this.mapOpen) { this.menus.setTacticalMapTitle(this.world?.map?.name || ''); input.releaseLock(); }
    else { this.menus.hideTacticalMap(); input.requestLock(); }
  }
  updateGameplayCursor() {
    this.cursorEl?.classList.toggle('hidden', ((this.mode === 'play' && !this.mapOpen && !this.dev?.open) || this.mode === 'drop' || input.locked));
  }
  // ---------------- pause / end ----------------
  onKey(code) {
    if (code === 'F10') { this.dev.set('god', !this.dev.state.god); this.menus?.toast(this.god ? 'GOD MODE ON' : 'GOD MODE OFF', 'warn'); }
    if (code === 'F9') this.dev.toggle();
    if (code === 'Escape') { if (this.dev?.open) this.dev.toggle(false); else if (this.mode === 'play' && this.mapOpen) this.toggleTacticalMap(false); else if (this.mode === 'play') this.pause(); else if (this.mode === 'pause') this.resume(); }
    if (code === (settings.data.binds.map || 'KeyM') && (this.mode === 'play')) this.toggleTacticalMap();
  }
  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause'; this.paused = true; input.setGameplay(false);
    audio.setMuffle(0.7);
    const m = this.session.mission;
    const roster = net.transport?.players || []; const squad = roster.map((pl) => { const isMe = pl.id === net.localId; const rp = this.session?.netsync?.remotes?.get?.(pl.id); return { name: pl.name || 'VANGUARD', color: pl.loadout?.neon || SQUAD_COLORS[pl.slot] || '#888', frame: (FRAME_VARIANTS[pl.loadout?.neon]?.name) || 'OUTRIDER', kills: isMe ? (this.combat?.stats.kills || 0) : (rp?.kills || 0), ready: true }; });
    this.menus.openPause({ objective: m.objectiveText, objectiveText: m.objectiveText, objectiveTitle: m.script?.opName || 'CURRENT OBJECTIVE', time: m.time, quest: m.currentQuest || null, side: m.side, squad, kills: this.combat?.stats.kills || 0, lives: m.lives, mapImage: (import.meta.env.BASE_URL || '/') + (this.world.map?.mapImage || 'textures/menus/map_clean.jpg') });
  }
  resume() {
    if (this.mode !== 'pause') return;
    this.menus.closePause(); this.menus.hide();
    this.mode = 'play'; this.paused = false; input.setGameplay(true);
    audio.setMuffle(0);
  }
  abortToOrbit(fromHost=false) {
    this._deploymentCancelled = true; this._resultTransition = null; this.renderer.fx.fade = 0;
    this.menus.closePause?.();
    this.transport?._loadReject?.(new Error('Deployment cancelled'));
    if(this.transport?.connected&&net.isHost&&!fromHost)net.send(MSG.RETURN,{});
    if(this.transport?.connected&&!net.isHost&&!fromHost&&this.transport.phase!=='results'&&this.transport.phase!=='lobby')this.transport.close();
    this.teardownSession();
    if (this.transport?.connected) { this.transport.setPhase('lobby'); this.mode = 'menu'; input.setGameplay(false); this.menus.show('multiplayer'); return; }
    this.mode = 'menu'; input.setGameplay(false);
    audio.setAmbience({ ambience_ship: 0.5 });
    this.showMainMenu();
  }
  async restartFromCheckpoint() {
    const cp = save.profile.operationInProgress;
    this.menus.closePause?.(); this.menus.hide();
    if (!cp) { const cfg = this.lastConfig || { difficulty: save.profile.loadout.difficulty, dropZone: save.profile.loadout.dropZone, map: save.profile.loadout.map, loadout: save.profile.loadout }; return this.startDeployment(cfg); }
    return this.continueOperation();
  }
  endMission(result) {
    this.menus.closePause?.();
    if (!result.rewardId) result.rewardId = (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join(''));
    if (net.isHost && net.transport?.peerCount) { net.send(MSG.EV_MISSION, { result: result.success ? 'complete' : 'failed', stats: result }, { reliable: true }); this.transport?.setPhase('results'); }
    if (!net.isHost && !save.profile.rewardReceipts?.[result.rewardId]) {
      save.recordMissionResult(this.mission?.script.id || result.map, result);
      save.addRecord(result.success ? { missionsCompleted: 1, coopMissions: 1 } : { missionsFailed: 1 });
      save.clearCheckpoint();
    }
    result = save.grantMissionRewards(result);
    this.lastResults = result;
    input.setGameplay(false); this.mode = 'results';
    this.session?.hud.show(false);
    this.menus.hideInteract?.();
    const succeeded = result.success;
    // keep the world rendering behind a fade, then switch to the results backdrop (timer-driven; the world is torn down at the end)
    this.renderer.fx.fade = 0;
    const t0 = performance.now();
    const transition = this._resultTransition = {};
    const step = () => {
      if(this._resultTransition !== transition)return;
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
    try { this.tick(); }
    catch (e) { const now = performance.now(); if (!this._lastErr || now - this._lastErr > 2000) { this._lastErr = now; console.error('[game] tick error', e); this.menus?.toast('SIMULATION FAULT LOGGED - CONTINUING', 'warn'); } }
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
    if (this.cursorEl) this.cursorEl.classList.toggle('hidden', (this.mode === 'play' && !this.mapOpen) || this.mode === 'drop' || (input.locked && this.mode === 'play'));
    const dt = (this._fixedDt != null ? this._fixedDt : Math.min(0.05, this.clock.getDelta())) * (this.dev?.state.timeScale ?? 1);
    if(this.mode==='loading'){input.endFrame();return;} // only prewarm owns rendering during loading
    if (this.fpsEl) { this._fpsAcc += dt; this._fpsN++; if (this._fpsAcc > 0.5) { this.fpsEl.textContent = `${Math.round(this._fpsN / this._fpsAcc)} FPS`; this._fpsAcc = 0; this._fpsN = 0; } }
    const s = this.session;
    if (s && this.world) {
      if (this.mode === 'play' || this.mode === 'pause' && net.isMultiplayer) {
        this.time += dt;
        s.player.update(dt); if(this.mode==='play')s.qte?.update(dt); this._speedLines(s.player.speedFx || 0); this._squadBoard(); this._lazyReticle(dt); updateBreakables(this.world, dt); updatePickups(this.world, dt, this.players);
        this.world.nav.update();
        if (!this.dev?.state.freezeEnemies) s.director.update(dt);
        s.projectiles.update(dt); s.abilities.update(dt); s.mission.update(dt); s.netsync?.update(dt);
        this.dev?.tick(s);
        s.hud.update(s.player, this, dt);
        this.updateGameplayCursor();
        this.renderer.fx.lowHealth = s.player.health < 30 && !s.player.dead ? 1 - s.player.health / 30 : 0;
        if (this.mapOpen) this.menus.showTacticalMap(this.tacticalMapState(s));
      } else if (this.mode === 'intro') {
        this._speedLines(0);
        this.updateIntro(dt);
      } else if (this.mode === 'drop') {
        this.time += dt; this.updateDrop(dt); if(s.mission.active)s.director.update(dt); s.projectiles.update(dt); s.mission.update(dt); s.abilities.update(dt); s.netsync?.update(dt);
      } else if (this.mode === 'pause' || this.mode === 'results') {
        // frozen world; still animate materials
      }
      s.fx.update(dt, this.camera);
      this.world.update(dt, this.camera);
      audio.updateListener(this.camera);
    } else if (this.mode === 'showcase' && this.showcaseUpdate) { this.showcaseUpdate(dt); this.renderer.render(dt); this._flushSnap(); input.endFrame(); return;
    } else if (this.renderMenuScene && this.menuScene) {
      this.menuScene.update(dt);
      audio.updateListener(this.menuScene.camera);
    }
    audio.update(dt);
    if (this.mode !== 'boot' && (s || this.renderMenuScene)) this.renderer.render(dt);
    this._flushSnap();
    input.endFrame();
  }
}
