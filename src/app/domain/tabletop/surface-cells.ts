import { PERF_HEX_SURFACE_CELLS, perfCounters } from '@axe/core/util/perf-counters';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  hexVertices,
  isFlatTopGrid,
  isHexGrid,
} from '@axe/domain/tabletop/hex-geometry';

export interface SurfacePoint {
  x: number;
  y: number;
}

export const HEX_SURFACE_INFLATE_PX = 1;

/**
 * The corner outlines of every hex on a board, each grown by `inflatePx` so that neighbouring cells
 * overlap.
 *
 * Empty on a square grid or a board with no cells.
 */
export function hexSurfaceCells(
  cols: number,
  rows: number,
  gridSize: number,
  gridType: GridType,
  inflatePx = 0
): SurfacePoint[][] {
  if (!isHexGrid(gridType) || cols <= 0 || rows <= 0 || gridSize <= 0) return [];
  perfCounters.bump(PERF_HEX_SURFACE_CELLS);

  const isFlatTop = isFlatTopGrid(gridType);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const circumradius = hexCircumradius(gridSize) + inflatePx;
  const startAngle = hexStartAngle(isFlatTop);
  const cells: SurfacePoint[][] = [];

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const center = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      cells.push(hexVertices(center.x, center.y, circumradius, startAngle));
    }
  }

  return cells;
}
