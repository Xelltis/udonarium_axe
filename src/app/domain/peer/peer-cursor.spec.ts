import { TestBed } from '@angular/core/testing';
import { domainPeerDisconnect$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { IPeerContext } from '@axe/core/network/peer-context';
import {
  PeerContextProvider,
  resetPeerContextProvider,
  setPeerContextProvider,
} from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { beMyself } from '@axe/testing/peer-context-stub';

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
    (PeerCursor as unknown as Record<string, unknown>)['goneUserIds'] = new Map();
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    (PeerCursor as unknown as Record<string, unknown>)['userIdMap'] = new Map();
    (PeerCursor as unknown as Record<string, unknown>)['peerIdMap'] = new Map();
    vi.restoreAllMocks();
  });

  describe('the local user id', () => {
    it('is the one on the reader\u2019s own cursor, and before there is one, the peer context\u2019s', () => {
      beMyself('from-context');
      expect(PeerCursor.myUserId).toBe('from-context');

      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'from-cursor';
      expect(PeerCursor.myUserId).toBe('from-cursor');

      PeerCursor.myCursor.userId = '';
      expect(PeerCursor.myUserId).toBe('from-context');
    });

    it('is empty, not missing, while the line is not open and the peer context holds no id', () => {
      setPeerContextProvider({
        peerContext: {} as IPeerContext,
        peerContexts: [],
        peerIds: [],
        peerId: '',
      } as PeerContextProvider);
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = '';

      expect(PeerCursor.myUserId).toBe('');
    });
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

    it('is no longer found by a user id written over since it was last looked up', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.userId = 'guest-1';
      expect(PeerCursor.findByUserId('guest-1')).toBe(cursor);

      cursor.userId = 'acct_1';

      expect(PeerCursor.findByUserId('guest-1')).toBeNull();
      expect(PeerCursor.findByUserId('acct_1')).toBe(cursor);
    });

    it('stands for the user a cursor that went stood for, through the one that user came back on', () => {
      const before = new PeerCursor('cursor-before');
      before.initialize();
      before.userId = 'user-bob';
      store.remove(before);

      expect(PeerCursor.userIdOf('cursor-before')).toBe('user-bob');
      expect(PeerCursor.standingFor('cursor-before')).toBeNull();
      const after = new PeerCursor('cursor-after');
      after.initialize();
      after.userId = 'user-bob';

      expect(PeerCursor.standingFor('cursor-before')).toBe(after);
      expect(PeerCursor.standingFor('cursor-after')).toBe(after);
      expect(PeerCursor.userIdOf('never-here')).toBe('');
      store.remove(after);
    });

    it('matches no unset cursor for an empty identifier', () => {
      const cursor = new PeerCursor();
      cursor.initialize();

      expect(cursor.userId).toBe('');
      expect(PeerCursor.findByUserId('')).toBeNull();
      expect(PeerCursor.findByPeerId('')).toBeNull();
    });
  });

  describe('a peer dropping out', () => {
    const made: PeerCursor[] = [];

    /** A cursor as it arrives from a peer: its state taken in before the store's hook runs. */
    function arrive(peerId: string, userId: string): PeerCursor {
      const cursor = new PeerCursor();
      const context = cursor.toContext();
      store.add(cursor, false, () => cursor.apply({ ...context, syncData: { ...context.syncData, peerId, userId } }));
      made.push(cursor);
      return cursor;
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      for (const cursor of made.splice(0)) if (store.get(cursor.identifier)) cursor.destroy();
      vi.useRealTimers();
    });

    it.each([
      ['is cleared away half a minute after it drops', [], false],
      ['stays when its peer is back within that time', ['peer-x'], true],
    ] as const)('%s', (_case, linkedThen, stays) => {
      const peerIds = vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['peer-x']);
      const cursor = arrive('peer-x', 'user-x');

      domainPeerDisconnect$.emit({ peerId: 'peer-x' });
      peerIds.mockReturnValue([...linkedThen]);
      vi.advanceTimersByTime(30_000);

      expect(Boolean(store.get(cursor.identifier))).toBe(stays);
    });

    it('is cleared away when its peer came back with a new cursor under the same peer id', () => {
      vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['peer-x']);
      const before = arrive('peer-x', 'user-x');
      const after = arrive('peer-x', 'user-x');

      domainPeerDisconnect$.emit({ peerId: 'peer-x' });
      vi.advanceTimersByTime(30_000);

      expect(store.get(before.identifier)).toBeFalsy();
      expect(store.isDeleted(before.identifier)).toBe(true);
      expect(store.get(after.identifier)).toBe(after);
      expect(PeerCursor.findByPeerId('peer-x')).toBe(after);
      expect(PeerCursor.findByUserId('user-x')).toBe(after);
    });

    it('deletes for every peer a cursor under this seat’s own peer id that is not its own', async () => {
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('peer-me');
      const send = vi.spyOn(Network, 'send').mockImplementation(() => {});
      PeerCursor.createMyCursor();
      const leftBehind = arrive('peer-me', 'user-me');
      const other = arrive('peer-x', 'user-x');

      await Promise.resolve();

      expect(store.get(leftBehind.identifier)).toBeFalsy();
      expect(store.isDeleted(leftBehind.identifier)).toBe(true);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'DELETE_GAME_OBJECT' }), undefined);
      expect(store.get(PeerCursor.myCursor.identifier)).toBe(PeerCursor.myCursor);
      expect(store.get(other.identifier)).toBe(other);
    });

    it('counts each seat linked now once, this one included', () => {
      vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['peer-x']);
      PeerCursor.createMyCursor();
      arrive('peer-x', 'user-x');
      const after = arrive('peer-x', 'user-x');
      arrive('peer-gone', 'user-gone');

      expect(PeerCursor.linkedCursors()).toEqual(expect.arrayContaining([PeerCursor.myCursor, after]));
      expect(PeerCursor.linkedCursors()).toHaveLength(2);
    });
  });

  describe('taking in a peer\u2019s state', () => {
    it('takes in an answer to a vote while the room holds no vote', () => {
      const sent = new PeerCursor('peer-cursor-a');
      sent.voteId = 3;
      const received = new PeerCursor('peer-cursor-a');

      expect(() => received.apply(sent.toContext())).not.toThrow();
      expect(received.voteId).toBe(3);
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
