import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  type NetworkErrorEvent,
  type NetworkPeerEvent,
  type PeerReconnectEvent,
} from '@axe/application/sync/object-change-network-helpers';
import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/network/network';
import { Account } from '@axe/core/network/server/server-protocol';
import { clearIdentity, loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';
import { NetworkEventHandlerService } from '@axe/features/lobby/network-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/**
 * The open, error and connect channels are private to the change service and fire
 * only through the message channel.
 * The tests give a stub service its own channels and emit on them directly.
 */
class StubObjectChange {
  readonly loadConfig$ = new EventChannel<{ config: unknown }>();
  readonly networkOpen$ = new EventChannel<NetworkPeerEvent>();
  readonly networkError$ = new EventChannel<NetworkErrorEvent>();
  readonly peerConnect$ = new EventChannel<NetworkPeerEvent>();
  readonly peerReconnect$ = new EventChannel<PeerReconnectEvent>();
  onObjectChangedForAlias(): () => void {
    return () => {};
  }
}

describe('NetworkEventHandlerService', () => {
  let chatStub: {
    sendSystemMessage: ReturnType<typeof vi.fn>;
    calibrateTimeOffset: ReturnType<typeof vi.fn>;
  };
  let stubChange: StubObjectChange;
  let account: ReturnType<typeof signal<Account | null>>;

  beforeEach(() => {
    account = signal<Account | null>(null);
    chatStub = {
      sendSystemMessage: vi.fn(),
      calibrateTimeOffset: vi.fn(),
    };
    stubChange = new StubObjectChange();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(ChatMessageService, { useValue: chatStub });
    TestBed.overrideProvider(ObjectChangeService, { useValue: stubChange });
    TestBed.overrideProvider(ServerAuthService, { useValue: { account } });
    TestBed.inject(NetworkEventHandlerService);
  });

  afterEach(() => {
    clearIdentity();
    vi.restoreAllMocks();
    // The tests hand the static cursor a new one, which leaves whoever held the post
    // before it in the store for the next spec to count as a peer at the table.
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) {
      ObjectStore.instance.delete(cursor, false);
    }
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.myCursor = null!;
  });

  it('puts the peer and user identifiers onto the cursor as the connection opens', () => {
    PeerCursor.myCursor = new PeerCursor();
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'p123',
      userId: 'u456',
    } as never);

    stubChange.networkOpen$.emit({ peerId: 'p123' });

    expect(PeerCursor.myCursor.peerId).toBe('p123');
    expect(PeerCursor.myCursor.userId).toBe('u456');
  });

  it('keeps the room this tab was last in while it waits outside any room', () => {
    PeerCursor.myCursor = new PeerCursor();
    saveIdentity({ userId: 'u', roomId: 'abc', roomName: 'room', role: 'gm', reConnectPass: '' });
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'p',
      userId: 'u',
      roomId: '',
      roomName: '',
      isRoom: false,
    } as never);

    stubChange.networkOpen$.emit({ peerId: 'p' });

    expect(loadIdentity()?.roomId).toBe('abc');
    expect(loadIdentity()?.roomName).toBe('room');
  });

  it('writes down the room a connection opens into', () => {
    PeerCursor.myCursor = new PeerCursor();
    saveIdentity({ userId: 'u', roomId: 'abc', roomName: 'room', role: 'gm', reConnectPass: '' });
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'p',
      userId: 'u',
      roomId: 'xyz',
      roomName: 'other',
      isRoom: true,
    } as never);

    stubChange.networkOpen$.emit({ peerId: 'p' });

    expect(loadIdentity()?.roomId).toBe('xyz');
    expect(loadIdentity()?.roomName).toBe('other');
  });

  it('calibrates the clock as a peer connects', () => {
    stubChange.peerConnect$.emit({ peerId: 'p1' });

    expect(chatStub.calibrateTimeOffset).toHaveBeenCalledTimes(1);
  });

  it('does not open a network connection in local mode', () => {
    const configureSpy = vi.spyOn(Network, 'configure').mockImplementation(() => {});
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    stubChange.loadConfig$.emit({ config: { backend: { url: '' }, localMode: true } });
    stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'offline' });

    expect(configureSpy).toHaveBeenCalledOnce();
    expect(openStandbySpy).not.toHaveBeenCalled();
    expect(chatStub.sendSystemMessage).not.toHaveBeenCalled();
  });

  it('opens the standby connection outside local mode', () => {
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    stubChange.loadConfig$.emit({ config: { backend: { url: 'https://example.test' }, localMode: false } });

    expect(openStandbySpy).toHaveBeenCalledOnce();
  });

  it('passes over an unavailable peer without a word or a reconnection', () => {
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    stubChange.networkError$.emit({ errorType: 'peer-unavailable', errorMessage: '' });

    expect(chatStub.sendSystemMessage).not.toHaveBeenCalled();
    expect(openStandbySpy).not.toHaveBeenCalled();
  });

  it('says this seat is still in the room under its own name, and goes back to waiting without using up a try', () => {
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    for (let i = 0; i < 5; i++) stubChange.networkError$.emit({ errorType: 'same-name-member', errorMessage: '' });

    expect(openStandbySpy).toHaveBeenCalledTimes(5);
    expect(chatStub.sendSystemMessage).toHaveBeenCalledTimes(5);
    expect(chatStub.sendSystemMessage.mock.calls[0][0] as string).toContain('feature.lobby.errors.sameNameMember');

    chatStub.sendSystemMessage.mockClear();
    stubChange.networkError$.emit({ errorType: 'token-expired', errorMessage: '' });
    expect(chatStub.sendSystemMessage.mock.calls.at(-1)?.[0] as string).toContain('feature.lobby.errors.reconnecting');
  });

  it('backs off and reconnects after a server error, up to a limit', async () => {
    vi.useFakeTimers();
    try {
      const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

      stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'oops' });

      // says only that it will try again, and tries after the backoff
      expect(chatStub.sendSystemMessage).toHaveBeenCalledTimes(1);
      expect(chatStub.sendSystemMessage.mock.calls[0][0]).toContain('feature.lobby.errors.reconnecting');
      expect(openStandbySpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3000);
      expect(openStandbySpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up past that limit and reports the error', async () => {
    vi.useFakeTimers();
    try {
      const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

      // reconnects up to three times, each after its backoff
      for (let i = 0; i < 3; i++) {
        stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'x' });
        await vi.advanceTimersByTimeAsync(20000);
      }
      expect(openStandbySpy).toHaveBeenCalledTimes(3);

      // reports the error on the fourth and stops
      stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'x' });
      await vi.advanceTimersByTimeAsync(20000);

      expect(openStandbySpy).toHaveBeenCalledTimes(3);
      const lastMessage = chatStub.sendSystemMessage.mock.calls.at(-1)?.[0] as string;
      expect(lastMessage).toContain('feature.lobby.errors.skywayServer');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the count of attempts once a connection opens', async () => {
    vi.useFakeTimers();
    try {
      PeerCursor.myCursor = new PeerCursor();
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
        peerId: 'p',
        userId: 'u',
        roomId: '',
        roomName: '',
        isRoom: false,
      } as never);
      const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

      for (let i = 0; i < 3; i++) {
        stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'x' });
        await vi.advanceTimersByTimeAsync(20000);
      }
      expect(openStandbySpy).toHaveBeenCalledTimes(3);

      stubChange.networkOpen$.emit({ peerId: 'p' });

      // can reconnect again after that
      stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'x' });
      await vi.advanceTimersByTimeAsync(20000);
      expect(openStandbySpy).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the server backoff where it was when another error has been through', async () => {
    vi.useFakeTimers();
    try {
      const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      // Two token errors before anything has opened, which is how a stale identity starts.
      stubChange.networkError$.emit({ errorType: 'token-expired', errorMessage: '' });
      stubChange.networkError$.emit({ errorType: 'token-expired', errorMessage: '' });
      openStandbySpy.mockClear();

      stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'cold start' });

      // The first wait of the server's own backoff, not the last of it.
      await vi.advanceTimersByTimeAsync(3000);
      expect(openStandbySpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an expired token and reconnects', () => {
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    stubChange.networkError$.emit({ errorType: 'token-expired', errorMessage: '' });

    expect(chatStub.sendSystemMessage).toHaveBeenCalledTimes(2);
    expect(openStandbySpy).toHaveBeenCalledTimes(1);
  });

  it('stops after the limit on an error that keeps coming back', () => {
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    // A token the cloud will not accept fails again the moment it is retried.
    for (let i = 0; i < 10; i++) {
      stubChange.networkError$.emit({ errorType: 'connectRtcApiFailed', errorMessage: '' });
    }

    expect(openStandbySpy).toHaveBeenCalledTimes(3);
    expect(chatStub.sendSystemMessage).toHaveBeenCalledTimes(6);
  });

  it('says a peer is reconnecting', () => {
    stubChange.peerReconnect$.emit({ peerId: 'abcdef123', state: 'retrying' });

    expect(chatStub.sendSystemMessage).toHaveBeenCalledTimes(1);
    expect(chatStub.sendSystemMessage.mock.calls[0][0]).toContain('feature.lobby.peerReconnect.retrying');
  });

  it('says it has come back', () => {
    stubChange.peerReconnect$.emit({ peerId: 'abcdef123', state: 'recovered' });

    expect(chatStub.sendSystemMessage.mock.calls[0][0]).toContain('feature.lobby.peerReconnect.recovered');
  });

  it('says it has failed', () => {
    stubChange.peerReconnect$.emit({ peerId: 'abcdef123', state: 'failed' });

    expect(chatStub.sendSystemMessage.mock.calls[0][0]).toContain('feature.lobby.peerReconnect.failed');
  });

  it('falls back to the head of the identifier for a peer whose name it does not know', () => {
    stubChange.peerReconnect$.emit({ peerId: 'abcdef123', state: 'retrying' });

    expect(chatStub.sendSystemMessage.mock.calls[0][0]).toContain('abcdef');
  });

  it('configures the network and stands by as the settings load', () => {
    const configureSpy = vi.spyOn(Network, 'configure').mockImplementation(() => {});
    const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

    stubChange.loadConfig$.emit({ config: { foo: 'bar' } });

    expect(configureSpy).toHaveBeenCalledWith({ foo: 'bar' });
    expect(openStandbySpy).toHaveBeenCalledTimes(1);
  });

  describe('a room server closing the connection', () => {
    const sent = () => chatStub.sendSystemMessage.mock.calls.map(([text]) => text as string);

    it('says why and goes back to waiting, however often, without trying again', () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

      for (let i = 0; i < 5; i++) stubChange.networkError$.emit({ errorType: 'wrong-password', errorMessage: '' });

      expect(openStandbySpy).toHaveBeenCalledTimes(5);
      expect(sent()).toHaveLength(5);
      expect(sent().every((text) => text.includes('feature.lobby.errors.roomServerWrongPassword'))).toBe(true);
    });

    it('names each reason the server gives', () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      const reasons: [string, string][] = [
        ['protocol-mismatch', 'roomServerProtocolMismatch'],
        ['room-not-found', 'roomServerNotFound'],
        ['room-full', 'roomServerFull'],
        ['replaced', 'roomServerReplaced'],
        ['server-unreachable', 'roomServerUnreachable'],
        ['no-backend', 'roomServerNoBackend'],
        ['unauthorized', 'roomServerUnauthorized'],
        ['bad-message', 'roomServerRefused'],
      ];

      for (const [code] of reasons) stubChange.networkError$.emit({ errorType: code, errorMessage: '' });

      expect(sent().map((text, i) => text.includes(`feature.lobby.errors.${reasons[i][1]}`))).toEqual(
        reasons.map(() => true)
      );
    });

    it('leaves those codes to the usual handling through SkyWay', () => {
      vi.spyOn(Network, 'openStandby').mockImplementation(() => {});

      stubChange.networkError$.emit({ errorType: 'wrong-password', errorMessage: '' });

      expect(sent()[0]).toContain('feature.lobby.errors.generic');
    });
  });

  describe('a login on a room server', () => {
    const ACCOUNT: Account = { userId: 'acct_1', name: 'Kai', avatarUrl: null };

    beforeEach(() => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
      PeerCursor.myCursor = new PeerCursor();
      TestBed.tick();
    });

    it('waits outside a room as the account while logged in, and as the tab’s own id after', () => {
      const openStandby = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      saveIdentity({ userId: 'acct_1', roomId: '', roomName: '', role: '', reConnectPass: '', guestUserId: 'tab-1' });
      account.set(ACCOUNT);
      TestBed.tick();
      openStandby.mockClear();

      stubChange.networkError$.emit({ errorType: 'room-not-found', errorMessage: '' });
      account.set(null);
      stubChange.networkError$.emit({ errorType: 'room-not-found', errorMessage: '' });

      expect(openStandby.mock.calls.map(([userId]) => userId)).toEqual(['acct_1', 'tab-1']);
    });

    it('goes into the same room again as whoever has logged in', () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        userId: 'tab-1',
        roomId: 'Ab3',
        roomName: '月夜の卓',
      } as never);
      vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('0123456789abcdef0123456789abcdef');
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
      PeerCursor.myCursor.reConnectPass = 'secret';

      account.set(ACCOUNT);
      TestBed.tick();

      expect(open).toHaveBeenCalledWith('acct_1', 'Ab3', '月夜の卓', 'secret', '0123456789abcdef0123456789abcdef');
    });

    it('takes the hand along when logging in outside a room', () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: false, userId: 'tab-1' } as never);
      const openStandby = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      const card = Card.create('held', '', '');
      card.toHand('tab-1');

      account.set(ACCOUNT);
      TestBed.tick();

      expect(card.location.name).toBe(handLocationOf('acct_1'));
      expect(openStandby).toHaveBeenCalledWith('acct_1');
      ObjectStore.instance.delete(card, false);
    });

    it('lends the account’s name to a cursor that still has the default, and leaves a chosen one', () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: false, userId: 'tab-1' } as never);
      vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      PeerCursor.myCursor.name = DEFAULT_CURSOR_NAME;
      account.set(ACCOUNT);
      TestBed.tick();
      expect(PeerCursor.myCursor.name).toBe('Kai');

      PeerCursor.myCursor.name = 'ゴブリン使い';
      account.set(null);
      TestBed.tick();
      account.set({ ...ACCOUNT, name: 'Another' });
      TestBed.tick();
      expect(PeerCursor.myCursor.name).toBe('ゴブリン使い');
    });
  });
});
