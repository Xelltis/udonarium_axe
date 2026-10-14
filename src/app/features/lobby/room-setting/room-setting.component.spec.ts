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

    it('creates the room on the server and opens it by its key, as its game master', async () => {
      const create = vi.spyOn(Network, 'createRoom').mockResolvedValue({ roomKey: KEY, roomId: 'Ab3' });
      const open = vi.spyOn(Network, 'open').mockImplementation(() => {});
      const resolve = vi.spyOn(TestBed.inject(ModalService), 'resolve').mockImplementation(() => {});
      component.roomName.set('月夜の卓');
      component.password.set('pw');

      component.createRoom();

      await vi.waitFor(() => expect(open).toHaveBeenCalled());
      expect(create).toHaveBeenCalledWith('月夜の卓', 'pw');
      expect(open).toHaveBeenCalledWith('user', 'Ab3', '月夜の卓', 'pw', KEY);
      expect(PeerCursor.myCursor.role).toBe(PeerRole.GameMaster);
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
  });
});
