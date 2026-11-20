import { TestBed } from '@angular/core/testing';
import { GameTableService } from '@axe/application/tabletop/game-table.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('GameTableService', () => {
  let tables: GameTableService;
  let first: GameTable;

  function table(): GameTable {
    const made = new GameTable();
    made.initialize();
    return made;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    tables = TestBed.inject(GameTableService);
    first = table();
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('keeps the last table', () => {
    expect(tables.mayRemove(first)).toBe(false);
    expect(tables.remove(first)).toBe(false);
    expect(ObjectStore.instance.get(first.identifier)).toBe(first);
  });

  it('takes a table away while another is left', () => {
    const second = table();

    expect(tables.mayRemove(second)).toBe(true);
    expect(tables.remove(second)).toBe(true);

    expect(ObjectStore.instance.get(second.identifier)).toBeNull();
    expect(tables.mayRemove(first)).toBe(false);
  });

  it('takes nothing away for a seat that may not change the table', () => {
    const second = table();
    PeerCursor.myCursor.role = PeerRole.Guest;

    expect(tables.mayRemove(second)).toBe(false);
    expect(tables.remove(second)).toBe(false);
    expect(ObjectStore.instance.get(second.identifier)).toBe(second);
  });

  it('puts a piece on one of its boards back on the table where it appeared to be before taking it away', () => {
    const second = table();
    const board = WhiteBoard.create('board', 4, 3, 1);
    board.location = { name: 'table', x: 100, y: 200 };
    second.appendChild(board);
    const piece = GameCharacter.create('piece', 1, '');
    piece.location = { name: 'table', x: 30, y: 40, surface: board.identifier };

    tables.remove(second);

    expect(piece.location).toEqual({ name: 'table', x: 130, y: 240 });
  });
});
