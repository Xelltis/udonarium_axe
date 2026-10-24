import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import {
  cellCenterOf,
  cellCount,
  cellGridOf,
  cellIndexAt,
  cellIndexOf,
  cellPolygonOf,
} from '@axe/domain/tabletop/fog/cell-grid';
import { GridSnapStyle } from '@axe/domain/tabletop/grid-snap-style';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { blockedByTerrain } from '@axe/domain/tabletop/move/blocked-cells';
import { landingHeightsOn } from '@axe/domain/tabletop/move/landing-height';
import { MoveBlockMap } from '@axe/domain/tabletop/move/move-block-map';
import { moveCostCells } from '@axe/domain/tabletop/move/move-cost-cells';
import {
  cellHolding,
  fitsOnCell,
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
  tableCellsOf,
} from '@axe/domain/tabletop/move/move-grid';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { pieceFitsOn } from '@axe/domain/tabletop/move/piece-footprint';
import {
  moveShiftOf,
  pieceCellOf,
  pieceCornerInSquare,
  pieceCornerOn,
  pieceCornerOnSquare,
  pieceCornersInSquare,
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

  it('counts a strip narrower than a square along the far edges as squares cut off by the edge', () => {
    const grid = moveGridOf(table(2));

    expect(isSquareGrid(grid)).toBe(true);
    expect([grid.cols, grid.rows, grid.sizePx]).toEqual([5, 4, 100]);
    expect(grid.clip).toEqual({ width: 450, height: 350 });
  });

  it('cuts nothing off a table its squares divide', () => {
    expect(moveGridOf({ ...table(2), width: 8, height: 6 }).clip).toBeUndefined();
  });
});

