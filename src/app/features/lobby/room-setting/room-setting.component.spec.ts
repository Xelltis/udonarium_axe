import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { clearIdentity, loadIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { markLoadedWithheld } from '@axe/domain/peer/withheld-table';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import { RoomSettingComponent } from '@axe/features/lobby/room-setting/room-setting.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomSettingComponent', () => {
  let component: RoomSettingComponent;
  let fixture: ComponentFixture<RoomSettingComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomSettingComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RoomSettingComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('leaves the password kept for reconnecting alone until a room is made', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.reConnectPass = 'kept';
    fixture = TestBed.createComponent(RoomSettingComponent);
    fixture.detectChanges();
    fixture.componentInstance.password.set('typed');
    fixture.detectChanges();

    expect(PeerCursor.myCursor.reConnectPass).toBe('kept');
    PeerCursor.myCursor = null!;
  });

  it('makes no room among peers while joined with even one other, the peers listed being the others', () => {
    const peers = vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['other']);
    fixture = TestBed.createComponent(RoomSettingComponent);

    expect(fixture.componentInstance.isConnected()).toBe(true);
    peers.mockReturnValue([]);
    fixture = TestBed.createComponent(RoomSettingComponent);
    expect(fixture.componentInstance.isConnected()).toBe(false);
    vi.restoreAllMocks();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(RoomSettingComponent, {
      beforeOpen: () => {
        PeerCursor.createMyCursor();
      },
    });
  });

  it('makes whoever creates a room its game master, a guest as well as a player', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Guest;
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user', isRoom: false } as PeerContext);
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
    vi.spyOn(Network, 'open').mockImplementation(() => {});
    component.roomName.set('月夜の卓');

    component.createRoom();

    expect(PeerCursor.myCursor.role).toBe(PeerRole.GameMaster);
    expect(loadIdentity()?.roomRole).toBe(PeerRole.GameMaster);
    clearIdentity();
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
  });

  it('makes a room with a table holding withheld parts only once the reader says to', async () => {
    PeerCursor.createMyCursor();
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user', isRoom: false } as PeerContext);
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
    const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    markLoadedWithheld(true, false);
    try {
      component.createRoom();
      await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(open).not.toHaveBeenCalled();

      ask.mockResolvedValue(true);
      component.createRoom();
      await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    } finally {
      markLoadedWithheld(false, false);
      clearIdentity();
      PeerCursor.myCursor = null!;
      vi.restoreAllMocks();
    }
  });

  it('makes no SkyWay room before the connection it is opened through is, and says so', () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
    const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
    component.roomName.set('月夜の卓');
    fixture.detectChanges();

    component.createRoom();

    const create = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="room-setting-create"]'
    );
    expect(open).not.toHaveBeenCalled();
    expect(create?.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('まだサーバーにつながっていません');
    vi.restoreAllMocks();
  });

  it('makes no SkyWay room once the connection has gone since the form was opened, and says so after the word', async () => {
    const isOpen = vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
    const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
    component.roomName.set('月夜の卓');
    fixture.detectChanges();

    isOpen.mockReturnValue(false);
    component.createRoom();
    expect(open).not.toHaveBeenCalled();

    (
      TestBed.inject(ObjectChangeService) as unknown as { _networkError$: { emit(e: unknown): void } }
    )._networkError$.emit({ errorType: 'error', errorMessage: 'gone' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    fixture.detectChanges();
    const create = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="room-setting-create"]'
    );
    expect(create?.disabled).toBe(true);
    vi.restoreAllMocks();
  });

  it('says to reload rather than to wait once the tries to connect have run out', () => {
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(false);
    TestBed.inject(NetworkReachService).giveUp();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ページを再読み込みしてください');
    expect(text).not.toContain('つながってから作成できます');
    vi.restoreAllMocks();
  });

  describe('on a room server', () => {
    const KEY = '0123456789abcdef0123456789abcdef';

    beforeEach(() => {
      PeerCursor.createMyCursor();
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user' } as PeerContext);
    });

    afterEach(() => {
      clearIdentity();
      PeerCursor.myCursor = null!;
      vi.restoreAllMocks();
    });

    it('offers a room to make outside any room, saying how long the server keeps it, and none from inside one', () => {
      const where = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ userId: 'user', isRoom: false } as PeerContext);
      const textOf = () => {
        fixture = TestBed.createComponent(RoomSettingComponent);
        fixture.detectChanges();
        return (fixture.nativeElement as HTMLElement).textContent ?? '';
      };

      const outside = textOf();
      expect(fixture.componentInstance.isConnected()).toBe(false);
      expect(outside).toContain('しばらく部屋のサーバーに残り');
      expect(outside).not.toContain('0人になった時点で解散');

      where.mockReturnValue({ userId: 'user', isRoom: true } as PeerContext);
      expect(textOf()).toContain('部屋に入っているあいだは、新しい部屋を作れません');
    });

    it('makes no room once the seat has come into one while the form was open', async () => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user', isRoom: true } as PeerContext);
      const create = vi.spyOn(Network, 'createRoom').mockResolvedValue({ roomKey: KEY, roomId: 'Ab3' });
      component.roomName.set('月夜の卓');

      component.createRoom();
      await Promise.resolve();

      expect(create).not.toHaveBeenCalled();
    });

    it('opens no new room once the seat has come into another while it was being made', async () => {
      const where = vi
        .spyOn(Network, 'peerContext', 'get')
        .mockReturnValue({ userId: 'user', isRoom: false } as PeerContext);
      vi.spyOn(Network, 'createRoom').mockImplementation(async () => {
        where.mockReturnValue({ userId: 'user', isRoom: true } as PeerContext);
        return { roomKey: KEY, roomId: 'Ab3' };
      });
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
      component.roomName.set('月夜の卓');

      component.createRoom();
      await vi.waitFor(() => expect(Network.createRoom).toHaveBeenCalled());
      await Promise.resolve();

      expect(open).not.toHaveBeenCalled();
    });

    it('creates the room on the server and opens it by its key, leaving the role for the server to give', async () => {
      const create = vi.spyOn(Network, 'createRoom').mockResolvedValue({ roomKey: KEY, roomId: 'Ab3' });
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
      const resolve = vi.spyOn(TestBed.inject(ModalService), 'resolve').mockImplementation(() => {});
      component.roomName.set('月夜の卓');
      component.password.set('pw');

      component.createRoom();

      await vi.waitFor(() => expect(open).toHaveBeenCalled());
      expect(create).toHaveBeenCalledWith('月夜の卓', 'pw');
      expect(open).toHaveBeenCalledWith('user', 'Ab3', '月夜の卓', 'pw', KEY);
      expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
      expect(loadIdentity()?.roomKey).toBe(KEY);
      expect(resolve).toHaveBeenCalled();
    });

    it('says why when the server will not create it, and opens nothing', async () => {
      vi.spyOn(Network, 'createRoom').mockRejectedValue(new ServerRoomApiError(429, 'rate-limited'));
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});

      component.createRoom();

      await vi.waitFor(() => expect(component.createError()).toContain('rate-limited'));
      expect(open).not.toHaveBeenCalled();
    });

    it('says a login is needed when the server asks for one', async () => {
      vi.spyOn(Network, 'createRoom').mockRejectedValue(new ServerRoomApiError(401, 'login-required'));
      vi.spyOn(Network, 'open').mockImplementation(() => {});

      component.createRoom();

      await vi.waitFor(() => expect(component.createError()).toContain('ログインが要ります'));
    });
  });
});
