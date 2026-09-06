import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';

/** A way that was actually walked, cell by cell, and what it came to. */
export interface WalkedPath {
  /** Whether every step of it was a step a piece could take. */
  walkable: boolean;
  /** What it cost, counted the way a reach is counted. Meaningless where it is not walkable. */
  cost: number;
}

function isNeighbour(grid: CellGrid, from: number, to: number, cutsCorners: boolean): boolean {
  let found = false;
  forEachMoveNeighbour(
    grid,
    from,
    (neighbour) => {
      if (neighbour === to) found = true;
    },
    cutsCorners
  );
  return found;
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
  const cutsCorners = options.cutsCorners ?? true;
  const costOf = options.costOf;
  const stopsAt = options.stopsAt;
  if (cells.length < 1) return { walkable: false, cost: 0 };

  let cost = 0;
  let stopped = false;
  for (let step = 1; step < cells.length; step++) {
    const from = cells[step - 1];
    const to = cells[step];
    if (to === from) continue;
    if (stopped) return { walkable: false, cost };
    if (!isNeighbour(grid, from, to, cutsCorners)) return { walkable: false, cost };
    if (isBlocked(to)) return { walkable: false, cost };
    const price = costOf ? costOf(to) : 1;
    if (!Number.isFinite(price)) return { walkable: false, cost };
    cost += Math.max(1, Math.ceil(price));
    if (stopsAt?.(to)) stopped = true;
  }
  return { walkable: true, cost };
}
