import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';
import type { Account } from '@axe/core/network/server/server-protocol';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { clearIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { buildInviteLink } from '@axe/domain/peer/invite-link';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { markLoadedWithheld, markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { InviteJoinComponent } from '@axe/features/lobby/invite-join/invite-join.component';
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import { RoomJoinService } from '@axe/features/lobby/room-join.service';
import { RoomRestoreOfferService } from '@axe/features/room-archive/room-restore-banner/room-restore-offer.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function createRoom(withPassword = false): IRoomInfo {
  const peer = PeerContext.parse('peer-1');
  peer.roomId = 'a1b';
  peer.roomName = 'room';
  if (withPassword) peer.password = 'pw';
  vi.spyOn(peer, 'verifyPassword').mockResolvedValue(true);
  return new RoomInfo('a1b', 'room', [peer]);
}

describe('InviteJoinComponent', () => {
  let fixture: ComponentFixture<InviteJoinComponent>;
  let findRoom: ReturnType<typeof vi.fn>;
  let join: ReturnType<typeof vi.fn>;
  let findServerRoom: ReturnType<typeof vi.fn>;
  let joinServerRoom: ReturnType<typeof vi.fn>;
  let modalOpen: ReturnType<typeof vi.fn>;
  let waitingForPreviousConnection: WritableSignal<boolean>;
  let isCompact: WritableSignal<boolean>;
  let restoreOffered: WritableSignal<boolean>;
  let originalMyCursor: PeerCursor;
  let auth: {
    isConfigured: boolean;
    account: WritableSignal<Account | null>;
    offersLogin: WritableSignal<boolean | null>;
    isLoggingIn: WritableSignal<boolean>;
    startLogin: ReturnType<typeof vi.fn>;
  };

  async function setup(hash: string): Promise<void> {
    location.hash = hash;
    await TestBed.configureTestingModule({
      imports: [InviteJoinComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RoomJoinService,
          useValue: { findRoom, join, findServerRoom, joinServerRoom, waitingForPreviousConnection },
        },
        { provide: ViewportService, useValue: { isCompact } },
        { provide: RoomRestoreOfferService, useValue: { visible: restoreOffered } },
        { provide: ServerAuthService, useValue: auth },
      ],
    }).compileComponents();
    TestBed.overrideProvider(ModalService, {
      useValue: {
        open: modalOpen,
        openLazy: async (load: () => Promise<unknown>, option?: unknown) =>
          (modalOpen as (...args: unknown[]) => unknown)(await load(), option),
      },
    });
    fixture = TestBed.createComponent(InviteJoinComponent);
    fixture.detectChanges();
  }

  function bannerText(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function contactLink(): string | null {
    return (
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="operator-contact-link"]')
        ?.getAttribute('href') ?? null
    );
  }

  async function eventually(assert: () => void): Promise<void> {
    await vi.waitFor(() => {
      fixture.detectChanges();
      assert();
    });
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  }

  beforeEach(() => {
    findRoom = vi.fn().mockResolvedValue(createRoom());
    join = vi.fn().mockResolvedValue(true);
    findServerRoom = vi.fn().mockResolvedValue(null);
    joinServerRoom = vi.fn().mockResolvedValue(true);
    modalOpen = vi.fn().mockResolvedValue('');
    waitingForPreviousConnection = signal(false);
    isCompact = signal(false);
    restoreOffered = signal(false);
    originalMyCursor = PeerCursor.myCursor;
    auth = {
      isConfigured: false,
      account: signal(null),
      offersLogin: signal(null),
      isLoggingIn: signal(false),
      startLogin: vi.fn().mockResolvedValue(undefined),
    };
    PeerCursor.myCursor = { reConnectPass: '', role: PeerRole.Player, update: vi.fn() } as unknown as PeerCursor;
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    location.hash = '';
    sessionStorage.clear();
    PeerCursor.myCursor = originalMyCursor;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('shows nothing and joins nothing without an invitation', async () => {
    await setup('');
    await flush();

    expect(bannerText().trim()).toBe('');
    expect(findRoom).not.toHaveBeenCalled();
  });

  it('finds the room and joins it from an invitation', async () => {
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(join).toHaveBeenCalledOnce());
    expect(findRoom).toHaveBeenCalledWith('a1b');
  });

  it('joins nothing with a table holding withheld parts unless the reader says to go in', async () => {
    const ask = vi.spyOn(ConfirmService.prototype, 'ask').mockResolvedValue(false);
    markLoadedWithheld(true, false);
    try {
      await setup('#join?r=a1b&n=room');

      await eventually(() => expect(ask).toHaveBeenCalledOnce());
      await flush();
      expect(join).not.toHaveBeenCalled();
    } finally {
      markLoadedWithheld(false, false);
    }
  });

  it('takes the banner away once it is in', async () => {
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(bannerText().trim()).toBe(''));
  });

  it('says it could not get in once reaching the network is given up, rather than saying it is joining', async () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
    await setup('#join?r=a1b&n=room');
    expect(bannerText()).toContain('参加しています');

    TestBed.inject(NetworkReachService).giveUp();
    fixture.detectChanges();

    expect(bannerText()).toContain('参加できませんでした');
    expect(join).not.toHaveBeenCalled();
  });

  it('leaves a seat in the room it made while the invitation waited, rather than taking it to the invited one', async () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
    await setup('#join?r=a1b&n=room');
    vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('made-room');

    const change = TestBed.inject(ObjectChangeService) as unknown as {
      _networkOpen$: { emit(event: { peerId: string }): void };
    };
    change._networkOpen$.emit({ peerId: 'made-room-peer' });
    await flush();

    expect(findRoom).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(bannerText().trim()).toBe('');
    expect(location.hash).toBe('');
  });

  it('fetches the lobby and opens it once asked, after the banner said it could not join', async () => {
    findRoom.mockResolvedValue(null);
    await setup('#join?r=a1b&n=room');
    await eventually(() => expect(bannerText()).toContain('見つかりませんでした'));
    const openLobby = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
      button.textContent?.includes('ロビー')
    )!;

    openLobby.click();

    await eventually(() => expect(modalOpen).toHaveBeenCalledOnce());
    expect(modalOpen.mock.calls[0][0]).toBe(LobbyComponent);
    expect(modalOpen.mock.calls[0][1]).toMatchObject({ width: 700, height: 400 });
  });

  it('takes the invitation off the address once another room opens, after the banner said it could not join', async () => {
    findRoom.mockResolvedValue(null);
    await setup('#join?r=a1b&n=room');
    await eventually(() => expect(bannerText()).toContain('見つかりませんでした'));
    const change = TestBed.inject(ObjectChangeService) as unknown as {
      _networkOpen$: { emit(event: { peerId: string }): void };
    };

    vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('a1b');
    change._networkOpen$.emit({ peerId: 'invited-room-peer' });
    expect(location.hash).toBe('#join?r=a1b&n=room');

    vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('made-room');
    change._networkOpen$.emit({ peerId: 'made-room-peer' });
    expect(location.hash).toBe('');
  });

  it('leaves a seat in the room it made while the invited room was looked up', async () => {
    let found: (room: unknown) => void = () => undefined;
    findRoom.mockReturnValue(new Promise((resolve) => (found = resolve)));
    await setup('#join?r=a1b&n=room');
    await eventually(() => expect(findRoom).toHaveBeenCalled());

    vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('made-room');
    found(createRoom());
    await flush();

    expect(join).not.toHaveBeenCalled();
    expect(bannerText().trim()).toBe('');
    expect(location.hash).toBe('');
  });

  it('joins nothing when a connection opens after it said it could not get in', async () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
    await setup('#join?r=a1b&n=room');
    TestBed.inject(NetworkReachService).giveUp();
    fixture.detectChanges();

    const change = TestBed.inject(ObjectChangeService) as unknown as {
      _networkOpen$: { emit(event: { peerId: string }): void };
    };
    change._networkOpen$.emit({ peerId: 'made-room' });
    await flush();

    expect(findRoom).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it('says it is waiting for this seat’s previous connection to drop while the join does', async () => {
    join.mockReturnValue(new Promise<boolean>(() => {}));
    await setup('#join?r=a1b&n=room');
    await eventually(() => expect(join).toHaveBeenCalled());

    waitingForPreviousConnection.set(true);
    fixture.detectChanges();
    expect(bannerText()).toContain('前の接続が切れるのを待っています');
  });

  it('takes the role the link names', async () => {
    await setup('#join?r=a1b&n=room&role=guest');

    await eventually(() => expect(PeerCursor.myCursor.role).toBe(PeerRole.Guest));
  });

  it('takes the role the link names before the room is opened, so a reload while it waits comes back in it', async () => {
    let roleWhenJoined: PeerRole | null = null;
    join.mockImplementation(async () => {
      roleWhenJoined = PeerCursor.myCursor.role;
      return true;
    });
    await setup('#join?r=a1b&n=room&role=guest');

    await eventually(() => expect(join).toHaveBeenCalledOnce());
    expect(roleWhenJoined).toBe(PeerRole.Guest);
  });

  it('leaves the role of a room the seat went into meanwhile when it cannot get in', async () => {
    join.mockImplementation(async () => {
      vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('zzz');
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      return false;
    });
    await setup('#join?r=a1b&n=room&role=guest');

    await eventually(() => expect(bannerText()).toContain('参加できませんでした'));
    expect(PeerCursor.myCursor.role).toBe(PeerRole.GameMaster);
  });

  it('leaves the seat in the role it had when it cannot get in', async () => {
    join.mockResolvedValue(false);
    await setup('#join?r=a1b&n=room&role=guest');

    await eventually(() => expect(bannerText()).toContain('参加できませんでした'));
    expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
  });

  it('keeps the role held in the room this tab was last in, coming back to it, over the one the link names', async () => {
    saveIdentity({ userId: 'u', roomId: 'a1b', roomName: 'room', role: PeerRole.GameMaster, reConnectPass: '' });
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    await setup('#join?r=a1b&n=room&role=pl');

    await eventually(() => expect(join).toHaveBeenCalledOnce());
    await flush();
    expect(PeerCursor.myCursor.role).toBe(PeerRole.GameMaster);
    clearIdentity();
  });

  it('says a browser set to play offline cannot join, and lets the banner be closed', async () => {
    localStorage.setItem(STORAGE_KEYS.localMode, '1');
    try {
      await setup('#join?r=a1b&n=room');
      await flush();

      expect(bannerText()).toContain('オフラインのため');
      expect(findRoom).not.toHaveBeenCalled();
      const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(['閉じる']);
      const notice = (fixture.nativeElement as HTMLElement).querySelector('div')!;
      expect(notice.classList).toContain('top-24');
      expect(notice.classList.contains('top-3')).toBe(false);
    } finally {
      localStorage.removeItem(STORAGE_KEYS.localMode);
    }
  });

  it('holds the offline notice back on a narrow screen until the offer to restore is answered', async () => {
    localStorage.setItem(STORAGE_KEYS.localMode, '1');
    isCompact.set(true);
    restoreOffered.set(true);
    try {
      await setup('#join?r=a1b&n=room');
      await flush();
      expect(bannerText().trim()).toBe('');

      restoreOffered.set(false);
      fixture.detectChanges();
      expect(bannerText()).toContain('オフラインのため');
    } finally {
      localStorage.removeItem(STORAGE_KEYS.localMode);
    }
  });

  it('shows the offline notice beside the offer to restore on a wide screen, below it', async () => {
    localStorage.setItem(STORAGE_KEYS.localMode, '1');
    restoreOffered.set(true);
    try {
      await setup('#join?r=a1b&n=room');
      await flush();

      expect(bannerText()).toContain('オフラインのため');
    } finally {
      localStorage.removeItem(STORAGE_KEYS.localMode);
    }
  });

  it('says so when the room is not there', async () => {
    findRoom.mockResolvedValue(null);
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(bannerText()).toContain('見つかりません'));
    expect(join).not.toHaveBeenCalled();
  });

  it('says so when it cannot get in', async () => {
    join.mockResolvedValue(false);
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(bannerText()).toContain('参加できません'));
  });

  it('asks for the password when the link carries none', async () => {
    findRoom.mockResolvedValue(createRoom(true));
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(modalOpen).toHaveBeenCalledOnce());
  });

  it('asks for nothing when it does', async () => {
    findRoom.mockResolvedValue(createRoom(true));
    await setup(
      buildInviteLink('', { roomId: 'a1b', roomName: 'room', roomKey: '', password: 'pw', role: null, overlay: false })
    );

    await eventually(() => expect(join).toHaveBeenCalledWith(expect.anything(), 'pw'));
    expect(modalOpen).not.toHaveBeenCalled();
  });

  describe('on a room server', () => {
    const KEY = '0123456789abcdef0123456789abcdef';
    const serverRoom = (hasPassword: boolean): IRoomInfo => ({
      id: 'a1b',
      name: 'room',
      hasPassword,
      peers: [],
      memberCount: 1,
      roomKey: KEY,
      filterByPassword: () => [],
    });
    const link = (password: string) =>
      buildInviteLink('', { roomId: 'a1b', roomName: 'room', roomKey: KEY, password, role: null, overlay: false });

    beforeEach(() => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
    });

    it('finds the room by the key in the link and joins it there', async () => {
      const room = serverRoom(true);
      findServerRoom.mockResolvedValue(room);
      await setup(link('pw'));

      await eventually(() => expect(joinServerRoom).toHaveBeenCalledWith(room, 'pw'));
      expect(findServerRoom).toHaveBeenCalledWith(KEY, 'a1b', 'room');
      expect(join).not.toHaveBeenCalled();
      expect(modalOpen).not.toHaveBeenCalled();
    });

    it('joins no other room with a table withheld in one, unless the reader says to go in', async () => {
      const ask = vi.spyOn(ConfirmService.prototype, 'ask').mockResolvedValue(false);
      markSeatWithheld(true, 'f'.repeat(32));
      findServerRoom.mockResolvedValue(serverRoom(false));
      try {
        await setup(link(''));

        await eventually(() => expect(ask).toHaveBeenCalledOnce());
        await flush();
        expect(joinServerRoom).not.toHaveBeenCalled();
      } finally {
        markLoadedWithheld(false, false);
      }
    });

    it('asks for the password, for the server to check, when the link carries none', async () => {
      findServerRoom.mockResolvedValue(serverRoom(true));
      modalOpen.mockResolvedValue('typed');
      await setup(link(''));

      await eventually(() => expect(joinServerRoom).toHaveBeenCalledWith(expect.anything(), 'typed'));
      expect(modalOpen.mock.calls[0][1]).toMatchObject({ checkedByServer: true });
    });

    it('hands the server the invitation the link carries before joining', async () => {
      findServerRoom.mockResolvedValue(serverRoom(false));
      const setServerInvite = vi.spyOn(Network, 'setServerInvite').mockImplementation(() => {});
      await setup(
        buildInviteLink('', {
          roomId: 'a1b',
          roomName: 'room',
          roomKey: KEY,
          password: '',
          role: null,
          overlay: false,
          invite: 'signed-invite',
        })
      );

      await eventually(() => expect(joinServerRoom).toHaveBeenCalled());
      expect(setServerInvite).toHaveBeenCalledWith('signed-invite', KEY);
      expect(setServerInvite.mock.invocationCallOrder[0]).toBeLessThan(joinServerRoom.mock.invocationCallOrder[0]);
    });

    it('takes no role from the link, which is the server’s to give', async () => {
      findServerRoom.mockResolvedValue(serverRoom(false));
      joinServerRoom.mockResolvedValue(true);
      await setup(
        buildInviteLink('', {
          roomId: 'a1b',
          roomName: 'room',
          roomKey: KEY,
          password: '',
          role: PeerRole.GameMaster,
          overlay: false,
        })
      );

      await eventually(() => expect(joinServerRoom).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
    });

    it('says it could not get in when the server cannot be asked about the room', async () => {
      findServerRoom.mockRejectedValue(new Error('out of reach'));
      await setup(link(''));

      await eventually(() => expect(bannerText()).toContain('参加できません'));
      expect(joinServerRoom).not.toHaveBeenCalled();
    });

    it('says the operator has blocked this connection when the server turns the lookup away for it', async () => {
      findServerRoom.mockRejectedValue(new ServerRoomApiError(403, 'banned'));
      await setup(link(''));

      await eventually(() => expect(bannerText()).toContain('運営者が、この回線を止めています'));
      expect(joinServerRoom).not.toHaveBeenCalled();
    });

    it('links the operator’s contact beside the word of the block, where the server gave one', async () => {
      findServerRoom.mockRejectedValue(new ServerRoomApiError(403, 'banned', 'https://example.com/contact'));
      await setup(link(''));

      await eventually(() => expect(contactLink()).toBe('https://example.com/contact'));
    });

    describe('for a reader who has not logged in', () => {
      function press(testId: string): void {
        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click();
        fixture.detectChanges();
      }

      beforeEach(() => {
        auth.isConfigured = true;
        auth.offersLogin.set(true);
        findServerRoom.mockResolvedValue(serverRoom(false));
      });

      it('asks them to log in, or to go in to watch, before going in', async () => {
        await setup(link(''));

        await eventually(() => expect(bannerText()).toContain('PL・GMとして入るには'));
        expect(joinServerRoom).not.toHaveBeenCalled();

        press('invite-join-watch');

        await eventually(() => expect(joinServerRoom).toHaveBeenCalledOnce());
      });

      it('goes in once the login it opened is done', async () => {
        await setup(link(''));
        await eventually(() => expect(bannerText()).toContain('PL・GMとして入るには'));

        press('invite-join-login');
        expect(auth.startLogin).toHaveBeenCalledOnce();
        await flush();
        expect(joinServerRoom).not.toHaveBeenCalled();

        auth.account.set({ userId: 'acct_1', name: 'Kai', avatarUrl: null });

        await eventually(() => expect(joinServerRoom).toHaveBeenCalledOnce());
      });

      it('does not ask again in a tab that chose to watch the room', async () => {
        await setup(link(''));
        await eventually(() => expect(bannerText()).toContain('PL・GMとして入るには'));
        press('invite-join-watch');
        await eventually(() => expect(joinServerRoom).toHaveBeenCalledOnce());
        fixture.destroy();
        TestBed.resetTestingModule();
        joinServerRoom.mockClear();

        await setup(link(''));

        await eventually(() => expect(joinServerRoom).toHaveBeenCalledOnce());
        expect(bannerText()).not.toContain('PL・GMとして入るには');
      });

      it('asks nothing where the server offers no login, or on a screen for streaming', async () => {
        auth.offersLogin.set(false);
        await setup(link(''));
        await eventually(() => expect(joinServerRoom).toHaveBeenCalledOnce());
        fixture.destroy();
        TestBed.resetTestingModule();
        joinServerRoom.mockClear();

        auth.offersLogin.set(true);
        await setup(
          buildInviteLink('', {
            roomId: 'a1b',
            roomName: 'room',
            roomKey: KEY,
            password: '',
            role: null,
            overlay: true,
          })
        );

        await eventually(() => expect(joinServerRoom).toHaveBeenCalledOnce());
      });
    });

    it('says the room is gone when the server does not list it', async () => {
      await setup(link(''));

      await eventually(() => expect(findServerRoom).toHaveBeenCalled());
      expect(joinServerRoom).not.toHaveBeenCalled();
    });
  });
});
