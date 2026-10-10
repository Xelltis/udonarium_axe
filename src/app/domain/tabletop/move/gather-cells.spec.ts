import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexAt, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { gatherSpotsAround } from '@axe/domain/tabletop/move/gather-cells';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';

const GRID_SIZE = 50;

function makePiece(name: string, size = 1): GameCharacter {
  const character = GameCharacter.create(name, size, '');
  character.setLocation('table');
  return character;
}

describe('gatherSpotsAround', () => {
  const grid = cellGridOf(10, 10, GRID_SIZE, GridType.SQUARE);
  const nothingTaken = () => new CellBits(cellCount(grid));
  const made: GameCharacter[] = [];

  const piece = (name: string, size = 1) => {
    const character = makePiece(name, size);
    made.push(character);
    return character;
  };

  afterEach(() => {
    for (const character of made.splice(0)) character.destroy();
  });

  it('stands the first piece on the cell that was asked for', () => {
    const start = cellIndexOf(grid, 4, 4);
    const spots = gatherSpotsAround(grid, GRID_SIZE, start, [piece('one')], nothingTaken());

    expect(spots.length).toBe(1);
    expect(spots[0].cell).toBe(start);
  });

  it('lays the rest around it, nearest first', () => {
    const start = cellIndexOf(grid, 4, 4);
    const party = [piece('one'), piece('two'), piece('three'), piece('four')];
    const spots = gatherSpotsAround(grid, GRID_SIZE, start, party, nothingTaken());

    expect(spots.length).toBe(4);
    expect(spots[0].cell).toBe(start);
    // Every one of them is a neighbour of the middle: nothing was placed two cells out while
    // the ring around the middle still had room in it.
    const middle = { col: 4, row: 4 };
    for (const spot of spots.slice(1)) {
      const col = spot.cell % grid.cols;
      const row = Math.floor(spot.cell / grid.cols);
      expect(Math.max(Math.abs(col - middle.col), Math.abs(row - middle.row))).toBe(1);
    }
    expect(new Set(spots.map((spot) => spot.cell)).size).toBe(4);
  });

  it('passes over ground somebody is already standing on', () => {
    const start = cellIndexOf(grid, 4, 4);
    const standing = piece('standing');
    const corner = { x: 4 * GRID_SIZE, y: 4 * GRID_SIZE };
    standing.location.x = corner.x;
    standing.location.y = corner.y;
    const taken = occupiedCells(grid, [standing], '');
    expect(taken.get(start)).toBe(true);

    const spots = gatherSpotsAround(grid, GRID_SIZE, start, [piece('one')], taken);

    expect(spots.length).toBe(1);
    expect(spots[0].cell).not.toBe(start);
  });

  it('gives a piece three cells across all the room it needs', () => {
    const start = cellIndexOf(grid, 4, 4);
    const big = piece('big', 3);
    const small = piece('small');
    const spots = gatherSpotsAround(grid, GRID_SIZE, start, [big, small], nothingTaken());

    expect(spots.length).toBe(2);
    // The ground the big one covers is taken from the small one, so the two do not overlap.
    const bigCells = new Set<number>();
    const span = 3 * GRID_SIZE;
    for (let y = spots[0].y; y < spots[0].y + span; y += GRID_SIZE) {
      for (let x = spots[0].x; x < spots[0].x + span; x += GRID_SIZE) {
        bigCells.add(cellIndexAt(grid, x, y));
      }
    }
    expect(bigCells.size).toBe(9);
    expect(bigCells.has(spots[1].cell)).toBe(false);
  });

  it('places a piece where it says it stands, corner and all', () => {
    const start = cellIndexOf(grid, 4, 4);
    const big = piece('big', 2);
    const spots = gatherSpotsAround(grid, GRID_SIZE, start, [big], nothingTaken());

    big.location.x = spots[0].x;
    big.location.y = spots[0].y;
    expect(pieceCellOf(grid, big, GRID_SIZE)).toBe(spots[0].cell);
  });

  it('gathers on a hex table as readily as on a square one', () => {
    const hexGrid = cellGridOf(10, 10, GRID_SIZE, GridType.HEX_VERTICAL);
    const start = cellIndexOf(hexGrid, 4, 4);
    const party = [piece('one'), piece('two'), piece('three'), piece('four'), piece('five')];
    const spots = gatherSpotsAround(hexGrid, GRID_SIZE, start, party, new CellBits(cellCount(hexGrid)));

    expect(spots.length).toBe(5);
    expect(spots[0].cell).toBe(start);
    expect(new Set(spots.map((spot) => spot.cell)).size).toBe(5);
  });

  it('leaves out a piece that can find no room at all', () => {
    const tiny = cellGridOf(1, 1, GRID_SIZE, GridType.SQUARE);
    const start = cellIndexOf(tiny, 0, 0);
    const spots = gatherSpotsAround(
      tiny,
      GRID_SIZE,
      start,
      [piece('one'), piece('two')],
      new CellBits(cellCount(tiny))
    );

    expect(spots.length).toBe(1);
  });

  it('answers with nothing when the table has no grid to stand on', () => {
    const noGrid = cellGridOf(0, 0, GRID_SIZE, GridType.SQUARE);
    expect(gatherSpotsAround(noGrid, GRID_SIZE, 0, [piece('one')], new CellBits(0))).toEqual([]);
  });

  it('answers with nothing when the spot asked for is off the table', () => {
    const spots = gatherSpotsAround(grid, GRID_SIZE, -1, [piece('one')], nothingTaken());
    expect(spots).toEqual([]);
  });
});
