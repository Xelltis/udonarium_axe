import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import {
  cellCenterOf,
  cellColRow,
  type CellGrid,
  cellIndexOf,
  cellPolygonOf,
} from '@axe/domain/tabletop/fog/cell-grid';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';

/**
 * One edge of a body of water seen from the side: an upright face along one side of one cell,
 * from where the water or the ground beside it ends up to the surface.
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
  /** How high its bottom stands where it starts and where it ends: level over a level floor, slanting over a slope. */
  readonly bottomStartPx: number;
  readonly bottomEndPx: number;
  /** The lower of the two, which is where the face is stood from. */
  readonly bottomPx: number;
  readonly topPx: number;
  /**
   * How high the water's own floor stands, which the colour of every side is laid from, so that
   * sides of different heights side by side are the same colour at the same depth.
   */
  readonly floorPx: number;
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

/** How far either side of an edge the ground is read, in pixels: just inside each of the two cells. */
const ACROSS_PX = 0.5;
/** How far in from each end of an edge the ground is read, as a share of it, to stay off the corners. */
const ALONG_SHARE = 0.004;
/** How little of a face may show before it is not drawn, in pixels. */
const SHOWING_PX = 0.5;

/**
 * The sides of the water that show.
 *
 * A side between two cells of water at one height is inside the water and is not drawn. Where
 * the water or the ground beside stands lower, only the part above it shows; where there is
 * neither, the whole of it from the bottom of the water up. The bottom is read at both ends of
 * the side, on either side of it, from `groundAt`, which gives how high the ground of a cell
 * stands at a point of it: along a slope running down into the water the face slants with the
 * ground rather than standing out of it in steps.
 *
 * Each side is a face of its own, one cell long: one face run along a whole bank is a long sheet
 * the browser can sort wrongly against what stands beside it.
 */
export function waterSidesOf(
  grid: CellGrid,
  cells: ReadonlyMap<number, WaterCell>,
  groundAt: (index: number, x: number, y: number) => number = () => 0
): WaterSide[] {
  const hex = isHexGrid(grid.type);
  const flatTop = isFlatTopGrid(grid.type);
  const sides: WaterSide[] = [];
  const ordered = [...cells.values()].sort((a, b) => a.index - b.index);
  for (const cell of ordered) {
    if (cell.surfacePx <= cell.floorPx) continue;
    const { col, row } = cellColRow(grid, cell.index);
    const centre = cellCenterOf(grid, cell.index);
    const corners = cellPolygonOf(grid, cell.index);
    const steps = hex ? hexSideStepsAt(flatTop, col, row) : SQUARE_SIDE_STEPS;
    for (let side = 0; side < corners.length; side++) {
      const [dx, dy] = steps[side];
      const across = cellIndexOf(grid, col + dx, row + dy);
      const neighbour = cells.get(across);
      const from = corners[side];
      const to = corners[(side + 1) % corners.length];
      const inward = inwardOf(from, to, centre);
      const bottomAt = (end: { x: number; y: number }, other: { x: number; y: number }) => {
        const near = { x: end.x + (other.x - end.x) * ALONG_SHARE, y: end.y + (other.y - end.y) * ALONG_SHARE };
        const inside = groundAt(cell.index, near.x + inward.x * ACROSS_PX, near.y + inward.y * ACROSS_PX);
        const outside = across < 0 ? 0 : groundAt(across, near.x - inward.x * ACROSS_PX, near.y - inward.y * ACROSS_PX);
        const floor = Math.max(cell.areaFloorPx, inside);
        return Math.min(Math.max(floor, outside, neighbour?.surfacePx ?? 0), cell.surfacePx);
      };
      const bottomStartPx = bottomAt(from, to);
      const bottomEndPx = bottomAt(to, from);
      if (Math.min(bottomStartPx, bottomEndPx) >= cell.surfacePx - SHOWING_PX) continue;
      sides.push({
        key: `${cell.index}:${side}`,
        index: cell.index,
        x0: from.x,
        y0: from.y,
        x1: to.x,
        y1: to.y,
        bottomStartPx,
        bottomEndPx,
        bottomPx: Math.min(bottomStartPx, bottomEndPx),
        topPx: cell.surfacePx,
        floorPx: Math.min(cell.areaFloorPx, cell.floorPx),
        color: cell.color,
        density: cell.density,
      });
    }
  }
  return sides;
}

/** The way square across an edge into its own cell, which reads the ground either side without sliding along it. */
function inwardOf(
  from: { x: number; y: number },
  to: { x: number; y: number },
  centre: { x: number; y: number }
): { x: number; y: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length <= 0) return { x: 0, y: 0 };
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  const towardsCentre = (centre.x - from.x) * normal.x + (centre.y - from.y) * normal.y;
  return towardsCentre >= 0 ? normal : { x: -normal.x, y: -normal.y };
}
