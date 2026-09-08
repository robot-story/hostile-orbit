// In-game HUD: holographic radar with enemy tracking, crosshair, hit markers, vitals, magazine pips, objective, compass, abilities, boss bar.
import { events } from '../core/events.js';
import { settings } from '../core/settings.js';
import { keyLabel } from '../core/input.js';
import { ABILITIES } from '../gameplay/weapons.js';
import { worldToMap } from '../world/terrain.js';

const BASE = import.meta.env.BASE_URL || './';
const ABILITY_ICONS = {
  kinetic: '<svg viewBox="0 0 40 40"><path d="M20 4l5 10v14l-5 8-5-8V14z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 20l-6 4M25 20l6 4" stroke="currentColor" stroke-width="2"/></svg>',
  gunship: '<svg viewBox="0 0 40 40"><path d="M4 20h32M20 10v20M10 14l10 6 10-6M12 30l8-4 8 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  sentry: '<svg viewBox="0 0 40 40"><rect x="14" y="10" width="12" height="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 14h10M20 19v6M12 34l8-9 8 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  supply: '<svg viewBox="0 0 40 40"><path d="M10 16h20v16H10zM10 16l10-8 10 8M20 8v24" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};
const WEAPON_ICONS = {
  rifle: '<svg viewBox="0 0 120 40"><path d="M2 22h30l4-6h14l3 6h40l6-3h18v6H92l-6 4H60l-2 6h-8l-2-6H34l-4-4H2z" fill="currentColor" opacity=".9"/><path d="M40 14h10v-6H40z" fill="currentColor" opacity=".6"/></svg>',
  shotgun: '<svg viewBox="0 0 120 40"><path d="M2 20h34l4-5h12l3 5h58v5H56l-3 6h-8l-3-6H40l-4 5H2z" fill="currentColor" opacity=".9"/><rect x="60" y="26" width="30" height="4" fill="currentColor" opacity=".6"/></svg>',
  lmg: '<svg viewBox="0 0 120 40"><path d="M2 20h28l3-7h20l3 7h50l8-3h4v7H98l-5 4H60l-2 6h-8l-3-6H35l-5 4H2z" fill="currentColor" opacity=".9"/><rect x="40" y="27" width="14" height="10" fill="currentColor" opacity=".7"/><path d="M84 27l-4 10M92 27l4 10" stroke="currentColor" stroke-width="2"/></svg>',
  sniper: '<svg viewBox="0 0 120 40"><path d="M2 21h26l3-5h10l2 5h70v4H50l-2 6h-8l-2-6H31l-3 4H2z" fill="currentColor" opacity=".9"/><rect x="36" y="8" width="26" height="5" rx="2" fill="currentColor" opacity=".7"/><path d="M40 13v3M58 13v3" stroke="currentColor" stroke-width="2"/></svg>',
  pistol: '<svg viewBox="0 0 120 40"><path d="M30 12h60v9H50l-4 14h-14l4-14h-6z" fill="currentColor" opacity=".9"/><rect x="62" y="21" width="20" height="3" fill="currentColor" opacity=".6"/></svg>',
};

export class Hud {
  constructor(root) {
    this.el = document.createElement('div'); this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="xhair"><i></i><i></i><i></i><i></i><b></b><div class="hitm"><i></i><i></i><i></i><i></i></div></div>
      <div class="dmgdir"></div>
      <div class="hud-top"><div class="obj"><span class="diamond"></span><div><div class="objtext">SURVEY BLACKSITE MERIDIAN</div><div class="objdist"></div></div></div><div class="side"></div></div>
      <div class="compass"><div class="strip"></div><div class="tick"></div><div class="objtick"></div></div>
      <div class="boss"><div class="name">WARDEN</div><div class="bar"><i></i></div><div class="plates"></div></div>
      <div class="hud-bl">
        <div class="radar"><canvas width="220" height="220"></canvas><div class="ring"></div><div class="rlabel">TAC-SCAN</div><div class="rn">N</div><div class="threat"></div></div>
        <div class="vitals"><div class="hpname">INTEGRITY</div><div class="hp"><div class="bar"><i></i><em></em></div><b class="hpnum">100</b></div><div class="lives"></div></div>
      </div>
      <div class="abilities"></div>
      <div class="hud-br"><div class="ammo"><div class="wicon"></div><div class="wname"></div><div class="count"><b class="mag">30</b><span class="res">/ 180</span></div><div class="pips"></div></div><div class="kit"><span class="gren"><i class="ico g"></i><b>4</b></span><span class="inj"><i class="ico h"></i><b>4</b></span></div></div>
      <div class="marked">TARGET MARKED — REINFORCEMENTS INBOUND</div>
      <div class="sniperscope"><div class="hole"></div><div class="ring"></div><div class="h"></div><div class="v"></div><div class="rl">LONGSHOT // 4.2x</div></div>
      <div class="godmode">GOD MODE</div>`;
    root.appendChild(this.el);
    const css = document.createElement('style');
    css.textContent = `
      #hud{position:absolute;inset:0;pointer-events:none;font-family:var(--font);--hs:var(--hud-scale);color:#e8f4f8}
      #hud .xhair{position:absolute;left:50%;top:50%;width:0;height:0}
      #hud .xhair i{position:absolute;background:var(--xc,var(--cyan));box-shadow:0 0 6px var(--xc,var(--cyan));opacity:.95;transition:top .08s,left .08s}
      #hud .xhair>i:nth-child(1){left:-1px;top:calc(-9px - var(--sp,6px));width:2px;height:9px}
      #hud .xhair>i:nth-child(2){left:-1px;top:var(--sp,6px);width:2px;height:9px}
      #hud .xhair>i:nth-child(3){top:-1px;left:calc(-9px - var(--sp,6px));height:2px;width:9px}
      #hud .xhair>i:nth-child(4){top:-1px;left:var(--sp,6px);height:2px;width:9px}
      #hud .xhair b{position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;background:#fff;border-radius:50%}
      #hud .hitm{position:absolute;left:0;top:0;opacity:0}
      #hud .hitm i{position:absolute;width:12px;height:2px;background:#fff;box-shadow:0 0 6px #fff}
      #hud .hitm i:nth-child(1){transform:translate(-14px,-10px) rotate(45deg)} #hud .hitm i:nth-child(2){transform:translate(3px,-10px) rotate(-45deg)}
      #hud .hitm i:nth-child(3){transform:translate(-14px,9px) rotate(-45deg)} #hud .hitm i:nth-child(4){transform:translate(3px,9px) rotate(45deg)}
      #hud .hitm.show{animation:hitm .25s ease-out} #hud .hitm.head i{background:var(--red);box-shadow:0 0 8px var(--red)} #hud .hitm.kill i{background:var(--amber);box-shadow:0 0 8px var(--amber);width:16px}
      @keyframes hitm{0%{opacity:1;transform:scale(1.4)}100%{opacity:0;transform:scale(1)}}
      #hud .dmgdir{position:absolute;left:50%;top:50%;width:0;height:0}
      #hud .dmgdir i{position:absolute;left:-40px;top:-140px;width:80px;height:18px;transform-origin:40px 140px;background:radial-gradient(ellipse at 50% 0,rgba(255,40,20,.85),rgba(255,40,20,0) 70%);opacity:0;animation:dd 1s ease-out forwards}
      @keyframes dd{0%{opacity:1}100%{opacity:0}}
      /* panels */
      #hud .panelx{position:relative;background:linear-gradient(180deg,rgba(4,14,20,.72),rgba(2,8,12,.82));border:1px solid rgba(0,229,255,.35);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
      #hud .hud-top{position:absolute;left:32px;top:28px;transform:scale(var(--hs));transform-origin:top left}
      #hud .obj{display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,rgba(0,229,255,.16),rgba(4,12,18,.6) 40%,rgba(4,12,18,.3));border-left:3px solid var(--cyan);padding:9px 20px 9px 16px;min-width:300px;clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%)}
      #hud .objtext{font-size:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
      #hud .objdist{font-size:11px;letter-spacing:.3em;color:var(--cyan);margin-top:2px;font-family:var(--mono)}
      #hud .side{margin-top:6px;display:flex;flex-direction:column;gap:3px}
      #hud .side div{font-size:11px;letter-spacing:.22em;color:rgba(255,200,120,.85);background:rgba(4,12,18,.5);border-left:2px solid var(--amber);padding:3px 10px;display:inline-flex;gap:10px;width:max-content;clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)}
      #hud .side div b{font-family:var(--mono);color:#fff} #hud .side div.done{opacity:.45;text-decoration:line-through}
      #hud .diamond{width:12px;height:12px;border:2px solid var(--cyan);transform:rotate(45deg);box-shadow:0 0 8px var(--cyan);animation:dpulse 1.6s ease-in-out infinite}
      @keyframes dpulse{50%{box-shadow:0 0 16px var(--cyan)}}
      #hud .compass{position:absolute;left:50%;top:14px;width:380px;height:24px;transform:translateX(-50%) scale(var(--hs));overflow:hidden;opacity:.9;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);border-bottom:1px solid rgba(0,229,255,.25)}
      #hud .compass .strip{position:absolute;top:2px;height:100%;white-space:nowrap;font-size:12px;letter-spacing:.2em;color:#fff}
      #hud .compass .strip span{display:inline-block;width:45px;text-align:center}
      #hud .compass .tick{position:absolute;left:50%;top:0;width:2px;height:9px;background:var(--cyan);box-shadow:0 0 6px var(--cyan);transform:translateX(-1px)}
      #hud .compass .objtick{position:absolute;top:14px;width:8px;height:8px;border:2px solid var(--cyan);transform:rotate(45deg);margin-left:-5px;display:none}
      #hud .boss{position:absolute;left:50%;top:60px;width:520px;transform:translateX(-50%) scale(var(--hs));display:none;text-align:center}
      #hud .boss.on{display:block}
      #hud .boss .name{font-size:14px;letter-spacing:.45em;color:var(--red);text-shadow:0 0 8px var(--red)}
      #hud .boss .bar{height:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,59,31,.6);margin-top:4px;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
      #hud .boss .bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff3b1f,#ff7a1a);box-shadow:0 0 10px rgba(255,90,31,.8);transition:width .2s}
      #hud .boss .plates{display:flex;justify-content:center;gap:6px;margin-top:5px}
      #hud .boss .plates i{width:40px;height:5px;background:rgba(255,255,255,.7)} #hud .boss .plates i.broken{background:rgba(255,255,255,.12)}
      /* bottom-left: radar + vitals */
      #hud .hud-bl{position:absolute;left:28px;bottom:28px;display:flex;align-items:flex-end;gap:16px;transform:scale(var(--hs));transform-origin:bottom left}
      #hud .radar{position:relative;width:170px;height:170px}
      #hud .radar canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,rgba(0,30,40,.55),rgba(0,10,16,.8));box-shadow:0 0 0 1px rgba(0,229,255,.35),0 0 18px rgba(0,229,255,.12),inset 0 0 30px rgba(0,229,255,.08)}
      #hud .radar .ring{position:absolute;inset:-4px;border-radius:50%;border:1px solid rgba(0,229,255,.25);border-top-color:var(--cyan);animation:spin 6s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      #hud .radar .rlabel{position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);font-size:9px;letter-spacing:.35em;color:var(--cyan);opacity:.8}
      #hud .radar .rn{position:absolute;left:50%;top:-14px;transform:translateX(-50%);font-size:10px;color:#fff;letter-spacing:.2em}
      #hud .radar .threat{position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 0 rgba(255,59,31,0);transition:box-shadow .4s;pointer-events:none}
      #hud .radar.t1 .threat{box-shadow:inset 0 0 14px rgba(255,120,40,.35)} #hud .radar.t2 .threat{box-shadow:inset 0 0 20px rgba(255,59,31,.5)} #hud .radar.t3 .threat{box-shadow:inset 0 0 26px rgba(255,59,31,.8);animation:tpulse 1s infinite}
      @keyframes tpulse{50%{box-shadow:inset 0 0 12px rgba(255,59,31,.4)}}
      #hud .vitals{padding:10px 16px 10px 14px;background:linear-gradient(90deg,rgba(4,14,20,.75),rgba(4,14,20,.35));border-left:2px solid rgba(0,229,255,.5);clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);min-width:300px}
      #hud .hpname{font-size:10px;letter-spacing:.35em;color:var(--cyan);margin-bottom:6px}
      #hud .hp{display:flex;align-items:center;gap:12px}
      #hud .hp .bar{width:230px;height:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25);position:relative;clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)}
      #hud .hp .bar i{display:block;height:100%;width:100%;background:repeating-linear-gradient(90deg,#dff7ff 0 12px,#8fe6ff 12px 14px);box-shadow:0 0 10px rgba(143,230,255,.8);transition:width .15s}
      #hud .hp .bar em{position:absolute;left:0;top:0;height:100%;width:0;background:rgba(255,80,40,.6);transition:width .6s;z-index:-1}
      #hud .hpnum{font-size:22px;font-weight:700;min-width:34px;text-align:right;font-family:var(--mono)}
      #hud .hp.low .bar i{background:repeating-linear-gradient(90deg,#ff6a4a 0 12px,#ff3b1f 12px 14px);box-shadow:0 0 12px rgba(255,59,31,.9)}
      #hud .lives{display:flex;gap:6px;margin-top:8px;align-items:center}
      #hud .lives em{width:22px;height:22px;background:rgba(255,255,255,.85);clip-path:polygon(20% 0,80% 0,100% 40%,100% 100%,0 100%,0 40%);opacity:.9;transition:opacity .3s}
      #hud .lives em.used{opacity:.15} #hud .lives .lt{font-size:9px;letter-spacing:.3em;color:var(--muted);margin-left:6px}
      /* abilities */
      #hud .abilities{position:absolute;left:50%;bottom:30px;transform:translateX(-50%) scale(var(--hs));display:flex;gap:16px;opacity:.3;transition:opacity .4s}
      #hud .abilities.on{opacity:1}
      #hud .ab{position:relative;width:66px;text-align:center;color:var(--cyan)}
      #hud .ab .ring{width:56px;height:56px;border-radius:50%;border:2px solid rgba(0,229,255,.45);display:flex;align-items:center;justify-content:center;margin:0 auto;background:radial-gradient(circle,rgba(0,229,255,.14),rgba(0,0,0,.55));position:relative;overflow:hidden}
      #hud .ab .ring svg{width:32px;height:32px;position:relative;z-index:1}
      #hud .ab .cd{position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,.78) var(--cd,0%),transparent 0)}
      #hud .ab .key{margin-top:4px;font-size:10px;letter-spacing:.1em;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.3);color:#fff;display:inline-block;padding:1px 6px}
      #hud .ab.ready .ring{border-color:var(--cyan);box-shadow:0 0 14px rgba(0,229,255,.5)}
      #hud .ab.locked{opacity:.4} #hud .ab .cdt{position:absolute;left:0;right:0;top:19px;font-size:14px;color:#fff;font-weight:600;z-index:2}
      /* bottom-right: weapon */
      #hud .hud-br{position:absolute;right:28px;bottom:28px;text-align:right;transform:scale(var(--hs));transform-origin:bottom right}
      #hud .ammo{position:relative;background:linear-gradient(270deg,rgba(4,14,20,.8),rgba(4,14,20,.4));border-right:2px solid rgba(0,229,255,.5);padding:10px 16px 10px 20px;display:inline-block;min-width:230px;clip-path:polygon(12px 0,100% 0,100% 100%,0 100%)}
      #hud .wicon{position:absolute;left:14px;top:8px;width:110px;height:36px;color:rgba(200,240,255,.85);filter:drop-shadow(0 0 4px rgba(0,229,255,.5))}
      #hud .wicon svg{width:100%;height:100%}
      #hud .wname{font-size:11px;letter-spacing:.32em;color:var(--cyan)}
      #hud .count b{font-size:36px;color:#fff;font-weight:700;font-family:var(--mono);transition:color .1s;line-height:1}
      #hud .count span{font-size:16px;color:var(--muted);margin-left:6px;font-family:var(--mono)}
      #hud .pips{display:flex;gap:2px;justify-content:flex-end;margin-top:6px;height:8px}
      #hud .pips i{width:4px;height:8px;background:var(--cyan);box-shadow:0 0 4px rgba(0,229,255,.6);clip-path:polygon(0 0,100% 20%,100% 100%,0 100%)} #hud .pips i.e{background:rgba(255,255,255,.12);box-shadow:none}
      #hud .kit{margin-top:8px;font-size:18px;color:#fff;display:flex;gap:12px;justify-content:flex-end;align-items:center}
      #hud .kit span{display:flex;align-items:center;gap:6px;background:rgba(4,14,20,.6);border:1px solid rgba(0,229,255,.25);padding:3px 10px;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
      #hud .kit b{font-family:var(--mono);font-weight:600}
      #hud .ico{display:inline-block;width:14px;height:14px;border:2px solid #fff;border-radius:50%}
      #hud .ico.h{border-radius:2px;background:linear-gradient(#3dff9a,#3dff9a) center/2px 10px no-repeat,linear-gradient(#3dff9a,#3dff9a) center/10px 2px no-repeat;border-color:transparent}
      #hud.reloading .count b{color:var(--amber)} #hud.lowammo .count b{color:var(--red)}
      #hud .marked{position:absolute;left:50%;top:96px;transform:translateX(-50%);color:var(--red);font-size:12px;letter-spacing:.3em;opacity:0;transition:opacity .3s;text-shadow:0 0 8px var(--red)}
      #hud .marked.on{opacity:1;animation:tpulse 1s infinite}
      #hud .godmode{position:absolute;right:16px;top:12px;font-size:11px;letter-spacing:.3em;color:var(--amber);opacity:.7;display:none}
      #hud.god .godmode{display:block}
      #hud .sniperscope{position:absolute;left:0;top:0;width:100%;height:100%;display:none;pointer-events:none;overflow:hidden}
      #hud .sniperscope .hole{position:absolute;left:50%;top:50%;width:52vmin;height:52vmin;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 300vmax rgba(0,4,8,.97),inset 0 0 40px rgba(0,0,0,.8)}
      #hud.scoped .sniperscope{display:block} #hud.scoped .xhair{opacity:0!important}
      #hud .sniperscope .ring{position:absolute;left:50%;top:50%;width:52vmin;height:52vmin;transform:translate(-50%,-50%);border-radius:50%;border:2px solid rgba(0,229,255,.55);box-shadow:0 0 30px rgba(0,229,255,.25),inset 0 0 40px rgba(0,229,255,.12)}
      #hud .sniperscope .h{position:absolute;left:50%;top:50%;width:52vmin;height:1px;transform:translate(-50%,-50%);background:linear-gradient(90deg,transparent,var(--cyan) 30%,transparent 48%,transparent 52%,var(--cyan) 70%,transparent)}
      #hud .sniperscope .v{position:absolute;left:50%;top:50%;width:1px;height:52vmin;transform:translate(-50%,-50%);background:linear-gradient(180deg,transparent,var(--cyan) 30%,transparent 48%,transparent 52%,var(--cyan) 70%,transparent)}
      #hud .sniperscope .rl{position:absolute;left:50%;top:calc(50% + 28vmin);transform:translateX(-50%);font-family:var(--mono);font-size:11px;letter-spacing:.3em;color:var(--cyan)}
      #hud.dead .xhair,#hud.dead .abilities,#hud.dead .hud-br{opacity:0}
    `;
    document.head.appendChild(css);
    this.canvas = this.el.querySelector('.radar canvas'); this.ctx = this.canvas.getContext('2d');
    this.mapImg = new Image(); this.mapImg.src = `${BASE}textures/menus/map_clean.jpg`; this.mapImg.onerror = () => { this.mapImg.onerror = null; this.mapImg.src = `${BASE}textures/blacksite-meridian-map.png`; };
    this.lives = 4; this.maxLives = 4; this.setLives(4, 4);
    this.buildAbilities(); this.buildCompass();
    this.objMarker = null; this.alertLevel = 0; this.enemiesRef = null; this.playersRef = null;
    this._unsub = [
      events.on('hud:hitmarker', (m) => this.hitMarker(m)),
      events.on('player:damaged', ({ from }) => this.damageDir(from)),
      events.on('objective:update', (t) => this.setObjective(t)),
      events.on('objective:marker', (m) => { this.objMarker = m; }),
      events.on('objective:side', (side) => this.setSide(side)),
      events.on('alert:level', (l) => { this.alertLevel = l; const r = this.el.querySelector('.radar'); r.className = 'radar' + (l > 0 ? ' t' + l : ''); }),
      events.on('hud:abilities', (cd, unlocked) => this.updateAbilities(cd, unlocked)),
      events.on('boss:spawn', (b) => this.setBoss(b)), events.on('boss:health', (b) => this.setBoss(b)), events.on('boss:died', () => this.setBoss(null)),
      events.on('lives:changed', (n) => this.setLives(n, this.maxLives)),
      events.on('player:marked', () => this.el.querySelector('.marked').classList.add('on')), events.on('player:unmarked', () => this.el.querySelector('.marked').classList.remove('on')),
      events.on('settings:changed', (k, v) => { if (k === 'crosshairColor') this.el.style.setProperty('--xc', v); }),
    ];
    this.el.style.setProperty('--xc', settings.data.crosshairColor);
    this.lastHp = 100; this.radarT = 0; this.lastPipMag = -1;
  }
  buildAbilities() {
    const c = this.el.querySelector('.abilities'); c.innerHTML = ''; this.abEls = {};
    ['kinetic', 'gunship', 'sentry', 'supply'].forEach((id, i) => { const d = document.createElement('div'); d.className = 'ab locked'; d.innerHTML = `<div class="ring"><div class="cd"></div>${ABILITY_ICONS[id]}<div class="cdt"></div></div><div class="key">${keyLabel(settings.data.binds['ability' + (i + 1)])}</div>`; d.title = ABILITIES[id].name; c.appendChild(d); this.abEls[id] = d; });
  }
  buildCompass() { const s = this.el.querySelector('.compass .strip'); let h = ''; const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }; for (let r = 0; r < 3; r++) for (let a = 0; a < 360; a += 15) h += `<span>${labels[a] || (a % 45 === 0 ? '' : '·')}</span>`; s.innerHTML = h; }
  updateAbilities(cd, unlocked) { this.el.querySelector('.abilities').classList.toggle('on', !!unlocked); for (const id in this.abEls) { const el = this.abEls[id]; const def = ABILITIES[id]; const v = cd[id] || 0; el.classList.toggle('locked', !unlocked); el.classList.toggle('ready', unlocked && v <= 0); el.querySelector('.cd').style.setProperty('--cd', `${(v / def.cooldown) * 100}%`); el.querySelector('.cdt').textContent = v > 0 ? Math.ceil(v) : ''; } }
  setLives(n, max = 4) { this.lives = n; this.maxLives = max; const c = this.el.querySelector('.lives'); c.innerHTML = ''; for (let i = 0; i < max; i++) { const e = document.createElement('em'); if (i >= n) e.classList.add('used'); c.appendChild(e); } const t = document.createElement('span'); t.className = 'lt'; t.textContent = 'REINFORCEMENTS'; c.appendChild(t); }
  setBoss(b) { const el = this.el.querySelector('.boss'); if (!b || b.dead) { el.classList.remove('on'); return; } el.classList.add('on'); el.querySelector('.bar i').style.width = `${Math.max(0, b.health / b.maxHealth * 100)}%`; el.querySelector('.plates').innerHTML = ['plateL', 'chest', 'plateR', 'kneeL', 'kneeR'].map(k => `<i class="${b.armour[k] > 0 ? '' : 'broken'}"></i>`).join(''); }
  hitMarker({ headshot, kill }) { const h = this.el.querySelector('.hitm'); h.classList.remove('show', 'head', 'kill'); void h.offsetWidth; h.classList.add('show'); if (headshot) h.classList.add('head'); if (kill) h.classList.add('kill'); }
  damageDir(from) { if (!from || !this.player) return; const dx = from.x - this.player.position.x, dz = from.z - this.player.position.z; const a = Math.atan2(dx, -dz) - this.player.cam.yaw; const i = document.createElement('i'); i.style.transform = `rotate(${-a}rad)`; this.el.querySelector('.dmgdir').appendChild(i); setTimeout(() => i.remove(), 1000); }
  setObjective(t) { this.el.querySelector('.objtext').textContent = t; }
  setSide(side) { this.side = side; const c = this.el.querySelector('.side'); c.innerHTML = Object.values(side).filter(o => o.total > 0).map(o => `<div class="${o.done >= o.total ? 'done' : ''}">${o.name} <b>${o.done}/${o.total}</b></div>`).join(''); }
  setSources(enemies, players) { this.enemiesRef = enemies; this.playersRef = players; }
  update(player, game, dt = 0.016) {
    this.player = player;
    const w = player.weapon;
    this.el.querySelector('.mag').textContent = w.ammo;
    this.el.querySelector('.res').textContent = '/ ' + w.reserve;
    this.el.querySelector('.wname').textContent = w.def.name;
    if (this.lastWeapon !== w.def.id) { this.lastWeapon = w.def.id; this.el.querySelector('.wicon').innerHTML = WEAPON_ICONS[w.def.kind] || WEAPON_ICONS.rifle; this.lastPipMag = -1; }
    if (this.lastPipMag !== w.ammo || this.lastPipMax !== w.def.mag) { this.lastPipMag = w.ammo; this.lastPipMax = w.def.mag; const n = Math.min(w.def.mag, 40); const per = w.def.mag / n; let h = ''; for (let i = 0; i < n; i++) h += `<i class="${(i + 1) * per <= w.ammo ? '' : 'e'}"></i>`; this.el.querySelector('.pips').innerHTML = h; }
    const hpPct = Math.max(0, player.health / player.maxHealth * 100);
    this.el.querySelector('.hp .bar i').style.width = `${hpPct}%`; this.el.querySelector('.hpnum').textContent = Math.ceil(player.health);
    if (player.health < this.lastHp) { const em = this.el.querySelector('.hp .bar em'); em.style.width = `${this.lastHp / player.maxHealth * 100}%`; setTimeout(() => em.style.width = `${hpPct}%`, 250); }
    this.lastHp = player.health;
    this.el.querySelector('.hp').classList.toggle('low', player.health < 30);
    this.el.querySelector('.gren b').textContent = player.grenades; this.el.querySelector('.inj b').textContent = player.injectors;
    this.el.classList.toggle('reloading', player.reloadT >= 0);
    this.el.classList.toggle('lowammo', w.ammo <= Math.ceil(w.def.mag * 0.2) && player.reloadT < 0);
    this.el.classList.toggle('dead', !!player.dead);
    this.el.classList.toggle('god', !!game?.god);
    this.el.classList.toggle('scoped', !!player.scoped);
    const spread = (player.aiming ? 4 : 8) + player.bloom * 400 + Math.min(14, player.velocity.length() * 2.5) + (player.state === 'cover' && !player.aiming ? 12 : 0);
    this.el.style.setProperty('--sp', spread + 'px');
    // compass
    const deg = ((-player.cam.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const px = -(deg / 15) * 45 - 360 * 3 + 190 - 22;
    this.el.querySelector('.compass .strip').style.transform = `translateX(${px}px)`;
    // objective distance & compass tick
    const ot = this.el.querySelector('.objtick'), od = this.el.querySelector('.objdist');
    if (this.objMarker?.pos) { const dx = this.objMarker.pos.x - player.position.x, dz = this.objMarker.pos.z - player.position.z; const dist = Math.hypot(dx, dz); const bearing = Math.atan2(dx, -dz); let rel = bearing - (-player.cam.yaw); rel = Math.atan2(Math.sin(rel), Math.cos(rel)); const xpx = 190 + rel / (Math.PI * 0.5) * 190; if (Math.abs(rel) < Math.PI * 0.5) { ot.style.display = 'block'; ot.style.left = xpx + 'px'; } else ot.style.display = 'none'; od.textContent = `${Math.round(dist)} m  //  ${this.objMarker.label || ''}`; }
    else { ot.style.display = 'none'; od.textContent = ''; }
    // radar (every other frame)
    this.radarT += dt; if (this.radarT > 0.05) { this.radarT = 0; this.drawRadar(player, game); }
  }
  drawRadar(player, game) {
    const c = this.ctx, W = this.canvas.width, R = W / 2, range = 60; c.clearRect(0, 0, W, W);
    const yaw = player.cam.yaw; // player-up rotation
    c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    // map underlay: 400m map -> pixels; scale so `range` metres = R px
    if (this.mapImg.complete && this.mapImg.naturalWidth) {
      const { mx, my } = worldToMap(player.position.x, player.position.z);
      const pxPerM = R / range; const size = 400 * pxPerM;
      c.save(); c.translate(R, R); c.rotate(yaw); c.globalAlpha = 0.28; c.filter = 'saturate(0.2) brightness(1.4)';
      c.drawImage(this.mapImg, -mx * pxPerM, -(400 - my) * pxPerM, size, size); c.restore();
      c.fillStyle = 'rgba(0,120,150,0.25)'; c.fillRect(0, 0, W, W);
    }
    // grid rings
    c.strokeStyle = 'rgba(0,229,255,0.18)'; c.lineWidth = 1;
    for (const r of [R * 0.33, R * 0.66]) { c.beginPath(); c.arc(R, R, r, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(R, 0); c.lineTo(R, W); c.moveTo(0, R); c.lineTo(W, R); c.stroke();
    // sweep
    const sweep = (performance.now() / 1000 * 1.2) % (Math.PI * 2);
    const grad = c.createConicGradient ? c.createConicGradient(sweep - Math.PI / 2, R, R) : null;
    if (grad) { grad.addColorStop(0, 'rgba(0,229,255,0)'); grad.addColorStop(0.85, 'rgba(0,229,255,0)'); grad.addColorStop(1, 'rgba(0,229,255,0.25)'); c.fillStyle = grad; c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.fill(); }
    // view cone
    c.fillStyle = 'rgba(0,229,255,0.08)'; c.beginPath(); c.moveTo(R, R); c.arc(R, R, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
    const toRadar = (x, z) => { const dx = x - player.position.x, dz = z - player.position.z; const rx = dx * Math.cos(yaw) + dz * Math.sin(yaw); const rz = -dx * Math.sin(yaw) + dz * Math.cos(yaw); return { x: R + rx / range * R, y: R + rz / range * R, d: Math.hypot(dx, dz) }; };
    // enemies
    const enemies = game?.director?.enemies || [];
    for (const e of enemies) {
      if (e.dead || e.type?.ally) continue;
      const p = toRadar(e.position.x, e.position.z); if (p.d > range) continue;
      const alert = e.alert; const boss = e.isBoss; const drone = e.typeId === 'drone';
      c.fillStyle = boss ? '#ff3b1f' : alert ? '#ff5a1f' : 'rgba(255,150,80,0.75)';
      c.shadowColor = c.fillStyle; c.shadowBlur = alert ? 8 : 0;
      c.beginPath();
      if (boss) { c.rect(p.x - 6, p.y - 6, 12, 12); }
      else if (drone) { c.moveTo(p.x, p.y - 5); c.lineTo(p.x + 5, p.y + 4); c.lineTo(p.x - 5, p.y + 4); c.closePath(); }
      else { c.arc(p.x, p.y, alert ? 4 : 3, 0, Math.PI * 2); }
      c.fill(); c.shadowBlur = 0;
      if (alert && !boss) { const fy = e.yaw ?? 0; const fx = -Math.sin(fy), fz = -Math.cos(fy); const rx = fx * Math.cos(yaw) + fz * Math.sin(yaw), rz = -fx * Math.sin(yaw) + fz * Math.cos(yaw); c.strokeStyle = 'rgba(255,90,31,0.8)'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + rx * 9, p.y + rz * 9); c.stroke(); }
    }
    // rescued allies / teammates
    for (const e of enemies) if (e.type?.ally && !e.dead) { const p = toRadar(e.position.x, e.position.z); if (p.d > range) continue; c.fillStyle = '#3dff9a'; c.beginPath(); c.arc(p.x, p.y, 3.5, 0, Math.PI * 2); c.fill(); }
    for (const pl of (game?.players || [])) { if (pl === player) continue; const p = toRadar(pl.position.x, pl.position.z); const col = pl.color || '#ffb020'; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 6; const cl = Math.min(p.d, range - 2) / (p.d || 1); const x = R + (p.x - R) * cl, y = R + (p.y - R) * cl; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; }
    // side operation markers (amber squares)
    if (this.side) { c.fillStyle = '#ffb020'; c.shadowColor = '#ffb020'; c.shadowBlur = 6; for (const o of Object.values(this.side)) for (const sp of (o.positions || [])) { const p = toRadar(sp.x, sp.z); if (p.d > range) continue; c.save(); c.translate(p.x, p.y); c.rotate(Math.PI / 4); c.fillRect(-3.5, -3.5, 7, 7); c.restore(); } c.shadowBlur = 0; }
    // objective diamond (clamped to edge)
    if (this.objMarker?.pos) { const p = toRadar(this.objMarker.pos.x, this.objMarker.pos.z); const cl = Math.min(p.d, range - 4) / (p.d || 1); const x = R + (p.x - R) * cl, y = R + (p.y - R) * cl; c.strokeStyle = this.objMarker.color || '#00e5ff'; c.lineWidth = 2; c.shadowColor = c.strokeStyle; c.shadowBlur = 8; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.stroke(); c.shadowBlur = 0; }
    // player arrow
    c.fillStyle = '#fff'; c.shadowColor = '#00e5ff'; c.shadowBlur = 8; c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R + 5, R + 5); c.lineTo(R, R + 2); c.lineTo(R - 5, R + 5); c.closePath(); c.fill(); c.shadowBlur = 0;
    c.restore();
    // north label position
    const nx = R + Math.sin(yaw) * (R + 10), ny = R - Math.cos(yaw) * (R + 10);
    const rn = this.el.querySelector('.rn'); rn.style.left = `${nx / W * 100}%`; rn.style.top = `${ny / W * 100}%`; rn.style.transform = 'translate(-50%,-50%)';
  }
  show(on) { this.el.style.display = on ? '' : 'none'; }
  dispose() { for (const u of this._unsub) u(); this.el.remove(); }
}
