import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import {
  EventContext,
  LOCAL_ONLY_EVENTS,
  NetworkMessage,
  networkMessage$,
  receiveEvents,
} from '@axe/core/network/network-messaging';
import { AuthorityEvent } from '@axe/core/network/server/server-protocol';

const AUTHORITY = '@authority';

describe('receiveEvents', () => {
  let received: NetworkMessage[];
  let off: () => void;

  beforeEach(() => {
    received = [];
    off = networkMessage$.subscribe((message) => received.push(message));
  });

  afterEach(() => {
    off();
    vi.restoreAllMocks();
  });

  const event = (eventName: string, sendFrom: string): EventContext => ({
    eventName,
    sendFrom,
    data: { identifier: 'card-1', aliasName: 'card' },
  });

  it('delivers each event as a message from its sender', () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(AUTHORITY);

    receiveEvents([event('UPDATE_GAME_OBJECT', 'peer-a'), event(AuthorityEvent.AUTHORITATIVE, AUTHORITY)]);

    expect(received.map((message) => [message.eventName, message.sendFrom])).toEqual([
      ['UPDATE_GAME_OBJECT', 'peer-a'],
      [AuthorityEvent.AUTHORITATIVE, AUTHORITY],
    ]);
  });

  it.each([
    AuthorityEvent.AUTHORITATIVE,
    AuthorityEvent.WITHDRAW,
    AuthorityEvent.ROLE_REJECTED,
    AuthorityEvent.ROLL_REJECTED,
  ])('drops %s from a seat that is not the room server', (eventName) => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(AUTHORITY);

    receiveEvents([event(eventName, 'peer-a'), event('UPDATE_GAME_OBJECT', 'peer-a')]);

    expect(received.map((message) => message.eventName)).toEqual(['UPDATE_GAME_OBJECT']);
  });

  it.each([...LOCAL_ONLY_EVENTS])('drops %s, which only this device tells itself, from anybody', (eventName) => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(AUTHORITY);

    receiveEvents([event(eventName, 'peer-a'), event(eventName, AUTHORITY)]);

    expect(received).toEqual([]);
  });

  it('counts as told only to this device every event it is told nowhere else', () => {
    expect([...LOCAL_ONLY_EVENTS].sort()).toEqual(
      [
        'CLOSE_NETWORK',
        'CONNECT_PEER',
        'DISCONNECT_PEER',
        'FIRST_SYNC_SETTLED',
        'LOCAL_OBJECT_UPDATED',
        'NETWORK_ERROR',
        'OPEN_NETWORK',
        'PEER_RECONNECT',
        'SERVER_ROLE_CHANGED',
        'UPDATE_AUDIO_RESOURE',
        'UPDATE_FILE_RESOURE',
        'UPDATE_MODEL_RESOURE',
        'VN_MODE',
      ].sort()
    );
  });

  it('drops the room server’s events altogether where there is no room server', () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);

    receiveEvents([event(AuthorityEvent.WITHDRAW, AUTHORITY), event(AuthorityEvent.AUTHORITATIVE, 'peer-a')]);

    expect(received).toEqual([]);
  });

  it('tells this device’s own events handed back to it as its own, though its peer has been renamed since', () => {
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('renamed');

    receiveEvents([event('UPDATE_GAME_OBJECT', '???')], true);
    receiveEvents([event('UPDATE_GAME_OBJECT', '???')]);

    expect(received.map((message) => message.isSendFromSelf)).toEqual([true, false]);
  });

  it('delivers the rest of a container, in order, after a listener throws on one of its events', () => {
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const offBroken = networkMessage$.subscribe((message) => {
      if (message.eventName === 'BROKEN_EVENT') throw new Error('broken listener');
    });
    const late: string[] = [];
    const offLate = networkMessage$.subscribe((message) => late.push(message.eventName));

    try {
      expect(() =>
        receiveEvents([
          event('UPDATE_GAME_OBJECT', 'peer-a'),
          event('BROKEN_EVENT', 'peer-a'),
          event('DELETE_GAME_OBJECT', 'peer-a'),
        ])
      ).not.toThrow();
    } finally {
      offBroken();
      offLate();
    }

    expect(received.map((message) => message.eventName)).toEqual([
      'UPDATE_GAME_OBJECT',
      'BROKEN_EVENT',
      'DELETE_GAME_OBJECT',
    ]);
    expect(late).toEqual(['UPDATE_GAME_OBJECT', 'BROKEN_EVENT', 'DELETE_GAME_OBJECT']);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toContain('BROKEN_EVENT');
  });
});
