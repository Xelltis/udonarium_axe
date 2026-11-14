import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCircumradius, hexSpacing, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/**
 * Snaps a screen position to the nearest spot a block of cells can start from, so a block drawn
 * there lines up with the grid; hex grids snap to an even column or row so the stagger matches.
 */
export function snapAnchor(
  gridType: GridType,
  tx: number,
  ty: number,
  displayCell: number
): { tx: number; ty: number } {
  if (!(displayCell > 0)) return { tx, ty };
  if (!isHexGrid(gridType)) {
    return {
      tx: Math.round(tx / displayCell) * displayCell,
      ty: Math.round(ty / displayCell) * displayCell,
    };
  }
  const flat = isFlatTopGrid(gridType);
  const s3 = hexCircumradius(displayCell);
  const { colSpacing, rowSpacing } = hexSpacing(displayCell, flat);
  if (flat) {
    const i = 2 * Math.round((tx + s3) / colSpacing / 2);
    const j = Math.round((ty + displayCell / 2) / rowSpacing);
    return { tx: i * colSpacing - s3, ty: j * rowSpacing - displayCell / 2 };
  }
  const j = 2 * Math.round((ty + s3) / rowSpacing / 2);
  const i = Math.round((tx + displayCell / 2) / colSpacing);
  return { tx: i * colSpacing - displayCell / 2, ty: j * rowSpacing - s3 };
}

/**
 * The on-screen size of a block of cells, allowing for the half-cell stagger and pointed ends of
 * hex grids; zero for fewer than one cell.
 */
export function footprintSize(
  gridType: GridType,
  cols: number,
  rows: number,
  displayCell: number
): { w: number; h: number } {
  if (!(cols >= 1) || !(rows >= 1) || !(displayCell > 0)) return { w: 0, h: 0 };
  if (!isHexGrid(gridType)) return { w: cols * displayCell, h: rows * displayCell };
  const flat = isFlatTopGrid(gridType);
  const s3 = hexCircumradius(displayCell);
  const { colSpacing, rowSpacing } = hexSpacing(displayCell, flat);
  if (flat) {
    return {
      w: 2 * s3 + (cols - 1) * colSpacing,
      h: rows * displayCell + (cols >= 2 ? displayCell / 2 : 0),
    };
  }
  return {
    w: cols * displayCell + (rows >= 2 ? displayCell / 2 : 0),
    h: 2 * s3 + (rows - 1) * rowSpacing,
  };
}

/** How many columns best fill a width on the given grid, at least one. */
export function colsForWidth(gridType: GridType, width: number, displayCell: number): number {
  if (!(width > 0) || !(displayCell > 0)) return 1;
  if (!isHexGrid(gridType)) return Math.max(1, Math.round(width / displayCell));
  const flat = isFlatTopGrid(gridType);
  const s3 = hexCircumradius(displayCell);
  const { colSpacing } = hexSpacing(displayCell, flat);
  if (flat) return Math.max(1, Math.round((width - 2 * s3) / colSpacing) + 1);
  return Math.max(1, Math.round((width - displayCell / 2) / displayCell));
}

/** How many rows best fill a height on the given grid, at least one. */
export function rowsForHeight(gridType: GridType, height: number, displayCell: number): number {
  if (!(height > 0) || !(displayCell > 0)) return 1;
  if (!isHexGrid(gridType)) return Math.max(1, Math.round(height / displayCell));
  const flat = isFlatTopGrid(gridType);
  const s3 = hexCircumradius(displayCell);
  const { rowSpacing } = hexSpacing(displayCell, flat);
  if (flat) return Math.max(1, Math.round((height - displayCell / 2) / displayCell));
  return Math.max(1, Math.round((height - 2 * s3) / rowSpacing) + 1);
}

/**
 * Whether the image on screen covers the whole frame, give or take `tolerancePx`, which is what
 * lets the crop be applied.
 */
export function coversFrame(
  tx: number,
  ty: number,
  imageScreenW: number,
  imageScreenH: number,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  tolerancePx = 0.75
): boolean {
  return (
    tx <= frameX + tolerancePx &&
    ty <= frameY + tolerancePx &&
    tx + imageScreenW >= frameX + frameW - tolerancePx &&
    ty + imageScreenH >= frameY + frameH - tolerancePx
  );
}
