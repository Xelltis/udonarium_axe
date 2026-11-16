import { TestBed } from '@angular/core/testing';
import {
  LINK_POLL_MS,
  PeerLinkRow,
  PeerLinkService,
  SYNC_STALLED_MS,
  syncProgressOf,
} from '@axe/application/lobby/peer-link.service';
import { Network } from '@axe/core/network/network';
import { FIRST_SYNC_SETTLED, localDispatch, networkMessage$ } from '@axe/core/network/network-messaging';
import { PeerLink } from '@axe/core/network/peer-link';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { peerStatsUpdated$ } from '@axe/core/network/peer-stats-events';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { syncProgressChanged$ } from '@axe/core/sync/sync-progress-events';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const row = (peerId: string, state: PeerLinkRow['state']): PeerLinkRow => ({ peerId, state });

describe('syncProgressOf', () => {
  const facts = (over: Partial<Parameters<typeof syncProgressOf>[0]>) => ({
    links: [row('peer-a', 'direct')],
    pendingCount: 0,
    isSettled: false,
    lastProgressAt: 0,
    now: 0,
    ...over,
  });

  it('is idle before the first sync with nothing to wait for', () => {
    expect(syncProgressOf(facts({}))).toEqual({ state: 'idle', count: 0 });
    expect(syncProgressOf(facts({ links: [] }))).toEqual({ state: 'idle', count: 0 });
  });

  it('is receiving, with the count, while objects are still to arrive', () => {
    expect(syncProgressOf(facts({ pendingCount: 12, isSettled: true }))).toEqual({ state: 'receiving', count: 12 });
  });

  it('is stalled once the count has stood still for thirty seconds, and receiving again once it moves', () => {
    const waiting = { pendingCount: 12, lastProgressAt: 1_000 };
    expect(syncProgressOf(facts({ ...waiting, now: 1_000 + SYNC_STALLED_MS - 1 })).state).toBe('receiving');
    expect(syncProgressOf(facts({ ...waiting, now: 1_000 + SYNC_STALLED_MS })).state).toBe('stalled');
    expect(syncProgressOf(facts({ ...waiting, lastProgressAt: 31_500, now: 32_000 })).state).toBe('receiving');
    expect(SYNC_STALLED_MS).toBe(30_000);
  });

  it('is settled once the first sync is and nothing is left to arrive', () => {
    expect(syncProgressOf(facts({ isSettled: true }))).toEqual({ state: 'settled', count: 0 });
  });

  it('has nobody to receive from when everybody is reached through others or not at all', () => {
    const links = [row('peer-a', 'relayed'), row('peer-b', 'failed')];
    expect(syncProgressOf(facts({ links, isSettled: true })).state).toBe('nobody');
    expect(syncProgressOf(facts({ links, pendingCount: 3 })).state).toBe('nobody');
  });

  it('still has somebody while one link is direct, through a relay server or not', () => {
    expect(syncProgressOf(facts({ links: [row('a', 'failed'), row('b', 'turn')], isSettled: true })).state).toBe(
      'settled'
    );
    expect(syncProgressOf(facts({ links: [row('a', 'relayed'), row('b', 'direct')] })).state).toBe('idle');
  });

  it('does not say nobody while the others are only being reconnected to', () => {
    expect(syncProgressOf(facts({ links: [row('a', 'reconnecting')], isSettled: true })).state).toBe('settled');
  });
});

