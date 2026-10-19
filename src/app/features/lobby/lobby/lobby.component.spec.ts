import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RoomDeletionService } from '@axe/application/lobby/room-deletion.service';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Network } from '@axe/core/index';
import { localDispatch } from '@axe/core/network/network-messaging';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { markLoadedWithheld, markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('LobbyComponent', () => {
  let component: LobbyComponent;
  let fixture: ComponentFixture<LobbyComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LobbyComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LobbyComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('asks for no change detector', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).cdr).toBeUndefined();
  });

  describe('connect()', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;
    let originalMyCursor: PeerCursor;

    beforeEach(() => {
      originalMyCursor = PeerCursor.myCursor;
      PeerCursor.myCursor = { peerId: '', reConnectPass: '' } as unknown as PeerCursor;
      openSpy = vi.spyOn(Network, 'open').mockImplementation(() => {});
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'test-user' } as PeerContext);
    });

    afterEach(() => {
      PeerCursor.myCursor = originalMyCursor;
      vi.restoreAllMocks();
    });

    it('does not open the connection on a wrong password', async () => {
      const ctx = PeerContext.parse('test-peer');
      vi.spyOn(ctx, 'verifyPassword').mockResolvedValue(false);

      await component.connect([ctx]);

      expect(openSpy).not.toHaveBeenCalled();
    });

    it('opens it on the right one', async () => {
      const ctx = PeerContext.parse('test-peer');
      vi.spyOn(ctx, 'verifyPassword').mockResolvedValue(true);

      await component.connect([ctx]);

      expect(openSpy).toHaveBeenCalledOnce();
    });

    it('holds a second press back while a join is under way, and lets one through once it ends', async () => {
      const ctx = PeerContext.parse('test-peer');
      vi.spyOn(ctx, 'verifyPassword').mockResolvedValue(true);
      let finish: (joined: boolean) => void = () => {};
      vi.spyOn(TestBed.inject(RoomJoinService), 'join').mockImplementation(
        () => new Promise<boolean>((resolve) => (finish = resolve))
      );

      await component.connect([ctx]);
      await component.connect([ctx]);
      expect(TestBed.inject(RoomJoinService).join).toHaveBeenCalledOnce();
      expect(component.isJoining()).toBe(true);

      finish(false);
      await vi.waitFor(() => expect(component.isJoining()).toBe(false));
      await component.connect([ctx]);
      expect(TestBed.inject(RoomJoinService).join).toHaveBeenCalledTimes(2);
    });

    it('says when the join is waiting for this seat’s previous connection to drop', () => {
      const waiting = () => fixture.nativeElement.querySelector('[data-testid="lobby-waiting-previous"]');
      fixture.detectChanges();
      expect(waiting()).toBeNull();

      TestBed.inject(RoomJoinService).waitingForPreviousConnection.set(true);
      fixture.detectChanges();
      expect(waiting()).not.toBeNull();
      TestBed.inject(RoomJoinService).waitingForPreviousConnection.set(false);
    });

    it('goes nowhere when somebody joined this seat while the password was asked for', async () => {
      const ctx = PeerContext.parse('test-peer');
      Object.defineProperty(ctx, 'hasPassword', { get: () => true });
      vi.spyOn(ctx, 'verifyPassword').mockResolvedValue(true);
      PeerCursor.myCursor.reConnectPass = 'kept';
      const peers = vi.spyOn(Network, 'peerIds', 'get').mockReturnValue([]);
      vi.spyOn(TestBed.inject(ModalService), 'open').mockImplementation(async () => {
        peers.mockReturnValue(['joined-meanwhile']);
        return 'typed';
      });

      await component.connect([ctx]);

      expect(openSpy).not.toHaveBeenCalled();
      expect(PeerCursor.myCursor.reConnectPass).toBe('kept');
    });

    it('does not open it when the password dialogue is dismissed', async () => {
      const ctx = PeerContext.parse('test-peer');
      Object.defineProperty(ctx, 'hasPassword', { get: () => true });
      vi.spyOn(ctx, 'verifyPassword').mockResolvedValue(false);
      vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue(null as unknown as string);

      await component.connect([ctx]);

      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe('the room list', () => {
    afterEach(() => vi.restoreAllMocks());

    it('shows a room a server reports by its count, with no peers to count', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      const serverRoom: IRoomInfo = {
        id: 'Ab3',
        name: '月夜の卓',
        hasPassword: true,
        peers: [],
        memberCount: 3,
        roomKey: '0123456789abcdef0123456789abcdef',
        filterByPassword: () => [],
      };
      vi.spyOn(Network, 'listAllRooms').mockResolvedValue([serverRoom]);

      await component.reload();
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(text).toContain('Ab3');
      expect(text).toContain('月夜の卓');
      expect(text).toContain('3人');
    });
  });

  it('says the server cannot be reached, and to reload the page, once reaching it is given up', async () => {
    const list = vi.spyOn(Network, 'listAllRooms').mockResolvedValue([]);
    TestBed.inject(NetworkReachService).giveUp();

    await component.reload();

    expect(component.help()).toContain('再読み込み');
    expect(list).not.toHaveBeenCalled();
  });

  it('says the server cannot be reached as soon as reaching it is given up while the lobby is open', () => {
    fixture.detectChanges();

    TestBed.inject(NetworkReachService).giveUp();
    fixture.detectChanges();

    expect(component.help()).toContain('再読み込み');
    expect(component.rooms()).toEqual([]);
  });

  it('says the server cannot be reached when it opens after reaching it was given up', () => {
    TestBed.inject(NetworkReachService).giveUp();

    const opened = TestBed.createComponent(LobbyComponent);
    opened.detectChanges();

    expect(opened.componentInstance.help()).toContain('再読み込み');
  });

  it('says the server is not reached yet, rather than that there are no rooms, while the connection is still coming', async () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
    const list = vi.spyOn(Network, 'listAllRooms').mockResolvedValue([]);

    await component.reload();

    expect(component.help()).toBe(
      'まだサーバーにつながっていません。しばらく待ってから「一覧を更新」を押してください。'
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('says the server is not reached yet as it opens before the connection is', () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);

    const opened = TestBed.createComponent(LobbyComponent);
    opened.detectChanges();

    expect(opened.componentInstance.help()).toBe(
      'まだサーバーにつながっていません。しばらく待ってから「一覧を更新」を押してください。'
    );
  });

  describe('signal-driven CD', () => {
    it('holds the rooms in a signal', () => {
      expect(typeof component.rooms).toBe('function');
    });

    it('holds the reloading flag in one', () => {
      expect(typeof component.isReloading).toBe('function');
    });

    it('holds the help text in one', () => {
      expect(typeof component.help).toBe('function');
    });

    it('reads the connection through the network version', () => {
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const spy = vi.spyOn(objectChangeService, 'networkVersion');
      void component.isConnected();
      expect(spy).toHaveBeenCalled();
    });
  });

  it('offers a way out of the room among peers too, where reloading an invitation goes back in', () => {
    vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['a']);
    TestBed.inject(ObjectChangeService).networkVersion.update((v) => v + 1);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="lobby-leave-room"]')).not.toBeNull();
    vi.restoreAllMocks();
  });

  describe('on a room server', () => {
    const room: IRoomInfo = {
      id: 'Ab3',
      name: '月夜の卓',
      hasPassword: true,
      peers: [],
      memberCount: 2,
      roomKey: '0123456789abcdef0123456789abcdef',
      filterByPassword: () => [],
    };
    let originalMyCursor: PeerCursor;

    beforeEach(() => {
      originalMyCursor = PeerCursor.myCursor;
      PeerCursor.myCursor = { peerId: '', reConnectPass: '' } as unknown as PeerCursor;
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
    });

    afterEach(() => {
      PeerCursor.myCursor = originalMyCursor;
      vi.restoreAllMocks();
    });

    it('lets a seat in a room go to no other, which would carry this table there, however few are in', () => {
      const where = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ isRoom: true, roomName: '' } as PeerContext);
      vi.spyOn(Network, 'peerIds', 'get').mockReturnValue([]);
      const bump = () => TestBed.inject(ObjectChangeService).networkVersion.update((v) => v + 1);
      fixture = TestBed.createComponent(LobbyComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.isConnected()).toBe(true);
      expect(fixture.nativeElement.querySelector('[data-testid="lobby-already-in-room"]')?.textContent).toContain(
        '「部屋を出る」でいったん部屋を出てから'
      );
      expect(fixture.nativeElement.querySelector('[data-testid="lobby-leave-room"]')).not.toBeNull();

      where.mockReturnValue({ isRoom: false, roomName: '' } as PeerContext);
      bump();
      expect(component.isConnected()).toBe(false);
    });

    it('stays open as the seat goes into the same room again, as on a logout here, and closes for another', async () => {
      const where = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ isRoom: true, roomId: 'Ab3', roomName: '' } as PeerContext);
      vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(Network, 'listAllRooms').mockResolvedValue([]);
      TestBed.inject(ObjectChangeService);
      const resolve = vi.spyOn(TestBed.inject(ModalService), 'resolve').mockImplementation(() => {});
      fixture.destroy();
      fixture = TestBed.createComponent(LobbyComponent);

      localDispatch('OPEN_NETWORK', { peerId: 'p' });
      await Promise.resolve();
      expect(resolve).not.toHaveBeenCalled();

      where.mockReturnValue({ isRoom: true, roomId: 'Xy9', roomName: '' } as PeerContext);
      localDispatch('OPEN_NETWORK', { peerId: 'p' });
      await Promise.resolve();
      expect(resolve).toHaveBeenCalled();
    });

    it('closes once the join it was opened during goes through', async () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
        isRoom: true,
        roomId: 'Ab3',
        roomName: '',
      } as PeerContext);
      const open = vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
      TestBed.inject(ObjectChangeService);
      const resolve = vi.spyOn(TestBed.inject(ModalService), 'resolve').mockImplementation(() => {});
      fixture.destroy();
      fixture = TestBed.createComponent(LobbyComponent);

      open.mockReturnValue(true);
      localDispatch('OPEN_NETWORK', { peerId: 'p' });
      await Promise.resolve();

      expect(resolve).toHaveBeenCalled();
    });

    it('joins nothing when the seat came into a room while the password was asked for', async () => {
      const where = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ isRoom: false, roomName: '' } as PeerContext);
      vi.spyOn(TestBed.inject(ModalService), 'open').mockImplementation(async () => {
        where.mockReturnValue({ isRoom: true, roomName: '' } as PeerContext);
        return 'pw';
      });
      const joinServerRoom = vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom').mockResolvedValue(false);

      await component.connectRoom({ alias: '', roomName: room.name, info: room, peerContexts: [] });

      expect(joinServerRoom).not.toHaveBeenCalled();
    });

    it('asks before taking a table with withheld parts into another room, and joins nothing on a no', async () => {
      markSeatWithheld(true, 'f'.repeat(32));
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      const joinServerRoom = vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom').mockResolvedValue(false);
      try {
        await component.connectRoom({ alias: '', roomName: room.name, info: room, peerContexts: [] });

        expect(ask).toHaveBeenCalledTimes(1);
        expect(joinServerRoom).not.toHaveBeenCalled();
      } finally {
        markLoadedWithheld(false, false);
      }
    });

    it('asks nothing on going back into the room the table was withheld in', async () => {
      markSeatWithheld(true, room.roomKey!);
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('pw');
      const joinServerRoom = vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom').mockResolvedValue(false);
      try {
        await component.connectRoom({ alias: '', roomName: room.name, info: room, peerContexts: [] });

        await vi.waitFor(() => expect(joinServerRoom).toHaveBeenCalledWith(room, 'pw'));
        expect(ask).not.toHaveBeenCalled();
      } finally {
        markLoadedWithheld(false, false);
      }
    });

    it('asks for the password for the server to check, and joins through the server', async () => {
      const openModal = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('pw');
      const joinServerRoom = vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom').mockResolvedValue(false);

      await component.connectRoom({ alias: '', roomName: room.name, info: room, peerContexts: [] });

      await vi.waitFor(() => expect(joinServerRoom).toHaveBeenCalledWith(room, 'pw'));
      expect(openModal.mock.calls[0][1]).toMatchObject({ checkedByServer: true });
    });

    it('keeps no password for reconnecting to a room without a key, one kept from another dropped', async () => {
      PeerCursor.myCursor.reConnectPass = 'other-room';
      vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom').mockResolvedValue(false);
      const open = { ...room, hasPassword: false } as IRoomInfo;

      await component.connectRoom({ alias: '', roomName: open.name, info: open, peerContexts: [] });

      expect(PeerCursor.myCursor.reConnectPass).toBe('');
    });

    it('joins nothing when the password dialogue is dismissed', async () => {
      vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue(null);
      const joinServerRoom = vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom');

      await component.connectRoom({ alias: '', roomName: room.name, info: room, peerContexts: [] });

      expect(joinServerRoom).not.toHaveBeenCalled();
    });

    it('says so when no room server is configured', async () => {
      vi.spyOn(Network, 'listAllRooms').mockRejectedValue(new ServerRoomApiError(0, 'no-backend'));

      await component.reload();

      expect(component.help()).toContain('backend.url');
    });
  });

  describe('deleting a room from the list', () => {
    const roomOf = (id: string, deletable: boolean): IRoomInfo => ({
      id,
      name: `卓${id}`,
      hasPassword: false,
      peers: [],
      memberCount: 0,
      roomKey: id.padEnd(32, '0'),
      deletable,
      filterByPassword: () => [],
    });
    const deleteButtons = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-testid="lobby-delete-room"]')
      );
    const notice = () =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="lobby-deletion-notice"]')
        ?.textContent?.trim();
    let listAllRooms: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      listAllRooms = vi.spyOn(Network, 'listAllRooms').mockResolvedValue([roomOf('aaa', true), roomOf('bbb', false)]);
      await component.reload();
      fixture.detectChanges();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('offers to delete only the rooms the reader is a GM of', () => {
      expect(deleteButtons()).toHaveLength(1);
    });

    it('deletes the room, lists the rooms again and says so', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const remove = vi.spyOn(TestBed.inject(RoomDeletionService), 'delete').mockResolvedValue('deleted');

      deleteButtons()[0].click();
      await vi.waitFor(() => expect(component.isDeleting()).toBe(false));
      fixture.detectChanges();

      expect(remove).toHaveBeenCalledWith({ roomKey: 'aaa'.padEnd(32, '0'), name: '卓aaa', id: 'aaa' });
      expect(listAllRooms).toHaveBeenCalledTimes(2);
      expect(notice()).toBe(t('feature.lobby.deleteRoom.deleted'));
    });

    it('says why a room could not be deleted, and leaves the list as it was', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      vi.spyOn(TestBed.inject(RoomDeletionService), 'delete').mockResolvedValue('not-game-master');

      await component.deleteRoom(component.rooms()[0]);
      fixture.detectChanges();

      expect(listAllRooms).toHaveBeenCalledTimes(1);
      expect(notice()).toBe(t('feature.lobby.deleteRoom.notGameMaster'));
    });

    it('says nothing when the reader thinks better of it', async () => {
      vi.spyOn(TestBed.inject(RoomDeletionService), 'delete').mockResolvedValue('cancelled');

      await component.deleteRoom(component.rooms()[0]);
      fixture.detectChanges();

      expect(notice()).toBeUndefined();
      expect(listAllRooms).toHaveBeenCalledTimes(1);
    });
  });

  describe('creating a room on a room server', () => {
    const createButton = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="lobby-create-room"]');

    beforeEach(() => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'listAllRooms').mockResolvedValue([]);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends somebody not logged in to log in rather than to the dialog', async () => {
      const auth = TestBed.inject(ServerAuthService);
      const startLogin = vi.spyOn(auth, 'startLogin').mockResolvedValue();
      const openModal = vi.spyOn(TestBed.inject(ModalService), 'open');
      fixture = TestBed.createComponent(LobbyComponent);
      fixture.detectChanges();

      createButton()!.click();

      expect(startLogin).toHaveBeenCalled();
      expect(openModal).not.toHaveBeenCalled();
    });

    it('offers no room to create on a server without a login', () => {
      const auth = TestBed.inject(ServerAuthService);
      vi.spyOn(auth, 'offersLogin').mockReturnValue(false);
      fixture = TestBed.createComponent(LobbyComponent);
      fixture.detectChanges();

      expect(createButton()).toBeNull();
    });
  });
});
