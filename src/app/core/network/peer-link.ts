/**
 * How this seat reaches another in a room where the seats link to each other: over a stream of its
 * own, only through somebody else who reaches both, on the way to a stream, or not at all.
 */
export type PeerLinkState = 'direct' | 'relayed' | 'reconnecting' | 'failed';

/** One of the others in the room and how this seat reaches it. */
export interface PeerLink {
  readonly peerId: string;
  readonly state: PeerLinkState;
}

/** What is known of the link to a peer, which its state is decided from. */
export interface PeerLinkFacts {
  /** Whether the stream to the peer is open. */
  readonly isOpen: boolean;
  /** Whether a stream to the peer is on its way to opening. */
  readonly isOpening: boolean;
  /** How many reconnect attempts have been scheduled for the peer since it was last connected. */
  readonly attempts: number;
  /** Whether those attempts have used the backoff up, so that they go on at the steady delay. */
  readonly isPastBackoff: boolean;
  /** Whether a peer with an open stream lists the peer among the users it is connected to. */
  readonly isListedByOpenPeer: boolean;
}

/**
 * Decides how this seat reaches a peer.
 *
 * An open stream is direct. Without one, the peer is being reconnected to while a stream is opening
 * or the backoff's attempts are running. Past the backoff, or for a peer never dialled, it is
 * relayed where somebody connected lists it, as that somebody passes on what is said to everybody,
 * and failed where nobody does. The backoff comes first, so a link just cut reads as being
 * reconnected to before it reads as relayed.
 */
export function peerLinkStateOf(facts: PeerLinkFacts): PeerLinkState {
  if (facts.isOpen) return 'direct';
  if (!facts.isPastBackoff && (facts.isOpening || 0 < facts.attempts)) return 'reconnecting';
  return facts.isListedByOpenPeer ? 'relayed' : 'failed';
}
