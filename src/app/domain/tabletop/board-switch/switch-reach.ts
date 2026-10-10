import { CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';

/** The cells a stretch of the board covers, leaving out whatever lies off the board. */
export function cellsOfRect(grid: CellGrid, rect: CellRect): Set<number> {
  const cells = new Set<number>();
  for (let row = rect.row; row < rect.row + rect.height; row++) {
    for (let col = rect.col; col < rect.col + rect.width; col++) {
      const index = cellIndexOf(grid, col, row);
      if (index >= 0) cells.add(index);
    }
  }
  return cells;
}

/**
 * How many steps it takes from one cell to the nearest of some others, or null where none of them
 * is within `limit` steps.
 *
 * Counted the way a piece steps, one cell to a neighbour, six ways on hexes and eight on squares
 * where corners may be cut, and nothing in the way is asked about: a switch within two cells is
 * within two cells whether or not there is a wall between, the way a voice carries round one.
 * Standing on one of the cells is nought steps.
 */
export function stepsToReach(
  grid: CellGrid,
  from: number,
  targets: ReadonlySet<number>,
  limit: number,
  cutsCorners = true
): number | null {
  if (from < 0 || targets.size < 1) return null;
  if (targets.has(from)) return 0;
  let edge = [from];
  const seen = new Set<number>(edge);
  for (let steps = 1; steps <= limit && edge.length > 0; steps++) {
    const next: number[] = [];
    for (const cell of edge) {
      let found = false;
      forEachMoveNeighbour(
        grid,
        cell,
        (neighbour) => {
          if (found || seen.has(neighbour)) return;
          if (targets.has(neighbour)) found = true;
          seen.add(neighbour);
          next.push(neighbour);
        },
        cutsCorners
      );
      if (found) return steps;
    }
    edge = next;
  }
  return null;
}
