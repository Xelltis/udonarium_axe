import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { allowsDiagonal, DEFAULT_DIAGONAL_MOVE, diagonalCost } from '@axe/domain/tabletop/move/diagonal-move';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';

/** A way that was actually walked, cell by cell, and what it came to. */
export interface WalkedPath {
  /** Whether every step of it was a step a piece could take. */
  walkable: boolean;
  /** What it cost, counted the way a reach is counted. Meaningless where it is not walkable. */
  cost: number;
  /** How many corners have been cut once it is walked, counting on from those cut before it. */
  corners: number;
}

/** Whether one cell is a step from another, and whether that step crosses a corner. */
function stepBetween(
  grid: CellGrid,
  from: number,
  to: number,
  cutsCorners: boolean
): { walkable: boolean; acrossCorner: boolean } {
  let walkable = false;
  let acrossCorner = false;
  forEachMoveNeighbour(
    grid,
    from,
    (neighbour, corner) => {
      if (neighbour !== to) return;
      walkable = true;
      acrossCorner = corner;
    },
    cutsCorners
  );
  return { walkable, acrossCorner };
}

/**
 * What a way somebody actually took would cost them, if they could take it at all.
 *
 * A reach says where a piece could end up; this says whether the way it went to get there was
 * one it could have walked. The two differ wherever the cheapest way round is not the way the
 * hand went: a piece dragged straight over a wall lands somewhere it could have reached the
 * long way about, and only the way it went shows that it did not go the long way about.
 *
 * Standing still costs nothing. A step that is not onto a neighbour, or onto ground nobody may
 * enter, makes the whole way unwalkable rather than merely dear.
 */
export function walkedPath(
  grid: CellGrid,
  cells: readonly number[],
  isBlocked: (index: number) => boolean,
  options: ReachOptions = {}
): WalkedPath {
  const diagonals = options.diagonals ?? DEFAULT_DIAGONAL_MOVE;
  const costOf = options.costOf;
  const stopsAt = options.stopsAt;
  if (cells.length < 1) return { walkable: false, cost: 0, corners: 0 };

  let cost = 0;
  let cut = Math.abs(Math.trunc(options.cornersCut ?? 0));
  let stopped = false;
  for (let step = 1; step < cells.length; step++) {
    const from = cells[step - 1];
    const to = cells[step];
    if (to === from) continue;
    if (stopped) return { walkable: false, cost, corners: cut };
    const stepped = stepBetween(grid, from, to, allowsDiagonal(diagonals));
    if (!stepped.walkable) return { walkable: false, cost, corners: cut };
    if (isBlocked(to)) return { walkable: false, cost, corners: cut };
    const price = costOf ? costOf(to) : 1;
    if (!Number.isFinite(price)) return { walkable: false, cost, corners: cut };
    const corner = stepped.acrossCorner ? diagonalCost(diagonals, cut++) : 1;
    if (!Number.isFinite(corner)) return { walkable: false, cost, corners: cut };
    cost += Math.max(1, Math.ceil(price)) * corner;
    if (stopsAt?.(to)) stopped = true;
  }
  return { walkable: true, cost, corners: cut };
}
