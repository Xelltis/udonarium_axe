import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { fogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { FogMemoryEventHandlerService } from '@axe/features/tabletop/fog-of-war/fog-memory-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('FogMemoryEventHandlerService', () => {
  const others: PeerCursor[] = [];

  function joinPeer(userId: string, role: PeerRole): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.userId = userId;
    cursor.role = role;
    others.push(cursor);
    return cursor;
  }

  function startRoom(local: boolean): void {
    TestBed.inject(LocalModePreferenceService).set(local);
  }

  const sharedVisibleCells = signal<{ grid: CellGrid; cells: CellBits } | null>(null);

  beforeEach(() => {
    sharedVisibleCells.set(null);
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: VisionService, useValue: { sharedVisibleCells, partyVisiblePieces: signal(new Set<string>()) } },
      ],
    });
    TestBed.inject(FogMemoryEventHandlerService);
  });

  afterEach(() => {
    for (const cursor of others.splice(0)) cursor.destroy();
    startRoom(false);
  });

  const grid = cellGridOf(4, 3, 50, GridType.SQUARE);
  let table: GameTable;

  /** A table whose fog remembers the ground, for the party's sight to be written onto. */
  function layFoggedTable(): void {
    table = new GameTable();
    table.fogEnabled = true;
    table.fogMode = 'normal';
    table.initialize();
  }

  function see(...cells: number[]): void {
    const bits = new CellBits(12);
    for (const cell of cells) bits.set(cell);
    sharedVisibleCells.set({ grid, cells: bits });
    TestBed.tick();
  }

  describe('writing it down', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      startRoom(true);
      PeerCursor.createMyCursor();
      layFoggedTable();
    });

    afterEach(() => {
      table.destroy();
      vi.useRealTimers();
    });

    it('writes what the party has seen after a moment, gathering what it sees meanwhile into one write', () => {
      see(5);
      vi.advanceTimersByTime(500);
      see(5, 7);
      expect(fogMemoryOn(table)).toBeNull();

      vi.advanceTimersByTime(500);

      const memory = fogMemoryOn(table)!;
      expect(memory.read(grid).get(5)).toBe(true);
      expect(memory.read(grid).get(7)).toBe(true);
    });

    it('drops a write still waiting once there is nothing to write', () => {
      see(5);
      sharedVisibleCells.set(null);
      TestBed.tick();

      vi.advanceTimersByTime(1000);

      expect(fogMemoryOn(table)).toBeNull();
    });
  });

  describe('who writes the fog down', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      layFoggedTable();
    });

    afterEach(() => {
      table.destroy();
      vi.useRealTimers();
    });

    /** Whether this seat writes down a cell the party has just seen, once the wait before a write is over. */
    function writesDown(cell: number): boolean {
      see(cell);
      vi.advanceTimersByTime(1000);
      return fogMemoryOn(table)?.read(grid).get(cell) ?? false;
    }

    it('writes it itself in the local mode a room is tried out in', () => {
      startRoom(true);
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;

      // Nothing opens a connection there, so no cursor is ever named.
      expect(mine.userId).toBe('');
      expect(writesDown(5)).toBe(true);
    });

    it('waits to be named anywhere else', () => {
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;

      expect(mine.userId).toBe('');
      expect(writesDown(5)).toBe(false);
    });

    it('leaves it to the first player by name once the table has names', () => {
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;
      mine.userId = 'zoe';
      joinPeer('alice', PeerRole.Player);

      expect(writesDown(5)).toBe(false);

      mine.userId = 'aaron';
      expect(writesDown(7)).toBe(true);
    });

    it('leaves it to the game master when one is at the table', () => {
      const mine = PeerCursor.createMyCursor();
      mine.role = PeerRole.Player;
      mine.userId = 'aaron';
      joinPeer('zoe', PeerRole.GameMaster);

      expect(writesDown(5)).toBe(false);
    });

    it('writes nothing while it has no cursor of its own', () => {
      startRoom(true);
      PeerCursor.myCursor = null!;

      expect(writesDown(5)).toBe(false);
    });
  });
});
