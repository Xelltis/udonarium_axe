import { GameCharacter } from '@axe/domain/character/game-character';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { asPiecePassageMode, passageCells, PiecePassageMode } from '@axe/domain/tabletop/move/piece-passage';
import { PieceRelation } from '@axe/domain/tabletop/move/piece-relation';
import { countCells } from '@axe/domain/tabletop/move/reachable-cells';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;

describe('reading a stored passage mode', () => {
  it('reads the modes it knows', () => {
    for (const mode of ['block', 'pass', 'cost', 'share'] as const) expect(asPiecePassageMode(mode)).toBe(mode);
  });

  it('answers with nothing for anything else, so an older answer can stand in', () => {
    expect(asPiecePassageMode('')).toBeNull();
    expect(asPiecePassageMode('squeeze')).toBeNull();
    expect(asPiecePassageMode(undefined)).toBeNull();
  });
});

describe('the ground the pieces on a table hold against one walking among them', () => {
  const grid = cellGridOf(9, 9, GRID, GridType.SQUARE);
  const made: GameCharacter[] = [];

  afterEach(() => {
    for (const piece of made.splice(0)) piece.destroy();
  });

  function pieceAt(col: number, row: number, partyIdentifier = '', size = 1): GameCharacter {
    const piece = GameCharacter.create('コマ', size, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.partyIdentifier = partyIdentifier;
    made.push(piece);
    return piece;
  }

  function held(mover: GameCharacter, pieces: GameCharacter[], modes: Record<PieceRelation, PiecePassageMode>) {
    return passageCells(grid, [mover, ...pieces], mover, (relation) => modes[relation]);
  }

  const everyone = (mode: PiecePassageMode): Record<PieceRelation, PiecePassageMode> => ({
    same: mode,
    other: mode,
    none: mode,
  });

  it('holds nothing at all where every piece shares its ground', () => {
    const mover = pieceAt(1, 1, 'heroes');
    const ground = held(mover, [pieceAt(4, 4, 'goblins')], everyone('share'));

    expect(countCells(ground.blocked)).toBe(0);
    expect(countCells(ground.costly)).toBe(0);
    expect(countCells(ground.noStop)).toBe(0);
  });

  it('shuts the ground of a piece nobody may walk into', () => {
    const mover = pieceAt(1, 1, 'heroes');
    const ground = held(mover, [pieceAt(4, 4, 'goblins')], everyone('block'));

    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(true);
    expect(countCells(ground.noStop)).toBe(0);
  });

  it('lets a piece cross its own side without stopping on it, and shuts the other side out', () => {
    const mover = pieceAt(1, 1, 'heroes');
    const ground = held(mover, [pieceAt(4, 4, 'heroes'), pieceAt(6, 6, 'goblins')], {
      same: 'pass',
      other: 'block',
      none: 'share',
    });

    expect(ground.noStop.get(cellIndexOf(grid, 4, 4))).toBe(true);
    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(false);
    expect(ground.blocked.get(cellIndexOf(grid, 6, 6))).toBe(true);
  });

  it('charges for the ground it crosses where the table charges for it', () => {
    const mover = pieceAt(1, 1, 'heroes');
    const ground = held(mover, [pieceAt(4, 4, 'heroes')], { same: 'cost', other: 'share', none: 'share' });

    expect(ground.costly.get(cellIndexOf(grid, 4, 4))).toBe(true);
    expect(ground.noStop.get(cellIndexOf(grid, 4, 4))).toBe(true);
  });

  it('holds every cell a piece covers, however wide it stands', () => {
    const mover = pieceAt(1, 1, 'heroes');
    const ground = held(mover, [pieceAt(4, 4, 'goblins', 3)], everyone('block'));

    expect(countCells(ground.blocked)).toBe(9);
  });

  it('holds nothing against the piece that is moving', () => {
    const mover = pieceAt(4, 4, 'heroes');
    const ground = held(mover, [], everyone('block'));

    expect(countCells(ground.blocked)).toBe(0);
  });

  it('leaves ground two pieces share shut rather than merely dear', () => {
    const mover = pieceAt(1, 1, 'heroes');
    const ground = held(mover, [pieceAt(4, 4, 'heroes'), pieceAt(4, 4, 'goblins')], {
      same: 'cost',
      other: 'block',
      none: 'share',
    });

    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(true);
    expect(ground.costly.get(cellIndexOf(grid, 4, 4))).toBe(false);
    expect(ground.noStop.get(cellIndexOf(grid, 4, 4))).toBe(false);
  });

  it('holds the ground of a board of hexes just as it does a board of squares', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const hexes = cellGridOf(9, 9, GRID, type);
      const mover = pieceAt(1, 1, 'heroes');
      const ground = passageCells(hexes, [mover, pieceAt(4, 4, 'goblins')], mover, () => 'block');

      expect(countCells(ground.blocked)).toBe(1);
    }
  });
});

describe('squeezing past a piece far enough apart in size', () => {
  const grid = cellGridOf(9, 9, GRID, GridType.SQUARE);
  const made: GameCharacter[] = [];

  afterEach(() => {
    for (const piece of made.splice(0)) piece.destroy();
  });

  function pieceAt(col: number, row: number, size: number): GameCharacter {
    const piece = GameCharacter.create('コマ', size, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    made.push(piece);
    return piece;
  }

  function shutAgainst(mover: GameCharacter, blocker: GameCharacter, slips: boolean) {
    return passageCells(grid, [mover, blocker], mover, () => 'block', slips);
  }

  it('is a body in the way while the table says nothing of size', () => {
    const mover = pieceAt(1, 1, 1);
    const ground = shutAgainst(mover, pieceAt(4, 4, 3), false);

    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(true);
    expect(ground.noStop.get(cellIndexOf(grid, 4, 4))).toBe(false);
  });

  it('is crossed but not stood on where the two are far enough apart', () => {
    const mover = pieceAt(1, 1, 1);
    const ground = shutAgainst(mover, pieceAt(4, 4, 3), true);

    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(false);
    expect(ground.noStop.get(cellIndexOf(grid, 4, 4))).toBe(true);
  });

  it('is crossed the other way round as well, a giant over a rat', () => {
    const mover = pieceAt(1, 1, 3);
    const ground = shutAgainst(mover, pieceAt(6, 6, 1), true);

    expect(ground.noStop.get(cellIndexOf(grid, 6, 6))).toBe(true);
  });

  it('stays a body in the way for two pieces only one cell apart', () => {
    const mover = pieceAt(1, 1, 1);
    const ground = shutAgainst(mover, pieceAt(4, 4, 2), true);

    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(true);
  });

  it('stays a body in the way for two pieces of a size', () => {
    const mover = pieceAt(1, 1, 2);
    const ground = shutAgainst(mover, pieceAt(4, 4, 2), true);

    expect(ground.blocked.get(cellIndexOf(grid, 4, 4))).toBe(true);
  });

  it('says nothing of size where the ground was never shut in the first place', () => {
    const mover = pieceAt(1, 1, 1);
    const ground = passageCells(grid, [mover, pieceAt(4, 4, 3)], mover, () => 'share', true);

    expect(countCells(ground.blocked)).toBe(0);
    expect(countCells(ground.noStop)).toBe(0);
  });
});
