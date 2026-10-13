import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { cellColRow, type CellGrid, cellIndexOf, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';

/**
 * One edge of a body of water seen from the side: an upright face along one side of one cell,
 * from where the water beside it ends up to the surface.
 */
export interface WaterSide {
  readonly key: string;
  /** The cell it belongs to. */
  readonly index: number;
  /** Where the side starts and ends along the floor, in table pixels, going round the cell clockwise. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly bottomPx: number;
  readonly topPx: number;
  readonly color: string;
  readonly density: number;
}

/** The steps to the cell across each side of a square, in the order its corners are given. */
const SQUARE_SIDE_STEPS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * The sides of the water that show.
 *
 * A side between two cells of water at one height is inside the water and is not drawn. Where
 * the water or the ground beside stands lower, only the part above it shows; where there is
 * neither, the whole of it from the bottom of the water up. `groundOf` gives how high the ground
 * stands in a cell. Each side is a face of its own, one cell long: one face run along a
 * whole bank is a long sheet the browser can sort wrongly against what stands beside it.
 */
export function waterSidesOf(
  grid: CellGrid,
  cells: ReadonlyMap<number, WaterCell>,
  groundOf: (index: number) => number = () => 0
): WaterSide[] {
  const hex = isHexGrid(grid.type);
  const flatTop = isFlatTopGrid(grid.type);
  const sides: WaterSide[] = [];
  const ordered = [...cells.values()].sort((a, b) => a.index - b.index);
  for (const cell of ordered) {
    if (cell.surfacePx <= cell.floorPx) continue;
    const { col, row } = cellColRow(grid, cell.index);
    const corners = cellPolygonOf(grid, cell.index);
    const steps = hex ? hexSideStepsAt(flatTop, col, row) : SQUARE_SIDE_STEPS;
    for (let side = 0; side < corners.length; side++) {
      const [dx, dy] = steps[side];
      const across = cellIndexOf(grid, col + dx, row + dy);
      const neighbour = cells.get(across);
      const beside = Math.max(neighbour?.surfacePx ?? 0, across >= 0 ? groundOf(across) : 0);
      const bottomPx = Math.max(beside, cell.floorPx);
      if (bottomPx >= cell.surfacePx) continue;
      const from = corners[side];
      const to = corners[(side + 1) % corners.length];
      sides.push({
        key: `${cell.index}:${side}`,
        index: cell.index,
        x0: from.x,
        y0: from.y,
        x1: to.x,
        y1: to.y,
        bottomPx,
        topPx: cell.surfacePx,
        color: cell.color,
        density: cell.density,
      });
    }
  }
  return sides;
}
