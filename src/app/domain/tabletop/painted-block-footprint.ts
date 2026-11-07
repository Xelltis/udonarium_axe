import { CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { cellColRow, CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import type { BlockPlacement } from '@axe/domain/tabletop/function-paint';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { cellCentre } from '@axe/domain/tabletop/map-grid';

/**
 * The cells a block stands over, and whether it stands over them squarely.
 *
 * Everything on the table is read in. One that sits square on the grid needs nothing said
 * about it beyond its cells; one that was turned, or that stands between them, or that is
 * two and a half cells wide, keeps its exact placement alongside so that laying it back
 * down returns it as it was.
 */
export function paintedBlockFootprintOf(
  object: { location: { x: number; y: number }; rotate?: number },
  width: number,
  depth: number,
  grid: CellGrid
): { rect: CellRect; placement: BlockPlacement | null } | null {
  const gridSize = grid.sizePx;
  if (gridSize <= 0) return null;
  const rotate = object.rotate ?? 0;
  if (isHexGrid(grid.type)) return hexFootprintOf(object, width, depth, grid, rotate);
  const exactCol = object.location.x / gridSize;
  const exactRow = object.location.y / gridSize;
  if (!Number.isFinite(exactCol) || !Number.isFinite(exactRow)) return null;

  const col = Math.max(0, Math.floor(exactCol));
  const row = Math.max(0, Math.floor(exactRow));
  const cellWidth = Math.max(1, Math.ceil(width));
  const cellDepth = Math.max(1, Math.ceil(depth));

  const square =
    rotate % 360 === 0 &&
    Number.isInteger(exactCol) &&
    Number.isInteger(exactRow) &&
    exactCol >= 0 &&
    exactRow >= 0 &&
    Number.isInteger(width) &&
    Number.isInteger(depth);

  return {
    rect: { col, row, width: cellWidth, height: cellDepth },
    placement: square ? null : { x: object.location.x, y: object.location.y, width, depth, rotate },
  };
}

/**
 * The cell a block stands on, on a board of hexes.
 *
 * A hex board has no corner to divide by: a block sits in the middle of its cell, and every
 * other column is dropped half a row. One that is not a single cell standing squarely in the
 * middle of one keeps its exact placement, as a turned or half-placed block does on squares.
 */
function hexFootprintOf(
  object: { location: { x: number; y: number } },
  width: number,
  depth: number,
  grid: CellGrid,
  rotate: number
): { rect: CellRect; placement: BlockPlacement | null } | null {
  const half = grid.sizePx / 2;
  const centreX = object.location.x + half;
  const centreY = object.location.y + half;
  const index = cellIndexAt(grid, centreX, centreY);
  if (index < 0) return null;
  const { col, row } = cellColRow(grid, index);
  const middle = cellCentre({ x: col, y: row }, grid);
  const square =
    rotate % 360 === 0 &&
    width === 1 &&
    depth === 1 &&
    Math.abs(middle.x - centreX) < 0.5 &&
    Math.abs(middle.y - centreY) < 0.5;
  return {
    rect: { col, row, width: 1, height: 1 },
    placement: square ? null : { x: object.location.x, y: object.location.y, width, depth, rotate },
  };
}
