import { cellCount, CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { MOVE_COST_HALF_EXTRA, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';

/**
 * What each cell of a table charges over the one step plain footing is worth.
 *
 * Ground painted twice charges the dearer of the two rather than both: a ford drawn over
 * undergrowth is a ford, and a table whose cost crept up every time somebody tidied the map
 * would be a table nobody could reckon a move on.
 *
 * A road is the exception, and is laid over whatever it runs through rather than beside it: a
 * made road across a swamp is a road, or there would be no point in making one. So the dear
 * ground is settled first and the roads are drawn over the answer.
 *
 * Nothing at all comes back as nothing, so a table with no such ground on it is priced the
 * way it always was, without a lookup standing between every step and the next.
 */
export function moveCostCells(grid: CellGrid, areas: readonly TableMoveCost[]): Float64Array | null {
  if (areas.length < 1) return null;
  const total = cellCount(grid);
  if (total < 1) return null;

  let charged = false;
  const costs = new Float64Array(total);
  for (const area of areas) {
    if (area.halves) continue;
    const rect = area.rect;
    const charge = area.charge;
    for (let row = 0; row < rect.height; row++) {
      for (let col = 0; col < rect.width; col++) {
        const index = cellIndexOf(grid, rect.col + col, rect.row + row);
        if (index < 0 || index >= total) continue;
        if (costs[index] >= charge) continue;
        costs[index] = charge;
        charged = true;
      }
    }
  }
  for (const area of areas) {
    if (!area.halves) continue;
    const rect = area.rect;
    for (let row = 0; row < rect.height; row++) {
      for (let col = 0; col < rect.width; col++) {
        const index = cellIndexOf(grid, rect.col + col, rect.row + row);
        if (index < 0 || index >= total) continue;
        costs[index] = MOVE_COST_HALF_EXTRA;
        charged = true;
      }
    }
  }
  return charged ? costs : null;
}
