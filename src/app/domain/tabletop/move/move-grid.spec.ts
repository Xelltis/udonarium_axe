import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { blockedByTerrain } from '@axe/domain/tabletop/move/blocked-cells';
import { landingHeightsOn } from '@axe/domain/tabletop/move/landing-height';
import { MoveBlockMap } from '@axe/domain/tabletop/move/move-block-map';
import { moveCostCells } from '@axe/domain/tabletop/move/move-cost-cells';
import {
  forEachCellCovered,
  isSquareGrid,
  moveGridOf,
  squareCentreAt,
  SquareGrid,
  squareGridOver,
  squarePxOf,
  squaresClosedBy,
  squareSpanOf,
  squaresWithAny,
} from '@axe/domain/tabletop/move/move-grid';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { pieceFitsOn } from '@axe/domain/tabletop/move/piece-footprint';
import {
  moveShiftOf,
  pieceCellOf,
  pieceCornerOn,
  pieceCornerOnSquare,
  sizeShiftOf,
} from '@axe/domain/tabletop/move/piece-on-grid';
import { MOVE_COST_HALF_EXTRA, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';

const table = (squareSpan: number | string, gridType = GridType.SQUARE) => ({
  width: 9,
  height: 7,
  gridSize: 50,
  gridType,
  squareSpan: squareSpan as number,
});

/** Squares of two cells over a table eight cells across and down. */
const twos = squareGridOver(cellGridOf(8, 8, 50, GridType.SQUARE), 2) as SquareGrid;

/** The cells of the table marked at the columns and rows given. */
function cellsAt(grid: SquareGrid, ...at: [number, number][]): CellBits {
  const bits = new CellBits(grid.fine.cols * grid.fine.rows);
  for (const [col, row] of at) bits.set(cellIndexOf(grid.fine, col, row));
  return bits;
}

function pieceAt(size: number, x: number, y: number): GameCharacter {
  const piece = GameCharacter.create('駒', size, '');
  piece.location = { ...piece.location, name: 'table', x, y };
  return piece;
}

describe('how many cells a square of a table is', () => {
  it('takes what the table says on a square grid, held between one and four', () => {
    expect(squareSpanOf(table(2))).toBe(2);
    expect(squareSpanOf(table('3'))).toBe(3);
    expect(squareSpanOf(table(9))).toBe(4);
    expect(squareSpanOf(table(0))).toBe(1);
  });

  it('counts every cell of a hex table or one with no grid, whatever the table holds', () => {
    expect(squareSpanOf(table(2, GridType.HEX_VERTICAL))).toBe(1);
    expect(squareSpanOf(table(2, GridType.HEX_HORIZONTAL))).toBe(1);
    expect(squareSpanOf(table(2, GridType.NONE))).toBe(1);
  });

  it('reads an empty or unreadable value as one cell', () => {
    expect(squareSpanOf(table(''))).toBe(1);
    expect(squareSpanOf(table('x'))).toBe(1);
  });

  it('gives the size of a square in px', () => {
    expect(squarePxOf(table(3))).toBe(150);
    expect(squarePxOf(table(3, GridType.HEX_VERTICAL))).toBe(50);
  });
});

describe('the grid a piece moves over', () => {
  it('is the table’s own cells when a square is one cell', () => {
    expect(moveGridOf(table(1))).toEqual(cellGridOf(9, 7, 50, GridType.SQUARE));
    expect(isSquareGrid(moveGridOf(table(1)))).toBe(false);
  });

  it('is whole squares only, leaving a strip narrower than a square off the far edges', () => {
    const grid = moveGridOf(table(2));

    expect(isSquareGrid(grid)).toBe(true);
    expect([grid.cols, grid.rows, grid.sizePx]).toEqual([4, 3, 100]);
  });
});

describe('the squares a box covers', () => {
  it('holds one square for a piece smaller than a square, wherever it stands in it', () => {
    for (const [x, y] of [
      [0, 0],
      [50, 0],
      [50, 50],
    ]) {
      const covered: number[] = [];
      forEachCellCovered(twos, x, y, x + 49, y + 49, (square) => covered.push(square));

      expect(covered).toEqual([0]);
    }
  });

  it('holds every square a piece left between them covers a cell of', () => {
    const covered: number[] = [];
    forEachCellCovered(twos, 50, 50, 149, 149, (square) => covered.push(square));

    expect(covered.sort()).toEqual([0, 1, 4, 5]);
  });
});

describe('the squares walls drawn on the cells close', () => {
  it('closes a square a wall one cell thick runs across, along its edge as well as through it', () => {
    expect(squaresClosedBy(twos, cellsAt(twos, [0, 0], [0, 1])).get(0)).toBe(true);
    expect(squaresClosedBy(twos, cellsAt(twos, [1, 0], [1, 1])).get(0)).toBe(true);
    expect(squaresClosedBy(twos, cellsAt(twos, [0, 1], [1, 1])).get(0)).toBe(true);
  });

  it('closes a square a wall runs across corner to corner', () => {
    expect(squaresClosedBy(twos, cellsAt(twos, [0, 0], [1, 1])).get(0)).toBe(true);
    expect(squaresClosedBy(twos, cellsAt(twos, [1, 0], [0, 1])).get(0)).toBe(true);
  });

  it('leaves a square open where a doorway breaks the wall or a pillar stands alone', () => {
    const threes = squareGridOver(cellGridOf(9, 9, 50, GridType.SQUARE), 3);

    expect(squaresClosedBy(threes, cellsAt(threes, [1, 0], [1, 2])).get(0)).toBe(false);
    expect(squaresClosedBy(threes, cellsAt(threes, [1, 1])).get(0)).toBe(false);
    expect(squaresClosedBy(threes, cellsAt(threes, [0, 1], [1, 1], [2, 1])).get(0)).toBe(true);
  });

  it('closes the squares a wall on the terrain runs through, and leaves the rest open', () => {
    const wall = Terrain.create('壁', 1, 4, 1, '', '');
    wall.mode = TerrainViewState.ALL;
    wall.location = { ...wall.location, x: 150, y: 0 };

    const closed = blockedByTerrain(twos, [wall]);

    expect([closed.get(cellIndexOf(twos, 1, 0)), closed.get(cellIndexOf(twos, 1, 1))]).toEqual([true, true]);
    expect([closed.get(cellIndexOf(twos, 0, 0)), closed.get(cellIndexOf(twos, 2, 0))]).toEqual([false, false]);
    wall.destroy();
  });
});

describe('walls painted on the cells, read on squares', () => {
  it('closes the squares the painted cells run across', () => {
    const map = new MoveBlockMap();
    map.write(twos.fine, cellsAt(twos, [2, 0], [2, 1], [5, 5]));

    const closed = map.read(twos);

    expect([closed.get(cellIndexOf(twos, 1, 0)), closed.get(cellIndexOf(twos, 2, 2))]).toEqual([true, false]);
  });
});

describe('the squares marked by any of their cells', () => {
  it('marks each square holding a marked cell once', () => {
    const squares = squaresWithAny(twos, cellsAt(twos, [0, 0], [1, 1], [7, 7]));

    expect([squares.get(0), squares.get(cellIndexOf(twos, 3, 3)), squares.get(1)]).toEqual([true, true, false]);
  });
});

describe('where a piece stands on squares', () => {
  it('stands as it did on the table’s own cells when a square is one cell', () => {
    for (const size of [1, 1.5, 2, 3, 4]) {
      expect(moveShiftOf(size, 50, 1)).toBe(sizeShiftOf(size, 50));
    }
  });

  it('puts the middle of a piece no wider than a square on the middle of the square', () => {
    expect(moveShiftOf(1, 50, 2)).toBe(25);
    expect(moveShiftOf(2, 50, 2)).toBe(50);
  });

  it('puts the middle of a piece two squares across where the squares meet', () => {
    expect(moveShiftOf(3, 50, 2)).toBe(25);
    expect(moveShiftOf(4, 50, 2)).toBe(50);
  });

  it('lands a piece in the middle of a square and finds it on that square again', () => {
    const piece = pieceAt(1, 0, 0);
    const square = cellIndexOf(twos, 1, 2);

    const corner = pieceCornerOn(twos, piece, 50, square);

    expect(corner).toEqual({ x: 125, y: 225 });
    expect(pieceCellOf(twos, piece, 50, corner)).toBe(square);
    piece.destroy();
  });
});

describe('where a dragged piece is snapped to', () => {
  it('goes on the square under where it is dropped, on a table counting squares of several cells', () => {
    const piece = pieceAt(1, 0, 0);

    expect(pieceCornerOnSquare({ ...table(2), width: 8, height: 8 }, piece, { x: 160, y: 30 })).toEqual({
      x: 125,
      y: 25,
    });
    piece.destroy();
  });

  it('is left to the table’s own snap on a table counting each cell', () => {
    const piece = pieceAt(1, 0, 0);

    expect(pieceCornerOnSquare(table(1), piece, { x: 160, y: 30 })).toBeNull();
    expect(pieceCornerOnSquare(table(2, GridType.HEX_VERTICAL), piece, { x: 160, y: 30 })).toBeNull();
    piece.destroy();
  });
});

describe('where a range is snapped to', () => {
  it('goes on the middle of the square under it, on a table counting squares of several cells', () => {
    expect(squareCentreAt({ ...table(2), width: 8, height: 8 }, { x: 160, y: 30 })).toEqual({ x: 150, y: 50 });
    expect(squareCentreAt(table(1), { x: 160, y: 30 })).toBeNull();
  });
});

describe('the ground on squares', () => {
  it('takes up the one square a piece smaller than a square is in', () => {
    const piece = pieceAt(1, 50, 0);

    const taken = occupiedCells(twos, [piece], '');

    expect([taken.get(0), taken.get(1)]).toEqual([true, false]);
    piece.destroy();
  });

  it('asks every square a wide piece would cover to be clear', () => {
    const piece = pieceAt(3, 0, 0);
    const blocked = new CellBits(16);
    blocked.set(cellIndexOf(twos, 2, 1));

    const fits = pieceFitsOn(twos, piece, 50, blocked)!;

    expect(fits(cellIndexOf(twos, 0, 0))).toBe(true);
    expect(fits(cellIndexOf(twos, 1, 0))).toBe(false);
    piece.destroy();
  });

  it('charges the dearest cell of a square, or makes it a road where a road runs through it', () => {
    const area = (col: number, row: number, extraCost: number, halves = false) => {
      const painted = new TableMoveCost();
      painted.col = col;
      painted.row = row;
      painted.extraCost = extraCost;
      painted.halves = halves;
      return painted;
    };

    const costs = moveCostCells(twos, [area(0, 0, 1), area(1, 1, 3), area(2, 0, 2), area(3, 1, 1, true)])!;

    expect(costs[0]).toBe(3);
    expect(costs[1]).toBe(MOVE_COST_HALF_EXTRA);
  });

  it('reads the height of the ground at the middle of a square', () => {
    const block = Terrain.create('台', 1, 1, 2, '', '');
    block.mode = TerrainViewState.ALL;
    block.location = { ...block.location, x: 25, y: 25 };

    const heights = landingHeightsOn(twos, [block]);

    expect(heights[0]).toBeGreaterThan(0);
    expect(heights[1]).toBe(0);
    block.destroy();
  });
});
