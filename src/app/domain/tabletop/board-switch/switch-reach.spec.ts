import { cellsOfRect, stepsToReach } from '@axe/domain/tabletop/board-switch/switch-reach';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';

describe('how far a switch is', () => {
  const square = cellGridOf(10, 10, 50, GridType.SQUARE);
  const hex = cellGridOf(10, 10, 50, GridType.HEX_VERTICAL);

  it('covers the cells of a stretch of the board, and none off it', () => {
    expect(cellsOfRect(square, { col: 8, row: 8, width: 3, height: 3 }).size).toBe(4);
  });

  it('counts nought from a cell the switch stands over, and a step across a corner as one', () => {
    const chest = cellsOfRect(square, { col: 5, row: 5, width: 1, height: 1 });

    expect(stepsToReach(square, cellIndexOf(square, 5, 5), chest, 3)).toBe(0);
    expect(stepsToReach(square, cellIndexOf(square, 7, 7), chest, 3)).toBe(2);
    expect(stepsToReach(square, cellIndexOf(square, 8, 5), chest, 2)).toBeNull();
  });

  it('counts to the nearest cell of a switch wider than one', () => {
    const wall = cellsOfRect(square, { col: 2, row: 2, width: 4, height: 1 });

    expect(stepsToReach(square, cellIndexOf(square, 5, 4), wall, 5)).toBe(2);
  });

  it('counts steps on hexes, where a cell has six neighbours', () => {
    const chest = cellsOfRect(hex, { col: 5, row: 5, width: 1, height: 1 });

    expect(stepsToReach(hex, cellIndexOf(hex, 5, 3), chest, 5)).toBe(2);
    expect(stepsToReach(hex, cellIndexOf(hex, 5, 3), chest, 1)).toBeNull();
  });

  it('reaches nothing from off the board, or where there is nothing to reach', () => {
    expect(stepsToReach(square, -1, new Set([3]), 5)).toBeNull();
    expect(stepsToReach(square, 3, new Set(), 5)).toBeNull();
  });
});
