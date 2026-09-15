import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  isFlatTopGrid,
  isHexGrid,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';

function flatTopNeighbors(col: number, row: number): [number, number][] {
  const odd = Math.abs(col % 2) === 1;
  const dy = odd ? 0 : -1;
  return [
    [col, row - 1],
    [col, row + 1],
    [col - 1, row + dy],
    [col - 1, row + dy + 1],
    [col + 1, row + dy],
    [col + 1, row + dy + 1],
  ];
}

function pointyTopNeighbors(col: number, row: number): [number, number][] {
  const odd = Math.abs(row % 2) === 1;
  const dx = odd ? 0 : -1;
  return [
    [col - 1, row],
    [col + 1, row],
    [col + dx, row - 1],
    [col + dx + 1, row - 1],
    [col + dx, row + 1],
    [col + dx + 1, row + 1],
  ];
}

/**
 * The cells sharing an edge with a cell: four on a square grid, six on a hex grid.
 *
 * Cells outside the scene are included; the caller keeps to the bounds.
 */
export function cellNeighbors(gridType: GridType, col: number, row: number): [number, number][] {
  if (gridType === GridType.HEX_VERTICAL) return flatTopNeighbors(col, row);
  if (gridType === GridType.HEX_HORIZONTAL) return pointyTopNeighbors(col, row);
  return [
    [col - 1, row],
    [col + 1, row],
    [col, row - 1],
    [col, row + 1],
  ];
}

/**
 * How far the hex grid is shifted from the scene's top-left corner so the outer hexes lie wholly
 * inside it; zero on a square grid.
 */
export function cellOriginOffset(gridType: GridType, cellPx: number): { x: number; y: number } {
  if (!isHexGrid(gridType)) return { x: 0, y: 0 };
  const s = hexCircumradius(cellPx);
  return isFlatTopGrid(gridType) ? { x: s, y: cellPx / 2 } : { x: cellPx / 2, y: s };
}

/**
 * The cell under a point in scene pixels, on either kind of grid; the cell may lie outside the
 * scene.
 */
export function pointToCell(gridType: GridType, x: number, y: number, cellPx: number): { col: number; row: number } {
  if (isHexGrid(gridType)) {
    const offset = cellOriginOffset(gridType, cellPx);
    return pixelToHexCell(x - offset.x, y - offset.y, cellPx, isFlatTopGrid(gridType));
  }
  return { col: Math.floor(x / cellPx), row: Math.floor(y / cellPx) };
}

/**
 * The centre of a cell in scene pixels, on either kind of grid, which is what snapping and cell
 * painting place things on.
 */
export function cellCenter(gridType: GridType, col: number, row: number, cellPx: number): { x: number; y: number } {
  if (isHexGrid(gridType)) {
    const flatTop = isFlatTopGrid(gridType);
    const { colSpacing, rowSpacing } = hexSpacing(cellPx, flatTop);
    const offset = cellOriginOffset(gridType, cellPx);
    const center = hexCellCenter(col, row, colSpacing, rowSpacing, flatTop);
    return { x: center.x + offset.x, y: center.y + offset.y };
  }
  return { x: (col + 0.5) * cellPx, y: (row + 0.5) * cellPx };
}
