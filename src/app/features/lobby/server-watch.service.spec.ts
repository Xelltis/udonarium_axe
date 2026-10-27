import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { EventContext } from '@axe/core/network/network-messaging';
import { IPeerContext } from '@axe/core/network/peer-context';
import { AuthorityEvent, ServerRole } from '@axe/core/network/server/server-protocol';
import { ServerWatchService } from '@axe/features/lobby/server-watch.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ServerWatchService', () => {
  let sent: { eventName: string; data: unknown; to: string | undefined }[];

  /** Seats the reader in a room on a room server, as the server tells of its role and the one it keeps. */
  function seat(
    role: ServerRole,
    kept: ServerRole | null,
    options: { transport?: 'server' | 'skyway'; isRoom?: boolean } = {}
  ): void {
    vi.spyOn(Network.instance, 'transport', 'get').mockReturnValue(options.transport ?? 'server');
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerId', 'get').mockReturnValue('peer-pl');
    vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue(role);
    vi.spyOn(Network.instance, 'keptRole', 'get').mockReturnValue(kept);
    vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
      isRoom: options.isRoom ?? true,
    } as IPeerContext);
  }

  const service = () => TestBed.inject(ServerWatchService);
  const asked = () => sent.filter((one) => one.eventName === AuthorityEvent.ROLE_REQUEST);

  beforeEach(() => {
    sent = [];
    vi.spyOn(Network.instance, 'send').mockImplementation((context, to) => {
      const { eventName, data } = context as EventContext;
      sent.push({ eventName, data, to });
    });
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers the role the room keeps, whether the seat holds it or watches', () => {
    seat('pl', 'pl');
    expect(service().roleToChoose()).toBe('pl');

    seat('guest', 'gm');
    expect(service().roleToChoose()).toBe('gm');
  });

  it('offers nothing where the room keeps no role above a guest’s, or tells of none', () => {
    for (const kept of [null, 'guest'] as const) {
      seat('guest', kept);
      expect(service().roleToChoose(), String(kept)).toBeNull();
    }
  });

  it('offers nothing away from a room server’s room', () => {
    seat('pl', 'pl', { transport: 'skyway' });
    expect(service().roleToChoose()).toBeNull();

    seat('pl', 'pl', { isRoom: false });
    expect(service().roleToChoose()).toBeNull();
  });

  it('offers anew once told the room server changed the role it keeps', () => {
    seat('guest', 'pl');
    const offered = TestBed.runInInjectionContext(() => computed(() => service().roleToChoose()));
    expect(offered()).toBe('pl');

    seat('guest', 'guest');
    service().noteRoleTold();

    expect(offered()).toBeNull();
  });

  it('asks the room server to watch, and to come back to the role it keeps', () => {
    seat('pl', 'pl');
    service().watch();
    seat('guest', 'pl');
    service().comeBack();

    expect(asked()).toEqual([
      { eventName: AuthorityEvent.ROLE_REQUEST, data: { peerId: 'peer-pl', role: 'guest' }, to: '@authority' },
      { eventName: AuthorityEvent.ROLE_REQUEST, data: { peerId: 'peer-pl', role: 'pl' }, to: '@authority' },
    ]);
  });

  it('asks again for the role the seat holds already, as the server may be ahead of it', () => {
    seat('guest', 'pl');
    service().watch();
    seat('pl', 'pl');
    service().comeBack();

    expect(asked().map((one) => (one.data as { role: ServerRole }).role)).toEqual(['guest', 'pl']);
  });

  it('asks nothing with nothing to choose', () => {
    seat('guest', null);
    service().watch();
    service().comeBack();

    expect(asked()).toEqual([]);
  });
});
