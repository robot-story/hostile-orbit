// The session host can provide a WebSocket relay when direct WebRTC is unavailable.
class Emitter {
  constructor() { this.handlers = new Map(); }
  on(type, fn) { const list = this.handlers.get(type) || []; list.push(fn); this.handlers.set(type, list); return this; }
  emit(type, data) { for (const fn of this.handlers.get(type) || []) fn(data); }
}
class Connection extends Emitter {
  constructor(peer, id) { super(); this.owner = peer; this.id = id; this.open = false; }
  get dataChannel() { return this.owner.socket; }
  send(data) { if (this.open) this.owner.send({ type: 'data', connection: this.id, data }); }
  close() { this.owner.send({ type: 'close', connection: this.id }); this.finish(); }
  finish() { this.open = false; this.owner.connections.delete(this.id); this.emit('close'); }
}
export class RelayPeer extends Emitter {
  constructor(id) {
    super(); this.connections = new Map(); this.destroyed = false;
    this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/game-peer`);
    this.socket.onopen = () => this.send({ type: 'register', id });
    this.socket.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'registered') { this.id = m.id; this.emit('open', m.id); }
      else if (m.type === 'error') this.emit('error', { type: m.code, message: m.message });
      else if (m.type === 'incoming') {
        const c = new Connection(this, m.connection); this.connections.set(c.id, c); c.open = true;
        this.emit('connection', c); c.emit('open'); this.send({ type: 'accept', connection: c.id });
      } else if (m.type === 'opened') { const c = this.connections.get(m.connection); if (c) { c.open = true; c.emit('open'); } }
      else if (m.type === 'data') this.connections.get(m.connection)?.emit('data', m.data);
      else if (m.type === 'closed') this.connections.get(m.connection)?.finish();
    };
    this.socket.onerror = () => this.emit('error', { message: 'Online host could not be reached. Keep its hosting process running.' });
    this.socket.onclose = () => { for (const c of [...this.connections.values()]) c.finish(); if (!this.destroyed) this.emit('disconnected'); };
  }
  send(m) { if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(m)); }
  connect(target) {
    const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
    const c = new Connection(this, id); this.connections.set(id, c); this.send({ type: 'connect', target, connection: id }); return c;
  }
  reconnect() { /* Return to the lobby to reconnect after losing the session host. */ }
  destroy() { this.destroyed = true; this.socket.close(); for (const c of [...this.connections.values()]) c.finish(); }
}
let probe;
export function findRelayServer() {
  return probe ||= fetch(new URL('relay-info.json', location.href), { signal: AbortSignal.timeout(2500) })
    .then(r => r.ok ? r.json() : null).then(v => v?.transport === 'hostile-orbit-relay' ? v : null).catch(() => null);
}
