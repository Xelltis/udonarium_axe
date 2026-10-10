import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { moveCostCells } from '@axe/domain/tabletop/move/move-cost-cells';
import { MOVE_COST_HALF_EXTRA, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { describe, expect, it } from 'vitest';

const square = cellGridOf(10, 10, 50, GridType.SQUARE);

function dearGround(col: number, row: number, width: number, height: number, extraCost: number): TableMoveCost {
  const area = new TableMoveCost();
  area.col = col;
  area.row = row;
  area.width = width;
  area.height = height;
  area.extraCost = extraCost;
  return area;
}

function road(col: number, row: number, width: number, height: number): TableMoveCost {
  const area = dearGround(col, row, width, height, 1);
  area.halves = true;
  return area;
}

describe('a road painted across a table', () => {
  it('takes half a step off the cells it runs over, and nothing beside them', () => {
    const costs = moveCostCells(square, [road(2, 3, 2, 1)])!;

    expect(costs[cellIndexOf(square, 2, 3)]).toBe(MOVE_COST_HALF_EXTRA);
    expect(costs[cellIndexOf(square, 4, 3)]).toBe(0);
  });

  it('runs straight through dear ground rather than beside it', () => {
    const costs = moveCostCells(square, [dearGround(0, 0, 10, 10, 3), road(2, 2, 1, 6)])!;

    expect(costs[cellIndexOf(square, 2, 3)]).toBe(MOVE_COST_HALF_EXTRA);
    expect(costs[cellIndexOf(square, 3, 3)]).toBe(3);
  });

  it('is a road whichever order the two were painted in', () => {
    const under = moveCostCells(square, [road(2, 2, 1, 6), dearGround(0, 0, 10, 10, 3)])!;

    expect(under[cellIndexOf(square, 2, 3)]).toBe(MOVE_COST_HALF_EXTRA);
  });
});

describe('what the ground of a table charges to cross', () => {
  it('charges nothing at all where nothing was painted', () => {
    expect(moveCostCells(square, [])).toBeNull();
  });

  it('charges every cell a stretch of ground covers, and none beside it', () => {
    const costs = moveCostCells(square, [dearGround(2, 3, 2, 1, 1)])!;

    expect(costs[cellIndexOf(square, 2, 3)]).toBe(1);
    expect(costs[cellIndexOf(square, 3, 3)]).toBe(1);
    expect(costs[cellIndexOf(square, 4, 3)]).toBe(0);
    expect(costs[cellIndexOf(square, 2, 4)]).toBe(0);
  });

  it('charges the dearer of two stretches painted over one another', () => {
    const costs = moveCostCells(square, [dearGround(2, 2, 3, 3, 2), dearGround(3, 3, 3, 3, 1)])!;

    expect(costs[cellIndexOf(square, 3, 3)]).toBe(2);
    expect(costs[cellIndexOf(square, 5, 5)]).toBe(1);
  });

  it('charges the same however the two are painted round', () => {
    const over = moveCostCells(square, [dearGround(3, 3, 3, 3, 1), dearGround(2, 2, 3, 3, 2)])!;

    expect(over[cellIndexOf(square, 3, 3)]).toBe(2);
  });

  it('leaves out whatever hangs off the edge of the board', () => {
    const costs = moveCostCells(square, [dearGround(9, 9, 4, 4, 3)])!;

    expect(costs[cellIndexOf(square, 9, 9)]).toBe(3);
    expect(costs.length).toBe(100);
  });

  it('charges nothing where a stretch of ground lies off the board altogether', () => {
    expect(moveCostCells(square, [dearGround(40, 40, 2, 2, 3)])).toBeNull();
  });

  it('holds a charge to a whole step between one and nine', () => {
    const costs = moveCostCells(square, [dearGround(1, 1, 1, 1, 0), dearGround(2, 2, 1, 1, 99)])!;

    expect(costs[cellIndexOf(square, 1, 1)]).toBe(1);
    expect(costs[cellIndexOf(square, 2, 2)]).toBe(9);
  });

  it('charges the ground of a board of hexes just as it does a board of squares', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(10, 10, 50, type);
      const costs = moveCostCells(grid, [dearGround(4, 4, 2, 2, 2)])!;

      expect(costs[cellIndexOf(grid, 4, 4)]).toBe(2);
      expect(costs[cellIndexOf(grid, 5, 5)]).toBe(2);
      expect(costs[cellIndexOf(grid, 6, 6)]).toBe(0);
    }
  });
});
