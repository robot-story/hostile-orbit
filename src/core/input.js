// Keyboard/mouse input with pointer lock, rebindable actions and per-frame edge detection.
import { settings } from './settings.js';
import { events } from './events.js';

class Input {
  constructor() {
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = false;      // gameplay input enabled
    this.wantLock = false;
    this.canvas = null;
    this.rebindCapture = null; // fn(code) during key rebinding
    this._toggleState = { crouch: false, aim: false, sprint: false };
    this.mouseX = 0; this.mouseY = 0;
  }
  attach(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (this.rebindCapture) {
        if (e.code !== 'Escape') this.rebindCapture(e.code);
        else this.rebindCapture(null);
        this.rebindCapture = null;
        e.preventDefault(); return;
      }
      if (e.repeat) return;
      this.keys.add(e.code); this.pressedThisFrame.add(e.code);
      if (this.enabled && ['Tab', 'Space', 'AltLeft', 'AltRight', 'F1', 'F3', 'F5'].includes(e.code)) e.preventDefault();
      if (e.code === 'Tab' && this.locked) e.preventDefault();
      events.emit('input:keydown', e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code); this.releasedThisFrame.add(e.code);
      if (['AltLeft', 'AltRight', 'Tab'].includes(e.code)) e.preventDefault();
      events.emit('input:keyup', e.code, e);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (this.rebindCapture) { this.rebindCapture(`Mouse${e.button}`); this.rebindCapture = null; e.preventDefault(); return; }
      this.mouseButtons.add(e.button); this.mousePressed.add(e.button);
      if (this.wantLock && !this.locked) this.requestLock();
      if (this.enabled) e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouseButtons.delete(e.button); this.mouseReleased.add(e.button); });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.lookActive) {
        // clamp insane deltas (pointer lock glitches)
        const dx = Math.max(-200, Math.min(200, e.movementX || 0));
        const dy = Math.max(-200, Math.min(200, e.movementY || 0));
        this.mouseDX += dx; this.mouseDY += dy;
      }
    });
    window.addEventListener('wheel', (e) => { if (this.lookActive) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      events.emit('input:lock', this.locked);
    });
    document.addEventListener('pointerlockerror', () => { console.warn('[input] pointer lock error'); });
  }
  requestLock() {
    if (!this.canvas || this.locked || this.lockUnavailable) return;
    const fail = (e) => {
      // Embedded/iframe browsers may refuse pointer lock entirely: fall back to raw mouse deltas without lock.
      if (e && e.name === 'SecurityError') { this.lockUnavailable = true; events.emit('input:lock-unavailable'); return; }
      try { const p2 = this.canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch((e2) => { if (e2?.name === 'SecurityError') { this.lockUnavailable = true; events.emit('input:lock-unavailable'); } }); } catch { /* ignore */ }
    };
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(fail); }
    catch (e) { fail(e); }
  }
  /** True when gameplay mouse look is active (real pointer lock, or fallback mode). */
  get lookActive() { return this.locked || (this.lockUnavailable && this.enabled); }
  releaseLock() { if (this.locked) document.exitPointerLock(); }
  setGameplay(on) {
    this.enabled = on; this.wantLock = on;
    if (on) this.requestLock(); else this.releaseLock();
    this._toggleState = { crouch: false, aim: false, sprint: false };
  }
  bind(action) { return settings.data.binds[action]; }
  _codeDown(code) { return code?.startsWith('Mouse') ? this.mouseButtons.has(+code.slice(5)) : this.keys.has(code); }
  _codePressed(code) { return code?.startsWith('Mouse') ? this.mousePressed.has(+code.slice(5)) : this.pressedThisFrame.has(code); }
  _codeReleased(code) { return code?.startsWith('Mouse') ? this.mouseReleased.has(+code.slice(5)) : this.releasedThisFrame.has(code); }
  down(action) { return this.enabled && (this._codeDown(this.bind(action)) || (action === 'roll' && this._codeDown('AltLeft'))); }
  pressed(action) { return this.enabled && (this._codePressed(this.bind(action)) || (action === 'roll' && this._codePressed('AltLeft'))); }
  released(action) { return this.enabled && this._codeReleased(this.bind(action)); }
  // raw
  keyPressed(code) { return this.pressedThisFrame.has(code); }
  keyDown(code) { return this.keys.has(code); }
  get fire() { return this.enabled && this.mouseButtons.has(0); }
  get firePressed() { return this.enabled && this.mousePressed.has(0); }
  get fireReleased() { return this.enabled && this.mouseReleased.has(0); }
  get aimHeld() { return this.enabled && this.mouseButtons.has(2); }
  get aimPressed() { return this.enabled && this.mousePressed.has(2); }
  get aimReleased() { return this.enabled && this.mouseReleased.has(2); }
  get middlePressed() { return this.enabled && this.mousePressed.has(1); }
  // toggle-aware helpers
  aim() {
    if (settings.data.aimToggle) { if (this.aimPressed) this._toggleState.aim = !this._toggleState.aim; return this.enabled && this._toggleState.aim; }
    return this.aimHeld;
  }
  crouch() {
    if (settings.data.crouchToggle) { if (this.pressed('crouch')) this._toggleState.crouch = !this._toggleState.crouch; return this.enabled && this._toggleState.crouch; }
    return this.down('crouch');
  }
  clearCrouchToggle() { this._toggleState.crouch = false; }
  clearAimToggle() { this._toggleState.aim = false; }
  sprint() {
    if (settings.data.sprintToggle) { if (this.pressed('sprint')) this._toggleState.sprint = !this._toggleState.sprint; return this.enabled && this._toggleState.sprint; }
    return this.down('sprint');
  }
  clearSprintToggle() { this._toggleState.sprint = false; }
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('forward')) z += 1;
    if (this.down('back')) z -= 1;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z, active: l > 0 };
  }
  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY, w = this.wheel;
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    return { dx, dy, wheel: w };
  }
  endFrame() {
    this.pressedThisFrame.clear(); this.releasedThisFrame.clear();
    this.mousePressed.clear(); this.mouseReleased.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
export const input = new Input();

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'M4', 'M5'][+code.slice(5)] || code;
  const map = { ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT', AltRight: 'R ALT', Space: 'SPACE', Escape: 'ESC', Tab: 'TAB', Enter: 'ENTER', CapsLock: 'CAPS', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`' };
  return map[code] || code.toUpperCase();
}
