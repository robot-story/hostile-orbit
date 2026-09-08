// Persistent player profile / progression / combat record.
import { events } from './events.js';

const KEY = 'hostile-orbit.profile.v1';

const DEFAULT_PROFILE = {
  createdAt: Date.now(),
  xp: 0,
  level: 1,
  requisition: 0,
  intel: 0,
  unlockedWeapons: ['viper', 'sidearm'],
  loadout: { primary: 'viper', secondary: 'sidearm', grenade: 'frag', armour: 'orbital_assault', difficulty: 'veteran', dropZone: 'main' },
  missions: {
    silent_meridian: { completed: 0, attempts: 0, bestTime: null, bestStars: 0, bestAccuracy: 0, lastResult: null },
  },
  record: {
    kills: 0, headshots: 0, shotsFired: 0, shotsHit: 0, deaths: 0, grenadesThrown: 0, orbitalStrikes: 0,
    operativesRescued: 0, wardensKilled: 0, dronesDestroyed: 0, timePlayed: 0, damageDealt: 0, damageTaken: 0,
    limbsRemoved: 0, missionsCompleted: 0, missionsFailed: 0, longestKillStreak: 0, coopMissions: 0,
  },
  operationInProgress: null, // checkpoint data for Continue Operation
};

class SaveSystem {
  constructor() { this.profile = structuredClone(DEFAULT_PROFILE); this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        this.profile = { ...structuredClone(DEFAULT_PROFILE), ...p };
        this.profile.record = { ...DEFAULT_PROFILE.record, ...(p.record || {}) };
        this.profile.missions = { ...structuredClone(DEFAULT_PROFILE.missions), ...(p.missions || {}) };
        this.profile.loadout = { ...DEFAULT_PROFILE.loadout, ...(p.loadout || {}) };
        if (!Array.isArray(this.profile.unlockedWeapons)) this.profile.unlockedWeapons = ['viper', 'sidearm'];
      }
    } catch (e) { console.warn('[save] load failed', e); }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.profile)); events.emit('profile:changed', this.profile); }
    catch (e) { console.warn('[save] save failed', e); }
  }
  unlockWeapon(id) {
    if (!this.profile.unlockedWeapons.includes(id)) { this.profile.unlockedWeapons.push(id); this.save(); events.emit('weapon:unlocked', id); return true; }
    return false;
  }
  hasWeapon(id) { return this.profile.unlockedWeapons.includes(id); }
  addRecord(partial) {
    for (const k in partial) this.profile.record[k] = (this.profile.record[k] || 0) + partial[k];
    this.save();
  }
  setRecordMax(k, v) { if ((this.profile.record[k] || 0) < v) { this.profile.record[k] = v; this.save(); } }
  setLoadout(l) { this.profile.loadout = { ...this.profile.loadout, ...l }; this.save(); }
  levelForXp(xp) { return 1 + Math.floor(Math.sqrt(xp / 400)); }
  addRewards({ xp = 0, requisition = 0, intel = 0 }) {
    this.profile.xp += xp; this.profile.requisition += requisition; this.profile.intel += intel;
    this.profile.level = this.levelForXp(this.profile.xp);
    this.save();
  }
  setCheckpoint(data) { this.profile.operationInProgress = data; this.save(); }
  clearCheckpoint() { this.profile.operationInProgress = null; this.save(); }
  get hasOperation() { return !!this.profile.operationInProgress; }
  recordMissionResult(id, result) {
    const m = this.profile.missions[id] || (this.profile.missions[id] = { completed: 0, attempts: 0, bestTime: null, bestStars: 0, bestAccuracy: 0, lastResult: null });
    m.attempts++;
    m.lastResult = result;
    if (result.success) {
      m.completed++;
      if (m.bestTime === null || result.time < m.bestTime) m.bestTime = result.time;
      if (result.stars > m.bestStars) m.bestStars = result.stars;
      if (result.accuracy > m.bestAccuracy) m.bestAccuracy = result.accuracy;
    }
    this.save();
  }
  wipe() { this.profile = structuredClone(DEFAULT_PROFILE); this.save(); }
}
export const save = new SaveSystem();
