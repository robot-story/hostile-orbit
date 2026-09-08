// Network layer facade. Single player = host with zero peers. Transport (WebRTC via PeerJS) plugs in later via setTransport().
import { EventBus } from '../core/events.js';
import { MSG } from './protocol.js';

class Net {
  constructor() {
    this.isHost = true;
    this.localId = 1;        // player id (host is 1)
    this.slot = 0;
    this.peers = new Map();  // playerId -> {conn, name, slot}
    this.bus = new EventBus();
    this.transport = null;
    this.connected = true;
    this.roomCode = null;
    this.stats = { sent: 0, recv: 0, bytes: 0 };
  }
  get playerCount() { return 1 + this.peers.size; }
  get isMultiplayer() { return this.peers.size > 0 || !this.isHost; }
  on(type, fn) { return this.bus.on(type, fn); }
  off(type, fn) { this.bus.off(type, fn); }
  /** Deliver a message locally (as if received). */
  dispatch(type, payload, from = this.localId) { this.stats.recv++; this.bus.emit(type, payload, from); }
  /**
   * Send to peers. Host: to all clients (or a specific `to`). Client: to host.
   * Messages are also NOT locally dispatched; callers apply local effects themselves (host authoritative).
   */
  send(type, payload, opts = {}) {
    if (!this.transport) return;
    this.stats.sent++;
    this.transport.send(type, payload, opts);
  }
  /** Convenience: host broadcasts an event and applies it locally via dispatch. */
  broadcast(type, payload) { this.send(type, payload, { reliable: !type.startsWith('snap:') }); this.dispatch(type, payload); }
  /** Client requests, host applies directly. */
  request(type, payload) { if (this.isHost) this.dispatch(type, payload, this.localId); else this.send(type, payload, { reliable: true }); }
  setTransport(t) { this.transport = t; }
  reset() { this.isHost = true; this.localId = 1; this.slot = 0; this.peers.clear(); this.transport?.close?.(); this.transport = null; this.connected = true; this.roomCode = null; }
}
export const net = new Net();
export { MSG };
