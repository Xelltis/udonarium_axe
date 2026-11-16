import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerHeartbeatEventHandlerService } from '@axe/features/lobby/peer-heartbeat-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PeerHeartbeatEventHandlerService', () => {
  let notices: ReturnType<typeof vi.spyOn>;

  const heartbeats = () =>
    vi
      .mocked(Network.instance.send)
      .mock.calls.filter(([context]) => (context as { eventName: string }).eventName === 'HEART_BEAT');

  const noticeKeys = () =>
    notices.mock.calls.map((call: unknown[]) => /feature\.[A-Za-z.]+/.exec(String(call[1]))?.[0]);

  function mine(): PeerCursor {
    const cursor = PeerCursor.createMyCursor();
    cursor.peerId = 'my-peer';
    return cursor;
  }

  function remote(peerId = 'remote-peer'): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.peerId = peerId;
    cursor.userId = 'user-1';
    return cursor;
  }

  function systemTab(): void {
    const tab = new ChatTab();
    tab.initialize();
    ChatTabList.instance.appendChild(tab);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{ peerId: 'remote-peer', isOpen: true }] as never);
    vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
    vi.spyOn(TestBed.inject(BatchService), 'add').mockImplementation((work) => work());
    notices = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageOnePlayer');
    void ChatTabList.instance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.forget();
    ChatTabList.forget();
  });

  describe('beating', () => {
    it('beats for this seat between browsers that talk to each other', () => {
      mine();
      TestBed.inject(PeerHeartbeatEventHandlerService);

      vi.advanceTimersByTime(5_000);

      expect(heartbeats()).toHaveLength(5);
    });

    it('does not beat through a room server', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      mine();
      TestBed.inject(PeerHeartbeatEventHandlerService);

      vi.advanceTimersByTime(5_000);

      expect(heartbeats()).toEqual([]);
    });

    it('stops with the service', () => {
      mine();
      TestBed.inject(PeerHeartbeatEventHandlerService);
      vi.advanceTimersByTime(1_000);

      TestBed.resetTestingModule();
      vi.advanceTimersByTime(5_000);

      expect(heartbeats()).toHaveLength(1);
    });
  });

  describe('hearing a heartbeat', () => {
    it('times the beat on the cursor of the peer it came from, and on no other', () => {
      mine();
      const heard = remote();
      const other = remote('different-peer');
      TestBed.inject(PeerHeartbeatEventHandlerService);

      localDispatch('HEART_BEAT', [Date.now() - 30, 'my-peer', 12, 7], 'remote-peer');

      expect(heard.totalTimeSignNum).toBe(1);
      expect(heard.firstTimeSignNo).toBe(7);
      expect(heard.timeDiffDown).toBe(30);
      expect(heard.timeLatency).toBe(42);
      expect(other.totalTimeSignNum).toBe(0);
    });

    it('leaves the round trip alone on a beat that answers another peer', () => {
      mine();
      const heard = remote();
      TestBed.inject(PeerHeartbeatEventHandlerService);

      localDispatch('HEART_BEAT', [Date.now(), 'somebody-else', 12, 1], 'remote-peer');

      expect(heard.timeLatency).toBe(99999);
    });
  });

  describe('through a room server', () => {
    it('counts a quiet seat as there while the server lists it, and as dropped once it does not', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const listed = vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['remote-peer']);
      mine();
      const cursor = remote();
      cursor.timestampReceive = Date.now() - 50_000;
      TestBed.inject(PeerHeartbeatEventHandlerService);

      vi.advanceTimersByTime(5_000);
      expect(cursor.isDisConnect).toBe(false);

      listed.mockReturnValue([]);
      vi.advanceTimersByTime(5_000);
      expect(cursor.isDisConnect).toBe(true);
    });
  });

  describe('a peer going quiet', () => {
    it('counts it as dropped once it is quiet for too long, and says so once', () => {
      systemTab();
      mine();
      const cursor = remote();
      cursor.isDisConnect = false;
      cursor.timestampReceive = Date.now() - 50_000;
      TestBed.inject(PeerHeartbeatEventHandlerService);

      vi.advanceTimersByTime(3_000);

      expect(cursor.isDisConnect).toBe(true);
      expect(noticeKeys()).toEqual(['feature.lobby.peerCursor.noSignal']);
    });

    it('counts one heard inside that time as connected, and says it is back a second later', () => {
      systemTab();
      mine();
      const cursor = remote();
      cursor.isDisConnect = true;
      cursor.timestampReceive = Date.now();
      TestBed.inject(PeerHeartbeatEventHandlerService);

      vi.advanceTimersByTime(1_000);
      expect(cursor.isDisConnect).toBe(false);
      expect(noticeKeys()).toEqual([]);

      vi.advanceTimersByTime(1_000);
      expect(noticeKeys()).toEqual(['feature.lobby.peerCursor.reconnected']);
    });

    it('goes on beating after saying a peer is back', () => {
      systemTab();
      mine();
      const cursor = remote();
      cursor.timestampReceive = Date.now();
      TestBed.inject(PeerHeartbeatEventHandlerService);

      vi.advanceTimersByTime(4_000);

      expect(heartbeats()).toHaveLength(4);
    });

    it('does not say a peer is back once its cursor has left in that second', () => {
      systemTab();
      mine();
      const cursor = remote();
      cursor.timestampReceive = Date.now();
      TestBed.inject(PeerHeartbeatEventHandlerService);
      vi.advanceTimersByTime(1_000);

      cursor.destroy();
      vi.advanceTimersByTime(5_000);

      expect(noticeKeys()).toEqual(['feature.lobby.peerCursor.loggedOut']);
    });
  });

  describe('a peer leaving', () => {
    it('says goodbye once to a cursor it has watched', () => {
      systemTab();
      mine();
      const cursor = remote();
      TestBed.inject(PeerHeartbeatEventHandlerService);
      vi.advanceTimersByTime(1_000);

      cursor.destroy();
      cursor.destroy();

      expect(noticeKeys()).toEqual(['feature.lobby.peerCursor.loggedOut']);
    });

    it('says nothing for a cursor that left before a round saw it', () => {
      systemTab();
      mine();
      const cursor = remote();
      TestBed.inject(PeerHeartbeatEventHandlerService);

      cursor.destroy();

      expect(noticeKeys()).toEqual([]);
    });

    it('says nothing for this seat’s own cursor', () => {
      systemTab();
      const cursor = mine();
      TestBed.inject(PeerHeartbeatEventHandlerService);
      vi.advanceTimersByTime(1_000);

      cursor.destroy();

      expect(noticeKeys()).toEqual([]);
    });
  });
});
