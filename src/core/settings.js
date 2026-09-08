// Persistent settings (localStorage) with defaults & change notifications.
import { events } from './events.js';

const KEY = 'hostile-orbit.settings.v1';

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', crouch: 'KeyC', cover: 'Space', roll: 'KeyX',
  reload: 'KeyR', grenade: 'KeyG', heal: 'KeyH', interact: 'KeyE',
  swap: 'Tab', shoulder: 'KeyQ', map: 'KeyM', reinforce: 'KeyB',
  ability1: 'Digit1', ability2: 'Digit2', ability3: 'Digit3', ability4: 'Digit4',
  pause: 'Escape',
};

export const BIND_LABELS = {
  forward: 'Move Forward', back: 'Move Back', left: 'Strafe Left', right: 'Strafe Right',
  sprint: 'Sprint', crouch: 'Crouch', cover: 'Take Cover / Vault', roll: 'Combat Roll',
  reload: 'Reload', grenade: 'Throw Grenade', heal: 'Wellness Injector', interact: 'Interact',
  swap: 'Swap Weapon', shoulder: 'Switch Shoulder', map: 'Tactical Map', reinforce: 'Reinforcement Beacon',
  ability1: 'Kinetic Strike', ability2: 'Gunship Run', ability3: 'Sentry Pod', ability4: 'Supply Pod',
  pause: 'Pause',
};

export const DEFAULTS = {
  // controls
  mouseSensitivity: 1.0,
  aimSensitivity: 0.75,
  invertY: false,
  aimToggle: false,
  crouchToggle: true,
  sprintToggle: false,
  binds: { ...DEFAULT_BINDS },
  // graphics
  quality: 'high',          // low | medium | high | ultra
  fov: 72,
  bloom: true,
  shadows: true,
  particles: 1.0,
  renderScale: 1.0,
  fullscreen: false,
  showFps: false,
  // audio
  masterVolume: 0.9,
  musicVolume: 0.65,
  sfxVolume: 1.0,
  voiceVolume: 1.0,
  ambienceVolume: 0.8,
  // accessibility
  subtitles: true,
  subtitleSize: 'medium',   // small | medium | large
  screenShake: 1.0,
  cameraSway: 1.0,
  crosshairColor: '#00e5ff',
  hudScale: 1.0,
  hitFlash: true,
  reduceFlashing: false,
  colorblindMode: 'off',    // off | deuteranopia | protanopia | tritanopia
  // gore
  gore: 'full',             // full | reduced | off
  bloodDecals: true,
  dismemberment: true,
  // player
  playerName: 'Vanguard',
};

class Settings {
  constructor() {
    this.data = structuredClone(DEFAULTS);
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...structuredClone(DEFAULTS), ...parsed, binds: { ...DEFAULT_BINDS, ...(parsed.binds || {}) } };
      }
    } catch (e) { console.warn('[settings] load failed', e); }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('[settings] save failed', e); }
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    if (this.data[k] === v) return;
    this.data[k] = v;
    this.save();
    events.emit('settings:changed', k, v);
  }
  setBind(action, code) {
    this.data.binds = { ...this.data.binds, [action]: code };
    this.save();
    events.emit('settings:changed', 'binds', this.data.binds);
  }
  resetBinds() { this.data.binds = { ...DEFAULT_BINDS }; this.save(); events.emit('settings:changed', 'binds', this.data.binds); }
  resetAll() { this.data = structuredClone(DEFAULTS); this.save(); events.emit('settings:reset'); }
  get qualityLevel() { return { low: 0, medium: 1, high: 2, ultra: 3 }[this.data.quality] ?? 2; }
  get goreLevel() { return { off: 0, reduced: 1, full: 2 }[this.data.gore] ?? 2; }
}
export const settings = new Settings();
