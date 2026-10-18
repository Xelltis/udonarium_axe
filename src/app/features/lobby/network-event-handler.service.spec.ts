import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  type NetworkErrorEvent,
  type NetworkPeerEvent,
  type PeerReconnectEvent,
} from '@axe/application/sync/object-change-network-helpers';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import { Account } from '@axe/core/network/server/server-protocol';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS } from '@axe/core/storage/asset-retries';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { clearIdentity, loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { DEFAULT_CURSOR_IMAGE_IDENTIFIER, DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { isTableWithheld, markLoadedWithheld, markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { IdleSeatService } from '@axe/features/lobby/idle-seat.service';
import { NetworkEventHandlerService } from '@axe/features/lobby/network-event-handler.service';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
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
  readonly peerDisconnect$ = new EventChannel<NetworkPeerEvent>();
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
    vi.useRealTimers();
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

  it('keeps the role held in the last room while it waits outside, its role there going down beside it', () => {
    PeerCursor.myCursor = new PeerCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    saveIdentity({ userId: 'u', roomId: 'abc', roomName: 'room', role: PeerRole.GameMaster, reConnectPass: '' });
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'p',
      userId: 'u',
      roomId: '',
      roomName: '',
      isRoom: false,
    } as never);

    stubChange.networkOpen$.emit({ peerId: 'p' });

    expect(loadIdentity()).toEqual(
      expect.objectContaining({ roomId: 'abc', role: PeerRole.Player, roomRole: PeerRole.GameMaster })
    );
  });

  it('writes down nothing of the seat while a replay’s board is on the table, cut off from the room', () => {
    PeerCursor.myCursor = new PeerCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    saveIdentity({ userId: 'u', roomId: 'abc', roomName: 'room', role: PeerRole.Player, reConnectPass: '' });
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'p',
      userId: 'u',
      roomId: 'abc',
      roomName: 'room',
      isRoom: true,
    } as never);
    const handler = TestBed.inject(NetworkEventHandlerService) as unknown as { rememberSeat(cursor: PeerCursor): void };

    setNetworkIsolated(true);
    try {
      handler.rememberSeat(PeerCursor.myCursor);
    } finally {
      setNetworkIsolated(false);
    }
    expect(loadIdentity()?.role).toBe(PeerRole.Player);

    handler.rememberSeat(PeerCursor.myCursor);
    expect(loadIdentity()?.role).toBe(PeerRole.GameMaster);
  });

  it('keeps the roles written down when the connection opens while a replay’s board is on the table', () => {
    PeerCursor.myCursor = new PeerCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    saveIdentity({ userId: 'u', roomId: 'abc', roomName: 'room', role: PeerRole.Player, reConnectPass: '' });
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'p',
      userId: 'u',
      roomId: '',
      roomName: '',
      isRoom: false,
    } as never);

    setNetworkIsolated(true);
    try {
      stubChange.networkOpen$.emit({ peerId: 'p' });
    } finally {
      setNetworkIsolated(false);
    }

    expect(loadIdentity()).toEqual(
      expect.objectContaining({ roomId: 'abc', role: PeerRole.Player, roomRole: PeerRole.Player })
    );
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

  it('plays as a player alone in local mode, though a room made the seat a guest before', () => {
    vi.spyOn(Network, 'configure').mockImplementation(() => {});
    PeerCursor.createMyCursor().role = PeerRole.Guest;

    stubChange.loadConfig$.emit({ config: { backend: { url: '' }, localMode: true } });

    expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
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

  it('leaves alone, once its backoff is up, a room or a wait asked for since the server error', async () => {
    vi.useFakeTimers();
    try {
      const openStandbySpy = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      let asked = 1;
      vi.spyOn(Network, 'openRequests', 'get').mockImplementation(() => asked);

      stubChange.networkError$.emit({ errorType: 'server-error', errorMessage: 'oops' });
      asked = 2;
      await vi.advanceTimersByTimeAsync(3000);

      expect(openStandbySpy).not.toHaveBeenCalled();
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
      expect(TestBed.inject(NetworkReachService).unreachable()).toBe(true);
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

  it('tells the reader alone, naming the room server, when the link to it drops and comes back', () => {
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('my-seat');
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
    const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});

    stubChange.peerReconnect$.emit({ peerId: 'my-seat', state: 'retrying' });
    stubChange.peerReconnect$.emit({ peerId: 'my-seat', state: 'recovered' });

    expect(shown.mock.calls.map(([text]) => text)).toEqual([
      '部屋のサーバーとの接続が切れました。再接続しています…',
      '部屋のサーバーとの接続を復旧しました。',
    ]);
    expect(chatStub.sendSystemMessage).not.toHaveBeenCalled();
  });

  it('shows nothing of the link to the room server on a screen made for streaming', () => {
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('my-seat');
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(TestBed.inject(OverlayModeService), 'active').mockReturnValue(true);
    const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});

    stubChange.peerReconnect$.emit({ peerId: 'my-seat', state: 'retrying' });
    stubChange.peerReconnect$.emit({ peerId: 'my-seat', state: 'recovered' });

    expect(shown).not.toHaveBeenCalled();
    expect(chatStub.sendSystemMessage).not.toHaveBeenCalled();
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
        ['room-deleted', 'roomServerDeleted'],
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

    it('never waits as an account without the prefix after its logout, though a version before saved it as the tab’s', () => {
      const unprefixed = 'e0100553-8866-4924-8a4a-d4900ac59de5';
      const openStandby = vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      saveIdentity({
        userId: unprefixed,
        roomId: '',
        roomName: '',
        role: '',
        reConnectPass: '',
        guestUserId: unprefixed,
      });
      account.set({ ...ACCOUNT, userId: unprefixed });
      TestBed.tick();
      account.set(null);
      TestBed.tick();
      openStandby.mockClear();

      stubChange.networkError$.emit({ errorType: 'room-not-found', errorMessage: '' });

      expect(openStandby).toHaveBeenCalledTimes(1);
      expect(openStandby.mock.calls[0][0]).not.toBe(unprefixed);
    });

    it('goes into the same room again as whoever has logged in', () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        userId: 'tab-1',
        roomId: 'Ab3',
        roomName: '月夜の卓',
        password: 'secret',
      } as never);
      vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('0123456789abcdef0123456789abcdef');
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
      // the password the room was opened with, not what a dialog left on the cursor
      PeerCursor.myCursor.reConnectPass = '';

      account.set(ACCOUNT);
      TestBed.tick();

      expect(open).toHaveBeenCalledWith('acct_1', 'Ab3', '月夜の卓', 'secret', '0123456789abcdef0123456789abcdef');
    });

    it('says the seat is a guest now when the login goes while in a room, but not on a login', () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        userId: 'acct_1',
        roomId: 'Ab3',
        roomName: '月夜の卓',
        password: '',
      } as never);
      vi.spyOn(Network, 'open').mockImplementation(() => {});
      const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});

      account.set(ACCOUNT);
      TestBed.tick();
      expect(shown).not.toHaveBeenCalled();

      account.set(null);
      TestBed.tick();
      expect(shown).toHaveBeenCalledExactlyOnceWith(TestBed.inject(TRANSLATE_FN)('feature.lobby.signedOutInRoom'));
    });

    it('goes into the room again as whoever is logged in when that changed while it was getting in', () => {
      const room = { isRoom: true, roomId: 'Ab3', roomName: '月夜の卓', password: 'secret' };
      const seat = vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ ...room, userId: 'acct_1' } as never);
      vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('0123456789abcdef0123456789abcdef');
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
      saveIdentity({ userId: 'acct_1', roomId: '', roomName: '', role: '', reConnectPass: '', guestUserId: 'tab-1' });

      stubChange.networkOpen$.emit({ peerId: 'p' });
      expect(open).toHaveBeenCalledExactlyOnceWith(
        'tab-1',
        'Ab3',
        '月夜の卓',
        'secret',
        '0123456789abcdef0123456789abcdef'
      );

      open.mockClear();
      seat.mockReturnValue({ ...room, userId: 'tab-1' } as never);
      stubChange.networkOpen$.emit({ peerId: 'p' });
      expect(open).not.toHaveBeenCalled();
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

    it('takes back on logout the name and avatar it lent, but not ones chosen since', () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: false, userId: 'tab-1' } as never);
      vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
      PeerCursor.myCursor.name = DEFAULT_CURSOR_NAME;
      PeerCursor.myCursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
      account.set({ ...ACCOUNT, avatarUrl: 'https://cdn.example/a.png' });
      TestBed.tick();
      expect(PeerCursor.myCursor.imageIdentifier).not.toBe(DEFAULT_CURSOR_IMAGE_IDENTIFIER);

      account.set(null);
      TestBed.tick();
      expect(PeerCursor.myCursor.name).toBe(DEFAULT_CURSOR_NAME);
      expect(PeerCursor.myCursor.imageIdentifier).toBe(DEFAULT_CURSOR_IMAGE_IDENTIFIER);

      account.set(ACCOUNT);
      TestBed.tick();
      PeerCursor.myCursor.name = 'ゴブリン使い';
      account.set(null);
      TestBed.tick();
      expect(PeerCursor.myCursor.name).toBe('ゴブリン使い');
    });
  });

  describe('roles on a room server', () => {
    const sent = () => chatStub.sendSystemMessage.mock.calls.map(([text]) => text as string);

    beforeEach(() => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      PeerCursor.myCursor = new PeerCursor();
    });

    it('warns of being let out for the page left alone, takes it back once used, and offers to go back in', () => {
      const snackbar = TestBed.inject(SnackbarService);
      const shown = vi.spyOn(snackbar, 'show');
      const comeBack = vi.spyOn(Network, 'comeBackFromIdle').mockImplementation(() => {});
      const idleSeat = TestBed.inject(IdleSeatService);

      localDispatch('SEAT_IDLE', { state: 'soon' }, 'someone-else');
      localDispatch('SEAT_IDLE', { state: 'soon' });
      expect(shown).toHaveBeenCalledTimes(1);
      localDispatch('SEAT_IDLE', { state: 'back' });
      expect(snackbar.current()).toBeNull();

      localDispatch('SEAT_IDLE', { state: 'left' });
      expect(idleSeat.leftAlone()).toBe(true);
      snackbar.runAction();

      expect(comeBack).toHaveBeenCalledTimes(1);
      expect(idleSeat.leftAlone()).toBe(false);
    });

    it('takes on the role the server gave as the room opens, over the one saved before', () => {
      PeerCursor.myCursor.role = 'gm';
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('guest');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);

      stubChange.networkOpen$.emit({ peerId: 'p' });

      expect(PeerCursor.myCursor.role).toBe('guest');
    });

    it('plays as a player outside a room, whatever role a room gave', () => {
      PeerCursor.myCursor.role = 'guest';
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue(null);
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: false } as never);

      stubChange.networkOpen$.emit({ peerId: 'p' });

      expect(PeerCursor.myCursor.role).toBe('pl');
    });

    it.each([
      ['a GM in a room', 'gm', true, 1],
      ['a PL in a room', 'pl', true, 1],
      ['a guest in a room', 'guest', true, 0],
      ['somebody waiting outside a room', null, false, 0],
    ] as const)('brings the pictures and sounds it holds into the room as %s may', (_name, role, isRoom, times) => {
      const images = vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      const audios = vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue(role);
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom } as never);

      stubChange.networkOpen$.emit({ peerId: 'p' });

      expect(images).toHaveBeenCalledTimes(times);
      expect(audios).toHaveBeenCalledTimes(times);
    });

    it('names what it holds to the others instead as a guest in a room, who puts nothing up', () => {
      const images = vi.spyOn(ImageStorage.instance, 'synchronize').mockImplementation(() => {});
      const audios = vi.spyOn(AudioStorage.instance, 'synchronize').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('guest');
      const inRoom = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);

      stubChange.networkOpen$.emit({ peerId: 'p' });
      expect(images).toHaveBeenCalledTimes(1);
      expect(audios).toHaveBeenCalledTimes(1);

      inRoom.mockReturnValue({ peerId: 'p', userId: 'u', isRoom: false } as never);
      stubChange.networkOpen$.emit({ peerId: 'p' });
      expect(images).toHaveBeenCalledTimes(1);
    });

    it('brings them in again once back in the room after the line dropped', () => {
      const images = vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('pl');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');

      stubChange.peerReconnect$.emit({ peerId: 'p', state: 'recovered' });

      expect(images).toHaveBeenCalledTimes(1);
    });

    it('puts up only what was missed, and reads the room again, telling nobody, once back on a link the server asked for', async () => {
      const all = vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      const missed = vi.spyOn(ImageStorage.instance, 'uploadMissedToAssetStore').mockImplementation(() => {});
      const missedSounds = vi.spyOn(AudioStorage.instance, 'uploadMissedToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('pl');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const list = vi.spyOn(AssetHttpStore.instance, 'listRoomAssets').mockResolvedValue([]);
      const forgot = vi.spyOn(ImageSharingSystem.instance, 'forgetMisses');
      const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});

      stubChange.peerReconnect$.emit({ peerId: 'p', state: 'resumed' });

      expect(missed).toHaveBeenCalledTimes(1);
      expect(missedSounds).toHaveBeenCalledTimes(1);
      expect(all).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
      expect(forgot).not.toHaveBeenCalled();
      expect(shown).not.toHaveBeenCalled();
      expect(chatStub.sendSystemMessage).not.toHaveBeenCalled();
    });

    it('fetches what the room holds as it opens, pictures and sounds apart', async () => {
      vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('guest');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      const picture = { id: 'a'.repeat(64), type: 'image/png', size: 1, name: 'map.png' };
      const sound = { id: 'b'.repeat(64), type: 'audio/ogg', size: 1, name: 'theme.ogg' };
      vi.spyOn(AssetHttpStore.instance, 'listRoomAssets').mockResolvedValue([picture, sound]);
      const forgotPictures = vi.spyOn(ImageSharingSystem.instance, 'forgetMisses');
      const pictures = vi.spyOn(ImageSharingSystem.instance, 'fetchListed').mockImplementation(() => {});
      const sounds = vi.spyOn(AudioSharingSystem.instance, 'fetchListed').mockImplementation(() => {});
      const upPictures = vi.spyOn(ImageStorage.instance, 'forgetUploaded');
      const upSounds = vi.spyOn(AudioStorage.instance, 'forgetUploaded');

      stubChange.networkOpen$.emit({ peerId: 'p' });

      await vi.waitFor(() => expect(pictures).toHaveBeenCalledWith([picture]));
      expect(sounds).toHaveBeenCalledWith([sound]);
      expect(forgotPictures).toHaveBeenCalled();
      expect(upPictures).toHaveBeenCalledWith([picture.id]);
      expect(upSounds).toHaveBeenCalledWith([sound.id]);
    });

    it('fetches nothing from the room while waiting outside one, or when the server cannot say', async () => {
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue(null);
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: false } as never);
      const list = vi.spyOn(AssetHttpStore.instance, 'listRoomAssets').mockResolvedValue(null);
      const pictures = vi.spyOn(ImageSharingSystem.instance, 'fetchListed').mockImplementation(() => {});

      stubChange.networkOpen$.emit({ peerId: 'p' });
      expect(list).not.toHaveBeenCalled();

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');
      stubChange.peerReconnect$.emit({ peerId: 'p', state: 'recovered' });
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
      expect(pictures).not.toHaveBeenCalled();
    });

    it('asks the room for its list again a little later when the server could not give it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('guest');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      const picture = { id: 'a'.repeat(64), type: 'image/png', size: 1, name: 'map.png' };
      const list = vi
        .spyOn(AssetHttpStore.instance, 'listRoomAssets')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([picture]);
      const pictures = vi.spyOn(ImageSharingSystem.instance, 'fetchListed').mockImplementation(() => {});
      vi.spyOn(AudioSharingSystem.instance, 'fetchListed').mockImplementation(() => {});

      stubChange.networkOpen$.emit({ peerId: 'p' });
      await vi.advanceTimersByTimeAsync(0);
      expect(list).toHaveBeenCalledTimes(1);
      expect(pictures).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS);

      expect(list).toHaveBeenCalledTimes(2);
      expect(pictures).toHaveBeenCalledWith([picture]);
    });

    it('gives each GM or PL linked before this seat a turn ahead of it to put up what a guest named', () => {
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('peer-c');
      vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['peer-a', 'peer-b', 'peer-d', 'peer-g']);
      const seats = [
        ['peer-a', PeerRole.GameMaster],
        ['peer-b', PeerRole.Player],
        ['peer-d', PeerRole.Player],
        ['peer-g', PeerRole.Guest],
      ].map(([peerId, role]) => {
        const cursor = new PeerCursor();
        cursor.peerId = peerId;
        cursor.role = role as PeerRole;
        cursor.initialize();
        return cursor;
      });
      try {
        expect(ImageStorage.instance.receivedUploadTurn()).toBe(2);
        expect(AudioStorage.instance.receivedUploadTurn()).toBe(2);
      } finally {
        for (const cursor of seats) cursor.destroy();
      }
    });

    it('reads the room’s list again a little after somebody leaves, for what they put up on the way out', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('pl');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');
      const picture = { id: 'a'.repeat(64), type: 'image/png', size: 1, name: 'map.png' };
      const list = vi.spyOn(AssetHttpStore.instance, 'listRoomAssets').mockResolvedValue([picture]);
      const pictures = vi.spyOn(ImageSharingSystem.instance, 'fetchListed').mockImplementation(() => {});
      vi.spyOn(AudioSharingSystem.instance, 'fetchListed').mockImplementation(() => {});

      stubChange.peerDisconnect$.emit({ peerId: 'q' });
      stubChange.peerDisconnect$.emit({ peerId: 'r' });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(list).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(list).toHaveBeenCalledTimes(1);
      expect(pictures).toHaveBeenCalledWith([picture]);
    });

    it.each([
      ['through SkyWay', 'skyway', true, 'p'],
      ['waiting outside a room', 'server', false, 'p'],
      ['gone into another room since', 'server', true, 'p2'],
    ] as const)('reads no list after somebody leaves %s', async (_case, transport, isRoom, peerIdThen) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'transport', 'get').mockReturnValue(transport);
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom } as never);
      const peerId = vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');
      const list = vi.spyOn(AssetHttpStore.instance, 'listRoomAssets').mockResolvedValue([]);

      stubChange.peerDisconnect$.emit({ peerId: 'q' });
      peerId.mockReturnValue(peerIdThen);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(list).not.toHaveBeenCalled();
    });

    it('stops asking for the room’s list once the seat has left the room', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('guest');
      const inRoom = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      const picture = { id: 'a'.repeat(64), type: 'image/png', size: 1, name: 'map.png' };
      const list = vi
        .spyOn(AssetHttpStore.instance, 'listRoomAssets')
        .mockResolvedValueOnce(null)
        .mockResolvedValue([picture]);
      const pictures = vi.spyOn(ImageSharingSystem.instance, 'fetchListed').mockImplementation(() => {});
      vi.spyOn(AudioSharingSystem.instance, 'fetchListed').mockImplementation(() => {});

      stubChange.networkOpen$.emit({ peerId: 'p' });
      await vi.advanceTimersByTimeAsync(0);
      inRoom.mockReturnValue({ peerId: 'p', userId: 'u', isRoom: false } as never);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 7);

      expect(list).toHaveBeenCalledTimes(2);
      expect(pictures).not.toHaveBeenCalled();
    });

    it('brings its pictures in, and takes the role on, once the server makes it a player', () => {
      const images = vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('pl');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      PeerCursor.myCursor.role = 'guest';

      localDispatch('SERVER_ROLE_CHANGED', { role: 'pl' }, 'someone-else');
      expect(images).not.toHaveBeenCalled();
      localDispatch('SERVER_ROLE_CHANGED', { role: 'pl' });

      expect(images).toHaveBeenCalledTimes(1);
      expect(PeerCursor.myCursor.role).toBe('pl');
    });

    it('holds the table as withheld while a role other than the GM, and whole once the GM', () => {
      vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      const role = vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('pl');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      try {
        localDispatch('SERVER_ROLE_CHANGED', { role: 'pl' });
        expect(isTableWithheld()).toBe(true);

        role.mockReturnValue('gm');
        localDispatch('SERVER_ROLE_CHANGED', { role: 'gm' });
        expect(isTableWithheld()).toBe(false);
      } finally {
        markLoadedWithheld(false, false);
      }
    });

    it('keeps the table withheld when the seat is the GM of another room, or of one it made', () => {
      vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('gm');
      const key = vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('room-b');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      markSeatWithheld(true, 'room-a');
      try {
        localDispatch('SERVER_ROLE_CHANGED', { role: 'gm' });
        expect(isTableWithheld()).toBe(true);

        key.mockReturnValue('room-a');
        localDispatch('SERVER_ROLE_CHANGED', { role: 'gm' });
        expect(isTableWithheld()).toBe(false);
      } finally {
        markLoadedWithheld(false, false);
      }
    });

    it('keeps the table withheld after a marked save was loaded, even once the GM', () => {
      vi.spyOn(ImageStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(AudioStorage.instance, 'uploadAllToAssetStore').mockImplementation(() => {});
      vi.spyOn(Network, 'serverRole', 'get').mockReturnValue('gm');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom: true } as never);
      markLoadedWithheld(true, false);
      try {
        localDispatch('SERVER_ROLE_CHANGED', { role: 'gm' });

        expect(isTableWithheld()).toBe(true);
      } finally {
        markLoadedWithheld(false, false);
      }
    });

    it('says why the server kept a role as it was', () => {
      localDispatch('ROLE_REJECTED', { peerId: 'x', role: 'pl', reason: 'not-logged-in' }, '@authority');
      localDispatch('ROLE_REJECTED', { peerId: 'x', role: 'pl', reason: 'not-logged-in' }, 'someone-else');

      expect(sent()).toHaveLength(1);
      expect(sent()[0]).toContain('feature.lobby.roleRejected.notLoggedIn');
    });
  });
});
