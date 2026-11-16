import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { hexLayoutOf, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

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
