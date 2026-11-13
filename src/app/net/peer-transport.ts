import Peer, { type DataConnection } from 'peerjs';
import { TransportError, type Bytes, type Endpoint, type EndpointStatus, type Link, type Network } from './transport';

/**
 * PeerJS transport. PeerJS's public broker only introduces the two phones; the data then flows
 * directly between them (or through PeerJS's shared relay when a network blocks that), and
 * every message is encrypted again by the sync layer, so the broker and relay see only noise.
 */
/** Switch on by saving `shesha.debug` in local storage; prints what the connection layer is doing. */
const debug = (...args: unknown[]) => {
  try { if (typeof localStorage !== "undefined" && localStorage.getItem("shesha.debug")) console.log("[shesha-net]", ...args); } catch { /* ignore */ }
};

const toBytes = (data: unknown): Bytes | null => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
};

class PeerLink implements Link {
  private msg?: (d: Bytes) => void;
  private closeCb?: () => void;
  private queue: Bytes[] = [];
  private closed = false;

  constructor(private conn: DataConnection, readonly initiator: boolean) {
    conn.on("data", raw => {
      const data = toBytes(raw);
      if (data === null) return;
      if (this.msg) this.msg(data); else this.queue.push(data);
    });
    const done = (why: string) => (err?: unknown) => {
      if (this.closed) return;
      debug("link ended:", why, initiator ? "(we dialled)" : "(they dialled)", err ? String(err) : "");
      this.closed = true;
      this.closeCb?.();
    };
    conn.on("close", done("close"));
    conn.on("error", done("error"));
  }

  get remoteId() { return this.conn.peer; }
  get open() { return !this.closed && this.conn.open; }

  send(data: Bytes) {
    if (!this.open) return;
    if (typeof data === "string") this.conn.send(data);
    else this.conn.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }

  onMessage(cb: (d: Bytes) => void) { this.msg = cb; this.queue.splice(0).forEach(cb); }
  onClose(cb: () => void) { this.closeCb = cb; if (this.closed) cb(); }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.conn.close(); } catch { /* already gone */ }
    this.closeCb?.();
  }
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

class PeerEndpoint implements Endpoint {
  private incoming?: (link: Link) => void;
  private status?: (s: EndpointStatus) => void;
  private closed = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private peer: Peer, readonly id: string) {
    peer.on("connection", conn => {
      // A caller that never finishes connecting is dropped
      const giveUp = setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 20_000);
      conn.on("open", () => { clearTimeout(giveUp); this.incoming?.(new PeerLink(conn, false)); });
      conn.on("error", () => clearTimeout(giveUp));
      conn.on("close", () => clearTimeout(giveUp));
    });
    peer.on("disconnected", () => {
      if (this.closed) return;
      this.status?.("lost");
      this.scheduleReconnect();
    });
    peer.on("open", () => { this.attempt = 0; this.status?.("open"); });
    peer.on("close", () => { this.closed = true; this.status?.("closed"); });
    peer.on("error", err => {
      if (this.closed) return;
      const type = (err as { type?: string }).type;
      debug("broker error:", type, String(err));
      if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
        this.status?.("lost");
        this.scheduleReconnect();
      } else if (type === "unavailable-id") {
        this.close();
      }
    });
  }

  private scheduleReconnect() {
    if (this.closed || this.timer) return;
    const delay = RECONNECT_DELAYS[Math.min(this.attempt++, RECONNECT_DELAYS.length - 1)];
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.closed || this.peer.destroyed) return;
      if (this.peer.disconnected) { try { this.peer.reconnect(); } catch { this.scheduleReconnect(); } }
    }, delay);
  }

  dial(remoteId: string, timeoutMs = 20_000): Promise<Link> {
    return new Promise((resolve, reject) => {
      if (this.closed || this.peer.destroyed) return reject(new TransportError("closed"));
      if (this.peer.disconnected) return reject(new TransportError("network"));
      const conn = this.peer.connect(remoteId, { reliable: true, serialization: "binary" });
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.peer.off("error", onPeerError);
        fn();
      };
      const onPeerError = (err: Error & { type?: string }) => {
        if (err.type === "peer-unavailable" && String(err.message).includes(remoteId)) {
          finish(() => reject(new TransportError("peer-unavailable")));
        }
      };
      const timer = setTimeout(() => finish(() => { try { conn.close(); } catch { /* ignore */ } reject(new TransportError("blocked")); }), timeoutMs);
      this.peer.on("error", onPeerError);
      conn.on("open", () => finish(() => resolve(new PeerLink(conn, true))));
      // The broker's "no such phone" can arrive just after the connection reports closing; wait a moment for the real reason
      const blockedSoon = () => { setTimeout(() => finish(() => reject(new TransportError("blocked"))), 600); };
      conn.on("error", e => { debug("dial error:", String(e)); blockedSoon(); });
      conn.on("close", () => { debug("dial closed before open"); blockedSoon(); });
    });
  }

  onIncoming(cb: (link: Link) => void) { this.incoming = cb; }
  onStatus(cb: (s: EndpointStatus) => void) { this.status = cb; }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    try { this.peer.destroy(); } catch { /* ignore */ }
    this.status?.("closed");
  }
}

export interface PeerNetworkOptions { host?: string; port?: number; path?: string; secure?: boolean; key?: string }

export class PeerNetwork implements Network {
  constructor(private options: PeerNetworkOptions = {}) {}

  open(id: string): Promise<Endpoint> {
    return new Promise((resolve, reject) => {
      let peer: Peer;
      try { peer = new Peer(id, { debug: 0, ...this.options }); } catch (e) { return reject(new TransportError("unsupported", String(e))); }
      let settled = false;
      const fail = (err: TransportError) => { if (settled) return; settled = true; clearTimeout(timer); try { peer.destroy(); } catch { /* ignore */ } reject(err); };
      const timer = setTimeout(() => fail(new TransportError("network")), 20_000);
      peer.on("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new PeerEndpoint(peer, id));
      });
      peer.on("error", err => {
        const type = (err as { type?: string }).type;
        if (type === "unavailable-id") fail(new TransportError("unavailable-id"));
        else if (type === "browser-incompatible") fail(new TransportError("unsupported"));
        else fail(new TransportError("network", String((err as Error).message)));
      });
    });
  }
}
