import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  type NetworkErrorEvent,
  type NetworkPeerEvent,
  type PeerReconnectEvent,
} from '@axe/application/sync/object-change-network-helpers';
import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
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

  beforeEach(() => {
    chatStub = {
      sendSystemMessage: vi.fn(),
      calibrateTimeOffset: vi.fn(),
    };
    stubChange = new StubObjectChange();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(ChatMessageService, { useValue: chatStub });
    TestBed.overrideProvider(ObjectChangeService, { useValue: stubChange });
    TestBed.inject(NetworkEventHandlerService);
  });

  afterEach(() => {
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
});
