import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RoomDeletionService } from '@axe/application/lobby/room-deletion.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { LOCAL_MODE_STORAGE_KEY, LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import { loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { IdleSeatService } from '@axe/features/lobby/idle-seat.service';
import { PeerMenuComponent } from '@axe/features/lobby/peer-menu/peer-menu.component';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PeerMenuComponent', () => {
  let component: PeerMenuComponent;
  let fixture: ComponentFixture<PeerMenuComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PeerMenuComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PeerMenuComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    (PeerCursor as unknown as Record<string, unknown>)['userIdMap'] = new Map();
    (PeerCursor as unknown as Record<string, unknown>)['peerIdMap'] = new Map();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('asks for no change detector', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).changeDetector).toBeUndefined();
  });

  it('holds the time in a signal', () => {
    expect(typeof component.myTime).toBe('function');
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(PeerMenuComponent, {
      beforeOpen: () => {
        PeerCursor.createMyCursor();
      },
    });
  });

  it('offers a reconnect among peers once anybody else is connected, the peers listed being the others', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    const peers = vi.spyOn(Network.instance, 'peerIds', 'get').mockReturnValue(['peer-a']);
    expect(component.shouldShowReconnectButton).toBe(true);

    peers.mockReturnValue([]);
    expect(component.shouldShowReconnectButton).toBe(false);
    vi.restoreAllMocks();
  });

  it('leaves the private connection controls out', () => {
    PeerCursor.createMyCursor();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('プライベート接続');
  });

  describe('promoting yourself', () => {
    beforeEach(() => {
      PeerCursor.createMyCursor();
    });

    function addGameMasterPeer(): void {
      const gm = new PeerCursor();
      gm.role = PeerRole.GameMaster;
      gm.initialize();
    }

    it('will not make you the game master while there is one', () => {
      addGameMasterPeer();
      PeerCursor.myCursor.role = PeerRole.Player;
      expect(component.isRoleSelfAssignable(PeerRole.GameMaster)).toBe(false);
    });

    it('will while there is none, so the room can recover', () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      expect(component.isRoleSelfAssignable(PeerRole.GameMaster)).toBe(true);
    });

    it('lets anybody take the player or guest role', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      expect(component.isRoleSelfAssignable(PeerRole.Player)).toBe(true);
      expect(component.isRoleSelfAssignable(PeerRole.Guest)).toBe(true);
    });

    it('lets the game master keep it', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(component.isRoleSelfAssignable(PeerRole.GameMaster)).toBe(true);
    });

    it('refuses the promotion outright while somebody holds it', () => {
      addGameMasterPeer();
      PeerCursor.myCursor.role = PeerRole.Player;
      component.setMyRole(PeerRole.GameMaster);
      expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
    });
  });

  describe('a role taken outside a room', () => {
    beforeEach(() => {
      PeerCursor.createMyCursor();
    });

    afterEach(() => {
      sessionStorage.clear();
      PeerCursor.myCursor = null!;
    });

    it('writes down only the role, keeping the tab’s user id and the room it was last in', () => {
      saveIdentity({
        userId: 'tab-user',
        roomId: 'room-1',
        roomName: '卓',
        role: PeerRole.GameMaster,
        reConnectPass: '',
        roomKey: '',
      });
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        userId: '',
        roomId: '',
        roomName: '',
        isRoom: false,
      } as never);
      PeerCursor.myCursor.role = PeerRole.GameMaster;

      component.setMyRole(PeerRole.Player);

      expect(loadIdentity()).toEqual(
        expect.objectContaining({ userId: 'tab-user', roomId: 'room-1', role: PeerRole.Player })
      );
    });

    it('forgets the room it was last in when a game master’s role is taken where the seat was not one', () => {
      saveIdentity({
        userId: 'tab-user',
        roomId: 'room-1',
        roomName: '卓',
        role: PeerRole.Player,
        reConnectPass: '',
        roomKey: 'key',
      });
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        userId: '',
        roomId: '',
        roomName: '',
        isRoom: false,
      } as never);
      PeerCursor.myCursor.role = PeerRole.Player;

      component.setMyRole(PeerRole.GameMaster);

      expect(loadIdentity()).toEqual(
        expect.objectContaining({ userId: 'tab-user', roomId: '', roomKey: '', role: PeerRole.GameMaster })
      );
    });

    it('writes no role down while a replay’s board is on the table, cut off from the room', () => {
      saveIdentity({
        userId: 'tab-user',
        roomId: 'room-1',
        roomName: '卓',
        role: PeerRole.Player,
        reConnectPass: '',
        roomKey: '',
      });
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        userId: 'tab-user',
        roomId: 'room-1',
        roomName: '卓',
        isRoom: true,
      } as never);
      PeerCursor.myCursor.role = PeerRole.Player;

      setNetworkIsolated(true);
      try {
        component.setMyRole(PeerRole.Guest);
      } finally {
        setNetworkIsolated(false);
      }

      expect(loadIdentity()).toEqual(expect.objectContaining({ role: PeerRole.Player, roomRole: PeerRole.Player }));
    });

    it('keeps the room it was last in when a game master’s role is taken back by the seat that held it there', () => {
      saveIdentity({
        userId: 'tab-user',
        roomId: 'room-1',
        roomName: '卓',
        role: PeerRole.GameMaster,
        reConnectPass: '',
        roomKey: 'key',
      });
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        userId: '',
        roomId: '',
        roomName: '',
        isRoom: false,
      } as never);
      PeerCursor.myCursor.role = PeerRole.GameMaster;

      component.setMyRole(PeerRole.Player);
      component.setMyRole(PeerRole.GameMaster);

      expect(loadIdentity()).toEqual(
        expect.objectContaining({ roomId: 'room-1', roomKey: 'key', role: PeerRole.GameMaster })
      );
    });
  });

  describe('roles on a room server', () => {
    let other: PeerCursor;

    beforeEach(() => {
      vi.spyOn(Network.instance, 'transport', 'get').mockReturnValue('server');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      other = new PeerCursor();
      other.peerId = 'other-peer';
      other.role = PeerRole.Player;
      other.initialize();
      fixture = TestBed.createComponent(PeerMenuComponent);
      component = fixture.componentInstance;
    });

    afterEach(() => {
      other.destroy();
      vi.restoreAllMocks();
    });

    it('offers the lobby, where the reader logs in or leaves, however many are in the room', () => {
      vi.spyOn(Network.instance, 'peerIds', 'get').mockReturnValue(['peer-a', 'peer-b', 'peer-c']);
      const lobby = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="peer-menu-show-lobby"]');
      fixture.detectChanges();
      expect(lobby()).not.toBeNull();

      vi.spyOn(Network.instance, 'transport', 'get').mockReturnValue('skyway');
      fixture = TestBed.createComponent(PeerMenuComponent);
      fixture.detectChanges();
      expect(lobby()).not.toBeNull();
    });

    it('lets the lobby be opened before the connection is, as the lobby says it is not reached yet', () => {
      vi.spyOn(Network.instance, 'isOpen', 'get').mockReturnValue(false);
      fixture.detectChanges();

      const lobby = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="peer-menu-show-lobby"]'
      );
      expect(lobby?.disabled).toBe(false);
    });

    it('offers a fresh sync from the server, and a reconnect, to a seat alone in the room', () => {
      vi.spyOn(Network.instance, 'peerIds', 'get').mockReturnValue([]);
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      vi.spyOn(ObjectSynchronizer.instance, 'requestFullSync').mockReturnValue(1);
      const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null!);

      expect(component.canRequestFullSync).toBe(true);
      expect(component.shouldShowReconnectButton).toBe(true);
      component.requestFullSync();

      expect(said).toHaveBeenCalledWith(encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequestedFromServer'));
    });

    it('shows your own role as the server gave it, with nothing to press', () => {
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.querySelector('[data-testid="peer-menu-server-role"]')?.textContent).toContain('GM');
    });

    it('asks the server for an invitation in the role chosen, and puts it in the link', async () => {
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        roomId: 'Ab3',
        roomName: '月夜の卓',
        password: '',
        hasPassword: false,
      } as never);
      const requestInvite = vi.spyOn(Network.instance, 'requestInvite').mockImplementation(async (role) => ({
        type: 'invite',
        role,
        invite: `signed-${role}`,
        expiresAt: Date.now() + 1e9,
      }));
      fixture = TestBed.createComponent(PeerMenuComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      await vi.waitFor(() => expect(requestInvite).toHaveBeenCalledWith(PeerRole.Player));
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>(`[data-testid="peer-menu-invite-role-${PeerRole.GameMaster}"]`)!
        .click();
      fixture.detectChanges();

      await vi.waitFor(() => expect(requestInvite).toHaveBeenCalledWith(PeerRole.GameMaster));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await vi.waitFor(() => expect((component as any).inviteLink()).toContain('i=signed-gm'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((component as any).inviteLink()).not.toContain('role=');
    });

    it('says so when the server gives no invitation', async () => {
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        roomId: 'Ab3',
        roomName: '月夜の卓',
        password: '',
        hasPassword: false,
      } as never);
      vi.spyOn(Network.instance, 'requestInvite').mockResolvedValue({
        type: 'invite',
        role: 'pl',
        invite: null,
        expiresAt: null,
      });
      fixture = TestBed.createComponent(PeerMenuComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await vi.waitFor(() => expect((component as any).serverInviteFailed()).toBe(true));
    });

    it('puts its invitation away when the reader is no longer the game master, and asks again once they are', async () => {
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        roomId: 'Ab3',
        roomName: '月夜の卓',
        password: '',
        hasPassword: false,
      } as never);
      let failing = true;
      const requestInvite = vi
        .spyOn(Network.instance, 'requestInvite')
        .mockImplementation(async (role) =>
          failing
            ? { type: 'invite', role, invite: null, expiresAt: null }
            : { type: 'invite', role, invite: `signed-${role}`, expiresAt: Date.now() + 1e9 }
        );
      fixture = TestBed.createComponent(PeerMenuComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = component as any;
      await vi.waitFor(() => expect(view.serverInviteFailed()).toBe(true));

      const settle = async () => {
        await Promise.resolve();
        fixture.detectChanges();
        await fixture.whenStable();
      };
      PeerCursor.myCursor.role = PeerRole.Player;
      await settle();
      expect(view.serverInviteFailed()).toBe(false);
      expect(view.inviteLink()).not.toContain('i=');
      const asked = requestInvite.mock.calls.length;

      failing = false;
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await settle();

      await vi.waitFor(() => expect(view.inviteLink()).toContain('i=signed-pl'));
      expect(requestInvite.mock.calls.length).toBeGreaterThan(asked);
      PeerCursor.myCursor.role = PeerRole.Player;
      await settle();
      expect(view.inviteLink()).not.toContain('i=');
    });

    it('follows the config that loads after the panel opened at startup', () => {
      vi.spyOn(Network.instance, 'transport', 'get').mockReturnValue('skyway');
      fixture = TestBed.createComponent(PeerMenuComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="peer-menu-server-role"]')).toBeNull();

      TestBed.inject(ObjectChangeService).loadConfig$.emit({ config: { transport: 'server' } });
      fixture.detectChanges();

      expect(root.querySelector('[data-testid="peer-menu-server-role"]')).not.toBeNull();
    });

    it('keeps an invitation to its own room, and asks again in another', async () => {
      const room = (roomKey: string) => {
        vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue(roomKey);
      };
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        roomId: 'Ab3',
        roomName: '月夜の卓',
        password: '',
        hasPassword: false,
      } as never);
      room('room-a');
      const requestInvite = vi.spyOn(Network.instance, 'requestInvite').mockImplementation(async (role) => ({
        type: 'invite',
        role,
        invite: `signed-${Date.now()}`,
        expiresAt: Date.now() + 1e10,
      }));
      fixture = TestBed.createComponent(PeerMenuComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      const bump = async () => {
        TestBed.inject(ObjectChangeService).networkVersion.update((v) => v + 1);
        fixture.detectChanges();
        await new Promise((resolve) => setTimeout(resolve, 20));
      };
      await vi.waitFor(() => expect(requestInvite).toHaveBeenCalled());
      await bump();
      const asked = requestInvite.mock.calls.length;

      await bump();
      expect(requestInvite).toHaveBeenCalledTimes(asked);

      room('room-b');
      await bump();
      expect(requestInvite.mock.calls.length).toBeGreaterThan(asked);
    });

    it('draws the role picker again from the role as it stands when the server keeps it', () => {
      vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([
        { peerId: 'other-peer', isOpen: true },
      ] as never);
      fixture = TestBed.createComponent(PeerMenuComponent);
      fixture.detectChanges();
      const picker = () =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
          '[data-testid="peer-menu-role-other-peer"]'
        );
      const before = picker();
      expect(before).not.toBeNull();

      localDispatch('ROLE_REJECTED', { peerId: 'other-peer', role: 'guest', reason: 'not-logged-in' }, '@authority');
      fixture.detectChanges();

      expect(picker()).not.toBe(before);
    });

    describe('deleting the room', () => {
      const ROOM_KEY = '0123456789abcdef0123456789abcdef';
      const deleteButton = () =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
          '[data-testid="peer-menu-delete-room"]'
        );
      const failure = () =>
        (fixture.nativeElement as HTMLElement)
          .querySelector('[data-testid="peer-menu-delete-room-failed"]')
          ?.textContent?.trim();

      beforeEach(() => {
        vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
          isRoom: true,
          roomId: 'Ab3',
          roomName: '月夜の卓',
          password: '',
          hasPassword: false,
        } as never);
        vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue(ROOM_KEY);
        vi.spyOn(Network.instance, 'requestInvite').mockImplementation(async (role) => ({
          type: 'invite',
          role,
          invite: `signed-${role}`,
          expiresAt: Date.now() + 1e9,
        }));
      });

      it('offers to go back into the room only while the seat is let out for the page left alone', () => {
        const idleSeat = TestBed.inject(IdleSeatService);
        const comeBack = vi.spyOn(Network, 'comeBackFromIdle').mockImplementation(() => {});
        fixture = TestBed.createComponent(PeerMenuComponent);
        const button = () =>
          (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
            '[data-testid="peer-menu-come-back"]'
          );
        fixture.detectChanges();
        expect(button()).toBeNull();

        idleSeat.markLeft();
        fixture.detectChanges();
        button()!.click();

        expect(comeBack).toHaveBeenCalledTimes(1);
        expect(idleSeat.leftAlone()).toBe(false);
      });

      it('lets a GM delete the room it is in, by its key', async () => {
        const remove = vi.spyOn(TestBed.inject(RoomDeletionService), 'delete').mockResolvedValue('deleted');
        fixture = TestBed.createComponent(PeerMenuComponent);
        fixture.detectChanges();

        deleteButton()!.click();
        await vi.waitFor(() => expect(remove).toHaveBeenCalled());
        fixture.detectChanges();

        expect(remove).toHaveBeenCalledWith({ roomKey: ROOM_KEY, name: '月夜の卓', id: 'Ab3' });
        expect(failure()).toBeUndefined();
      });

      it('says why the room could not be deleted', async () => {
        const t = TestBed.inject(TRANSLATE_FN);
        vi.spyOn(TestBed.inject(RoomDeletionService), 'delete').mockResolvedValue('failed');
        fixture = TestBed.createComponent(PeerMenuComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();

        await component.deleteRoom();
        fixture.detectChanges();

        expect(failure()).toBe(t('feature.lobby.deleteRoom.failed'));
      });

      it('offers nobody but a GM to delete the room', () => {
        PeerCursor.myCursor.role = PeerRole.Player;
        fixture = TestBed.createComponent(PeerMenuComponent);
        fixture.detectChanges();

        expect(deleteButton()).toBeNull();
      });
    });

    it('asks the server to change somebody’s role, leaving their cursor for the server to change', () => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

      component.reassignRole('other-peer', PeerRole.Guest);

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'ROLE_REQUEST', data: { peerId: 'other-peer', role: PeerRole.Guest } }),
        '@authority'
      );
      expect(other.role).toBe(PeerRole.Player);
    });
  });

  describe('findPeerTimeReceive', () => {
    it('returns when a peer was last heard from', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-test';
      cursor.timestampReceive = 1234567890;

      expect(component.findPeerTimeReceive('peer-test')).toBe(1234567890);
    });

    it('returns nothing for a peer not yet heard from', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-new';

      expect(component.findPeerTimeReceive('peer-new')).toBe(-1);
    });

    it('returns zero for a peer that is not there', () => {
      expect(component.findPeerTimeReceive('nonexistent')).toBe(0);
    });
  });

  describe('findPeerTimeLatency', () => {
    it('returns the latency of a peer in seconds', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-lat';
      cursor.timeLatency = 500;

      expect(component.findPeerTimeLatency('peer-lat')).toBe(0.5);
    });

    it('returns a dash for one that is not there', () => {
      expect(component.findPeerTimeLatency('nonexistent')).toBe('--');
    });
  });

  describe('findPeerDegreeOfSuccess', () => {
    it('returns none of none before the first beat', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-deg';

      expect(component.findPeerDegreeOfSuccess('peer-deg')).toBe('0/0');
    });

    it('returns none of none for a peer that is not there', () => {
      expect(component.findPeerDegreeOfSuccess('nonexistent')).toBe('0/0');
    });

    it('works the success rate out of the heartbeats', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-stat';
      cursor.firstTimeSignNo = 0;
      cursor.lastTimeSignNo = 9;
      cursor.totalTimeSignNum = 10;

      expect(component.findPeerDegreeOfSuccess('peer-stat')).toBe('10/10');
    });

    it('with some of them missed', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-loss';
      cursor.firstTimeSignNo = 0;
      cursor.lastTimeSignNo = 9;
      cursor.totalTimeSignNum = 7;

      expect(component.findPeerDegreeOfSuccess('peer-loss')).toBe('7/10');
    });
  });

  describe('online or offline', () => {
    beforeEach(() => {
      PeerCursor.createMyCursor();
    });

    function segment(mode: string): HTMLButtonElement {
      return fixture.nativeElement.querySelector(`[data-testid="connection-mode-${mode}"]`) as HTMLButtonElement;
    }

    it('shows the two as one choice, with the network settings under online alone', () => {
      fixture.detectChanges();

      expect(segment('online').getAttribute('aria-checked')).toBe('true');
      expect(segment('offline').getAttribute('aria-checked')).toBe('false');
      expect(fixture.nativeElement.querySelector('[data-testid="online-settings"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="offline-note"]')).toBeNull();

      TestBed.inject(LocalModePreferenceService).set(true);
      fixture.detectChanges();

      expect(segment('offline').getAttribute('aria-checked')).toBe('true');
      expect(fixture.nativeElement.querySelector('[data-testid="online-settings"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="offline-note"]')).not.toBeNull();
    });

    it('asks before it starts again, and writes the choice down only once it is confirmed', async () => {
      const reload = vi.spyOn(component as unknown as { reload(): void }, 'reload').mockImplementation(() => undefined);
      const letGo = vi.spyOn(Network.instance, 'letPageGo').mockImplementation(() => {});
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await component.chooseConnectionMode('offline');

      expect(ask).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(LocalModePreferenceService).enabled()).toBe(false);
      expect(reload).not.toHaveBeenCalled();

      ask.mockResolvedValue(true);
      await component.chooseConnectionMode('offline');

      expect(TestBed.inject(LocalModePreferenceService).enabled()).toBe(true);
      expect(localStorage.getItem(LOCAL_MODE_STORAGE_KEY)).toBe('1');
      expect(letGo).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('says what leaving the room would lose, and keeps the room in the automatic save before going offline', async () => {
      const calls: string[] = [];
      vi.spyOn(component as unknown as { reload(): void }, 'reload').mockImplementation(() => calls.push('reload'));
      vi.spyOn(Network.instance, 'letPageGo').mockImplementation(() => {});
      vi.spyOn(TestBed.inject(RoomArchiveEventHandlerService), 'flush').mockImplementation(async () => {
        calls.push('save');
      });
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
      vi.spyOn(Network.instance, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network.instance, 'isAuthorityOpen', 'get').mockReturnValue(true);
      vi.spyOn(ImageStorage.instance, 'hasUploadsPending', 'get').mockReturnValue(true);
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      const t = TestBed.inject(TRANSLATE_FN);

      await component.chooseConnectionMode('offline');

      expect(ask).toHaveBeenCalledWith(
        `${t('feature.lobby.peerMenu.confirmOffline')}\n${t('feature.lobby.leaveRoom.uploads')}`
      );
      expect(calls).toEqual(['save', 'reload']);
    });

    it('takes the invitation off the address on going offline, and takes one choice at a time', async () => {
      const reload = vi.spyOn(component as unknown as { reload(): void }, 'reload').mockImplementation(() => undefined);
      vi.spyOn(Network.instance, 'letPageGo').mockImplementation(() => {});
      let finishSaving!: () => void;
      vi.spyOn(TestBed.inject(RoomArchiveEventHandlerService), 'flush').mockReturnValue(
        new Promise<void>((resolve) => (finishSaving = resolve))
      );
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      history.replaceState(null, '', '/axe/?lang=ja#join?room=abc');
      try {
        const first = component.chooseConnectionMode('offline');
        await Promise.resolve();
        await component.chooseConnectionMode('offline');
        expect(ask).toHaveBeenCalledTimes(1);
        expect(TestBed.inject(LocalModePreferenceService).enabled()).toBe(false);

        finishSaving();
        await first;

        expect(location.hash).toBe('');
        expect(location.search).toBe('?lang=ja');
        expect(reload).toHaveBeenCalledTimes(1);
      } finally {
        history.replaceState(null, '', '/');
      }
    });

    it('does nothing when the mode it is already in is chosen again', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');

      await component.chooseConnectionMode('online');

      expect(ask).not.toHaveBeenCalled();
    });
  });
});
