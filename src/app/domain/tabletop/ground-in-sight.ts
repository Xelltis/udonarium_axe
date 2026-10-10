import { CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';

/**
 * Whether a stretch of ground has been come upon: any one cell of it within sight.
 *
 * One cell is enough, and the whole of it is then drawn. A trap the party has spotted the edge
 * of is a trap they are looking at, and drawing half of one would say less about where it is
 * than it would about where the eyes are.
 *
 * Nothing given for what is seen means nothing is hidden - a table with neither dark nor fog on
 * it - and every stretch of ground is in plain sight.
 */
export function groundInSight(grid: CellGrid, rect: CellRect, seen: CellBits | null): boolean {
  if (!seen) return true;
  for (let row = 0; row < rect.height; row++) {
    for (let col = 0; col < rect.width; col++) {
      const index = cellIndexOf(grid, rect.col + col, rect.row + row);
      if (index >= 0 && seen.get(index)) return true;
    }
  }
  return false;
}
