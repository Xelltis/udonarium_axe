import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { cellColRow, type CellGrid, cellIndexOf, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';

/** One stretch of shore: a side of a cell of water where the land beside rises to the surface. */
export interface WaterShore {
  readonly key: string;
  /** The cell of water it belongs to. */
  readonly index: number;
  /**
   * Where it starts and ends, in table pixels, going round the cell clockwise, so that the water
   * lies to the right of the way it runs.
   */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly surfacePx: number;
}

/** How far below the surface land may stand and still be the shore the waves break on, in pixels. */
const SHORE_PX = 0.5;

const SQUARE_SIDE_STEPS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Where the water meets land standing as high as its surface: the sides waves break against.
 *
 * Water beside lower ground or the edge of the board stands as a wall of water instead, and
 * water beside water is open water; neither has a shore. `groundOf` gives how high the ground
 * stands in a cell.
 */
export function waterShoreOf(
  grid: CellGrid,
  cells: ReadonlyMap<number, WaterCell>,
  groundOf: (index: number) => number
): WaterShore[] {
  const hex = isHexGrid(grid.type);
  const flatTop = isFlatTopGrid(grid.type);
  const shores: WaterShore[] = [];
  const ordered = [...cells.values()].sort((a, b) => a.index - b.index);
  for (const cell of ordered) {
    const { col, row } = cellColRow(grid, cell.index);
    const corners = cellPolygonOf(grid, cell.index);
    const steps = hex ? hexSideStepsAt(flatTop, col, row) : SQUARE_SIDE_STEPS;
    for (let side = 0; side < corners.length; side++) {
      const [dx, dy] = steps[side];
      const across = cellIndexOf(grid, col + dx, row + dy);
      if (across < 0 || cells.has(across)) continue;
      if (groundOf(across) < cell.surfacePx - SHORE_PX) continue;
      const from = corners[side];
      const to = corners[(side + 1) % corners.length];
      shores.push({
        key: `${cell.index}:${side}`,
        index: cell.index,
        x0: from.x,
        y0: from.y,
        x1: to.x,
        y1: to.y,
        surfacePx: cell.surfacePx,
      });
    }
  }
  return shores;
}
