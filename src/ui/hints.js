// Onboarding hints: one-time contextual control prompts (keycaps) shown at the right moment during the
// first missions. Each hint fires once per profile (localStorage) and never overlaps another.
import { events } from '../core/events.js';
import { settings } from '../core/settings.js';
import { keyLabel } from '../core/input.js';

const KEY = 'hostile-orbit.hints.v1';

export class Hints {
  constructor(root, game) {
    this.game = game; this.queue = []; this.showing = null; this.seen = new Set();
    try { const raw = localStorage.getItem(KEY); if (raw) this.seen = new Set(JSON.parse(raw)); } catch { /* ignore */ }
    this.el = document.createElement('div'); this.el.className = 'hints'; root.appendChild(this.el);
    const css = document.createElement('style');
    css.textContent = `
      #ui > .hints{position:absolute;left:50%;top:132px;transform:translateX(-50%);pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:6px;z-index:5}
      .hint{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(4,8,12,.9);border:1px solid rgba(0,229,255,.45);border-left:3px solid var(--yellow,#f2c744);color:#e8f4f8;font-family:var(--font);font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;box-shadow:0 0 18px rgba(0,229,255,.12)}
      .hint.on{opacity:1;transform:none}
      .hint .kc{display:inline-block;min-width:22px;padding:2px 7px;margin:0 2px;border:1px solid rgba(255,255,255,.45);border-bottom-width:3px;border-radius:3px;background:rgba(255,255,255,.06);font-family:var(--mono);font-size:11px;color:#fff;letter-spacing:.05em}
      .hint .lbl{color:var(--yellow,#f2c744);font-size:10px;letter-spacing:.3em;margin-right:4px}
    `;
    document.head.appendChild(css);
    const b = () => settings.data.binds;
    const k = (code) => `<span class="kc">${keyLabel(code)}</span>`;
    const t0 = () => this.game.mission?.time ?? 0;
    this.offs = [
      events.on('mission:start', () => { this.later(2.5, 'move', `${k(b().forward)}${k(b().left)}${k(b().back)}${k(b().right)} MOVE &nbsp; ${k(b().sprint)} SPRINT &nbsp; HOLD ${k(b().cover)} JETPACK`); this.later(14, 'map', `${k(b().map)} LIVE TACTICAL MAP &nbsp; ${k(b().shoulder)} SWITCH SHOULDER`); }),
      events.on('enemy:alert', () => this.show('combat', `<span class="kc">RMB</span> AIM + AUTO-LOCK &nbsp; <span class="kc">LMB</span> FIRE &nbsp; ${k(b().reload)} RELOAD`)),
      events.on('hint:cover', () => this.show('cover', `TAP ${k(b().cover)} TO TUCK INTO COVER &nbsp; ${k(b().roll)} DODGE ROLL`)),
      events.on('abilities:unlock', () => this.later(1.5, 'abilities', `${k(b().ability1)}${k(b().ability2)}${k(b().ability3)}${k(b().ability4)} ORBITAL SUPPORT: STRIKE / GUNSHIP / SENTRY / SUPPLY`)),
      events.on('player:damaged', ({ dmg }) => { const p = this.game.localPlayer; if (p && p.health < p.maxHealth * 0.55) this.show('heal', `${k(b().heal)} WELLNESS INJECTOR &nbsp; ${k(b().grenade)} GRENADE (HOLD TO THROW FAR)`); }),
      events.on('player:kill', () => { this.kills = (this.kills || 0) + 1; if (this.kills === 4) this.show('swap', `${k(b().swap)} / MOUSE WHEEL SWAP WEAPON &nbsp; ${k(b().crouch)} CROUCH`); }),
      events.on('hud:interact', (d) => { if (d && !this.seen.has('interact')) this.show('interact', `HOLD ${k(b().interact)} TO INTERACT`); }),
    ];
    void t0;
  }
  later(sec, id, html) { setTimeout(() => { if (this.game.mode === 'play') this.show(id, html); }, sec * 1000); }
  show(id, html) {
    if (this.seen.has(id)) return;
    this.seen.add(id); try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ }
    this.queue.push({ id, html }); this.pump();
  }
  pump() {
    if (this.showing || !this.queue.length) return;
    const h = this.queue.shift(); this.showing = h;
    const el = document.createElement('div'); el.className = 'hint'; el.innerHTML = `<span class="lbl">HINT</span>${h.html}`; this.el.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => { el.remove(); this.showing = null; this.pump(); }, 300); }, 5200);
  }
  reset() { this.seen.clear(); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
  dispose() { for (const o of this.offs) o(); this.el.remove(); }
}
