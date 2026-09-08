// WebRTC transport via PeerJS public signalling. Host owns the lobby; clients connect by room code / invite link.
import Peer from 'peerjs';
import { net } from './net.js';
import { MSG, MAX_PLAYERS, PROTOCOL_VERSION, SQUAD_COLORS, SQUAD_NAMES } from './protocol.js';
import { events } from '../core/events.js';

const ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
] };
const PREFIX = 'hostile-orbit-v3-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return s; }
export function inviteLink(code) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('join', code); return u.toString(); }

/** Lobby + connection manager. One instance per session. */
export class Transport {
  constructor() {
    this.peer = null; this.conns = new Map(); // playerId -> DataConnection (host) ; client: single conn in this.hostConn
    this.hostConn = null;
    this.code = null; this.link = null; this.isHost = false; this.connected = false; this.error = null;
    this.players = []; // lobby roster
    this.settings = { difficulty: 'veteran', dropZone: 'main' };
    this.phase = 'lobby'; // lobby | mission | results
    this.localName = 'Vanguard'; this.localLoadout = null;
    this.nextId = 2;
    this._pending = new Map(); // conn -> temp until hello
  }
  // ---------- lifecycle ----------
  async host(name, loadout) {
    this.close();
    this.localName = name; this.localLoadout = loadout; this.isHost = true;
    this.code = makeCode(); this.link = inviteLink(this.code);
    await this._openPeer(PREFIX + this.code);
    net.isHost = true; net.localId = 1; net.slot = 0; net.roomCode = this.code; net.setTransport(this);
    this.players = [{ id: 1, slot: 0, name, ready: false, loadout, connected: true, isHost: true }];
    this.connected = true;
    this.peer.on('connection', (conn) => this._onIncoming(conn));
    this._emitLobby();
    return { code: this.code, link: this.link };
  }
  async join(code, name, loadout) {
    this.close();
    code = (code || '').trim().toUpperCase();
    if (code.length !== 6) throw new Error('Enter the 6-character room code');
    this.localName = name; this.localLoadout = loadout; this.isHost = false; this.code = code; this.link = inviteLink(code);
    await this._openPeer();
    net.isHost = false; net.setTransport(this); net.roomCode = code;
    await new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { name } });
      const timer = setTimeout(() => { if (!this.connected) { reject(new Error('Could not reach the host. Check the code and that the host is still in the lobby.')); conn.close(); } }, 15000);
      conn.on('open', () => { this.hostConn = conn; conn.send({ t: MSG.HELLO, p: { name, version: PROTOCOL_VERSION, loadout } }); });
      conn.on('data', (msg) => { if (msg?.t === MSG.WELCOME) { clearTimeout(timer); this._onWelcome(msg.p); resolve(); } else this._recv(msg, 1); });
      conn.on('close', () => { this.connected = false; this.error = 'Disconnected from host'; events.emit('lobby:update', this.state()); events.emit('mp:disconnected'); });
      conn.on('error', (e) => { clearTimeout(timer); this.error = String(e?.message || e); reject(new Error(this.error)); });
    });
    return { code: this.code, link: this.link };
  }
  _openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id, { config: ICE, debug: 0 }) : new Peer({ config: ICE, debug: 0 });
      this.peer = peer;
      const timer = setTimeout(() => reject(new Error('Signalling server timeout')), 15000);
      peer.on('open', () => { clearTimeout(timer); resolve(); });
      peer.on('error', (e) => { clearTimeout(timer); this.error = e?.type === 'unavailable-id' ? 'Room code already in use, try again' : (e?.type === 'peer-unavailable' ? 'No lobby with that code' : String(e?.message || e?.type || e)); events.emit('mp:error', this.error); reject(new Error(this.error)); });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
    });
  }
  close() {
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear(); this.hostConn = null;
    if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } this.peer = null; }
    this.connected = false; this.players = []; this.code = null; this.link = null; this.error = null; this.phase = 'lobby';
    net.reset();
  }
  // ---------- host side ----------
  _onIncoming(conn) {
    conn.on('data', (msg) => {
      if (msg?.t === MSG.HELLO) {
        if (this.players.filter(p => p.connected).length >= MAX_PLAYERS) { conn.send({ t: MSG.CHAT, p: { text: 'LOBBY FULL' } }); setTimeout(() => conn.close(), 300); return; }
        if (msg.p.version !== PROTOCOL_VERSION) { conn.send({ t: MSG.CHAT, p: { text: 'VERSION MISMATCH' } }); setTimeout(() => conn.close(), 300); return; }
        // reconnect: reuse the slot of a disconnected player with the same name
        let rec = this.players.find(p => !p.connected && p.name === msg.p.name);
        const id = rec ? rec.id : this.nextId++;
        const slot = rec ? rec.slot : [0, 1, 2].find(s => !this.players.some(p => p.slot === s && p.connected));
        if (rec) { rec.connected = true; rec.loadout = msg.p.loadout || rec.loadout; } else { this.players = this.players.filter(p => p.connected); this.players.push({ id, slot, name: msg.p.name || SQUAD_NAMES[slot], ready: false, loadout: msg.p.loadout, connected: true, isHost: false }); }
        conn.playerId = id; this.conns.set(id, conn);
        conn.send({ t: MSG.WELCOME, p: { id, slot, players: this.players, settings: this.settings, phase: this.phase } });
        this._emitLobby();
        events.emit('mp:joined', id);
        return;
      }
      if (conn.playerId) this._recv(msg, conn.playerId);
    });
    conn.on('close', () => { const id = conn.playerId; if (!id) return; this.conns.delete(id); const p = this.players.find(x => x.id === id); if (p) { p.connected = false; p.ready = false; } this._emitLobby(); events.emit('mp:left', id); });
    conn.on('error', () => {});
  }
  // ---------- client side ----------
  _onWelcome(p) {
    net.localId = p.id; net.slot = p.slot; this.players = p.players; this.settings = p.settings; this.phase = p.phase; this.connected = true; this.error = null;
    this._emitLobby();
  }
  // ---------- messaging ----------
  _recv(msg, from) {
    if (!msg || !msg.t) return;
    net.stats.recv++;
    if (msg.t === MSG.LOBBY) { this.players = msg.p.players; this.settings = msg.p.settings; this.phase = msg.p.phase; this._emitLobby(); return; }
    if (msg.t === MSG.READY && this.isHost) { const pl = this.players.find(x => x.id === from); if (pl) { pl.ready = !!msg.p.ready; if (msg.p.loadout) pl.loadout = msg.p.loadout; } this._emitLobby(); return; }
    if (this.isHost && !msg.t.startsWith('req:') && msg.t !== MSG.SNAP_PLAYER && msg.t !== MSG.CHAT && msg.t !== MSG.EV_PLAYERDOWN) return; // clients may not send events
    // relay player snapshots to other clients (host)
    if (this.isHost && msg.t === MSG.SNAP_PLAYER) { for (const [id, c] of this.conns) if (id !== from) this._raw(c, msg); }
    net.dispatch(msg.t, msg.p, from);
  }
  _raw(conn, msg) { try { if (conn.open) conn.send(msg); } catch { /* ignore */ } }
  send(type, payload, opts = {}) {
    const msg = { t: type, p: payload };
    if (this.isHost) { if (opts.to) { const c = this.conns.get(opts.to); if (c) this._raw(c, msg); } else for (const c of this.conns.values()) this._raw(c, msg); }
    else if (this.hostConn) this._raw(this.hostConn, msg);
  }
  // ---------- lobby ops ----------
  setReady(ready, loadout) {
    if (this.isHost) { const me = this.players.find(p => p.id === 1); if (me) { me.ready = ready; if (loadout) me.loadout = loadout; } this._emitLobby(); }
    else this.send(MSG.READY, { ready, loadout });
  }
  setLoadout(loadout) { this.localLoadout = loadout; if (this.isHost) { const me = this.players.find(p => p.id === 1); if (me) me.loadout = loadout; this._emitLobby(); } else this.send(MSG.READY, { ready: this.players.find(p => p.id === net.localId)?.ready || false, loadout }); }
  setSettings(s) { if (!this.isHost) return; Object.assign(this.settings, s); this._emitLobby(); }
  setPhase(p) { this.phase = p; if (this.isHost) this._emitLobby(); }
  _emitLobby() { if (this.isHost) this.send(MSG.LOBBY, { players: this.players, settings: this.settings, phase: this.phase }); events.emit('lobby:update', this.state()); }
  state() {
    return { players: this.players.map(p => ({ ...p, isLocal: p.id === net.localId, color: SQUAD_COLORS[p.slot] || SQUAD_COLORS[0] })), settings: this.settings, code: this.code, link: this.link, connected: this.connected, isHost: this.isHost, error: this.error, phase: this.phase };
  }
  get peerCount() { return this.isHost ? this.conns.size : (this.connected ? 1 : 0); }
}
