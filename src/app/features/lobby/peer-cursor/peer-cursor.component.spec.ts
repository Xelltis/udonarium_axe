import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerCursorComponent } from '@axe/features/lobby/peer-cursor/peer-cursor.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PeerCursorComponent', () => {
  let component: PeerCursorComponent;
  let fixture: ComponentFixture<PeerCursorComponent>;
  let batchService: BatchService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PeerCursorComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    batchService = TestBed.inject(BatchService);
    fixture = TestBed.createComponent(PeerCursorComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.forget();
    ChatTabList.forget();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('names a peer who renames themselves, without the cursor being moved', async () => {
    // The cursor belongs to somebody else, so the name over it is the only thing on the cursor
    // that moves with the rename. Nothing is checked by hand: it has to follow because the
    // signals said so.
    beMyself('me');
    const other = new PeerCursor();
    other.userId = 'other';
    other.name = 'まえの名前';
    other.initialize();
    fixture.componentRef.setInput('cursor', other);
    fixture.detectChanges();
    const shown = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(shown()).toContain('まえの名前');

    other.name = 'あとの名前';
    TestBed.inject(ObjectChangeService).notifyChanged(other.identifier);
    await fixture.whenStable();

    expect(shown()).toContain('あとの名前');
    expect(shown()).not.toContain('まえの名前');
    other.destroy();
  });

  it('tears down without throwing when no timer was set', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });

  describe('listening for a cursor to move', () => {
    it('ignores a move from another peer', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const addSpy = vi.spyOn(batchService, 'add');

      localDispatch('CURSOR_MOVE', [10, 20, 30], 'different-peer');

      expect(addSpy).not.toHaveBeenCalled();
    });

    it('lays a cursor on the screen where the point it is at is drawn, and again as the camera moves', async () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';
      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';
      const camera = TestBed.inject(TableCameraService);
      const layout = { left: 100, top: 50, width: 800, height: 600, boardWidth: 1000, boardHeight: 750 };
      camera.setLayout(layout);
      let scale = 2;
      vi.spyOn(TestBed.inject(TableSurfaceService), 'pageOf').mockImplementation((_surface, x, y, z = 0) => ({
        x: 100 + x * scale,
        y: 50 + y * scale - z,
      }));
      vi.spyOn(batchService, 'add').mockImplementation((work) => work());
      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();
      await fixture.whenStable();
      const element = (component as unknown as { cursorElement: HTMLElement }).cursorElement;

      localDispatch('CURSOR_MOVE', [10, 20, 30], 'remote-peer');

      expect(element.style.transform).toBe('translate(20px, 10px)');
      expect(fixture.nativeElement.querySelectorAll('[data-cursor-face]')).toHaveLength(1);

      scale = 3;
      camera.setLayout({ ...layout, width: 900 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(element.style.transform).toBe('translate(30px, 30px)');
    });

    it('queues nothing without an element to move', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const priv = component as unknown as { cursorElement: HTMLElement | null };
      priv.cursorElement = null;

      const addSpy = vi.spyOn(batchService, 'add');

      localDispatch('CURSOR_MOVE', [10, 20, 30], 'remote-peer');

      expect(addSpy).not.toHaveBeenCalled();
    });
  });

  describe('tearing down', () => {
    it('clears the update timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { updateTimer: ReturnType<typeof setTimeout> | null };
      priv.updateTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(priv.updateTimer).toBeNull();
    });
  });
});
