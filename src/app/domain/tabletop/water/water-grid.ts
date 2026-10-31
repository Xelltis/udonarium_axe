import { type CellGrid, sameCellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { hexLayoutOf, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { WaterArea } from '@axe/domain/tabletop/water/water-cells';

/**
 * How many cells past each edge of the table the grid the water is laid on reaches at most.
 * Water laid further out than that is drawn as far as it reaches, and water lying wholly beyond
 * it is not drawn and draws the grid out no further.
 */
export const WATER_REACH_CELLS = 120;

/**
 * The grid the water is laid on: the table's own, reaching past its edges as far as any water laid
 * off the board does, so that a pond laid there is drawn as one on the board is.
 *
 * Every cell of the table keeps its place, and water that lies on the table alone is laid on the
 * table's grid itself. For water reaching off it, on hexes the grid reaches a cell further, as the
 * middle of a hex along the edge can lie outside the area.
 */
export function waterGridOver(table: CellGrid, areas: readonly WaterArea[]): CellGrid {
  if (!(table.sizePx > 0) || areas.length < 1) return table;
  const hex = isHexGrid(table.type);
  const pitch = hex ? hexLayoutOf(table.sizePx, isFlatTopGrid(table.type)) : null;
  const colPx = pitch?.colSpacing ?? table.sizePx;
  const rowPx = pitch?.rowSpacing ?? table.sizePx;
  const margin = hex ? 1 : 0;

  let fromCol = 0;
  let fromRow = 0;
  let toCol = table.cols;
  let toRow = table.rows;
  for (const area of areas) {
    const right = area.left + area.width;
    const bottom = area.top + area.height;
    if (area.left >= 0 && area.top >= 0 && right <= table.cols * colPx && bottom <= table.rows * rowPx) continue;
    const reach = {
      fromCol: Math.max(Math.floor(area.left / colPx) - margin, -WATER_REACH_CELLS),
      fromRow: Math.max(Math.floor(area.top / rowPx) - margin, -WATER_REACH_CELLS),
      toCol: Math.min(Math.ceil(right / colPx) + margin, table.cols + WATER_REACH_CELLS),
      toRow: Math.min(Math.ceil(bottom / rowPx) + margin, table.rows + WATER_REACH_CELLS),
    };
    if (reach.fromCol >= reach.toCol || reach.fromRow >= reach.toRow) continue;
    fromCol = Math.min(fromCol, reach.fromCol);
    fromRow = Math.min(fromRow, reach.fromRow);
    toCol = Math.max(toCol, reach.toCol);
    toRow = Math.max(toRow, reach.toRow);
  }
  fromCol = evenFloor(fromCol);
  fromRow = evenFloor(fromRow);
  if (fromCol === 0 && fromRow === 0 && toCol === table.cols && toRow === table.rows) return table;

  return {
    cols: toCol - fromCol,
    rows: toRow - fromRow,
    sizePx: table.sizePx,
    type: table.type,
    originCol: fromCol,
    originRow: fromRow,
  };
}

/** Whether two grids the water is laid on lay it the same, cell for cell and pixel for pixel. */
export function sameWaterGrid(a: CellGrid | null, b: CellGrid | null): boolean {
  if (a === b) return true;
  return !!a && !!b && a.sizePx === b.sizePx && sameCellGrid(a, b);
}

function evenFloor(value: number): number {
  return Math.floor(value / 2) * 2;
}
