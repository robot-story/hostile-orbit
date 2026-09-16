// Dev menu (F9, or DEV MENU on the pause screen): feature toggles and cheats for testing. State persists in
// localStorage so a setting survives reloads. Nothing here touches the network protocol; everything acts on
// the local (host) session, which is also what single player is.
import * as THREE from 'three';
import { save } from '../core/save.js';
import { WEAPONS } from '../gameplay/weapons.js';
import { STAGES } from '../gameplay/mission.js';
import { input } from '../core/input.js';

const KEY = 'hostile-orbit.dev.v2';
export const DEV_DEFAULTS = {
  god: false,           // opt-in testing only
  abilities: false,     // unlocked by the mission normally
  infiniteAmmo: false,  // magazines, reserve, grenades and injectors stay full
  freezeEnemies: false, // director + AI stop ticking
  noFog: false,
  bloom: true,
  showFps: false,
  timeScale: 1,         // 0.1 .. 2
  fastCooldowns: false, // ability cooldowns x10 faster
};

const TOGGLES = [
  ['god', 'GOD MODE', 'Local player takes no damage (F10 also toggles).'],
  ['abilities', 'ALL ORBITAL ABILITIES', '1-4 unlocked from the start of every drop.'],
  ['infiniteAmmo', 'INFINITE AMMO', 'Mags, reserve, grenades and injectors refill every frame.'],
  ['fastCooldowns', 'FAST ABILITY COOLDOWNS', 'Orbital cooldowns run 10x faster.'],
  ['freezeEnemies', 'FREEZE ENEMIES', 'AI and spawns stop. Useful for screenshots.'],
  ['noFog', 'DISABLE FOG', 'Removes distance fog.'],
  ['bloom', 'BLOOM', 'Post-process glow.'],
  ['showFps', 'FPS COUNTER', 'Same as the Settings toggle.'],
];

