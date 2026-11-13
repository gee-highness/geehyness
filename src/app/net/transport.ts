// Transport interfaces shared with Ludo Sync (same Network / Endpoint / Link split), so the room logic never touches PeerJS directly.
/**
 * How two phones reach each other. The sync code only knows these interfaces, so the same logic
 * runs over PeerJS in the app and over an in-memory network in tests (where links can be cut,
 * messages dropped or tampered with, and the "internet" switched off).
 */
export type Bytes = Uint8Array | string;

export type TransportErrorKind =
  /** Someone (often our own earlier session) still holds this id on the broker. */
  | "unavailable-id"
  /** The other phone is not online right now. Normal. */
  | "peer-unavailable"
  /** No route to the broker. */
  | "network"
  /** Direct connection could not be made (blocked network, no relay). */
  | "blocked"
  | "timeout"
  | "unsupported"
  | "closed";

export class TransportError extends Error {
  constructor(readonly kind: TransportErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "TransportError";
  }
}

export interface Link {
  readonly remoteId: string;
  /** True on the phone that dialled. */
  readonly initiator: boolean;
  readonly open: boolean;
  send(data: Bytes): void;
  close(): void;
  onMessage(cb: (data: Bytes) => void): void;
  onClose(cb: () => void): void;
}

export type EndpointStatus = "open" | "lost" | "closed";

export interface Endpoint {
  readonly id: string;
  dial(remoteId: string, timeoutMs?: number): Promise<Link>;
  onIncoming(cb: (link: Link) => void): void;
  onStatus(cb: (status: EndpointStatus) => void): void;
  close(): void;
}

export interface Network {
  /** Registers `id` so others can dial it. */
  open(id: string): Promise<Endpoint>;
}
