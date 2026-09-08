import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import {
  allowsDiagonal,
  countsDiagonals,
  DEFAULT_DIAGONAL_MOVE,
  diagonalCost,
  DiagonalMove,
} from '@axe/domain/tabletop/move/diagonal-move';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';

export const DEFAULT_REACH_BUDGET = 4000;

export interface ReachOptions {
  /** How many cells may be looked at before the search gives up on a heavy table. */
  budget?: number;
  /** How a step across a corner is counted. A hex board has no corners to cut. */
  diagonals?: DiagonalMove;
  /**
   * What entering a cell costs, in steps. One by default, and Infinity for one nobody enters.
   *
   * The cell stepped off is given as well, since a table may charge for the step rather than
   * for the ground: what it costs to break out of a fight is owed by the step that leaves it,
   * not by every cell beyond.
   */
  costOf?: (index: number, from: number) => number;
  /** Whether entering a cell ends the walk there: it is reached, and nothing beyond it is. */
  stopsAt?: (index: number) => boolean;
  /**
   * How many corners have been cut before this search sets out.
   *
   * A move settled a leg at a time is one move, so a table that counts corners by turns goes
   * on counting from where the last leg left off rather than starting the reckoning again.
   */
  cornersCut?: number;
}

/**
 * A place in the search: the cell stood on, and how many corners have been cut to get there.
 *
 * Only the count's parity is kept, and only where the table counts corners by turns. Everywhere
 * else the cell alone says everything about what a step from it will cost, and the search is
 * the plain one over cells.
 */
function stateWidth(diagonals: DiagonalMove): number {
  return countsDiagonals(diagonals) ? 2 : 1;
}

/** Where in the count of corners a search sets out, which is nowhere unless corners are counted. */
export function startingCut(diagonals: DiagonalMove, cornersCut: number | undefined): number {
  return countsDiagonals(diagonals) ? Math.abs(Math.trunc(cornersCut ?? 0)) % 2 : 0;
}

/**
 * How far a piece walks, counted in steps rather than in cells.
 *
 * Ground of its own price is what tells this from a plain breadth-first walk: a cell may cost
 * two steps to enter, or a hundred, and the cheapest way to it is wanted rather than the one
 * with the fewest cells in it.
 *
 * What a corner costs may depend on how many have been cut already, so a cell is not settled
 * once but once per count of corners behind it. A way that spends a dearer corner early can
 * still be the cheapest way onward, and dropping it as "already seen" answered a piece with a
 * reach it did not have.
 */
export function reachableCells(
  grid: CellGrid,
  start: number,
  cells: number,
  isBlocked: (index: number) => boolean,
  options: ReachOptions = {}
): CellBits {
  const budget = options.budget ?? DEFAULT_REACH_BUDGET;
  const diagonals = options.diagonals ?? DEFAULT_DIAGONAL_MOVE;
  const costOf = options.costOf;
  const stopsAt = options.stopsAt;
  const total = cellCount(grid);
  const reached = new CellBits(total);
  if (start < 0 || start >= total || cells < 1 || budget < 1) return reached;

  const width = stateWidth(diagonals);
  const from = start * width + startingCut(diagonals, options.cornersCut);
  const cheapest = new Float64Array(total * width).fill(Number.POSITIVE_INFINITY);
  const settled = new CellBits(total * width);
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
      // The cell it started from is not ground it walked to, and is not counted against the
      // budget either: what the budget bounds is how much ground the answer may hold.
      if (cell !== start) {
        reached.set(cell);
        if (++spent >= budget) return reached;
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
          const queue = byStep.get(walked);
          if (queue) queue.push(next);
          else byStep.set(walked, [next]);
        },
        allowsDiagonal(diagonals)
      );
    }
  }
  return reached;
}

export function countCells(bits: CellBits): number {
  let found = 0;
  for (let index = 0; index < bits.count; index++) {
    if (bits.get(index)) found++;
  }
  return found;
}