describe('PeerLinkService', () => {
  let service: PeerLinkService;
  let peerLinks: PeerLink[];
  let grades: Record<string, PeerSessionGrade>;
  let pendingCount: number;
  let isSettled: boolean;
  let lastProgressAt: number;
  let authority: string | null;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    peerLinks = [];
    grades = {};
    pendingCount = 0;
    isSettled = false;
    lastProgressAt = Number.NEGATIVE_INFINITY;
    authority = null;
    vi.spyOn(Network, 'peerLinks', 'get').mockImplementation(() => peerLinks);
    vi.spyOn(Network, 'authorityPeerId', 'get').mockImplementation(() => authority);
    vi.spyOn(Network, 'peerContexts', 'get').mockImplementation(
      () => Object.entries(grades).map(([peerId, grade]) => ({ peerId, isOpen: true, session: { grade } })) as never
    );
    const synchronizer = ObjectSynchronizer.instance;
    vi.spyOn(synchronizer, 'pendingCount', 'get').mockImplementation(() => pendingCount);
    vi.spyOn(synchronizer, 'isSettled', 'get').mockImplementation(() => isSettled);
    vi.spyOn(synchronizer, 'lastProgressAt', 'get').mockImplementation(() => lastProgressAt);
    service = TestBed.inject(PeerLinkService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads nothing until somebody watches, and reads at once when somebody does', () => {
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    vi.advanceTimersByTime(LINK_POLL_MS * 3);
    expect(service.links()).toEqual([]);

    const stop = service.watch();
    expect(service.links()).toEqual([row('peer-a', 'direct')]);
    stop();
  });

  it('tells a direct link through a relay server apart, and leaves the other states as the network gives them', () => {
    peerLinks = [
      { peerId: 'a', state: 'direct' },
      { peerId: 'b', state: 'direct' },
      { peerId: 'c', state: 'relayed' },
      { peerId: 'd', state: 'reconnecting' },
      { peerId: 'e', state: 'failed' },
    ];
    grades = { a: PeerSessionGrade.HIGH, b: PeerSessionGrade.LOW, c: PeerSessionGrade.LOW };

    const stop = service.watch();

    expect(service.links().map((link) => link.state)).toEqual(['direct', 'turn', 'relayed', 'reconnecting', 'failed']);
    stop();
  });

  it.each(['CONNECT_PEER', 'DISCONNECT_PEER', 'PEER_RECONNECT', 'OPEN_NETWORK', 'CLOSE_NETWORK'])(
    'reads the links again on %s',
    (eventName) => {
      const stop = service.watch();
      peerLinks = [{ peerId: 'peer-a', state: 'reconnecting' }];

      localDispatch(eventName, { peerId: 'peer-a' });

      expect(service.links()).toEqual([row('peer-a', 'reconnecting')]);
      stop();
    }
  );

  it('reads the links again on the link statistics, and every second for what changes without a word', () => {
    const stop = service.watch();
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    grades = { 'peer-a': PeerSessionGrade.LOW };
    peerStatsUpdated$.emit();
    expect(service.links()).toEqual([row('peer-a', 'turn')]);

    peerLinks = [{ peerId: 'peer-a', state: 'relayed' }];
    vi.advanceTimersByTime(LINK_POLL_MS);
    expect(service.links()).toEqual([row('peer-a', 'relayed')]);
    expect(LINK_POLL_MS).toBe(1_000);
    stop();
  });

  it('follows the sync as the synchronizer tells of it, and on its first sync settling', () => {
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    const stop = service.watch();
    expect(service.syncProgress()).toEqual({ state: 'idle', count: 0 });

    pendingCount = 40;
    lastProgressAt = performance.now();
    syncProgressChanged$.emit();
    expect(service.syncProgress()).toEqual({ state: 'receiving', count: 40 });

    pendingCount = 0;
    isSettled = true;
    localDispatch(FIRST_SYNC_SETTLED, {});
    expect(service.syncProgress()).toEqual({ state: 'settled', count: 0 });
    stop();
  });

  it('reads the sync as stalled once thirty seconds pass with the count standing still, with no word from anybody', () => {
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    pendingCount = 7;
    lastProgressAt = performance.now();
    const stop = service.watch();

    vi.advanceTimersByTime(SYNC_STALLED_MS - LINK_POLL_MS);
    expect(service.syncProgress().state).toBe('receiving');
    vi.advanceTimersByTime(LINK_POLL_MS);
    expect(service.syncProgress()).toEqual({ state: 'stalled', count: 7 });

    lastProgressAt = performance.now();
    pendingCount = 6;
    syncProgressChanged$.emit();
    expect(service.syncProgress()).toEqual({ state: 'receiving', count: 6 });
    stop();
  });

  it('hands out the same value while nothing it says has changed, so nothing is drawn again', () => {
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    const stop = service.watch();
    const links = service.links();
    const progress = service.syncProgress();

    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    vi.advanceTimersByTime(LINK_POLL_MS * 5);
    syncProgressChanged$.emit();

    expect(service.links()).toBe(links);
    expect(service.syncProgress()).toBe(progress);
    stop();
  });

  it('stops listening once the last watcher lets go, and keeps going while one is left', () => {
    const listening = () => [networkMessage$, peerStatsUpdated$, syncProgressChanged$].map((c) => c.listenerCount);
    const before = listening();
    const first = service.watch();
    const second = service.watch();
    expect(listening()).toEqual(before.map((count) => count + 1));

    first();
    first();
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    vi.advanceTimersByTime(LINK_POLL_MS);
    expect(service.links()).toEqual([row('peer-a', 'direct')]);

    second();
    expect(listening()).toEqual(before);
    peerLinks = [];
    vi.advanceTimersByTime(LINK_POLL_MS * 2);
    expect(service.links()).toEqual([row('peer-a', 'direct')]);
  });

  it('tells of no links and an idle sync on a room server', () => {
    authority = '@authority';
    peerLinks = [{ peerId: 'peer-a', state: 'direct' }];
    pendingCount = 9;
    isSettled = true;

    const stop = service.watch();

    expect(service.links()).toEqual([]);
    expect(service.syncProgress()).toEqual({ state: 'idle', count: 0 });
    stop();
  });
});
