import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
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
});
