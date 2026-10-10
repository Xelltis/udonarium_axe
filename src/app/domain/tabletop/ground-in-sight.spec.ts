import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { groundInSight } from '@axe/domain/tabletop/ground-in-sight';

const grid = cellGridOf(10, 10, 50, GridType.SQUARE);

function seeing(...cells: [number, number][]): CellBits {
  const seen = new CellBits(100);
  for (const [col, row] of cells) seen.set(cellIndexOf(grid, col, row));
  return seen;
}

describe('groundInSight', () => {
  const patch = { col: 2, row: 2, width: 3, height: 2 };

  it('holds where one cell of it has been come upon', () => {
    expect(groundInSight(grid, patch, seeing([4, 3]))).toBe(true);
  });

  it('holds for nothing where none of it has', () => {
    expect(groundInSight(grid, patch, seeing([7, 7]))).toBe(false);
  });

  it('holds for everything on a table that hides nothing', () => {
    expect(groundInSight(grid, patch, null)).toBe(true);
  });

  it('holds for nothing where the reader sees nothing at all', () => {
    expect(groundInSight(grid, patch, new CellBits(100))).toBe(false);
  });
});
