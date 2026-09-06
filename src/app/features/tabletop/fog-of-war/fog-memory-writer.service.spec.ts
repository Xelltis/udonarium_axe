import { TestBed } from '@angular/core/testing';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { FogMemoryWriterService } from '@axe/features/tabletop/fog-of-war/fog-memory-writer.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('FogMemoryWriterService', () => {
  let service: { isScribe(): boolean };
  const others: PeerCursor[] = [];

  function joinPeer(userId: string, role: PeerRole): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.userId = userId;
    cursor.role = role;
    others.push(cursor);
    return cursor;
  }

  function startRoom(search: string): void {
    history.replaceState({}, '', `/${search}`);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(FogMemoryWriterService) as unknown as { isScribe(): boolean };
  });

  afterEach(() => {
    for (const cursor of others.splice(0)) cursor.destroy();
    startRoom('');
  });

  describe('who writes the fog down', () => {
    it('writes it itself in the local mode a room is tried out in', () => {
      startRoom('?local=1');
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;

      // Nothing opens a connection there, so no cursor is ever named.
      expect(mine.userId).toBe('');
      expect(service.isScribe()).toBe(true);
    });

    it('waits to be named anywhere else', () => {
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;

      expect(mine.userId).toBe('');
      expect(service.isScribe()).toBe(false);
    });

    it('leaves it to the first player by name once the table has names', () => {
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;
      mine.userId = 'zoe';
      joinPeer('alice', PeerRole.Player);

      expect(service.isScribe()).toBe(false);

      mine.userId = 'aaron';
      expect(service.isScribe()).toBe(true);
    });

    it('leaves it to the game master when one is at the table', () => {
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;
      mine.userId = 'aaron';
      joinPeer('zoe', PeerRole.GameMaster);

      expect(service.isScribe()).toBe(false);
    });

    it('writes nothing while it has no cursor of its own', () => {
      startRoom('?local=1');
      PeerCursor.myCursor = null!;

      expect(service.isScribe()).toBe(false);
    });
  });
});
