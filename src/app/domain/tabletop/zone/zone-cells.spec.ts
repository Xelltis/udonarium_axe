import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { zoneCells } from '@axe/domain/tabletop/zone/zone-cells';

describe('zoneCells', () => {
  const grid = cellGridOf(10, 10, 50, GridType.SQUARE);

  it('takes the cells whose middles lie in a circle, edge included', () => {
    const cells = zoneCells(grid, { centre: { x: 125, y: 125 }, square: false, reach: 50 });

    expect(cells.get(cellIndexOf(grid, 2, 2))).toBe(true);
    expect(cells.get(cellIndexOf(grid, 3, 2))).toBe(true);
    expect(cells.get(cellIndexOf(grid, 3, 3))).toBe(false);
  });

  it('takes a square whole', () => {
    const cells = zoneCells(grid, { centre: { x: 125, y: 125 }, square: true, reach: 50 });

    expect(cells.get(cellIndexOf(grid, 3, 3))).toBe(true);
    expect(cells.get(cellIndexOf(grid, 4, 2))).toBe(false);
  });
});
