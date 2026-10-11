import { cellCenterOf, cellColRow, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { moveNeighboursOf, moveNeighbourToward } from '@axe/domain/tabletop/move/move-neighbours';
import { describe, expect, it } from 'vitest';

function around(cols: number, rows: number, type: GridType, col: number, row: number): string[] {
  const grid = cellGridOf(cols, rows, 50, type);
  return moveNeighboursOf(grid, cellIndexOf(grid, col, row))
    .map((index) => cellColRow(grid, index))
    .map((cell) => `${cell.col},${cell.row}`)
    .sort();
}

describe('the cells a step reaches on squares', () => {
  it('counts a step cornerways as one cell, so a square has eight of them', () => {
    expect(around(6, 6, GridType.SQUARE, 2, 2)).toEqual(
      ['1,1', '2,1', '3,1', '1,2', '3,2', '1,3', '2,3', '3,3'].sort()
    );
  });

  it('has only what is on the board at a corner', () => {
    expect(around(6, 6, GridType.SQUARE, 0, 0)).toEqual(['1,0', '0,1', '1,1'].sort());
  });
});

describe('the cells a step reaches on flat-topped hexes', () => {
  it('goes up and down its own column and up-and-across the two beside it, from an even column', () => {
    expect(around(6, 6, GridType.HEX_VERTICAL, 2, 2)).toEqual(['2,1', '2,3', '1,1', '1,2', '3,1', '3,2'].sort());
  });

  it('goes down-and-across instead, from an odd column', () => {
    expect(around(6, 6, GridType.HEX_VERTICAL, 3, 2)).toEqual(['3,1', '3,3', '2,2', '2,3', '4,2', '4,3'].sort());
  });
});

describe('the cells a step reaches on pointy-topped hexes', () => {
  it('goes left and right along its own row and left-and-across the two beside it, from an even row', () => {
    expect(around(6, 6, GridType.HEX_HORIZONTAL, 2, 2)).toEqual(['1,2', '3,2', '1,1', '2,1', '1,3', '2,3'].sort());
  });

  it('goes right-and-across instead, from an odd row', () => {
    expect(around(6, 6, GridType.HEX_HORIZONTAL, 2, 3)).toEqual(['1,3', '3,3', '2,2', '3,2', '2,4', '3,4'].sort());
  });
});

describe('a square board that forbids corners', () => {
  it('steps four ways rather than eight', () => {
    const grid = cellGridOf(5, 5, 50, GridType.SQUARE);
    const middle = cellIndexOf(grid, 2, 2);

    expect(moveNeighboursOf(grid, middle, false)).toHaveLength(4);
    expect(moveNeighboursOf(grid, middle, false)).not.toContain(cellIndexOf(grid, 3, 3));
    expect(moveNeighboursOf(grid, middle, true)).toHaveLength(8);
  });

  it('leaves a hex board its six ways either way, having no corners to cut', () => {
    const grid = cellGridOf(5, 5, 50, GridType.HEX_VERTICAL);
    const middle = cellIndexOf(grid, 2, 2);

    expect(moveNeighboursOf(grid, middle, false)).toHaveLength(6);
    expect(moveNeighboursOf(grid, middle, true)).toHaveLength(6);
  });
});

describe('the cell one step along a given way', () => {
  function bearing(grid: CellGrid, from: number, to: number): number {
    const a = cellCenterOf(grid, from);
    const b = cellCenterOf(grid, to);
    return ((Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI + 360) % 360;
  }

  const boards = [
    { name: 'squares', type: GridType.SQUARE, ways: [0, 90, 180, 270] },
    { name: 'flat-topped hexes', type: GridType.HEX_VERTICAL, ways: [0, 60, 120, 180, 240, 300] },
    { name: 'pointy-topped hexes', type: GridType.HEX_HORIZONTAL, ways: [30, 90, 150, 210, 270, 330] },
  ];

  for (const board of boards) {
    it(`counts the ways clockwise on ${board.name}, from odd and even cells alike`, () => {
      const grid = cellGridOf(8, 8, 50, board.type);
      for (const [col, row] of [
        [3, 3],
        [3, 4],
        [4, 3],
        [4, 4],
      ]) {
        const from = cellIndexOf(grid, col, row);
        board.ways.forEach((expected, direction) => {
          expect(bearing(grid, from, moveNeighbourToward(grid, from, direction))).toBeCloseTo(expected, 5);
        });
      }
    });
  }

  it('goes round again past the last way, and back from before the first', () => {
    const grid = cellGridOf(8, 8, 50, GridType.HEX_VERTICAL);
    const from = cellIndexOf(grid, 3, 3);

    expect(moveNeighbourToward(grid, from, 6)).toBe(moveNeighbourToward(grid, from, 0));
    expect(moveNeighbourToward(grid, from, -1)).toBe(moveNeighbourToward(grid, from, 5));
  });

  it('steps off the board to nothing', () => {
    const grid = cellGridOf(4, 4, 50, GridType.SQUARE);
    const corner = cellIndexOf(grid, 0, 0);

    expect(moveNeighbourToward(grid, corner, 0)).toBe(-1);
    expect(moveNeighbourToward(grid, corner, 3)).toBe(-1);
    expect(moveNeighbourToward(grid, -1, 0)).toBe(-1);
  });
});
