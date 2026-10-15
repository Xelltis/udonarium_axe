import { Network } from '@axe/core/network/network';
import { EventContext, NetworkMessage, networkMessage$, receiveEvents } from '@axe/core/network/network-messaging';
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

  it('drops the room server’s events altogether where there is no room server', () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);

    receiveEvents([event(AuthorityEvent.WITHDRAW, AUTHORITY), event(AuthorityEvent.AUTHORITATIVE, 'peer-a')]);

    expect(received).toEqual([]);
  });
});
