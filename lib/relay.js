// Room connections through Ably (https://ably.com), a hosted realtime relay.
// Everything travels over HTTPS on port 443 (WebSocket, falling back to plain
// HTTP polling), so it works on school and office networks that block WebRTC.
//
// Each room uses two channels:
//   bitbench:CODE     the host publishes state and chat to everyone (optionally to one player)
//   bitbench:CODE:up  players publish to the host; presence here says who is in the room
// Tokens come from /api/ably-token and are tied to a random clientId, so the
// clientId on every message is verified by Ably and can't be faked.

const ENDPOINT = process.env.NEXT_PUBLIC_ABLY_ENDPOINT || undefined; // only for testing against Ably's sandbox
const down = (code) => `bitbench:${code}`;
const up = (code) => `bitbench:${code}:up`;
const uid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);

export class RelayError extends Error {
  constructor(type, message) {
    super(message || type);
    this.type = type; // 'not-configured' | 'network' | 'lost'
  }
}

// Connects and resolves once Ably says we're connected.
async function connect() {
  // The modular build with just the pieces we use. (Needs the modern browserslist in
  // package.json: compiling Ably for older browsers breaks its ErrorInfo class.)
  const { BaseRealtime, WebSocketTransport, XHRPolling, FetchRequest, RealtimePresence } = await import('ably/modular');
  const clientId = uid();
  let authError = null;
  const rt = new BaseRealtime({
    plugins: { WebSocketTransport, XHRPolling, FetchRequest, RealtimePresence },
    clientId,
    endpoint: ENDPOINT,
    echoMessages: false,
    authCallback: async (_params, cb) => {
      try {
        const res = await fetch(`/api/ably-token?clientId=${clientId}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          authError = new RelayError(res.status === 503 ? 'not-configured' : 'network', body.error);
          throw authError;
        }
        cb(null, body);
      } catch (err) {
        cb(String(err.message || err), null);
      }
    },
  });
  await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (change) => {
      if (settled) return;
      settled = true;
      rt.connection.off(onChange);
      rt.close();
      reject(authError || new RelayError('network', change?.reason?.message));
    };
    const onChange = (change) => {
      if (settled) return;
      if (change.current === 'connected') { settled = true; rt.connection.off(onChange); resolve(); }
      else if (change.current === 'failed' || change.current === 'suspended') fail(change);
    };
    rt.connection.on(onChange);
    // 'disconnected' retries on its own; give up if nothing works within 20s.
    setTimeout(() => rt.connection.state !== 'connected' && fail(), 20_000);
  });
  return rt;
}

// Calls onLost if the connection to Ably is gone for good (offline for ~2 minutes, or failed).
function watchLost(rt, onLost) {
  rt.connection.on((change) => {
    if (change.current === 'suspended' || change.current === 'failed') onLost(new RelayError('lost'));
  });
}

const findHost = async (channel) => (await channel.presence.get()).find((m) => m.data?.role === 'host');

// One player as the host sees them. Looks like a PeerJS DataConnection so
// HostGame doesn't care how players are connected.
class PlayerConn {
  constructor(room, id) {
    this.room = room;
    this.peer = id;
    this.open = true;
    this.handlers = {};
  }
  on(event, fn) { (this.handlers[event] ||= []).push(fn); }
  emit(event, arg) { for (const fn of this.handlers[event] || []) fn(arg); }
  send(msg) { if (this.open) this.room.publish(msg, this.peer); }
  close() {
    if (!this.open) return;
    this.room.publish({ type: 'bye' }, this.peer);
    this.drop();
  }
  drop() {
    if (!this.open) return;
    this.open = false;
    this.room.conns.delete(this.peer);
    this.emit('close');
  }
}

class HostRoom {
  constructor(rt, code) {
    this.rt = rt;
    this.code = code;
    this.id = rt.auth.clientId;
    this.down = rt.channels.get(down(code));
    this.up = rt.channels.get(up(code));
    this.conns = new Map();
  }

  // onConn(conn) fires when a new player says hello; onLost if the host's own connection dies.
  async listen(onConn, onLost) {
    await this.up.subscribe('msg', (m) => {
      if (!m.clientId || m.clientId === this.id) return;
      let conn = this.conns.get(m.clientId);
      if (!conn) {
        if (m.data?.type !== 'hello') return;
        conn = new PlayerConn(this, m.clientId);
        this.conns.set(m.clientId, conn);
        onConn(conn);
      }
      conn.emit('data', m.data);
    });
    await this.up.presence.subscribe('leave', (m) => this.conns.get(m.clientId)?.drop());
    watchLost(this.rt, onLost);
  }

  // to: one player's id, or nothing for everyone.
  publish(msg, to) {
    this.down.publish('msg', to ? { to, msg } : { msg }).catch(() => { /* connection gone; watchLost reports it */ });
  }

  close() { this.rt.close(); }
}

// Opens a room with a fresh code. makeCode() is retried if the code is in use.
export async function hostRoom(makeCode) {
  const rt = await connect();
  try {
    for (let i = 0; i < 5; i++) {
      const code = makeCode();
      const channel = rt.channels.get(up(code));
      if (await findHost(channel)) continue;
      await channel.presence.enter({ role: 'host' });
      return new HostRoom(rt, code);
    }
    throw new RelayError('network', 'Could not find a free room code.');
  } catch (err) {
    rt.close();
    throw err;
  }
}

// Joins a room. Resolves to null if no host is in it. onMessage gets messages
// from the host meant for everyone or for this player; onClose(err) fires if
// the host leaves or the connection is lost.
export async function joinRoom(code, { onMessage, onClose }) {
  const rt = await connect();
  try {
    const upCh = rt.channels.get(up(code));
    const host = await findHost(upCh);
    if (!host) { rt.close(); return null; }
    const id = rt.auth.clientId;
    await rt.channels.get(down(code)).subscribe('msg', (m) => {
      const d = m.data;
      if (m.clientId === host.clientId && d && (!d.to || d.to === id)) onMessage(d.msg);
    });
    await upCh.presence.subscribe('leave', (m) => { if (m.clientId === host.clientId) onClose(new RelayError('host-left')); });
    await upCh.presence.enter({ role: 'player' });
    watchLost(rt, onClose);
    return {
      id,
      send: (msg) => upCh.publish('msg', msg).catch(() => {}),
      close: () => rt.close(),
    };
  } catch (err) {
    rt.close();
    throw err instanceof RelayError ? err : new RelayError('network', err?.message);
  }
}
