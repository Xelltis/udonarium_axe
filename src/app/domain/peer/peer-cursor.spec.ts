import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/index';
import { resetPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

describe('PeerCursor', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    // It is put back each time, in case another spec left a stub behind.
    resetPeerContextProvider();
    store = ObjectStore.instance;
    PeerCursor.myCursor = null!;
    (PeerCursor as unknown as Record<string, unknown>)['userIdMap'] = new Map();
    (PeerCursor as unknown as Record<string, unknown>)['peerIdMap'] = new Map();
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    (PeerCursor as unknown as Record<string, unknown>)['userIdMap'] = new Map();
    (PeerCursor as unknown as Record<string, unknown>)['peerIdMap'] = new Map();
    vi.restoreAllMocks();
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts with no user', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.userId).toBe('');
    });

    it('starts with no peer', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.peerId).toBe('');
    });

    it('starts unnamed', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.name).toBe('');
    });

    it('starts with no picture', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.imageIdentifier).toBe('');
    });

    it('starts unanswered', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.voteAnswer).toBe(-1);
    });

    it('starts on no vote', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.voteId).toBe(-1);
    });
  });

  describe('its fields', () => {
    it('starts as dropped', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.isDisConnect).toBe(true);
    });

    it('takes the dropped flag', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.isDisConnect = false;
      expect(cursor.isDisConnect).toBe(false);
    });

    it('starts with nothing sent', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.timestampSend).toBe(-1);
    });

    it('starts with nothing received', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.timestampReceive).toBe(-1);
    });

    it('starts at the highest latency', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.timeLatency).toBe(99999);
    });

    it('starts at the default timeout', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.timeout).toBe(40);
    });

    it('returns one for a timeout of nothing', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.timeout = 0;
      expect(cursor.timeout).toBe(1);
      cursor.timeout = -5;
      expect(cursor.timeout).toBe(1);
    });

    it('the colours it starts with', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.chatColorCode).toEqual(['#000000', '#FF0000', '#0099FF']);
    });
  });

  describe('isMine', () => {
    it('is false before your own cursor is set', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      expect(cursor.isMine).toBeFalsy();
    });

    it('is true for your own', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      PeerCursor.myCursor = cursor;
      expect(cursor.isMine).toBe(true);
    });

    it('is false for anybody elses', () => {
      const cursor1 = new PeerCursor();
      cursor1.initialize();
      const cursor2 = new PeerCursor();
      cursor2.initialize();
      PeerCursor.myCursor = cursor1;
      expect(cursor2.isMine).toBe(false);
    });
  });

  describe('createMyCursor', () => {
    it('creates your own', () => {
      const cursor = PeerCursor.createMyCursor();
      expect(cursor).toBeTruthy();
      expect(PeerCursor.myCursor).toBe(cursor);
    });

    it('against the peer you are connected as', () => {
      const cursor = PeerCursor.createMyCursor();
      expect(cursor.peerId).toBe(Network.peerId);
    });

    it('builds a new one rather than handing back the one already there', () => {
      const first = PeerCursor.createMyCursor();
      first.role = PeerRole.GameMaster;

      const second = PeerCursor.createMyCursor();

      expect(second).not.toBe(first);
      expect(second.role).toBe(PeerRole.Player);
      expect(PeerCursor.myCursor).toBe(second);
    });

    it('takes the one it replaced off the table', () => {
      const first = PeerCursor.createMyCursor();

      PeerCursor.createMyCursor();

      expect(store.get(first.identifier)).toBeNull();
    });

    it('and marks it connected, since you have not dropped', () => {
      const cursor = PeerCursor.createMyCursor();
      expect(cursor.isDisConnect).toBe(false);
    });
  });

  describe('findByUserId / findByPeerId', () => {
    it('is found by its user', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.userId = 'user-abc';
      expect(PeerCursor.findByUserId('user-abc')).toBe(cursor);
    });

    it('is found by its peer', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'peer-xyz';
      expect(PeerCursor.findByPeerId('peer-xyz')).toBe(cursor);
    });

    it('returns nothing for an identifier that is not there', () => {
      expect(PeerCursor.findByUserId('nonexistent')).toBeFalsy();
      expect(PeerCursor.findByPeerId('nonexistent')).toBeFalsy();
    });

    it('matches no unset cursor for an empty identifier', () => {
      const cursor = new PeerCursor();
      cursor.initialize();

      expect(cursor.userId).toBe('');
      expect(PeerCursor.findByUserId('')).toBeNull();
      expect(PeerCursor.findByPeerId('')).toBeNull();
    });
  });

  describe('debugReceiveDelay', () => {
    it('adds the delay onto when it was received', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.debugReceiveDelay = 100;
      cursor.timestampReceive = 1000;
      expect(cursor.timestampReceive).toBe(1100);
    });
  });
});
