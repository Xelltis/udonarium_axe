import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { WritingPeerManager } from '@axe/features/chat/chat-input/chat-input-writing';

describe('WritingPeerManager', () => {
  let manager: WritingPeerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new WritingPeerManager();
    vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId) => {
      return { name: `User(${peerId})` } as PeerCursor;
    });
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('add()', () => {
    it('names somebody as soon as they are added', () => {
      manager.add('peer-1');
      expect(manager.names()).toEqual(['User(peer-1)']);
    });

    it('names them once however often they are added', () => {
      manager.add('peer-1');
      manager.add('peer-1');
      expect(manager.names()).toEqual(['User(peer-1)']);
    });

    it('names everybody added', () => {
      manager.add('peer-1');
      manager.add('peer-2');
      expect(manager.names()).toEqual(['User(peer-1)', 'User(peer-2)']);
    });

    it('drops somebody after a couple of seconds', () => {
      manager.add('peer-1');
      expect(manager.names()).toEqual(['User(peer-1)']);

      vi.advanceTimersByTime(2000);
      expect(manager.names()).toEqual([]);
    });

    it('puts that clock back on another add', () => {
      manager.add('peer-1');
      vi.advanceTimersByTime(1500);
      manager.add('peer-1'); // puts the clock back
      vi.advanceTimersByTime(1500);
      // long past the first add, but the second put the clock back
      expect(manager.names()).toEqual(['User(peer-1)']);

      vi.advanceTimersByTime(500); // 2000ms in all since the second add
      expect(manager.names()).toEqual([]);
    });
  });

  describe('remove()', () => {
    it('drops somebody at once on request', () => {
      manager.add('peer-1');
      manager.add('peer-2');
      manager.remove('peer-1');
      expect(manager.names()).toEqual(['User(peer-2)']);
    });

    it('throws nothing for somebody who was never there', () => {
      expect(() => manager.remove('nonexistent')).not.toThrow();
    });

    it('never fires the clock after that', () => {
      manager.add('peer-1');
      manager.remove('peer-1');
      vi.advanceTimersByTime(2000);
      expect(manager.names()).toEqual([]);
    });
  });

  describe('destroy()', () => {
    it('fires nothing and names nobody after teardown', () => {
      manager.add('peer-1');
      manager.destroy();
      vi.advanceTimersByTime(2000);
      // everything is cleared on teardown, and a stray callback does no harm
      expect(manager.names()).toEqual(['User(peer-1)']);
    });
  });
});
