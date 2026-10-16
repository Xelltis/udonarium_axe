import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RoomDeletionService } from '@axe/application/lobby/room-deletion.service';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
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
        'ページを再読み込みしてから'
      );

      where.mockReturnValue({ isRoom: false, roomName: '' } as PeerContext);
      bump();
      expect(component.isConnected()).toBe(false);
    });

    it('asks for the password for the server to check, and joins through the server', async () => {
      const openModal = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('pw');
      const joinServerRoom = vi.spyOn(TestBed.inject(RoomJoinService), 'joinServerRoom').mockResolvedValue(false);

      await component.connectRoom({ alias: '', roomName: room.name, info: room, peerContexts: [] });

      await vi.waitFor(() => expect(joinServerRoom).toHaveBeenCalledWith(room, 'pw'));
      expect(openModal.mock.calls[0][1]).toMatchObject({ checkedByServer: true });
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
