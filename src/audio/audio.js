// Runtime audio engine: buses, positional SFX, layered music director, voice queue with subtitles.
import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { events } from '../core/events.js';
import { clamp, pick, damp } from '../core/mathx.js';

const BASE = import.meta.env.BASE_URL || './';

export const MUSIC_STATES = {
  none:       {},
  menu:       { pad: 0.75, pulse: 0.12 },
  deploy:     { pad: 1.0, pulse: 1.0, drums_light: 0.7, tension: 0.2 },
  explore:    { pad: 0.85, pulse: 0.35 },
  alert:      { pad: 0.7, pulse: 0.6, drums_light: 1.0, tension: 0.45 },
  combat:     { pad: 0.5, pulse: 0.5, drums_heavy: 1.0, bass_distorted: 1.0 },
  extraction: { pad: 0.6, drums_heavy: 1.0, bass_distorted: 1.0, lead_extraction: 1.0, tension: 0.3 },
  boss:       { pad: 0.4, drums_heavy: 1.0, bass_distorted: 1.0, tension: 1.0, lead_extraction: 0.6 },
  results:    { pad: 0.8, lead_extraction: 0.35, pulse: 0.1 },
  failed:     { pad: 0.6, tension: 0.9 },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buffers = new Map();     // name -> AudioBuffer
    this.sfxManifest = null;
    this.musicManifest = null;
    this.voManifest = null;
    this.listenerPos = new THREE.Vector3();
    this.listenerFwd = new THREE.Vector3(0, 0, -1);
    this.listenerUp = new THREE.Vector3(0, 1, 0);
    this.musicLayers = new Map();  // name -> {gain, src, target}
    this.musicState = 'none';
    this.musicStarted = false;
    this.ambience = new Map();     // name -> {gain, src, target}
    this.voiceQueue = [];
    this.currentVoice = null;
    this.loops = new Map();       // handle -> node set
    this.loadProgress = 0;
    this.activeSfx = 0;
    this.lastPlayed = new Map();
    this._pendingInit = null;
    this.muffle = 0; // 0..1 low pass for death/pause
    this.loadedCount = 0; this.totalCount = 0;
  }

  async init() {
    if (this.ctx) return this._pendingInit;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.lowpass = c.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 22000;
    this.compressor = c.createDynamicsCompressor();
    this.compressor.threshold.value = -12; this.compressor.knee.value = 20; this.compressor.ratio.value = 4; this.compressor.attack.value = 0.003; this.compressor.release.value = 0.15;
    this.master.connect(this.lowpass).connect(this.compressor).connect(c.destination);
    this.bus = {};
    for (const b of ['music', 'sfx', 'voice', 'ambience', 'ui']) { this.bus[b] = c.createGain(); this.bus[b].connect(this.master); }
    // music tone filter: menus are mellow (no high shimmer/ringing), gameplay opens up
    this.bus.music.disconnect(); this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 1400; this.musicFilter.Q.value = 0.5;
    this.bus.music.connect(this.musicFilter).connect(this.master);
    this.applyVolumes();
    events.on('settings:changed', (k) => { if (k.endsWith('Volume')) this.applyVolumes(); });
    this._pendingInit = this._loadAll();
    await this._pendingInit;
    this.ready = true;
    return true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const d = settings.data;
    this.master.gain.value = d.masterVolume;
    this.bus.music.gain.value = d.musicVolume;
    this.bus.sfx.gain.value = d.sfxVolume;
    this.bus.ui.gain.value = d.sfxVolume;
    this.bus.voice.gain.value = d.voiceVolume;
    this.bus.ambience.gain.value = d.ambienceVolume;
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  async _fetchJson(url) { try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch { return null; } }

  async _loadAll() {
    const [m, vo] = await Promise.all([this._fetchJson(`${BASE}audio/manifest.json`), this._fetchJson(`${BASE}audio/vo/manifest.json`)]);
    this.sfxManifest = m?.sfx || {};
    this.musicManifest = m?.music || {};
    this.voManifest = vo || {};
    const files = new Set();
    for (const k in this.sfxManifest) for (const f of (this.sfxManifest[k].variants || [this.sfxManifest[k].file])) files.add(f);
    for (const k in this.musicManifest) files.add(this.musicManifest[k].file);
    for (const k in this.voManifest) files.add(this.voManifest[k].file);
    const list = [...files];
    // UI + weapons first
    list.sort((a, b) => (a.includes('ui_') ? -1 : 0) - (b.includes('ui_') ? -1 : 0));
    this.totalCount = list.length; this.loadedCount = 0;
    const workers = 8;
    let idx = 0;
    const next = async () => {
      while (idx < list.length) {
        const f = list[idx++];
        await this._loadBuffer(f);
        this.loadedCount++; this.loadProgress = this.loadedCount / Math.max(1, this.totalCount);
        events.emit('audio:progress', this.loadProgress);
      }
    };
    await Promise.all(Array.from({ length: workers }, next));
    if (list.length === 0) console.warn('[audio] no audio manifest found - run npm run gen:all');
    events.emit('audio:ready');
  }

  async _loadBuffer(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    try {
      const r = await fetch(`${BASE}audio/${file}`);
      if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(ab);
      this.buffers.set(file, buf);
      return buf;
    } catch (e) { this.buffers.set(file, null); return null; }
  }

  _bufferFor(name) {
    const e = this.sfxManifest?.[name];
    if (!e) return null;
    const v = e.variants && e.variants.length ? pick(e.variants) : e.file;
    return { buf: this.buffers.get(v), gain: e.gain ?? 1, loop: !!e.loop };
  }

  updateListener(camera) {
    if (!this.ctx) return;
    camera.getWorldPosition(this.listenerPos);
    camera.getWorldDirection(this.listenerFwd);
    this.listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(this.listenerPos.x, t, 0.02); L.positionY.setTargetAtTime(this.listenerPos.y, t, 0.02); L.positionZ.setTargetAtTime(this.listenerPos.z, t, 0.02);
      L.forwardX.setTargetAtTime(this.listenerFwd.x, t, 0.02); L.forwardY.setTargetAtTime(this.listenerFwd.y, t, 0.02); L.forwardZ.setTargetAtTime(this.listenerFwd.z, t, 0.02);
      L.upX.setTargetAtTime(this.listenerUp.x, t, 0.02); L.upY.setTargetAtTime(this.listenerUp.y, t, 0.02); L.upZ.setTargetAtTime(this.listenerUp.z, t, 0.02);
    } else { L.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z); L.setOrientation(this.listenerFwd.x, this.listenerFwd.y, this.listenerFwd.z, this.listenerUp.x, this.listenerUp.y, this.listenerUp.z); }
  }

  /** Play a one-shot or loop. Returns a handle {stop(), gain, setPosition()} */
  play(name, opts = {}) {
    if (!this.ctx || !this.ready) return null;
    const entry = this._bufferFor(name);
    if (!entry || !entry.buf) return null;
    // Rate limit identical sounds (avoid phasing stacks)
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) || 0;
    if (now - last < (opts.minInterval ?? 0.012)) return null;
    this.lastPlayed.set(name, now);
    if (this.activeSfx > 96 && !opts.important) return null;
    // Distance cull
    if (opts.pos) {
      const d = opts.pos.distanceTo(this.listenerPos);
      const maxD = opts.maxDistance ?? 140;
      if (d > maxD) return null;
    }
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = entry.buf;
    src.loop = opts.loop ?? entry.loop;
    const pitch = (opts.pitch ?? 1) * (opts.pitchVar ? 1 + (Math.random() * 2 - 1) * opts.pitchVar : 1);
    src.playbackRate.value = pitch;
    const g = c.createGain();
    g.gain.value = (opts.volume ?? 1) * entry.gain;
    let node = g;
    let panner = null;
    if (opts.pos) {
      panner = c.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = opts.refDistance ?? 4;
      panner.maxDistance = opts.maxDistance ?? 140;
      panner.rolloffFactor = opts.rolloff ?? 1.1;
      panner.positionX.value = opts.pos.x; panner.positionY.value = opts.pos.y; panner.positionZ.value = opts.pos.z;
      g.connect(panner); node = panner;
    }
    node.connect(this.bus[opts.bus || 'sfx']);
    src.connect(g);
    const startAt = now + (opts.delay || 0);
    src.start(startAt, opts.offset || 0);
    this.activeSfx++;
    const handle = {
      src, gain: g, panner, name, stopped: false,
      stop(fade = 0.02) {
        if (this.stopped) return; this.stopped = true;
        try { g.gain.setTargetAtTime(0, c.currentTime, fade / 3); src.stop(c.currentTime + fade + 0.05); } catch { /* ignore */ }
      },
      setPosition(p) { if (panner) { const t = c.currentTime; panner.positionX.setTargetAtTime(p.x, t, 0.03); panner.positionY.setTargetAtTime(p.y, t, 0.03); panner.positionZ.setTargetAtTime(p.z, t, 0.03); } },
      setVolume(v, tc = 0.05) { g.gain.setTargetAtTime(v * entry.gain, c.currentTime, tc); },
      setPitch(p, tc = 0.05) { src.playbackRate.setTargetAtTime(p, c.currentTime, tc); },
    };
    src.onended = () => { this.activeSfx--; handle.stopped = true; try { src.disconnect(); g.disconnect(); panner?.disconnect(); } catch { /* ignore */ } };
    return handle;
  }

  ui(name, opts = {}) { return this.play(name, { ...opts, bus: 'ui', important: true }); }

  // ---------- Music ----------
  _ensureMusicStarted() {
    if (this.musicStarted || !this.ctx || !this.musicManifest) return;
    const names = Object.keys(this.musicManifest).filter(n => this.musicManifest[n].loop !== false);
    const allLoaded = names.every(n => this.buffers.get(this.musicManifest[n].file));
    if (!allLoaded || names.length === 0) return;
    const start = this.ctx.currentTime + 0.05;
    for (const n of names) {
      const buf = this.buffers.get(this.musicManifest[n].file);
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g).connect(this.bus.music);
      src.start(start);
      this.musicLayers.set(n, { src, gain: g, target: 0, cur: 0 });
    }
    this.musicStarted = true;
  }
  setMusicState(state, opts = {}) {
    if (!MUSIC_STATES[state]) state = 'none';
    if (this.musicState === state && !opts.force) return;
    this.musicState = state;
    this.musicFadeSpeed = opts.speed ?? 1.2;
    const targets = MUSIC_STATES[state];
    for (const [n, l] of this.musicLayers) l.target = targets[n] ?? 0;
    const mellow = state === 'menu' || state === 'results' || state === 'failed' || state === 'none';
    if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(mellow ? 1400 : 18000, this.ctx.currentTime, 0.8);
  }
  playStinger(name, volume = 1) {
    const e = this.musicManifest?.[name]; if (!e || !this.ctx) return;
    const buf = this.buffers.get(e.file); if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = volume;
    src.connect(g).connect(this.bus.music); src.start();
  }

  // ---------- Ambience ----------
  setAmbience(mix, speed = 0.6) { // mix: {ambience_wind: 1, ambience_alien: 0.5}
    if (!this.ctx) return;
    for (const name in mix) {
      if (!this.ambience.has(name)) {
        const h = this.play(name, { loop: true, volume: 0, bus: 'ambience', important: true });
        if (!h) continue;
        this.ambience.set(name, { h, target: 0, cur: 0 });
      }
      this.ambience.get(name).target = mix[name];
    }
    for (const [name, a] of this.ambience) if (!(name in mix)) a.target = 0;
    this.ambienceSpeed = speed;
  }

  // ---------- Voice ----------
  say(id, opts = {}) {
    if (!this.ctx || !this.voManifest) return false;
    const e = this.voManifest[id];
    if (!e) { console.warn('[audio] missing VO', id); return false; }
    const prio = opts.priority ?? e.priority ?? 1;
    // dedupe if already queued
    if (this.voiceQueue.some(q => q.id === id) || this.currentVoice?.id === id) return false;
    // Low priority barks are dropped if something is playing or queued
    if (prio <= 1 && (this.currentVoice || this.voiceQueue.length)) return false;
    if (prio >= 3 && this.currentVoice && (this.currentVoice.prio <= 1)) { this.currentVoice.handle?.stop(0.08); this._voiceEnded(true); }
    this.voiceQueue.push({ id, prio, delay: opts.delay || 0, onEnd: opts.onEnd, entry: e, t: performance.now() });
    this.voiceQueue.sort((a, b) => b.prio - a.prio);
    this._pumpVoice();
    return true;
  }
  _pumpVoice() {
    if (this.currentVoice || !this.voiceQueue.length) return;
    const q = this.voiceQueue.shift();
    const buf = this.buffers.get(q.entry.file);
    if (!buf) { q.onEnd?.(); this._pumpVoice(); return; }
    const handle = this.play(`__vo__`, {}); // placeholder no-op (manifest lookup fails) — we construct manually below
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = 1;
    src.connect(g).connect(this.bus.voice);
    const startAt = c.currentTime + q.delay + 0.02;
    src.start(startAt);
    const dur = buf.duration;
    this.currentVoice = { id: q.id, prio: q.prio, handle: { stop: (f = 0.05) => { try { g.gain.setTargetAtTime(0, c.currentTime, f / 3); src.stop(c.currentTime + f + 0.02); } catch { /* ignore */ } } }, onEnd: q.onEnd };
    const speaker = q.entry.speaker;
    if (speaker === 'voss' || speaker === 'legion') this.play('radio_open', { bus: 'voice', volume: 0.5, delay: q.delay });
    setTimeout(() => events.emit('subtitle:show', { speaker, text: q.entry.text, duration: dur, id: q.id }), q.delay * 1000);
    src.onended = () => { if (this.currentVoice && this.currentVoice.id === q.id) this._voiceEnded(false); };
    void handle;
  }
  _voiceEnded(interrupted) {
    const cv = this.currentVoice; this.currentVoice = null;
    if (cv) { const sp = this.voManifest[cv.id]?.speaker; if (!interrupted && (sp === 'voss' || sp === 'legion')) this.play('radio_close', { bus: 'voice', volume: 0.4 }); cv.onEnd?.(); }
    events.emit('subtitle:hide');
    setTimeout(() => this._pumpVoice(), 250);
  }
  stopVoice() { this.currentVoice?.handle?.stop(0.05); this.voiceQueue.length = 0; this.currentVoice = null; events.emit('subtitle:hide'); }
  voiceDuration(id) { return this.voManifest?.[id]?.duration ?? 2; }
  hasVoice(id) { return !!this.voManifest?.[id]; }

  setMuffle(v) { this.muffle = clamp(v, 0, 1); }

  update(dt) {
    if (!this.ctx) return;
    this._ensureMusicStarted();
    const sp = this.musicFadeSpeed || 1.2;
    for (const l of this.musicLayers.values()) {
      if (Math.abs(l.cur - l.target) > 0.001) { l.cur = damp(l.cur, l.target, sp, dt); l.gain.gain.setTargetAtTime(l.cur, this.ctx.currentTime, 0.05); }
    }
    for (const a of this.ambience.values()) {
      if (Math.abs(a.cur - a.target) > 0.001) { a.cur = damp(a.cur, a.target, this.ambienceSpeed || 0.6, dt); a.h.setVolume(a.cur, 0.1); }
    }
    const targetLP = this.muffle > 0 ? 22000 - this.muffle * 21200 : 22000;
    const cur = this.lowpass.frequency.value;
    if (Math.abs(cur - targetLP) > 10) this.lowpass.frequency.setTargetAtTime(targetLP, this.ctx.currentTime, 0.08);
  }
}

export const audio = new AudioEngine();
