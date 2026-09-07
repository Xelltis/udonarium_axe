import { cellColRow, CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/** A step across a corner is a step, the same as one along a side. */
export const DIAGONAL_COSTS_ONE_CELL = true;

type Step = readonly [number, number];

const ORTHOGONAL_STEPS: readonly Step[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const DIAGONAL_STEPS: readonly Step[] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

const SQUARE_STEPS_WITH_CORNERS: readonly Step[] = [...ORTHOGONAL_STEPS, ...DIAGONAL_STEPS];

const FLAT_TOP_EVEN_COLUMN_STEPS: readonly Step[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
];

const FLAT_TOP_ODD_COLUMN_STEPS: readonly Step[] = [
  [0, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

const POINTY_TOP_EVEN_ROW_STEPS: readonly Step[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

const POINTY_TOP_ODD_ROW_STEPS: readonly Step[] = [
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * Which way a piece may step out of a cell.
 *
 * Six ways on a hex board, where every side is a side and there are no corners to cut.
 * On squares there are corners, and whether a piece may cut them is the table's to say:
 * allowed, a step across one costs what a step along a side does.
 */
function stepsFor(gridType: GridType, col: number, row: number, cutsCorners: boolean): readonly Step[] {
  if (!isHexGrid(gridType)) return cutsCorners ? SQUARE_STEPS_WITH_CORNERS : ORTHOGONAL_STEPS;
  if (isFlatTopGrid(gridType)) {
    return Math.abs(col % 2) === 1 ? FLAT_TOP_ODD_COLUMN_STEPS : FLAT_TOP_EVEN_COLUMN_STEPS;
  }
  return Math.abs(row % 2) === 1 ? POINTY_TOP_ODD_ROW_STEPS : POINTY_TOP_EVEN_ROW_STEPS;
}

/**
 * Every way out of a cell, and whether each one crosses a corner.
 *
 * A hex board answers no to that for all six: every one of its steps is along a side, however
 * the column and row numbers happen to move.
 */
export function forEachMoveNeighbour(
  grid: CellGrid,
  index: number,
  visit: (neighbour: number, acrossCorner: boolean) => void,
  cutsCorners = true
): void {
  if (grid.cols <= 0 || grid.rows <= 0) return;
  if (index < 0 || index >= grid.cols * grid.rows) return;
  const { col, row } = cellColRow(grid, index);
  const hex = isHexGrid(grid.type);
  for (const [dx, dy] of stepsFor(grid.type, col, row, cutsCorners)) {
    const neighbour = cellIndexOf(grid, col + dx, row + dy);
    if (neighbour >= 0) visit(neighbour, !hex && dx !== 0 && dy !== 0);
  }
}

export function moveNeighboursOf(grid: CellGrid, index: number, cutsCorners = true): number[] {
  const found: number[] = [];
  forEachMoveNeighbour(grid, index, (neighbour) => found.push(neighbour), cutsCorners);
  return found;
}