export class DevMenu {
  constructor(game, root) {
    this.game = game; this.open = false;
    this.state = { ...DEV_DEFAULTS };
    try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(this.state, JSON.parse(raw)); } catch { /* ignore */ }
    if (new URLSearchParams(location.search).has('mortal')) this.state.god = false;
    this.el = document.createElement('div'); this.el.id = 'devmenu'; root.appendChild(this.el);
    const css = document.createElement('style');
    css.textContent = `
      #devmenu{position:absolute;right:0;top:0;bottom:0;width:340px;background:rgba(4,6,9,.94);border-left:2px solid #f2c744;color:#e8e8e8;font-family:'Rajdhani',var(--font,sans-serif);padding:18px 18px 24px;box-sizing:border-box;overflow-y:auto;pointer-events:auto;transform:translateX(100%);transition:transform .18s ease;z-index:60}
      #devmenu.open{transform:none}
      #devmenu h2{margin:0 0 4px;font-size:18px;letter-spacing:.2em;color:#f2c744}
      #devmenu .sub{font-size:10px;letter-spacing:.25em;color:#8a9096;margin-bottom:14px}
      #devmenu .row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;margin-bottom:4px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);cursor:pointer}
      #devmenu .row:hover{border-color:rgba(242,199,68,.5)}
      #devmenu .row .lbl{font-size:12px;letter-spacing:.12em;font-weight:600}
      #devmenu .row .tip{font-size:10px;color:#8a9096;letter-spacing:.03em;margin-top:2px}
      #devmenu .sw{flex:0 0 38px;height:18px;border:1px solid rgba(255,255,255,.3);position:relative;background:rgba(0,0,0,.4)}
      #devmenu .sw i{position:absolute;top:2px;left:2px;width:12px;height:12px;background:#666;transition:all .12s}
      #devmenu .row.on .sw{border-color:#f2c744} #devmenu .row.on .sw i{left:22px;background:#f2c744}
      #devmenu .grp{font-size:10px;letter-spacing:.3em;color:#f2c744;margin:14px 0 6px}
      #devmenu .btns{display:flex;flex-wrap:wrap;gap:6px}
      #devmenu button{background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.25);color:#e8e8e8;font-family:inherit;font-size:11px;letter-spacing:.12em;padding:7px 10px;cursor:pointer}
      #devmenu button:hover{border-color:#f2c744;color:#f2c744}
      #devmenu input[type=range]{width:100%}
      #devmenu .val{font-family:monospace;font-size:11px;color:#f2c744}
      #devmenu .close{position:absolute;right:14px;top:14px}
    `;
    document.head.appendChild(css);
    this.build();
    this.applyAll();
  }
  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* ignore */ } }
  set(k, v) { this.state[k] = v; this.persist(); this.apply(k); this.refresh(); }
  toggle(force) {
    this.open = force != null ? force : !this.open;
    this.el.classList.toggle('open', this.open);
    if (this.open) { this.refresh(); input.releaseLock(); }
  }
  /** Apply a single setting to the live game. */
  apply(k) {
    const g = this.game, st = this.state, s = g.session;
    switch (k) {
      case 'god': g.god = !!st.god; g.session?.hud?.el?.classList.toggle('god', g.god); break;
      case 'abilities': if (st.abilities && s?.abilities) s.abilities.unlock(); break;
      case 'noFog': if (g.world?.scene?.fog) { if (!this._fogDensity) this._fogDensity = g.world.scene.fog.density; g.world.scene.fog.density = st.noFog ? 0 : (g.world.lighting?.fogDensity ?? this._fogDensity); } break;
      case 'bloom': if (g.renderer?.bloomPass) g.renderer.bloomPass.enabled = !!st.bloom; break;
      case 'showFps': g._fps?.(!!st.showFps); break;
      default: break;
    }
  }
  applyAll() { for (const k of Object.keys(this.state)) this.apply(k); }
  /** Called by the game after a session is built. */
  onSession() { this.apply('abilities'); this.apply('noFog'); this.apply('bloom'); this.apply('god'); }
  /** Per-frame hooks (cheap). */
  tick(s) {
    const st = this.state; if (!s) return;
    if (st.infiniteAmmo && s.player) { const p = s.player; for (const k of ['primary', 'secondary']) { const w = p.weapons[k]; if (w) { w.ammo = w.def.mag; w.reserve = w.def.maxReserve; } } p.grenades = 4; p.injectors = 4; }
    if (st.fastCooldowns && s.abilities?.cooldowns) for (const k in s.abilities.cooldowns) s.abilities.cooldowns[k] = Math.max(0, s.abilities.cooldowns[k] - 0.15);
  }
  // ---- actions ----
  skipTo(stage) { const m = this.game.session?.mission; if (!m) return; const idx = STAGES.indexOf(stage); if (idx >= STAGES.indexOf('orbital')) { m.flags.jammer = true; m.charge0 = m.charge1 = true; m.flags.chargesPlanted = 2; if (m.level.jammer?.group) m.level.jammer.group.visible = false; this.game.abilities?.unlock(); } if (idx >= STAGES.indexOf('extract_move')) m.flags.data = true; m.setStage(stage); this.teleportObjective(); }
  /** Best-known location for the current stage when no marker is up. */
  stageAnchor() { const s = this.game.session; if (!s) return null; const L = this.game.world.map.locations, st = s.mission.stage; const k = { canyon: 'jammerGateSouth', jammer: 'jammerCenter', jammer_armed: 'jammerGateSouth', orbital: 'commsGateSouth', comms: 'commsTerminal', download: 'commsTerminal', extract_move: 'extractionApproach', extract_hold: 'extractionCenter', warden: 'extractionCenter', board: 'extractionCenter' }[st]; return k && L[k] ? L[k].pos : null; }
  teleportObjective() { const s = this.game.session; const pos = s?.hud?.objMarker?.pos || this.stageAnchor(); if (!pos) return; const p = s.player; const w = this.game.world.nav.nearestWalkable(pos.x + 4, pos.z + 4, 25) || { x: pos.x + 4, z: pos.z + 4 }; p.position.set(w.x, this.game.world.groundHeight(w.x, w.z), w.z); p.velocity.set(0, 0, 0); p.vy = 0; }
  spawnWarden() { const s = this.game.session; if (!s) return; const p = s.player; const a = Math.random() * Math.PI * 2; s.director.spawn('warden', new THREE.Vector3(p.position.x + Math.cos(a) * 22, p.position.y, p.position.z + Math.sin(a) * 22), { yaw: 0 }); }
  spawnSquad() { const s = this.game.session; if (!s) return; const p = s.player; const a = Math.random() * Math.PI * 2; const at = new THREE.Vector3(p.position.x + Math.cos(a) * 26, p.position.y, p.position.z + Math.sin(a) * 26); s.director.wave?.(['fire_team'], [at], {}); }
  killAll() { const s = this.game.session; if (!s) return; for (const e of [...s.director.enemies]) { if (e.dead || e.type?.ally) continue; try { e.health = 0; e.die({ dir: [0, 0, 1], p: [e.position.x, e.position.y + 1, e.position.z], impulse: 3, zone: 'chest' }); } catch (err) { console.warn('[dev] kill failed', err); } } }
  giveWeapons() { for (const id of Object.keys(WEAPONS)) save.unlockWeapon(id); const p = this.game.session?.player; if (p) { p.pickupWeapon('atlas'); p.pickupWeapon('hammer'); } }
  refill() { const p = this.game.session?.player; if (!p) return; p.resupply(1); p.health = p.maxHealth; p.fuel = 1; }
  build() {
    const rows = TOGGLES.map(([k, label, tip]) => `<div class="row" data-k="${k}"><div><div class="lbl">${label}</div><div class="tip">${tip}</div></div><div class="sw"><i></i></div></div>`).join('');
    const stages = ['canyon', 'jammer', 'orbital', 'comms', 'download', 'extract_move', 'extract_hold', 'warden', 'board'];
    this.el.innerHTML = `
      <button class="close" data-a="close">CLOSE [F9]</button>
      <h2>DEV MENU</h2><div class="sub">TESTING CONTROLS // NOT FOR CITIZENS</div>
      ${rows}
      <div class="grp">TIME SCALE <span class="val" data-v="timeScale"></span></div>
      <input type="range" min="0.1" max="2" step="0.1" data-r="timeScale">
      <div class="grp">MISSION</div>
      <div class="btns">${stages.map((s) => `<button data-a="skip" data-s="${s}">${s.toUpperCase().replace('_', ' ')}</button>`).join('')}</div>
      <div class="grp">ACTIONS</div>
      <div class="btns">
        <button data-a="tp">TELEPORT TO OBJECTIVE</button><button data-a="refill">REFILL + HEAL</button>
        <button data-a="weapons">GIVE ALL WEAPONS</button><button data-a="warden">SPAWN WARDEN</button>
        <button data-a="squad">SPAWN FIRE TEAM</button><button data-a="kill">KILL ALL ENEMIES</button>
        <button data-a="map">TACTICAL MAP</button><button data-a="reset">RESET DEV SETTINGS</button>
      </div>`;
    this.el.addEventListener('click', (e) => {
      const row = e.target.closest('.row'); if (row) { const k = row.dataset.k; this.set(k, !this.state[k]); return; }
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a;
      if (a === 'close') this.toggle(false);
      else if (a === 'skip') this.skipTo(b.dataset.s);
      else if (a === 'tp') this.teleportObjective();
      else if (a === 'refill') this.refill();
      else if (a === 'weapons') this.giveWeapons();
      else if (a === 'warden') this.spawnWarden();
      else if (a === 'squad') this.spawnSquad();
      else if (a === 'kill') this.killAll();
      else if (a === 'map') this.game.toggleTacticalMap?.();
      else if (a === 'reset') { this.state = { ...DEV_DEFAULTS }; this.persist(); this.applyAll(); this.refresh(); }
    });
    this.el.querySelector('[data-r="timeScale"]').addEventListener('input', (e) => { this.state.timeScale = +e.target.value; this.persist(); this.refresh(); });
    // keep game keys from firing while typing/clicking inside the panel
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }
  refresh() {
    for (const row of this.el.querySelectorAll('.row')) row.classList.toggle('on', !!this.state[row.dataset.k]);
    const r = this.el.querySelector('[data-r="timeScale"]'); if (r && +r.value !== this.state.timeScale) r.value = this.state.timeScale;
    const v = this.el.querySelector('[data-v="timeScale"]'); if (v) v.textContent = `${this.state.timeScale.toFixed(1)}x`;
  }
}
