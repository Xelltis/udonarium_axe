import { depthOf, EyeFrame } from '@axe/domain/tabletop/first-person/first-person-clip';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellIndexAt, CellPoint, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';

/** How close in front of the eye the view is cut, in cells; nothing nearer is drawn. */
export const NEAR_CELLS = 0.05;

/** What the view can show: the board's cells, those in sight, how large a cell is and how far the view reaches. */
export interface FirstPersonSight {
  readonly grid: CellGrid | null;
  /** The cells in sight, or null where everything is. */
  readonly seen: CellBits | null;
  readonly gridSize: number;
  readonly reachPx: number;
}

/**
 * Whether a piece stands where the view can show it: the cell under its middle is in sight, or any
 * cell whose middle its footing covers, so a great piece half behind a pillar still shows; and the
 * face it stands up on lies ahead of the eye, its near side no further off than the view reaches.
 */
export function pieceInSight(
  sight: FirstPersonSight,
  eye: EyeFrame,
  at: CellPoint,
  groundPx: number,
  centre: CellPoint
): boolean {
  const { grid, seen } = sight;
  if (!grid) return false;
  const depth = depthOf(eye, centre);
  if (depth <= sight.gridSize * NEAR_CELLS * 4 || depth - groundPx / 2 > sight.reachPx) return false;
  if (!seen) return true;
  const middle = cellIndexAt(grid, centre.x, centre.y);
  if (middle >= 0 && seen.get(middle)) return true;
  const edge = Math.min(1, groundPx / 4);
  let shown = false;
  forEachCellInBox(grid, at.x + edge, at.y + edge, at.x + groundPx - edge, at.y + groundPx - edge, (cell) => {
    if (!shown && seen.get(cell)) shown = true;
  });
  return shown;
}
