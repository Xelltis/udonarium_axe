import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import {
  allowsDiagonal,
  countsDiagonals,
  DEFAULT_DIAGONAL_MOVE,
  diagonalCost,
} from '@axe/domain/tabletop/move/diagonal-move';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { DEFAULT_REACH_BUDGET, ReachOptions, startingCut } from '@axe/domain/tabletop/move/reachable-cells';

/**
 * The cheapest way from one cell to another, cell by cell, or nothing where there is none.
 *
 * The reach says where a piece may end up; this says how it would get there, which is what a
 * route has to be drawn from. Ground is settled a price at a time, so the first way settled to
 * a place is the cheapest there is.
 *
 * A place is a cell and, where the table counts corners by turns, the count of corners cut on
 * the way to it: the same cell reached with a corner in hand is a different place to walk on
 * from, and the cheaper of the two is not always the one that leads on cheapest.
 *
 * The way includes the cell it starts on, so a way that goes nowhere is one cell long.
 */
export function cheapestPath(
  grid: CellGrid,
  start: number,
  goal: number,
  cells: number,
  isBlocked: (index: number) => boolean,
  options: ReachOptions = {}
): number[] | null {
  const budget = options.budget ?? DEFAULT_REACH_BUDGET;
  const diagonals = options.diagonals ?? DEFAULT_DIAGONAL_MOVE;
  const costOf = options.costOf;
  const stopsAt = options.stopsAt;
  const total = cellCount(grid);
  if (start < 0 || start >= total || goal < 0 || goal >= total || budget < 1) return null;
  if (start === goal) return [start];
  if (cells < 1) return null;

  const width = countsDiagonals(diagonals) ? 2 : 1;
  const from = start * width + startingCut(diagonals, options.cornersCut);
  const cheapest = new Float64Array(total * width).fill(Number.POSITIVE_INFINITY);
  const settled = new CellBits(total * width);
  const cameFrom = new Map<number, number>();
  const byStep = new Map<number, number[]>([[0, [from]]]);
  cheapest[from] = 0;
  let spent = 0;

  for (let step = 0; step <= cells; step++) {
    const walking = byStep.get(step);
    if (!walking) continue;
    byStep.delete(step);
    for (const state of walking) {
      if (settled.get(state) || cheapest[state] < step) continue;
      settled.set(state);
      const cell = Math.floor(state / width);
      const cut = state % width;
      if (cell === goal) return traceBack(cameFrom, from, state, width);
      if (cell !== start) {
        if (++spent >= budget) return null;
        if (stopsAt?.(cell)) continue;
      }
      forEachMoveNeighbour(
        grid,
        cell,
        (neighbour, acrossCorner) => {
          if (isBlocked(neighbour)) return;
          const ground = costOf ? costOf(neighbour, cell) : 1;
          if (!Number.isFinite(ground)) return;
          const corner = acrossCorner ? diagonalCost(diagonals, cut) : 1;
          if (!Number.isFinite(corner)) return;
          const walked = step + Math.max(1, Math.ceil(ground)) * corner;
          if (walked > cells) return;
          const next = neighbour * width + (acrossCorner && width > 1 ? (cut + 1) % 2 : cut);
          if (settled.get(next) || cheapest[next] <= walked) return;
          cheapest[next] = walked;
          cameFrom.set(next, state);
          const queue = byStep.get(walked);
          if (queue) queue.push(next);
          else byStep.set(walked, [next]);
        },
        allowsDiagonal(diagonals)
      );
    }
  }
  return null;
}

function traceBack(cameFrom: ReadonlyMap<number, number>, start: number, goal: number, width: number): number[] {
  const way = [Math.floor(goal / width)];
  let held = goal;
  while (held !== start) {
    const previous = cameFrom.get(held);
    if (previous === undefined) return [];
    held = previous;
    way.push(Math.floor(held / width));
  }
  return way.reverse();
}
