import { CellStep, hexStepsAt, ORTHOGONAL_STEPS, SQUARE_STEPS_WITH_CORNERS } from '@axe/domain/tabletop/cell-steps';
import { cellColRow, CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/** A step across a corner is a step, the same as one along a side. */
export const DIAGONAL_COSTS_ONE_CELL = true;

/**
 * Which way a piece may step out of a cell.
 *
 * Six ways on a hex board, where every side is a side and there are no corners to cut.
 * On squares there are corners, and whether a piece may cut them is the table's to say:
 * allowed, a step across one costs what a step along a side does.
 */
function stepsFor(gridType: GridType, col: number, row: number, cutsCorners: boolean): readonly CellStep[] {
  if (!isHexGrid(gridType)) return cutsCorners ? SQUARE_STEPS_WITH_CORNERS : ORTHOGONAL_STEPS;
  return hexStepsAt(isFlatTopGrid(gridType), col, row);
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

/**
 * The cell one step out of a cell, along one of the ways out of it.
 *
 * The ways are counted clockwise from the first a board lists: north on squares and on
 * flat-topped hexes, north-east on pointy-topped ones. Corners are never cut, so a square has
 * four. A count past the last goes round again, and a step off the board is -1.
 */
export function moveNeighbourToward(grid: CellGrid, index: number, direction: number): number {
  if (grid.cols <= 0 || grid.rows <= 0) return -1;
  if (index < 0 || index >= grid.cols * grid.rows) return -1;
  const { col, row } = cellColRow(grid, index);
  const steps = stepsFor(grid.type, col, row, false);
  const [dx, dy] = steps[((Math.trunc(direction) % steps.length) + steps.length) % steps.length];
  return cellIndexOf(grid, col + dx, row + dy);
}

/** The cells a piece can step to from one cell in a single step, as a list; see {@link forEachMoveNeighbour}. */
export function moveNeighboursOf(grid: CellGrid, index: number, cutsCorners = true): number[] {
  const found: number[] = [];
  forEachMoveNeighbour(grid, index, (neighbour) => found.push(neighbour), cutsCorners);
  return found;
}
