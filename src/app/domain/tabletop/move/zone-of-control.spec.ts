import { GameCharacter } from '@axe/domain/character/game-character';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { countCells } from '@axe/domain/tabletop/move/reachable-cells';
import {
  asHostilityBy,
  asZocMode,
  DEFAULT_HOSTILITY_BY,
  isHostileTo,
  zoneOfControl,
} from '@axe/domain/tabletop/move/zone-of-control';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;

describe('the ground an enemy holds', () => {
  const grid = cellGridOf(9, 9, GRID, GridType.SQUARE);
  const made: GameCharacter[] = [];

  afterEach(() => {
    for (const piece of made.splice(0)) piece.destroy();
  });

  function pieceAt(col: number, row: number, size = 1): GameCharacter {
    const piece = GameCharacter.create('コマ', size, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    made.push(piece);
    return piece;
  }

  it('reaches the eight cells around one enemy', () => {
    const held = zoneOfControl(grid, [pieceAt(4, 4)], 1);

    expect(countCells(held)).toBe(8);
    expect(held.get(cellIndexOf(grid, 3, 3))).toBe(true);
    expect(held.get(cellIndexOf(grid, 5, 4))).toBe(true);
  });

  it('leaves out the cell the enemy is standing on', () => {
    const held = zoneOfControl(grid, [pieceAt(4, 4)], 1);

    expect(held.get(cellIndexOf(grid, 4, 4))).toBe(false);
  });

  it('reaches two cells out where the table says two', () => {
    const held = zoneOfControl(grid, [pieceAt(4, 4)], 2);

    expect(countCells(held)).toBe(24);
    expect(held.get(cellIndexOf(grid, 6, 6))).toBe(true);
    expect(held.get(cellIndexOf(grid, 7, 4))).toBe(false);
  });

  it('holds a diamond where a table forbids cutting corners', () => {
    const held = zoneOfControl(grid, [pieceAt(4, 4)], 2, false);

    expect(countCells(held)).toBe(12);
    expect(held.get(cellIndexOf(grid, 6, 6))).toBe(false);
    expect(held.get(cellIndexOf(grid, 5, 5))).toBe(true);
  });

  it('holds nothing at all with no reach', () => {
    expect(countCells(zoneOfControl(grid, [pieceAt(4, 4)], 0))).toBe(0);
  });

  it('holds nothing with nobody to hold it', () => {
    expect(countCells(zoneOfControl(grid, [], 2))).toBe(0);
  });

  it('holds the ground round the whole of a piece that takes up more than a cell', () => {
    const held = zoneOfControl(grid, [pieceAt(4, 4, 2)], 1);

    expect(countCells(held)).toBe(12);
    expect(held.get(cellIndexOf(grid, 5, 5))).toBe(false);
    expect(held.get(cellIndexOf(grid, 6, 5))).toBe(true);
  });

  it('leaves out the cells all of the enemies stand on, close together as they are', () => {
    const held = zoneOfControl(grid, [pieceAt(4, 4), pieceAt(5, 4)], 1);

    expect(held.get(cellIndexOf(grid, 4, 4))).toBe(false);
    expect(held.get(cellIndexOf(grid, 5, 4))).toBe(false);
    expect(countCells(held)).toBe(10);
  });

  it('holds nothing round a piece that is not on the table', () => {
    const away = pieceAt(4, 4);
    away.location = { name: 'graveyard', x: 0, y: 0 };

    expect(countCells(zoneOfControl(grid, [away], 1))).toBe(0);
  });
});

describe('who holds ground against whom', () => {
  const made: GameCharacter[] = [];

  afterEach(() => {
    for (const piece of made.splice(0)) piece.destroy();
  });

  function piece(isNpc: boolean): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.isNpc = isNpc;
    made.push(character);
    return character;
  }

  it('counts a monster as the enemy of a hero', () => {
    expect(isHostileTo(piece(true), piece(false))).toBe(true);
  });

  it('counts a hero as the enemy of a monster', () => {
    expect(isHostileTo(piece(false), piece(true))).toBe(true);
  });

  it('counts nobody on the same side as an enemy', () => {
    expect(isHostileTo(piece(false), piece(false))).toBe(false);
    expect(isHostileTo(piece(true), piece(true))).toBe(false);
  });

  it('never counts a piece as its own enemy', () => {
    const hero = piece(false);
    expect(isHostileTo(hero, hero)).toBe(false);
  });
});

describe('what a table asks of the ground round an enemy', () => {
  it('reads the four it knows', () => {
    expect(asZocMode('none')).toBe('none');
    expect(asZocMode('stop')).toBe('stop');
    expect(asZocMode('block')).toBe('block');
    expect(asZocMode('cost')).toBe('cost');
  });

  it('asks for nothing where the table says something it does not know', () => {
    expect(asZocMode('engagement')).toBe('none');
    expect(asZocMode(undefined)).toBe('none');
    expect(asZocMode(2)).toBe('none');
  });
});

describe('how a table tells its two sides apart', () => {
  const made: GameCharacter[] = [];

  afterEach(() => {
    for (const piece of made.splice(0)) piece.destroy();
  });

  function piece(npc: boolean, party = ''): GameCharacter {
    const held = GameCharacter.create('コマ', 1, '');
    held.isNpc = npc;
    held.partyIdentifier = party;
    made.push(held);
    return held;
  }

  it('reads a way it does not know as telling them apart by whom the master runs', () => {
    expect(asHostilityBy('faction')).toBe(DEFAULT_HOSTILITY_BY);
    expect(asHostilityBy(undefined)).toBe('npc');
  });

  it('tells a monster from a hero, and asks nothing of their parties', () => {
    expect(isHostileTo(piece(true, 'a'), piece(false, 'a'))).toBe(true);
    expect(isHostileTo(piece(true), piece(true))).toBe(false);
  });

  it('tells one party from another where the table says to', () => {
    expect(isHostileTo(piece(false, 'goblins'), piece(false, 'heroes'), 'party')).toBe(true);
    expect(isHostileTo(piece(true, 'heroes'), piece(false, 'heroes'), 'party')).toBe(false);
  });

  it('leaves a piece nobody has placed out of it both ways, where the sides are parties', () => {
    // It holds no ground, and none is held against it. Held only one way, a stray would be
    // walled in by every party on the board while stopping none of them.
    expect(isHostileTo(piece(true), piece(false, 'heroes'), 'party')).toBe(false);
    expect(isHostileTo(piece(true, 'goblins'), piece(false), 'party')).toBe(false);
  });

  it('never makes a piece its own enemy, whichever way the sides are told apart', () => {
    const hero = piece(false, 'heroes');

    expect(isHostileTo(hero, hero)).toBe(false);
    expect(isHostileTo(hero, hero, 'party')).toBe(false);
  });
});
