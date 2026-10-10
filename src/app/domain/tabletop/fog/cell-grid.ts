import { hexStepsAt, SQUARE_STEPS_WITH_CORNERS } from '@axe/domain/tabletop/cell-steps';
import { GridType } from '@axe/domain/tabletop/grid-type';
import {
  hexCellCenter,
  hexLayoutOf,
  hexVertices,
  isFlatTopGrid,
  isHexGrid,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';
import { cellCentre, MapGrid } from '@axe/domain/tabletop/map-grid';

export interface CellGrid extends MapGrid {
  cols: number;
  rows: number;
}

export interface CellPoint {
  x: number;
  y: number;
}

/**
 * A cell grid for a table of this many columns and rows, with the counts floored and held at zero
 * or more.
 */
export function cellGridOf(cols: number, rows: number, gridSize: number, gridType: GridType): CellGrid {
  return { cols: Math.max(0, Math.floor(cols)), rows: Math.max(0, Math.floor(rows)), sizePx: gridSize, type: gridType };
}

/** How many cells the grid has, which is the size a CellBits for it needs. */
export function cellCount(grid: CellGrid): number {
  return grid.cols * grid.rows;
}

/**
 * Whether two grids number their cells the same way: the same columns, rows and cell shape.
 *
 * The cell size is not compared, since a cell's index does not depend on it.
 */
export function sameCellGrid(a: CellGrid, b: CellGrid): boolean {
  return a.cols === b.cols && a.rows === b.rows && a.type === b.type;
}

/** The index of a cell by column and row, or -1 when the cell lies off the grid. */
export function cellIndexOf(grid: CellGrid, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

/** The column and row of a cell index. The index is not checked against the grid. */
export function cellColRow(grid: CellGrid, index: number): { col: number; row: number } {
  return { col: index % grid.cols, row: Math.floor(index / grid.cols) };
}

/** The centre of a cell in table pixels, on square and hex grids alike. */
export function cellCenterOf(grid: CellGrid, index: number): CellPoint {
  const { col, row } = cellColRow(grid, index);
  return cellCentre({ x: col, y: row }, grid);
}

/**
 * The index of the cell under a point in table pixels, or -1 when the point is off the grid or the
 * grid has no size.
 */
export function cellIndexAt(grid: CellGrid, x: number, y: number): number {
  if (grid.sizePx <= 0) return -1;
  if (!isHexGrid(grid.type)) {
    return cellIndexOf(grid, Math.floor(x / grid.sizePx), Math.floor(y / grid.sizePx));
  }
  const { col, row } = pixelToHexCell(x, y, grid.sizePx, isFlatTopGrid(grid.type));
  return cellIndexOf(grid, col, row);
}

/** The outline of a cell in table pixels: four corners on squares, six on hexes. */
export function cellPolygonOf(grid: CellGrid, index: number): CellPoint[] {
  const centre = cellCenterOf(grid, index);
  if (!isHexGrid(grid.type)) {
    const half = grid.sizePx / 2;
    return [
      { x: centre.x - half, y: centre.y - half },
      { x: centre.x + half, y: centre.y - half },
      { x: centre.x + half, y: centre.y + half },
      { x: centre.x - half, y: centre.y + half },
    ];
  }
  const { circumradius, startAngle } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  return hexVertices(centre.x, centre.y, circumradius, startAngle);
}

/**
 * The box in table pixels that the grid's cells cover.
 *
 * On squares that is the table itself. On hexes it is padded by a circumradius on every side, since
 * the cells along the edge overhang it.
 */
export function gridExtentPx(grid: CellGrid): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!isHexGrid(grid.type)) {
    return { minX: 0, minY: 0, maxX: grid.cols * grid.sizePx, maxY: grid.rows * grid.sizePx };
  }
  const { colSpacing, rowSpacing, circumradius } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  return {
    minX: -circumradius,
    minY: -circumradius,
    maxX: colSpacing * grid.cols + circumradius,
    maxY: rowSpacing * grid.rows + circumradius,
  };
}

