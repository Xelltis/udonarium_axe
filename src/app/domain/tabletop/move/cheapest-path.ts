import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { DEFAULT_REACH_BUDGET, ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';

/**
 * The cheapest way from one cell to another, cell by cell, or nothing where there is none.
 *
 * The reach says where a piece may end up; this says how it would get there, which is what a
 * route has to be drawn from. Ground is settled a price at a time, so the first way found to
 * a cell is the cheapest there is and each cell is looked at once.
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
  const cutsCorners = options.cutsCorners ?? true;
  const costOf = options.costOf;
  const stopsAt = options.stopsAt;
  const total = cellCount(grid);
  if (start < 0 || start >= total || goal < 0 || goal >= total || budget < 1) return null;
  if (start === goal) return [start];
  if (cells < 1) return null;

  const cameFrom = new Map<number, number>();
  const settled = new Set<number>([start]);
  const byStep = new Map<number, number[]>([[0, [start]]]);
  let waiting = 1;
  let spent = 0;

  for (let step = 0; step < cells && waiting > 0; step++) {
    const walking = byStep.get(step);
    if (!walking) continue;
    byStep.delete(step);
    waiting -= walking.length;
    for (const cell of walking) {
      let found = false;
      forEachMoveNeighbour(
        grid,
        cell,
        (neighbour) => {
          if (found || settled.has(neighbour)) return;
          settled.add(neighbour);
          if (isBlocked(neighbour)) return;
          const price = costOf ? costOf(neighbour) : 1;
          if (!Number.isFinite(price)) return;
          const walked = step + Math.max(1, Math.ceil(price));
          if (walked > cells) return;
          cameFrom.set(neighbour, cell);
          spent++;
          if (neighbour === goal) {
            found = true;
            return;
          }
          if (spent >= budget) {
            found = true;
            return;
          }
          if (stopsAt?.(neighbour)) return;
          const queue = byStep.get(walked);
          if (queue) queue.push(neighbour);
          else byStep.set(walked, [neighbour]);
          waiting++;
        },
        cutsCorners
      );
      if (cameFrom.has(goal)) return traceBack(cameFrom, start, goal);
      if (spent >= budget) return null;
    }
  }
  return cameFrom.has(goal) ? traceBack(cameFrom, start, goal) : null;
}

function traceBack(cameFrom: ReadonlyMap<number, number>, start: number, goal: number): number[] {
  const way = [goal];
  let held = goal;
  while (held !== start) {
    const previous = cameFrom.get(held);
    if (previous === undefined) return [];
    held = previous;
    way.push(held);
  }
  return way.reverse();
}