describe('a square the table’s edge cuts off', () => {
  const grid = moveGridOf(table(2)) as SquareGrid;
  const corner = cellIndexOf(grid, 4, 3);

  it('has its middle and its outline where it is on the table', () => {
    expect(cellCenterOf(grid, corner)).toEqual({ x: 425, y: 325 });
    expect(cellPolygonOf(grid, corner)).toEqual([
      { x: 400, y: 300 },
      { x: 450, y: 300 },
      { x: 450, y: 350 },
      { x: 400, y: 350 },
    ]);
    expect(cellCenterOf(grid, cellIndexOf(grid, 1, 3))).toEqual({ x: 150, y: 325 });
  });

  it('holds the points on the table and none past its edge', () => {
    expect(cellIndexAt(grid, 440, 10)).toBe(cellIndexOf(grid, 4, 0));
    expect(cellIndexAt(grid, 460, 10)).toBe(-1);
    expect(cellIndexAt(grid, 10, 360)).toBe(-1);
  });

  it('is made of the cells of it that are on the table', () => {
    expect(tableCellsOf(grid, corner)).toEqual([{ col: 8, row: 6 }]);
    expect(cellHolding(grid, 8, 6)).toBe(corner);
    expect(cellHolding(grid, 9, 6)).toBe(-1);
  });

  it('puts a piece on what of it is on the table, and finds the piece there again', () => {
    const piece = pieceAt(1, 0, 0);

    const at = pieceCornerOn(grid, piece, 50, corner);

    expect(at).toEqual({ x: 400, y: 300 });
    expect(pieceCellOf(grid, piece, 50, at)).toBe(corner);
    piece.destroy();
  });

  it('counts a piece a little over a square across as the whole cells it is counted in', () => {
    const piece = pieceAt(2.4, 0, 0);

    expect(pieceFitsOn(grid, piece, 50, new CellBits(cellCount(grid)))?.(cellIndexOf(grid, 0, 0))).toBe(true);
    piece.destroy();
  });

  it('keeps a wide piece on the table only across the edge that cuts the square off', () => {
    const cutAcross = moveGridOf({ ...table(2), width: 9, height: 8 });
    const piece = pieceAt(3, 0, 0);

    expect(pieceCornerOn(cutAcross, piece, 50, cellIndexOf(cutAcross, 0, 3))).toEqual({ x: 25, y: 325 });
    piece.destroy();
  });

  it('holds a piece as wide as the square on a cell of no binary width', () => {
    const odd = squareGridOver(cellGridOf(15, 15, 33.3, GridType.SQUARE), 2);

    expect(fitsOnCell(odd, cellIndexOf(odd, 6, 6), 2 * 33.3)).toBe(true);
  });

  it('asks nothing of a piece every square holds, cut off or not', () => {
    const piece = pieceAt(1, 0, 0);

    expect(pieceFitsOn(grid, piece, 50, new CellBits(cellCount(grid)))).toBeNull();
    piece.destroy();
  });

  it('keeps a piece wider than what is left of it on the table, and has no room for one', () => {
    const piece = pieceAt(2, 0, 0);
    const strip = cellIndexOf(grid, 0, 3);

    expect(pieceCornerOn(grid, piece, 50, strip)).toEqual({ x: 0, y: 250 });
    expect(pieceFitsOn(grid, piece, 50, new CellBits(cellCount(grid)))?.(strip)).toBe(false);
    expect(pieceFitsOn(grid, piece, 50, new CellBits(cellCount(grid)))?.(cellIndexOf(grid, 0, 2))).toBe(true);
    piece.destroy();
  });

  it('is not closed by rubble in a corner of a strip narrower than it is deep', () => {
    const threesCut = moveGridOf({ ...table(3), width: 8, height: 9 }) as SquareGrid;
    const strip = cellIndexOf(threesCut, 2, 0);

    expect(squaresClosedBy(threesCut, cellsAt(threesCut, [7, 1], [6, 2])).get(strip)).toBe(false);
    expect(squaresClosedBy(threesCut, cellsAt(threesCut, [6, 1], [7, 1])).get(strip)).toBe(true);
  });

  it('is closed by a wall across the part of it on the table, and left open by nothing', () => {
    const strip = cellIndexOf(grid, 0, 3);

    expect(squaresClosedBy(grid, cellsAt(grid)).get(strip)).toBe(false);
    expect(squaresClosedBy(grid, cellsAt(grid, [0, 6], [1, 6])).get(strip)).toBe(true);
    expect(squaresClosedBy(grid, cellsAt(grid, [0, 5])).get(cellIndexOf(grid, 0, 2))).toBe(false);
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

describe('where a piece is put down among the cells of a square', () => {
  /** Squares of three cells, for the cells in the middle of a square as well as along its edges. */
  const threes = squareGridOver(cellGridOf(9, 9, 50, GridType.SQUARE), 3) as SquareGrid;

  it('goes on the cell under the point it is wanted at', () => {
    const piece = pieceAt(1, 0, 0);

    expect(pieceCornerInSquare(threes, piece, 50, cellIndexOf(threes, 1, 0), { x: 230, y: 120 })).toEqual({
      x: 200,
      y: 100,
    });
    piece.destroy();
  });

  it('keeps a piece two cells across inside the square', () => {
    const piece = pieceAt(2, 0, 0);

    expect(pieceCornerInSquare(threes, piece, 50, cellIndexOf(threes, 0, 0), { x: 140, y: 140 })).toEqual({
      x: 50,
      y: 50,
    });
    expect(pieceCornerInSquare(threes, piece, 50, cellIndexOf(threes, 1, 0), { x: 160, y: 10 })).toEqual({
      x: 150,
      y: 0,
    });
    piece.destroy();
  });

  /** A table eight cells across and down counting squares of two cells, keeping its pieces to the cells. */
  const keptTwos = { ...table(2), width: 8, height: 8, gridSnap: true, gridSnapStyle: GridSnapStyle.GRID };

  it('puts a piece of part of a cell dropped by hand with its middle where cells meet inside the square', () => {
    const half = pieceAt(0.5, 0, 0);

    expect(pieceCornerOnSquare(keptTwos, half, { x: 0, y: 0 })).toEqual({ x: 37.5, y: 37.5 });
    expect(pieceCornerOnSquare(keptTwos, half, { x: 80, y: 10 })).toEqual({ x: 37.5, y: 37.5 });
    half.destroy();
  });

  it('keeps a piece dropped by hand to the cells of the square under its middle', () => {
    const piece = pieceAt(2, 0, 0);

    expect(pieceCornerOnSquare(keptTwos, piece, { x: 50, y: 50 })).toEqual({ x: 100, y: 100 });
    expect(pieceCornerOnSquare({ ...keptTwos, squareSpan: 1 }, piece, { x: 50, y: 50 })).toBeNull();
    piece.destroy();
  });

  it('lists the places a piece could stand in a square, along the top row first', () => {
    const one = pieceAt(1, 0, 0);
    const two = pieceAt(2, 0, 0);
    const half = pieceAt(0.5, 0, 0);
    const square = cellIndexOf(threes, 1, 0);

    expect(pieceCornersInSquare(threes, one, square)).toHaveLength(9);
    expect(pieceCornersInSquare(threes, one, square)[1]).toEqual({ x: 200, y: 0 });
    expect(pieceCornersInSquare(threes, two, square)).toEqual([
      { x: 150, y: 0 },
      { x: 200, y: 0 },
      { x: 150, y: 50 },
      { x: 200, y: 50 },
    ]);
    expect(pieceCornersInSquare(threes, half, square)[0]).toEqual({ x: 187.5, y: 37.5 });
    for (const piece of [one, two, half]) piece.destroy();
  });

  it('keeps a piece of part of a cell with no point where cells meet to stand on in the middle of the square', () => {
    const wide = pieceAt(2.5, 0, 0);

    expect(pieceCornersInSquare(threes, wide, cellIndexOf(threes, 0, 0))).toEqual([{ x: 12.5, y: 12.5 }]);
    wide.destroy();
  });

  it('puts a piece of part of a cell with its middle where cells meet', () => {
    const half = pieceAt(0.5, 0, 0);

    expect(pieceCornerInSquare(threes, half, 50, cellIndexOf(threes, 0, 0), { x: 60, y: 90 })).toEqual({
      x: 37.5,
      y: 87.5,
    });
    half.destroy();
  });

  it('puts a piece the square holds on the cells nearest its middle, on a table keeping to the cells', () => {
    const kept = (span: number) =>
      moveGridOf({ ...table(span), width: 12, height: 12, gridSnap: true, gridSnapStyle: GridSnapStyle.GRID });
    const one = pieceAt(1, 0, 0);
    const two = pieceAt(2, 0, 0);

    expect(pieceCornerOn(kept(2), one, 50, cellIndexOf(kept(2), 1, 1))).toEqual({ x: 100, y: 100 });
    expect(pieceCornerOn(kept(3), one, 50, cellIndexOf(kept(3), 1, 1))).toEqual({ x: 200, y: 200 });
    expect(pieceCornerOn(kept(4), two, 50, cellIndexOf(kept(4), 0, 0))).toEqual({ x: 50, y: 50 });
    expect(pieceCornerOn(moveGridOf({ ...table(2), width: 12, height: 12 }), one, 50, 7)).toEqual({ x: 125, y: 125 });
    one.destroy();
    two.destroy();
  });

  it('puts a piece wider than a square in the middle of it, as a square always has', () => {
    const piece = pieceAt(4, 0, 0);
    const square = cellIndexOf(threes, 1, 1);

    expect(pieceCornerInSquare(threes, piece, 50, square, { x: 160, y: 160 })).toEqual(
      pieceCornerOn(threes, piece, 50, square)
    );
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
