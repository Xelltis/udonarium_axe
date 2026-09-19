import { GridType } from '@axe/domain/tabletop/grid-type';
import { hexCircumradius, hexSpacing, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

export interface HexMaskGeometry {
  pixelW: number;
  pixelH: number;
  offsetX: number;
  offsetY: number;
}

/**
 * How large a mask covering a hex board is in pixels, and where the first cell's centre sits inside
 * it.
 *
 * Null on a square grid or a board with no cells.
 */
export function computeHexMaskGeometry(
  cols: number,
  rows: number,
  gridSize: number,
  gridType: GridType
): HexMaskGeometry | null {
  if (!isHexGrid(gridType) || cols <= 0 || rows <= 0) return null;
  const isFlatTop = isFlatTopGrid(gridType);
  const s = hexCircumradius(gridSize);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);

  if (isFlatTop) {
    const offsetX = s;
    const offsetY = gridSize / 2;
    const pixelW = 2 * s + (cols - 1) * colSpacing;
    const hasOddCol = cols >= 2;
    const pixelH = hasOddCol ? rows * gridSize + gridSize / 2 : rows * gridSize;
    return { pixelW, pixelH, offsetX, offsetY };
  } else {
    const offsetX = gridSize / 2;
    const offsetY = s;
    const hasOddRow = rows >= 2;
    const pixelW = hasOddRow ? cols * gridSize + gridSize / 2 : cols * gridSize;
    const pixelH = 2 * s + (rows - 1) * rowSpacing;
    return { pixelW, pixelH, offsetX, offsetY };
  }
}
