/**
 * The geometry shared by the hex grids.
 *
 * Terms:
 *   the circumradius is the distance from the centre of a hex to a corner
 *   the cell size is the distance between opposite sides
 *   flat-topped hexes line their columns up vertically
 *   pointy-topped hexes line their rows up horizontally
 */

import { GridType } from '@axe/domain/tabletop/game-table';

/**
 * The distance from a hex's centre to a corner, for a grid whose cell size is measured across the
 * flats.
 */
export function hexCircumradius(gridSize: number): number {
  return gridSize / Math.sqrt(3);
}

/** Whether the grid is the flat-topped hex grid, whose columns line up vertically. */
export function isFlatTopGrid(gridType: GridType): boolean {
  return gridType === GridType.HEX_VERTICAL;
}

/** Whether the grid is one of the two hex grids rather than squares. */
export function isHexGrid(gridType: GridType): boolean {
  return gridType === GridType.HEX_VERTICAL || gridType === GridType.HEX_HORIZONTAL;
}

export interface HexSpacing {
  colSpacing: number;
  rowSpacing: number;
}

/** How far apart neighbouring hex centres sit along the columns and along the rows. */
export function hexSpacing(gridSize: number, isFlatTop: boolean): HexSpacing {
  const s = hexCircumradius(gridSize);
  return isFlatTop ? { colSpacing: 1.5 * s, rowSpacing: gridSize } : { colSpacing: gridSize, rowSpacing: 1.5 * s };
}

/**
 * The angle of a hex's first corner, in radians: 0 for flat-topped hexes, a quarter turn back for
 * pointy-topped ones.
 */
export function hexStartAngle(isFlatTop: boolean): number {
  return isFlatTop ? 0 : -Math.PI / 2;
}

/**
 * The centre of a hex cell in table pixels, with odd columns (flat-topped) or odd rows
 * (pointy-topped) shifted by half a step.
 */
export function hexCellCenter(
  col: number,
  row: number,
  colSpacing: number,
  rowSpacing: number,
  isFlatTop: boolean
): { x: number; y: number } {
  if (isFlatTop) {
    return {
      x: col * colSpacing,
      y: row * rowSpacing + (Math.abs(col % 2) === 1 ? rowSpacing / 2 : 0),
    };
  }
  return {
    x: col * colSpacing + (Math.abs(row % 2) === 1 ? colSpacing / 2 : 0),
    y: row * rowSpacing,
  };
}

/** The corners come back clockwise. */
export function hexVertices(cx: number, cy: number, s: number, startAngle: number): { x: number; y: number }[] {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    verts.push({ x: cx + s * Math.cos(angle), y: cy + s * Math.sin(angle) });
  }
  return verts;
}

/**
 * The column and row of the hex whose centre is nearest a point in table pixels.
 *
 * The answer is not held to the table, so it can be negative or past the last cell.
 */
export function pixelToHexCell(
  px: number,
  py: number,
  gridSize: number,
  isFlatTop: boolean
): { col: number; row: number } {
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const colEst = px / colSpacing;
  const rowEst = py / rowSpacing;
  let bestCol = 0;
  let bestRow = 0;
  let bestDist = Infinity;
  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const dx = px - x;
      const dy = py - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
        bestRow = row;
      }
    }
  }
  return { col: bestCol, row: bestRow };
}

/** Outlines one hex on a canvas with the context's current stroke style. */
export function strokeHexPath(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  startAngle: number
): void {
  context.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    const x = cx + s * Math.cos(angle);
    const y = cy + s * Math.sin(angle);
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
}

/** Fills one hex on a canvas with the context's current fill style. */
export function fillHexPath(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  startAngle: number
): void {
  context.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    const x = cx + s * Math.cos(angle);
    const y = cy + s * Math.sin(angle);
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
}
