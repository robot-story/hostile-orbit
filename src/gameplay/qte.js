// Pressure mini-games run on top of the fight: an arrow-key sequence (QTE) and an uplink alignment ring. Both draw
// their own DOM, read raw key state, and hand a result back to the mission. Local-player only: the squad's job is to
// keep whoever is at the console alive.
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';

const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const KEYS = Object.keys(ARROWS);

export class QTE {
  constructor(game, ui) {
    this.game = game; this.ui = ui; this.active = null; this.align = null;
    this.el = document.createElement('div'); this.el.id = 'qte'; this.el.style.display = 'none'; ui.appendChild(this.el);
    const css = document.createElement('style'); css.textContent = `
      #qte{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;font-family:var(--font);z-index:7}
      #qte .t{font-size:12px;letter-spacing:.42em;color:var(--yellow,#f2c744)}
      #qte .h{font-size:11px;letter-spacing:.14em;color:rgba(232,244,248,.75);margin-top:4px}
      #qte .seq{display:flex;gap:10px;justify-content:center;margin:12px 0 8px}
      #qte .k{width:52px;height:52px;border:2px solid rgba(0,229,255,.5);display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;background:rgba(3,10,14,.6);transition:transform .08s,background .08s}
      #qte .k.done{border-color:var(--teal,#2ee6a6);color:var(--teal,#2ee6a6);background:rgba(46,230,166,.12)}
      #qte .k.cur{border-color:var(--yellow,#f2c744);transform:scale(1.18);box-shadow:0 0 18px rgba(242,199,68,.5)}
      #qte .k.bad{border-color:#ff3b1f;background:rgba(255,59,31,.25);animation:qteShake .3s}
      #qte .bar{width:320px;height:4px;margin:0 auto;background:rgba(255,255,255,.12)}#qte .bar i{display:block;height:100%;background:var(--yellow,#f2c744);box-shadow:0 0 10px var(--yellow,#f2c744)}
      #qte .ring{position:relative;width:180px;height:180px;margin:10px auto 6px;border-radius:50%;border:2px solid rgba(0,229,255,.35)}
      #qte .ring .tgt{position:absolute;left:50%;top:50%;width:6px;height:70px;margin-left:-3px;margin-top:-70px;transform-origin:50% 100%;background:linear-gradient(180deg,#ff5a1f,transparent)}
      #qte .ring .me{position:absolute;left:50%;top:50%;width:4px;height:84px;margin-left:-2px;margin-top:-84px;transform-origin:50% 100%;background:linear-gradient(180deg,#00e5ff,transparent)}
      #qte .ring .ok{position:absolute;inset:14px;border-radius:50%;border:2px solid transparent;transition:border-color .1s}#qte .ring.locked .ok{border-color:var(--teal,#2ee6a6);box-shadow:0 0 22px rgba(46,230,166,.35)}
      #qte .pct{font-family:var(--font-title);font-size:34px;color:#fff;margin-top:4px}
      @keyframes qteShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`;
    document.head.appendChild(css);
  }
  /** Arrow sequence under fire. opts: { title, hint, steps, window, onSuccess, onFail(reason), near: () => bool } */
  start(opts) {
    const seq = Array.from({ length: opts.steps || 6 }, () => KEYS[Math.floor(Math.random() * 4)]);
    this.active = { ...opts, seq, i: 0, t: 0, windowT: opts.window || 1.4, fails: 0 };
    this.el.innerHTML = `<div class="t">${opts.title || 'ENTER THE SEQUENCE'}</div><div class="h">${opts.hint || 'Arrow keys, in order, before each timer runs out. A wrong key resets the sequence.'}</div><div class="seq">${seq.map((k) => `<div class="k">${ARROWS[k]}</div>`).join('')}</div><div class="bar"><i></i></div>`;
    this.el.style.display = 'block'; this._refresh(); audio.play('objective_new', { volume: 0.6 }); events.emit('hint:qte');
  }
  _refresh() { const A = this.active; if (!A) return; const ks = this.el.querySelectorAll('.k'); ks.forEach((k, i) => { k.classList.toggle('done', i < A.i); k.classList.toggle('cur', i === A.i); }); }
  _fail(reason) {
    const A = this.active; if (!A) return; A.fails++; const ks = this.el.querySelectorAll('.k'); ks[Math.min(A.i, ks.length - 1)]?.classList.add('bad');
    audio.play('ui_error', { volume: 0.8 }); events.emit('fx:shake', 0.2); events.emit('toast', reason === 'far' ? 'SEQUENCE ABORTED  //  RETURN TO THE CONSOLE' : reason === 'time' ? 'TOO SLOW  //  SEQUENCE RESET' : 'WRONG KEY  //  SEQUENCE RESET', 'warn');
    A.onFail?.(reason, A.fails);
    // new sequence, same fight
    A.seq = Array.from({ length: A.seq.length }, () => KEYS[Math.floor(Math.random() * 4)]); A.i = 0; A.t = 0;
    this.el.querySelector('.seq').innerHTML = A.seq.map((k) => `<div class="k">${ARROWS[k]}</div>`).join(''); this._refresh();
  }
  /** Uplink alignment: keep your aim on a drifting bearing. opts: { title, hint, hold, onSuccess, near: () => bool } */
  startAlign(opts) {
    this.align = { ...opts, prog: 0, hold: opts.hold || 4, t: 0, target: Math.random() * Math.PI * 2 };
    this.el.innerHTML = `<div class="t">${opts.title || 'ALIGN THE UPLINK'}</div><div class="h">${opts.hint || 'Track the drifting beacon with your aim. Hold the lock until the dish charges.'}</div><div class="ring"><div class="tgt"></div><div class="me"></div><div class="ok"></div></div><div class="pct">0%</div>`;
    this.el.style.display = 'block'; audio.play('objective_new', { volume: 0.6 });
  }
  update(dt) {
    const A = this.active;
    if (A) {
      if (A.near && !A.near()) { this._fail('far'); if (A.fails >= 99) return; }
      A.t += dt; this.el.querySelector('.bar i').style.width = `${Math.max(0, 1 - A.t / A.windowT) * 100}%`;
      if (A.t >= A.windowT) { this._fail('time'); return; }
      for (const k of KEYS) { if (input._codePressed(k)) { if (k === A.seq[A.i]) { A.i++; A.t = 0; audio.play('ui_tab', { volume: 0.7, pitch: 1 + A.i * 0.06 }); this._refresh(); if (A.i >= A.seq.length) { this.active = null; this.el.style.display = 'none'; audio.play('ui_confirm', { volume: 1 }); A.onSuccess?.(); return; } } else { this._fail('wrong'); return; } } }
      return;
    }
    const L = this.align;
    if (L) {
      const p = this.game.session?.player; if (!p) return;
      L.t += dt; L.target += Math.sin(L.t * 0.9) * 0.55 * dt + Math.cos(L.t * 0.37) * 0.35 * dt;
      const yaw = p.cam.yaw; let d = Math.atan2(Math.sin(L.target - yaw), Math.cos(L.target - yaw)); const locked = Math.abs(d) < 0.14 && (!L.near || L.near());
      if (locked) L.prog = Math.min(L.hold, L.prog + dt); else L.prog = Math.max(0, L.prog - dt * 0.6);
      const ring = this.el.querySelector('.ring'); ring.classList.toggle('locked', locked);
      ring.querySelector('.tgt').style.transform = `rotate(${(-d * 180 / Math.PI).toFixed(1)}deg)`; ring.querySelector('.me').style.transform = 'rotate(0deg)';
      const pct = Math.round(L.prog / L.hold * 100); this.el.querySelector('.pct').textContent = pct + '%';
      if (locked && Math.floor(L.prog * 4) !== L._tick) { L._tick = Math.floor(L.prog * 4); audio.play('download_beep', { volume: 0.35, pitch: 1 + L.prog / L.hold * 0.5 }); }
      if (L.prog >= L.hold) { this.align = null; this.el.style.display = 'none'; audio.play('ui_confirm', { volume: 1 }); L.onSuccess?.(); }
    }
  }
  cancel() { this.active = null; this.align = null; this.el.style.display = 'none'; }
  get busy() { return !!(this.active || this.align); }
}