/**
 * A function giving the centre of the cell at a column and row, with the grid's measurements looked
 * up once rather than for every cell.
 */
function cellCentreFinder(grid: CellGrid): (col: number, row: number) => CellPoint {
  if (!isHexGrid(grid.type)) {
    const size = grid.sizePx;
    return (col, row) => ({ x: (col + 0.5) * size, y: (row + 0.5) * size });
  }
  const { colSpacing, rowSpacing, isFlatTop } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  return (col, row) => hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
}

/** Visits every cell with its index and centre, row by row. Does nothing on a grid with no size. */
export function forEachCell(grid: CellGrid, visit: (index: number, cx: number, cy: number) => void): void {
  if (grid.sizePx <= 0) return;
  const centreOf = cellCentreFinder(grid);
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const centre = centreOf(col, row);
      visit(row * grid.cols + col, centre.x, centre.y);
    }
  }
}

/**
 * Visits the cells whose centres lie inside a box in table pixels, with their index and centre.
 *
 * The box is clipped to the grid first, so a box reaching far past the table costs no more than the
 * table does.
 */
export function forEachCellInBox(
  grid: CellGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  visit: (index: number, cx: number, cy: number) => void
): void {
  if (grid.sizePx <= 0 || grid.cols <= 0 || grid.rows <= 0) return;
  const extent = gridExtentPx(grid);
  const lowX = Math.max(minX, extent.minX);
  const lowY = Math.max(minY, extent.minY);
  const highX = Math.min(maxX, extent.maxX);
  const highY = Math.min(maxY, extent.maxY);
  if (lowX > highX || lowY > highY) return;
  const bounds = boxToCellBounds(grid, lowX, lowY, highX, highY);
  const centreOf = cellCentreFinder(grid);
  for (let row = bounds.fromRow; row <= bounds.toRow; row++) {
    for (let col = bounds.fromCol; col <= bounds.toCol; col++) {
      const index = row * grid.cols + col;
      const centre = centreOf(col, row);
      if (centre.x < minX || centre.x > maxX || centre.y < minY || centre.y > maxY) continue;
      visit(index, centre.x, centre.y);
    }
  }
}

function boxToCellBounds(
  grid: CellGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { fromCol: number; toCol: number; fromRow: number; toRow: number } {
  const topLeft = looseCellAt(grid, minX, minY);
  const bottomRight = looseCellAt(grid, maxX, maxY);
  return {
    fromCol: Math.max(0, Math.min(topLeft.col, bottomRight.col) - 1),
    toCol: Math.min(grid.cols - 1, Math.max(topLeft.col, bottomRight.col) + 1),
    fromRow: Math.max(0, Math.min(topLeft.row, bottomRight.row) - 1),
    toRow: Math.min(grid.rows - 1, Math.max(topLeft.row, bottomRight.row) + 1),
  };
}

function looseCellAt(grid: CellGrid, x: number, y: number): { col: number; row: number } {
  if (!isHexGrid(grid.type)) {
    return { col: Math.floor(x / grid.sizePx), row: Math.floor(y / grid.sizePx) };
  }
  return pixelToHexCell(x, y, grid.sizePx, isFlatTopGrid(grid.type));
}

/**
 * The cells around one, whatever shape the cells are: the eight around a square, corners
 * included, and the six around a hex.
 *
 * Each is visited once, in no particular order. Nothing is visited on a grid without a size.
 */
export function forEachNeighbourCell(grid: CellGrid, index: number, visit: (neighbour: number) => void): void {
  if (!(grid.sizePx > 0)) return;
  const { col, row } = cellColRow(grid, index);
  const steps = isHexGrid(grid.type) ? hexStepsAt(isFlatTopGrid(grid.type), col, row) : SQUARE_STEPS_WITH_CORNERS;
  for (const [dx, dy] of steps) {
    const neighbour = cellIndexOf(grid, col + dx, row + dy);
    if (neighbour >= 0) visit(neighbour);
  }
}
