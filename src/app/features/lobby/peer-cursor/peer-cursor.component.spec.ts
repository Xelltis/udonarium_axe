import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
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
    PeerCursor.myCursor = null!;
    (PeerCursor as unknown as Record<string, unknown>)['userIdMap'] = new Map();
    (PeerCursor as unknown as Record<string, unknown>)['peerIdMap'] = new Map();
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
    (PeerCursorComponent as unknown as Record<string, unknown>)['_sentLogoutIdentifiers'] = new Set();
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

  describe('listening for a heartbeat', () => {
    it('queues work on the heartbeat of another cursor', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const addSpy = vi.spyOn(batchService, 'add');

      localDispatch('HEART_BEAT', [Date.now(), 'my-peer', null, 1], 'remote-peer');

      expect(addSpy).toHaveBeenCalled();
    });

    it('ignores its own', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';

      fixture.componentRef.setInput('cursor', myCursor);
      fixture.detectChanges();

      const addSpy = vi.spyOn(batchService, 'add');

      localDispatch('HEART_BEAT', [Date.now(), 'other', null, 1], 'other-peer');

      expect(addSpy).not.toHaveBeenCalled();
    });

    it('ignores a heartbeat from another peer', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const addSpy = vi.spyOn(batchService, 'add');

      localDispatch('HEART_BEAT', [Date.now(), 'my-peer', null, 1], 'different-peer');

      expect(addSpy).not.toHaveBeenCalled();
    });
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

  describe('chkDisConnect', () => {
    it('counts a peer as dropped once it goes quiet for too long', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';
      // ChatTabList singleton must exist in ObjectStore for chkDisConnect()
      void ChatTabList.instance;

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';
      remoteCursor.isDisConnect = false;
      remoteCursor.timestampReceive = Date.now() - 50_000;

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const priv = component as unknown as { chkDisConnect: () => void };
      priv.chkDisConnect();

      expect(remoteCursor.isDisConnect).toBe(true);
    });

    it('counts one still connected inside that time', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';
      void ChatTabList.instance;

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';
      remoteCursor.isDisConnect = true;
      remoteCursor.timestampReceive = Date.now();

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const priv = component as unknown as { chkDisConnect: () => void };
      priv.chkDisConnect();

      expect(remoteCursor.isDisConnect).toBe(false);
    });

    it('does not drop a peer twice, so the message is not repeated', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';
      void ChatTabList.instance;

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';
      remoteCursor.isDisConnect = true;
      remoteCursor.timestampReceive = Date.now() - 50_000;

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const chatService = TestBed.inject(ChatMessageService);
      const chatSpy = vi.spyOn(chatService, 'sendSystemMessageOnePlayer');

      const priv = component as unknown as { chkDisConnect: () => void };
      priv.chkDisConnect();

      expect(remoteCursor.isDisConnect).toBe(true);
      expect(chatSpy).not.toHaveBeenCalled();
    });
  });

  describe('not saying goodbye twice', () => {
    beforeEach(() => {
      // clears the static set before each test
      (PeerCursorComponent as unknown as Record<string, unknown>)['_sentLogoutIdentifiers'] = new Set();
    });

    it('says it once however often it is asked', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';
      const tabList = ChatTabList.instance;
      const tab = new ChatTab();
      tab.initialize();
      tabList.appendChild(tab);

      const remoteCursor = new PeerCursor();
      remoteCursor.initialize();
      remoteCursor.peerId = 'remote-peer';
      remoteCursor.userId = 'user-1';

      fixture.componentRef.setInput('cursor', remoteCursor);
      fixture.detectChanges();

      const chatService = TestBed.inject(ChatMessageService);
      const chatSpy = vi.spyOn(chatService, 'sendSystemMessageOnePlayer');

      const priv = component as unknown as { logoutMessage: () => void };
      priv.logoutMessage(); // 1回目
      priv.logoutMessage(); // 2回目（静的 Set で防がれる）

      expect(chatSpy).toHaveBeenCalledTimes(1);
    });

    it('says nothing for its own cursor', () => {
      const myCursor = PeerCursor.createMyCursor();
      myCursor.peerId = 'my-peer';
      void ChatTabList.instance;

      fixture.componentRef.setInput('cursor', myCursor);
      fixture.detectChanges();

      const chatService = TestBed.inject(ChatMessageService);
      const chatSpy = vi.spyOn(chatService, 'sendSystemMessageOnePlayer');

      const priv = component as unknown as { logoutMessage: () => void };
      priv.logoutMessage();

      expect(chatSpy).not.toHaveBeenCalled();
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

    it('clears the timestamp timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as {
        timestampTimer: ReturnType<typeof setTimeout> | null;
        timestampTimerEnabled: boolean;
      };
      priv.timestampTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(priv.timestampTimer).toBeNull();
    });
  });
});
