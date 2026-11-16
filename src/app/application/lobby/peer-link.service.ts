import { inject, Injectable, signal, untracked } from '@angular/core';
import { Network } from '@axe/core/network/network';
import { FIRST_SYNC_SETTLED, networkMessage$ } from '@axe/core/network/network-messaging';
import { PeerLinkState } from '@axe/core/network/peer-link';
import { peerStatsUpdated$ } from '@axe/core/network/peer-stats-events';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { syncProgressChanged$ } from '@axe/core/sync/sync-progress-events';
import { isRelayedLink } from '@axe/domain/peer/peer-link-quality';

/**
 * How this seat reaches one of the others, as the connection panel says it: a direct link apart from
 * one that goes through a relay server, which is direct all the same.
 */
export type PeerLinkView = PeerLinkState | 'turn';

/** One of the others in the room and how this seat reaches it. */
export interface PeerLinkRow {
  readonly peerId: string;
  readonly state: PeerLinkView;
}

/**
 * Where this seat's sync of the room stands: nothing to say yet, receiving, receiving but stalled,
 * all there, or with nobody to receive from.
 */
export type SyncProgressState = 'idle' | 'receiving' | 'stalled' | 'settled' | 'nobody';

/** Where this seat's sync of the room stands, and how many objects are still to arrive. */
export interface SyncProgress {
  readonly state: SyncProgressState;
  readonly count: number;
}

/** How long the count of objects still to arrive may stand still before the sync reads as stalled. */
export const SYNC_STALLED_MS = 30_000;

/**
 * How often the links are looked at again while somebody watches them. The members of the room and
 * the users each peer lists change without an event of their own.
 */
export const LINK_POLL_MS = 1_000;

const REDRAWING_EVENTS: ReadonlySet<string> = new Set([
  'OPEN_NETWORK',
  'CLOSE_NETWORK',
  'CONNECT_PEER',
  'DISCONNECT_PEER',
  'PEER_RECONNECT',
  FIRST_SYNC_SETTLED,
]);

/** What the sync's standing is worked out from. */
export interface SyncProgressFacts {
  readonly links: readonly PeerLinkRow[];
  readonly pendingCount: number;
  readonly isSettled: boolean;
  /** When the count last moved the right way, by the same clock as `now`. */
  readonly lastProgressAt: number;
  readonly now: number;
}

/**
 * Works out where the sync of the room stands.
 *
 * With somebody in the room reached only through others or not at all, and nobody reached directly,
 * there is nobody to receive from, whatever else. Otherwise it is receiving while objects are still
 * to arrive, stalled once their count has stood still for SYNC_STALLED_MS, settled once the first
 * sync is, and idle before that.
 */
export function syncProgressOf(facts: SyncProgressFacts): SyncProgress {
  const count = facts.pendingCount;
  const isDirect = (link: PeerLinkRow): boolean => link.state === 'direct' || link.state === 'turn';
  const isCutOff = (link: PeerLinkRow): boolean => link.state === 'relayed' || link.state === 'failed';
  if (!facts.links.some(isDirect) && facts.links.some(isCutOff)) return { state: 'nobody', count };
  if (0 < count) {
    return { state: SYNC_STALLED_MS <= facts.now - facts.lastProgressAt ? 'stalled' : 'receiving', count };
  }
  return { state: facts.isSettled ? 'settled' : 'idle', count };
}

function sameLinks(a: readonly PeerLinkRow[], b: readonly PeerLinkRow[]): boolean {
  return a.length === b.length && a.every((link, i) => link.peerId === b[i].peerId && link.state === b[i].state);
}

function sameProgress(a: SyncProgress, b: SyncProgress): boolean {
  return a.state === b.state && a.count === b.count;
}

/**
 * How this seat reaches each of the others in a room where the seats link to each other, and how
 * far its sync of the room has come, as signals for the connection panel.
 *
 * Both are read from the network and the synchronizer only while somebody watches: on the events
 * that tell of a peer coming, going or being reconnected to, on the link statistics, on the
 * synchronizer's held-back notice of its progress, and every LINK_POLL_MS. Unwatched, they stay as
 * last read. A signal changes only when what it says does, so a sync of thousands of objects draws
 * the panel again no more often than the synchronizer tells. On a room server there are no links to
 * tell of and the sync reads as idle.
 */
@Injectable({ providedIn: 'root' })
export class PeerLinkService {
  private readonly synchronizer = inject(ObjectSynchronizer);
  private watchers = 0;
  private stopWatching: (() => void) | null = null;
  private readonly linkRows = signal<readonly PeerLinkRow[]>([], { equal: sameLinks });
  private readonly progress = signal<SyncProgress>({ state: 'idle', count: 0 }, { equal: sameProgress });

  /** Each of the others in the room and how this seat reaches it, sorted by peer id. */
  readonly links = this.linkRows.asReadonly();
  /** Where this seat's sync of the room stands. */
  readonly syncProgress = this.progress.asReadonly();

  /**
   * Keeps the two signals up to date until the function given back is called. What it reads and
   * writes as it begins is kept from whoever calls it, so an effect may call it.
   */
  watch(): () => void {
    this.watchers++;
    if (this.watchers === 1) untracked(() => this.begin());
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.watchers--;
      if (this.watchers === 0) this.end();
    };
  }

  private begin(): void {
    const refresh = (): void => this.refresh();
    const stops = [
      networkMessage$.subscribe((message) => {
        if (REDRAWING_EVENTS.has(message.eventName)) this.refresh();
      }),
      peerStatsUpdated$.subscribe(refresh),
      syncProgressChanged$.subscribe(refresh),
    ];
    const timer = setInterval(refresh, LINK_POLL_MS);
    this.stopWatching = () => {
      clearInterval(timer);
      for (const stop of stops) stop();
    };
    this.refresh();
  }

  private end(): void {
    this.stopWatching?.();
    this.stopWatching = null;
  }

  private refresh(): void {
    if (Network.authorityPeerId !== null) {
      this.linkRows.set([]);
      this.progress.set({ state: 'idle', count: 0 });
      return;
    }
    const sessions = new Map(Network.peerContexts.map((peer) => [peer.peerId, peer.session]));
    const links = Network.peerLinks.map((link): PeerLinkRow => {
      const session = sessions.get(link.peerId);
      const isTurn = link.state === 'direct' && !!session && isRelayedLink(session);
      return { peerId: link.peerId, state: isTurn ? 'turn' : link.state };
    });
    this.linkRows.set(links);
    this.progress.set(
      syncProgressOf({
        links,
        pendingCount: this.synchronizer.pendingCount,
        isSettled: this.synchronizer.isSettled,
        lastProgressAt: this.synchronizer.lastProgressAt,
        now: performance.now(),
      })
    );
  }
}
