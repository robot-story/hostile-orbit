// Operation: Silent Meridian — objectives, interactables, scripted events, waves, extraction, checkpoints, results.
import * as THREE from 'three';
import { events } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { net, MSG } from '../net/net.js';
import { v3 } from '../net/protocol.js';
import { Dropship } from './pods.js';
import { M } from '../world/terrain.js';
import { clamp, rand, pick, formatTime } from '../core/mathx.js';

export const STAGES = ['land', 'canyon', 'jammer', 'jammer_armed', 'orbital', 'comms', 'download', 'extract_move', 'extract_hold', 'warden', 'board', 'complete', 'failed'];

export class Mission {
  constructor(game) {
    this.game = game; this.world = game.world; this.fx = game.fx; this.level = game.world.level; this.L = this.level.locations;
    this.stage = 'land'; this.stageT = 0; this.time = 0;
    this.interactables = new Map();
    this.objectiveText = 'AWAITING DEPLOYMENT';
    this.flags = { jammer: false, data: false, rescued: 0, chargesPlanted: 0, wardenDead: false, extractionStarted: false };
    this.holdTimer = 0; this.downloadT = 0; this.jammerCountdown = -1; this.waveT = 0;
    this.markers = [];
    this.lives = game.difficulty?.lives ?? 4; this.reinforcementsUsed = 0;
    this.dropship = null; this.rescuedUnits = [];
    this.active = false; this.result = null;
    this.interactHold = 0; this.currentInteract = null;
    this.musicT = 0;
    this._bind();
  }
  _bind() {
    this._offs = [
      events.on('enemy:died', (e) => this.onEnemyDied(e)),
      events.on('boss:died', () => { this.flags.wardenDead = true; if (this.stage === 'warden') this.setStage('board'); }),
      events.on('player:died', (p) => this.onPlayerDied(p)),
      events.on('player:kill', () => { this.killsSinceLine++; if (this.killsSinceLine === 12) audio.say('ship_violence_target', { priority: 1 }); if (Math.random() < 0.18) audio.say(pick(['vg_compliance', 'vg_liberated', 'vg_refund', 'vg_democratic', 'vg_exceeding', 'vg_dental']), { priority: 1 }); }),
      events.on('enemy:alert', () => { if (!this.firstContact) { this.firstContact = true; audio.say('voss_first_contact', { priority: 2, delay: 0.8 }); } }),
    ];
    this.killsSinceLine = 0;
    net.on(MSG.REQ_INTERACT, (m, from) => { if (net.isHost) this.onInteractRequest(m, from); });
    net.on(MSG.EV_OBJECTIVE, (m) => { if (!net.isHost) this.applyObjectiveEvent(m); });
  }
  dispose() { for (const o of this._offs) o(); this.clearMarkers(); this.dropship?.remove(); }
  // ---------- objectives ----------
  setObjective(text, banner = null) { this.objectiveText = text; events.emit('objective:update', text); if (banner) events.emit('objective:banner', banner); }
  clearMarkers() { for (const m of this.markers) m.remove?.(); this.markers.length = 0; events.emit('objective:marker', null); }
  mark(pos, color = '#00e5ff', label = '') { const m = this.fx.marker(pos.clone().setY(pos.y + 2.5), color); this.markers.push(m); events.emit('objective:marker', { pos, color, label }); return m; }
  setStage(stage, silent = false) {
    if (this.stage === stage) return;
    this.stage = stage; this.stageT = 0;
    if (net.isHost) net.send(MSG.EV_OBJECTIVE, { id: 'stage', state: stage, data: this.flags }, { reliable: true });
    this.clearMarkers();
    const L = this.L;
    switch (stage) {
      case 'canyon':
        this.setObjective('REACH THE JAMMER OUTPOST', { title: 'NEW OBJECTIVE', sub: 'Move through the canyon to the jammer outpost' });
        this.mark(L.jammerGateSouth.pos, '#00e5ff', 'JAMMER OUTPOST');
        audio.say('voss_jammer_intel', { priority: 3, delay: 6 });
        audio.say('voss_occupants', { priority: 2, delay: 26 });
        this.checkpoint('canyon');
        break;
      case 'jammer':
        this.setObjective('PLANT EXPLOSIVES ON THE JAMMER (0/2)', { title: 'NEW OBJECTIVE', sub: 'Plant two charges on the jammer array' });
        for (const cp of this.level.jammer.chargePoints) this.mark(cp, '#ff7a1a', 'CHARGE');
        this.checkpoint('jammer');
        break;
      case 'jammer_armed':
        this.setObjective('GET CLEAR OF THE JAMMER', { title: 'CHARGES ARMED', sub: 'Detonation in 10 seconds' });
        this.jammerCountdown = 10;
        break;
      case 'orbital':
        this.flags.jammer = true;
        this.setObjective('ASSAULT THE COMMUNICATIONS BASE', { title: 'OBJECTIVE COMPLETE', sub: 'Jammer destroyed. Orbital support online.' });
        this.game.abilities.unlock();
        audio.say('voss_orbital_unlocked', { priority: 3, delay: 1.5 });
        audio.say('ship_orbital_unlock', { priority: 2, delay: 9 });
        audio.say('voss_comms_base', { priority: 3, delay: 16 });
        audio.say('voss_detention', { priority: 2, delay: 30 });
        this.mark(L.commsGateSouth.pos, '#00e5ff', 'COMMS BASE');
        this.checkpoint('orbital');
        break;
      case 'comms':
        this.setObjective('DOWNLOAD THE INVASION DATA', { title: 'NEW OBJECTIVE', sub: 'Access the command terminal' });
        this.mark(this.level.terminal.position, '#00e5ff', 'TERMINAL');
        for (const c of this.level.cells || []) if (!c.rescued) this.mark(c.consolePosition, '#ffd23f', 'DETENTION');
        this.checkpoint('comms');
        break;
      case 'download':
        this.setObjective('DEFEND THE TERMINAL — DOWNLOAD 0%', { title: 'DOWNLOAD STARTED', sub: 'Hold the command room' });
        this.downloadT = 0; this.waveT = 4;
        audio.say('voss_download', { priority: 3 });
        audio.setMusicState('combat');
        break;
      case 'extract_move':
        this.flags.data = true;
        this.setObjective('REACH THE EXTRACTION PLATFORM', { title: 'DATA SECURED', sub: 'Proceed to extraction' });
        audio.say('voss_data_secured', { priority: 3 });
        audio.say('ship_data_complete', { priority: 2, delay: 7 });
        this.mark(L.extractionCenter.pos, '#00e5ff', 'EXTRACTION');
        for (const c of this.level.cells || []) if (!c.rescued) this.mark(c.consolePosition, '#ffd23f', 'DETENTION');
        this.checkpoint('extract_move');
        break;
      case 'extract_hold':
        this.flags.extractionStarted = true; this.holdTimer = 90; this.waveT = 3; this.wardenSpawned = false;
        this.setObjective('HOLD THE PLATFORM — 90s', { title: 'EXTRACTION CALLED', sub: 'Survive for ninety seconds' });
        audio.say('voss_extraction', { priority: 3 });
        audio.say('ship_wait_time', { priority: 2, delay: 8 });
        audio.say('voss_hold', { priority: 2, delay: 30 });
        audio.setMusicState('extraction');
        this.dropship = new Dropship(this.game, L.extractionCenter.pos, { canLand: false });
        this.checkpoint('extract_hold');
        break;
      case 'warden':
        this.setObjective('DESTROY THE WARDEN', { title: 'WARDEN SIGNATURE DETECTED', sub: 'Destroy its armour plates to expose the core' });
        audio.say('voss_warden_2', { priority: 3 });
        audio.say('voss_warden', { priority: 2, delay: 6 });
        audio.say('vg_warden', { priority: 1, delay: 16 });
        audio.setMusicState('boss');
        break;
      case 'board':
        this.setObjective('BOARD THE DROPSHIP', { title: 'DROPSHIP ON FINAL APPROACH', sub: 'Get aboard' });
        audio.say('voss_dropship', { priority: 3 });
        if (this.dropship) this.dropship.canLand = true;
        this.mark(L.extractionCenter.pos, '#3dff9a', 'DROPSHIP');
        audio.setMusicState('extraction');
        break;
      case 'complete':
        this.setObjective('MISSION COMPLETE', { title: 'MISSION COMPLETE', sub: 'Blacksite Meridian liberated' });
        break;
      case 'failed':
        this.setObjective('MISSION FAILED');
        break;
    }
  }
  applyObjectiveEvent(m) { if (m.id === 'stage') { Object.assign(this.flags, m.data || {}); this.setStage(m.state); } else if (m.id === 'progress') { this.downloadT = m.data.download ?? this.downloadT; this.holdTimer = m.data.hold ?? this.holdTimer; this.jammerCountdown = m.data.jammer ?? this.jammerCountdown; this.lives = m.data.lives ?? this.lives; } else if (m.id === 'rescued') { this.onRescued(m.data.index, true); } else if (m.id === 'charge') { this.onChargePlanted(m.data.index, true); } }
  // ---------- start ----------
  start(dropPos) {
    this.active = true; this.time = 0;
    this.setupInteractables();
    this.setupGarrisons();
    this.setObjective('SURVEY THE LANDING ZONE');
    events.emit('objective:update', this.objectiveText);
    audio.setMusicState('explore');
    audio.setAmbience({ ambience_wind: 0.8, ambience_alien: 0.45 });
    setTimeout(() => { if (this.active) { audio.say('voss_landed', { priority: 3 }); audio.say('vg_landed', { priority: 1, delay: 3 }); this.setStage('canyon'); } }, 1500);
  }
  setupGarrisons() {
    if (!net.isHost) return;
    const D = this.game.director, L = this.L, lv = this.level;
    const routes = lv.patrolRoutes || [];
    const rt = (re) => routes.find(r => re.test(r.name)) || null;
    // patrols along the three routes
    const main = rt(/main/i), high = rt(/high/i), trench = rt(/trench/i), jam = rt(/jammer/i), comms = rt(/comms|court/i), ext = rt(/extract/i);
    if (main) { D.addPatrol(main, 'patrol_light', 1); D.addPatrol(main, 'patrol', Math.floor(main.points.length / 2)); }
    if (high) D.addPatrol(high, 'patrol_light', 1);
    if (trench) D.addPatrol(trench, 'patrol', 1);
    // area garrisons
    D.addGarrison(L.canyonJunction.pos, 70, ['recon'], { spread: 6 });
    D.addGarrison(L.jammerGateSouth.pos, 75, ['patrol_heavy', 'fire_team', ...(jam ? [{ template: 'patrol', route: jam }] : []), 'recon'], { spread: 18 });
    D.addGarrison(L.jammerCenter.pos, 40, ['assault'], { spread: 12, alert: true });
    D.addGarrison(L.commsGateSouth.pos, 80, ['fire_team', 'heavy', ...(comms ? [{ template: 'patrol', route: comms }] : []), 'recon'], { spread: 20 });
    D.addGarrison(L.detentionEntrance.pos, 35, ['patrol'], { spread: 8, alert: true });
    D.addGarrison(L.extractionApproach.pos, 70, ['patrol', 'heavy'], { spread: 16 });
  }
  setupInteractables() {
    const lv = this.level;
    lv.jammer.chargePoints.forEach((p, i) => this.addInteractable({ id: 'charge' + i, position: p, radius: 2.4, label: 'PLANT EXPLOSIVE CHARGE', holdTime: 3, condition: () => this.stage === 'jammer' && !this['charge' + i], onComplete: () => this.requestInteract('charge' + i) }));
    this.addInteractable({ id: 'terminal', position: lv.terminal.position, radius: 2.8, label: 'ACCESS COMMAND TERMINAL', holdTime: 2, condition: () => this.stage === 'comms', onComplete: () => this.requestInteract('terminal') });
    (lv.cells || []).forEach((c, i) => this.addInteractable({ id: 'cell' + i, position: c.consolePosition, radius: 2.6, label: 'RELEASE CAPTURED OPERATIVE', holdTime: 2.5, condition: () => !c.rescued && ['comms', 'download', 'extract_move', 'extract_hold', 'warden', 'board'].includes(this.stage), onComplete: () => this.requestInteract('cell' + i) }));
    this.addInteractable({ id: 'board', position: this.L.extractionCenter.pos, radius: 7, label: 'BOARD THE DROPSHIP', holdTime: 1.5, condition: () => this.stage === 'board' && this.dropship?.landed, onComplete: () => this.requestInteract('board') });
    for (const cache of (lv.supplyCaches || [])) { const used = new Set(); this.addInteractable({ id: 'cache' + (cache.collider?.id || Math.random()), position: cache.position, radius: 2.2, label: 'TAKE SUPPLIES', holdTime: 0.8, condition: (p) => !used.has(p.id), onComplete: (p) => { used.add(p.id); p.resupply(0.5); audio.play('pickup', { volume: 1 }); events.emit('toast', 'SUPPLY CACHE: AMMUNITION RESTOCKED', 'unlock'); if (cache.weapon) { if (save.unlockWeapon(cache.weapon)) events.emit('toast', `${cache.weapon.toUpperCase()} RECOVERED — AVAILABLE IN THE ARMOURY`, 'unlock'); p.pickupWeapon(cache.weapon); } } }); }
    // field weapon pickups: Hammer at the jammer outpost, Atlas at the comms base
    this.addInteractable({ id: 'pickup_hammer', position: this.L.jammerCenter.pos.clone().add(new THREE.Vector3(6, 0, 4)), radius: 2.2, label: 'TAKE HAMMER SHOTGUN', holdTime: 1, condition: (p) => !p.pickedHammer, onComplete: (p) => { p.pickedHammer = true; p.pickupWeapon('hammer'); if (save.unlockWeapon('hammer')) events.emit('toast', 'HAMMER SHOTGUN RECOVERED — UNLOCKED IN ARMOURY', 'unlock'); else events.emit('toast', 'HAMMER SHOTGUN EQUIPPED', 'info'); audio.play('weapon_pickup', { volume: 1 }); }, marker: '#ffb020' });
    this.addInteractable({ id: 'pickup_atlas', position: this.L.commsPlaza.pos.clone().add(new THREE.Vector3(-5, 0, 3)), radius: 2.2, label: 'TAKE ATLAS LMG', holdTime: 1, condition: (p) => !p.pickedAtlas, onComplete: (p) => { p.pickedAtlas = true; p.pickupWeapon('atlas'); if (save.unlockWeapon('atlas')) events.emit('toast', 'ATLAS LMG RECOVERED — UNLOCKED IN ARMOURY', 'unlock'); else events.emit('toast', 'ATLAS LMG EQUIPPED', 'info'); audio.play('weapon_pickup', { volume: 1 }); }, marker: '#ffb020' });
    for (const it of this.interactables.values()) if (it.marker) { it.position.y = this.world.groundHeight(it.position.x, it.position.z); this.fx.marker?.(it.position.clone().setY(it.position.y + 1.6), it.marker); }
  }
  addInteractable(it) { it.position = it.position.clone(); if (it.position.y === 0) it.position.y = this.world.groundHeight(it.position.x, it.position.z); this.interactables.set(it.id, it); return it; }
  removeInteractable(id) { this.interactables.delete(id); }
  requestInteract(id) { if (net.isHost) this.onInteractRequest({ target: id, phase: 'done' }, net.localId); else net.send(MSG.REQ_INTERACT, { target: id, phase: 'done' }, { reliable: true }); }
  onInteractRequest(m, from) {
    const id = m.target;
    if (id.startsWith('charge')) this.onChargePlanted(+id.slice(6));
    else if (id === 'terminal' && this.stage === 'comms') this.setStage('download');
    else if (id.startsWith('cell')) this.onRescued(+id.slice(4));
    else if (id === 'board' && this.stage === 'board') this.complete();
  }
  onChargePlanted(i, remote = false) {
    if (this['charge' + i]) return; this['charge' + i] = true; this.flags.chargesPlanted++;
    audio.play('terminal_interact', { pos: this.level.jammer.chargePoints[i], volume: 1 });
    if (net.isHost && !remote) net.send(MSG.EV_OBJECTIVE, { id: 'charge', data: { index: i } }, { reliable: true });
    if (this.flags.chargesPlanted >= 2) this.setStage('jammer_armed');
    else { this.setObjective(`PLANT EXPLOSIVES ON THE JAMMER (${this.flags.chargesPlanted}/2)`); events.emit('toast', 'CHARGE PLANTED', 'info'); }
  }
  onRescued(i, remote = false) {
    const c = this.level.cells?.[i]; if (!c || c.rescued) return; c.rescued = true; this.flags.rescued++;
    if (c.doorMesh) c.doorMesh.visible = false;
    audio.play('door_open', { pos: c.position, volume: 1 });
    if (net.isHost && !remote) net.send(MSG.EV_OBJECTIVE, { id: 'rescued', data: { index: i } }, { reliable: true });
    // spawn the operative (ally) who follows the player
    const D = this.game.director; if (D && net.isHost) { const u = D.spawn('rescued', c.position, { state: 'idle' }); if (u) { u.rescuedFollow = true; this.rescuedUnits.push(u); } }
    events.emit('toast', `OPERATIVE RECOVERED (${this.flags.rescued}/2)`, 'unlock');
    audio.say('ship_rescue', { priority: 2 });
    this.game.combat.stats.operativesRescued = (this.game.combat.stats.operativesRescued || 0) + 1;
    if (this.flags.rescued >= 2) events.emit('objective:banner', { title: 'SECONDARY OBJECTIVE COMPLETE', sub: 'Both operatives recovered' });
  }
  destroyJammer() {
    const j = this.level.jammer; const p = j.position.clone();
    this.fx.explosion(p.clone().setY(p.y + 4), 14, 'jammer');
    this.fx.smokeColumn?.(p.clone(), 5, 30);
    audio.play('jammer_explode', { pos: p, volume: 1, maxDistance: 600, refDistance: 50, important: true });
    events.emit('fx:flash', 0.8); events.emit('fx:shake', 1.4, p);
    if (j.hum) { j.hum.stop(0.5); }
    // topple the tower: remove colliders, animate group falling, hide emitters
    if (j.collider) this.world.removeCollider(j.collider);
    if (j.colliders) for (const c of j.colliders) this.world.removeCollider(c);
    for (const e of (j.emitters || [])) e.visible = false;
    const g = j.group; if (g) { const t0 = performance.now(); const dir = rand(0, Math.PI * 2); const anim = { update: () => { const k = clamp((performance.now() - t0) / 2500, 0, 1); const e = k * k; g.rotation.z = Math.cos(dir) * e * 1.4; g.rotation.x = Math.sin(dir) * e * 1.4; g.position.y = j.position.y - e * 6; if (k >= 1) { this.world.removeUpdatable(anim); this.fx.explosion(p.clone(), 8, 'large'); this.fx.smokeColumn?.(p.clone(), 3, 20); events.emit('fx:shake', 1, p); } } }; this.world.addUpdatable(anim); }
    if (net.isHost) this.game.combat.explode(p.clone(), 16, 700, { kind: 'jammer', attackerId: 0, impulse: 30, friendly: true, selfMult: 1 });
    audio.say('voss_jammer_destroyed', { priority: 3, delay: 2.5 });
    this.setStage('orbital');
  }
  onEnemyDied(e) {}
  // ---------- player death / reinforcements ----------
  onPlayerDied(p) {
    if (!this.active) return;
    if (p !== this.game.localPlayer) return;
    this.game.combat.stats.deaths = (this.game.combat.stats.deaths || 0) + 1;
    audio.say('voss_death', { priority: 2, delay: 1.5 });
    audio.setMuffle?.(0.6);
    if (net.isHost) setTimeout(() => this.reinforce(p), 3800);
    else net.send(MSG.EV_PLAYERDOWN, { p: v3(p.position) }, { reliable: true });
  }
  /** Host: a squadmate died; spend a shared reinforcement and send them a pod. */
  onRemotePlayerDied(m, from) {
    if (!this.active) return;
    setTimeout(() => {
      if (!this.active) return;
      if (this.lives <= 0) { this.checkSquadWipe(); return; }
      this.lives--; this.reinforcementsUsed++; events.emit('lives:changed', this.lives);
      const spot = this.pickReinforceSpot(new THREE.Vector3(...m.p));
      net.send(MSG.EV_REINFORCE, { id: from, p: v3(spot), lives: this.lives }, { reliable: true });
      events.emit('toast', 'SQUADMATE REINFORCED — SHARED POOL ' + this.lives, 'info');
    }, 3800);
  }
  checkSquadWipe() { const alive = (this.game.players || []).some(p => !p.dead); if (!alive && this.lives <= 0) this.fail(); }
  pickReinforceSpot(base) {
    let best = base.clone(), bs = -Infinity;
    for (let i = 0; i < 14; i++) { const a = rand(0, 6.28), r = rand(6, 16); const cand = this.world.nav.randomWalkableNear(base.x + Math.cos(a) * r, base.z + Math.sin(a) * r, 4); if (!cand) continue; const pos = new THREE.Vector3(cand.x, 0, cand.z); let minE = 99; for (const e of this.game.director.enemies) if (!e.dead) minE = Math.min(minE, e.position.distanceTo(pos)); const score = Math.min(minE, 30) - Math.abs(r - 10) * 0.3; if (score > bs) { bs = score; best = pos; } }
    best.y = this.world.groundHeight(best.x, best.z); return best;
  }
  reinforce(p) {
    if (!this.active) return;
    if (this.lives <= 0) { if (net.peers.size || net.transport?.peerCount) { this.checkSquadWipe(); events.emit('toast', 'NO REINFORCEMENTS LEFT — SPECTATING', 'warn'); return; } this.fail(); return; }
    this.lives--; this.reinforcementsUsed++;
    events.emit('lives:changed', this.lives);
    if (this.lives === 0) audio.say('ship_last_life', { priority: 2, delay: 5 });
    else audio.say(pick(['ship_welcome', 'ship_waiver', 'ship_continuity']), { priority: 2, delay: 4 });
    const best = this.pickReinforceSpot(p.position);
    if (net.transport?.peerCount) net.send(MSG.EV_REINFORCE, { id: net.localId, p: v3(best), lives: this.lives }, { reliable: true });
    audio.setMuffle?.(0);
    this.game.launchPlayerPod(p, best);
  }
  fail() {
    if (!this.active) return; this.active = false; this.setStage('failed');
    audio.say('voss_failed', { priority: 3 });
    audio.setMusicState('failed');
    this.result = this.buildResults(false);
    save.recordMissionResult('silent_meridian', this.result); save.addRecord({ missionsFailed: 1 }); save.clearCheckpoint();
    setTimeout(() => events.emit('mission:end', this.result), 4000);
  }
  complete() {
    if (!this.active) return; this.active = false; this.setStage('complete');
    audio.say('voss_complete', { priority: 3 }); audio.say('ship_results', { priority: 2, delay: 8 });
    this.dropship?.takeOff();
    this.result = this.buildResults(true);
    save.recordMissionResult('silent_meridian', this.result); save.addRecord({ missionsCompleted: 1, coopMissions: net.isMultiplayer ? 1 : 0 }); save.addRewards(this.result); save.clearCheckpoint();
    events.emit('mission:extracting');
    setTimeout(() => events.emit('mission:end', this.result), 6500);
  }
  buildResults(success) {
    const s = this.game.combat.stats; const diff = this.game.difficulty;
    const accuracy = s.shotsFired ? clamp(s.shotsHit / s.shotsFired, 0, 1) : 0;
    let stars = 0; if (success) { stars = 2; if (this.flags.rescued >= 2) stars++; if (this.reinforcementsUsed <= 1) stars++; if (accuracy > 0.5 && this.time < 15 * 60) stars++; } else stars = this.flags.jammer ? 1 : 0;
    const xp = Math.round((success ? 1200 : 300) * (diff?.xp || 1) + s.kills * 6 + s.headshots * 4 + this.flags.rescued * 150 + (this.flags.jammer ? 200 : 0) + (this.flags.data ? 250 : 0));
    const requisition = Math.round((success ? 500 : 80) * (diff?.xp || 1) + s.kills * 2 + this.flags.rescued * 60);
    const intel = (this.flags.data ? 2 : 0) + this.flags.rescued;
    save.addRecord({ kills: s.kills, headshots: s.headshots, shotsFired: s.shotsFired, shotsHit: s.shotsHit, deaths: s.deaths || 0, grenadesThrown: s.grenadesThrown, orbitalStrikes: s.orbitalStrikes, operativesRescued: this.flags.rescued, wardensKilled: s.wardensKilled || 0, dronesDestroyed: s.dronesDestroyed, timePlayed: Math.round(this.time), damageDealt: Math.round(s.damageDealt), limbsRemoved: s.limbsRemoved });
    save.setRecordMax('longestKillStreak', s.bestStreak);
    return { success, time: Math.round(this.time), accuracy, kills: s.kills, headshots: s.headshots, reinforcementsUsed: this.reinforcementsUsed, xp, requisition, intel, stars, objectives: { jammer: this.flags.jammer, data: this.flags.data, rescued: this.flags.rescued, rescuedTotal: 2 }, coop: net.isMultiplayer, isHost: net.isHost };
  }
  checkpoint(stage) {
    if (!net.isHost) return;
    const p = this.game.localPlayer;
    save.setCheckpoint({ stage, time: this.time, lives: this.lives, reinforcementsUsed: this.reinforcementsUsed, flags: { ...this.flags }, position: p ? [p.position.x, p.position.y, p.position.z] : null, loadout: save.profile.loadout, difficulty: this.game.difficulty?.id, stats: { ...this.game.combat.stats }, savedAt: Date.now() });
    events.emit('toast', 'CHECKPOINT REACHED', 'info');
    audio.play('checkpoint', { volume: 0.7 });
  }
  /** Restore from a checkpoint object (after the world has been rebuilt). */
  restore(cp) {
    this.time = cp.time || 0; this.lives = cp.lives ?? this.lives; this.reinforcementsUsed = cp.reinforcementsUsed || 0; Object.assign(this.flags, cp.flags || {});
    Object.assign(this.game.combat.stats, cp.stats || {});
    if (this.flags.jammer) { const j = this.level.jammer; if (j.group) j.group.visible = false; if (j.collider) this.world.removeCollider(j.collider); this.game.abilities.unlock(); }
    for (const c of (this.level.cells || [])) { /* rescued state not restored: operatives left the field */ }
    this.charge0 = this.charge1 = this.flags.chargesPlanted >= 2;
    const stage = cp.stage;
    this.stage = null; this.setStage(stage);
    if (stage === 'extract_hold') { this.holdTimer = 90; }
  }
  // ---------- per-frame ----------
  update(dt) {
    if (!this.active) { this.dropship?.update(dt); return; }
    this.time += dt; this.stageT += dt;
    this.updateInteract(dt);
    this.dropship?.update(dt);
    const p = this.game.localPlayer; const D = this.game.director;
    if (net.isHost) {
      // stage triggers
      if (this.stage === 'canyon' && this.anyPlayerNear(this.L.jammerGateSouth.pos, 34)) this.setStage('jammer');
      if (this.stage === 'jammer_armed') { this.jammerCountdown -= dt; const s = Math.ceil(this.jammerCountdown); if (s !== this._lastCd) { this._lastCd = s; if (s <= 5 && s > 0) audio.play('countdown_tick', { volume: 0.8 }); this.setObjective(`GET CLEAR — DETONATION IN ${Math.max(0, s)}s`); } if (this.jammerCountdown <= 0) this.destroyJammer(); }
      if (this.stage === 'orbital' && this.anyPlayerNear(this.L.commsGateSouth.pos, 40)) this.setStage('comms');
      if (this.stage === 'download') {
        this.downloadT += dt; const pct = clamp(this.downloadT / 60, 0, 1);
        if (Math.floor(pct * 100) !== this._lastPct) { this._lastPct = Math.floor(pct * 100); this.setObjective(`DEFEND THE TERMINAL — DOWNLOAD ${this._lastPct}%`); if (this._lastPct % 10 === 0) audio.play('download_beep', { volume: 0.5 }); }
        this.waveT -= dt;
        if (this.waveT <= 0) { this.waveT = 16; const pts = this.level.spawnPoints?.comms || [this.L.commsGateSouth.pos]; D.wave([pick(['assault', 'fire_team']), pick(['patrol', 'heavy'])], pts, { allowElite: true }); events.emit('toast', 'NULL LEGION REINFORCEMENTS INBOUND', 'warn'); }
        if (pct >= 1) this.setStage('extract_move');
      }
      if (this.stage === 'extract_move' && this.anyPlayerNear(this.L.extractionCenter.pos, 18)) this.setStage('extract_hold');
      if (this.stage === 'extract_hold') {
        this.holdTimer -= dt; const s = Math.ceil(this.holdTimer);
        if (s !== this._lastHold) { this._lastHold = s; this.setObjective(`HOLD THE PLATFORM — ${Math.max(0, s)}s`); if (s <= 10 && s > 0) audio.play('countdown_tick', { volume: 0.7 }); if (s === 45) audio.say('ship_extraction_request', { priority: 1 }); }
        this.waveT -= dt;
        if (this.waveT <= 0) { this.waveT = 14; const pts = this.level.spawnPoints?.extraction || [this.L.extractionApproach.pos]; const shuffled = [...pts].sort(() => Math.random() - 0.5); D.wave([pick(['assault', 'fire_team', 'patrol_heavy']), pick(['patrol', 'heavy', 'assault'])], shuffled, { allowElite: true }); if (Math.random() < 0.5) D.wave(['recon'], shuffled, { delay: 3 }); }
        if (this.holdTimer <= 45 && !this.wardenSpawned) { this.wardenSpawned = true; const sp = this.L.extractionApproach.pos; D.spawn('warden', sp, { yaw: 0 }); audio.play('warden_roar', { pos: sp, volume: 1, maxDistance: 400 }); events.emit('toast', 'WARDEN SIGNATURE DETECTED', 'warn'); }
        if (this.holdTimer <= 0) { if (this.flags.wardenDead || !D.boss || D.boss.dead) this.setStage('board'); else this.setStage('warden'); }
      }
      if (this.stage === 'warden') { this.waveT -= dt; if (this.waveT <= 0) { this.waveT = 22; const pts = this.level.spawnPoints?.extraction || [this.L.extractionApproach.pos]; D.wave([pick(['patrol', 'assault'])], pts); } }
      // periodic progress sync for clients
      this.syncT = (this.syncT || 0) - dt; if (this.syncT <= 0 && net.peers.size) { this.syncT = 1; net.send(MSG.EV_OBJECTIVE, { id: 'progress', data: { download: this.downloadT, hold: this.holdTimer, jammer: this.jammerCountdown, lives: this.lives } }, { reliable: false }); }
    }
    // music & ambience by alert
    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = 1.5;
      if (!['extract_hold', 'warden', 'board', 'download', 'complete', 'failed'].includes(this.stage)) { const lvl = D.alertLevel; audio.setMusicState(lvl >= 2 ? 'combat' : lvl >= 0.8 ? 'alert' : 'explore'); }
      else if (this.stage === 'download') audio.setMusicState('combat');
      if (p) { const nearBase = p.position.distanceTo(this.L.commsPlaza.pos) < 70 || p.position.distanceTo(this.L.jammerCenter.pos) < 55; audio.setAmbience(nearBase ? { ambience_base: 0.9, ambience_wind: 0.35 } : { ambience_wind: 0.8, ambience_alien: 0.45 }); }
    }
    // low health warning line
    if (p && p.health < 30 && !p.dead && !this._lowSaid) { this._lowSaid = true; audio.say('ship_low_health', { priority: 1 }); setTimeout(() => this._lowSaid = false, 40000); }
  }
  anyPlayerNear(pos, r) { for (const p of this.game.players || []) if (!p.dead && p.position.distanceTo(pos) < r) return true; return false; }
  updateInteract(dt) {
    const p = this.game.localPlayer; if (!p || p.dead) { events.emit('hud:interact', null); return; }
    let best = null, bd = Infinity;
    for (const it of this.interactables.values()) { const d = it.position.distanceTo(p.position); if (d < it.radius && d < bd && (!it.condition || it.condition(p))) { bd = d; best = it; } }
    if (best !== this.currentInteract) { this.currentInteract = best; this.interactHold = 0; }
    if (!best) { events.emit('hud:interact', null); return; }
    const holding = input.down('interact') && p.state !== 'roll' && p.state !== 'vault';
    if (holding) { this.interactHold += dt; p.interacting = true; if (!this._interactSound) { this._interactSound = audio.play('terminal_interact', { volume: 0.5 }); } }
    else { this.interactHold = Math.max(0, this.interactHold - dt * 2); p.interacting = false; this._interactSound = null; }
    const prog = clamp(this.interactHold / best.holdTime, 0, 1);
    events.emit('hud:interact', { text: best.label, progress: prog, key: 'E' });
    if (prog >= 1) { this.interactHold = 0; p.interacting = false; best.onComplete?.(p); if (best.once !== false && !best.condition) this.interactables.delete(best.id); this.currentInteract = null; audio.play('objective_complete', { volume: 0.6 }); }
  }
}
