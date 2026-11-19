import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { hexLayoutOf, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { cellCentre, type MapGrid } from '@axe/domain/tabletop/map-grid';

/** How near two cells' middles may lie to a point and still both be what it lies under, in cells. */
const TIE = 1e-9;

/** A point of the layout, in cells across and down from the top left cell's index. */
export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Where a point of the board, in cells from its top left, falls among the cells of the layout, which
 * read their heights at their indices: a square's index is half a cell short of its middle, and a hex
 * column or row is taken at its average stagger, so the ground runs on unbroken from one to the next.
 */
export function layoutPointOf(gridType: GridType, x: number, y: number): LayoutPoint {
  if (!isHexGrid(gridType)) return { x: x - 0.5, y: y - 0.5 };
  const { colSpacing, rowSpacing, isFlatTop } = hexLayoutOf(1, isFlatTopGrid(gridType));
  return isFlatTop ? { x: x / colSpacing, y: y / rowSpacing - 0.25 } : { x: x / colSpacing - 0.25, y: y / rowSpacing };
}

/** The point of the board, in cells from its top left, that a point of the layout falls on; the inverse of {@link layoutPointOf}. */
export function boardPointOfLayout(gridType: GridType, point: LayoutPoint): { x: number; y: number } {
  if (!isHexGrid(gridType)) return { x: point.x + 0.5, y: point.y + 0.5 };
  const { colSpacing, rowSpacing, isFlatTop } = hexLayoutOf(1, isFlatTopGrid(gridType));
  return isFlatTop
    ? { x: point.x * colSpacing, y: (point.y + 0.25) * rowSpacing }
    : { x: (point.x + 0.25) * colSpacing, y: point.y * rowSpacing };
}

/** The layout point a ground sample reads its height at, by the sample's column and row. */
export function layoutPointOfSample(gridType: GridType, column: number, row: number): LayoutPoint {
  return layoutPointOf(gridType, column / GROUND_SAMPLES_PER_CELL, row / GROUND_SAMPLES_PER_CELL);
}

/** The ground sample nearest to a layout point, as its column and row. */
export function sampleOfLayoutPoint(gridType: GridType, point: LayoutPoint): { column: number; row: number } {
  const at = boardPointOfLayout(gridType, point);
  return { column: Math.round(at.x * GROUND_SAMPLES_PER_CELL), row: Math.round(at.y * GROUND_SAMPLES_PER_CELL) };
}

/** The cell of the layout a layout point lies in, nearest by index. */
export function cellOfLayoutPoint(point: LayoutPoint): { x: number; y: number } {
  return { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
}

/**
 * How high the ground stands at a point of the board, in cells from its top left, with every cell
 * given a level of its own: the level of the cell whose middle lies nearest the point, and where the
 * point lies as near the middles of several, the highest of theirs. So on squares a sample on the line
 * between two cells stands as high as the higher of them, and ground sunk in some cells slopes down
 * inside those cells alone.
 */
export function levelUnder(
  gridType: GridType,
  x: number,
  y: number,
  levelAt: (x: number, y: number) => number
): number {
  const grid: MapGrid = { type: gridType, sizePx: 1 };
  const near = cellOfLayoutPoint(layoutPointOf(gridType, x, y));
  const distances = new Float64Array(9);
  let nearest = Number.POSITIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const centre = cellCentre({ x: near.x + dx, y: near.y + dy }, grid);
      const distance = Math.hypot(centre.x - x, centre.y - y);
      distances[(dy + 1) * 3 + dx + 1] = distance;
      nearest = Math.min(nearest, distance);
    }
  }
  let level = Number.NEGATIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (distances[(dy + 1) * 3 + dx + 1] > nearest + TIE) continue;
      level = Math.max(level, levelAt(near.x + dx, near.y + dy));
    }
  }
  return level;
}
