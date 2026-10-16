import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { clearIdentity, loadIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
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

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(RoomSettingComponent, {
      beforeOpen: () => {
        PeerCursor.createMyCursor();
      },
    });
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

    it('offers a room to make whoever is in, and says how long the server keeps it', () => {
      vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['a', 'b', 'c']);
      fixture = TestBed.createComponent(RoomSettingComponent);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(fixture.componentInstance.isConnected()).toBe(false);
      expect(text).toContain('しばらく部屋のサーバーに残り');
      expect(text).not.toContain('0人になった時点で解散');
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
