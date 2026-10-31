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
  /**
   * Where the cells are cut off, in table px, on a grid of squares whose last column or row is only
   * partly on the table: squares of several cells along an edge the table's size does not divide.
   * Nothing on a grid whose cells are all whole.
   */
  readonly clip?: { readonly width: number; readonly height: number };
  /**
   * Where the grid's first column and row stand among the table's cells, for a grid that reaches
   * past the table's top or left edge. Even, so that each column and row keeps the parity the steps
   * between hexes are read by. Nothing on a grid that starts where the table does.
   */
  readonly originCol?: number;
  readonly originRow?: number;
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
 * Whether two grids number their cells the same way: the same columns, rows and cell shape, cut
 * off at the same place.
 *
 * The cell size is not compared, since a cell's index does not depend on it.
 */
export function sameCellGrid(a: CellGrid, b: CellGrid): boolean {
  return (
    a.cols === b.cols &&
    a.rows === b.rows &&
    a.type === b.type &&
    a.clip?.width === b.clip?.width &&
    a.clip?.height === b.clip?.height &&
    (a.originCol ?? 0) === (b.originCol ?? 0) &&
    (a.originRow ?? 0) === (b.originRow ?? 0)
  );
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

/**
 * The column and row of a cell index among the table's cells, which on a grid reaching past the
 * table's top or left edge are not its column and row on the grid. The index is not checked.
 */
export function tableColRowOf(grid: CellGrid, index: number): { col: number; row: number } {
  const { col, row } = cellColRow(grid, index);
  return { col: col + (grid.originCol ?? 0), row: row + (grid.originRow ?? 0) };
}

/**
 * The centre of a cell in table pixels, on square and hex grids alike; the centre of what is on the
 * table of a square cut off by the table's edge.
 */
export function cellCenterOf(grid: CellGrid, index: number): CellPoint {
  const { col, row } = tableColRowOf(grid, index);
  if (grid.clip && !isHexGrid(grid.type)) return clippedCentre(col, row, grid.sizePx, grid.clip);
  return cellCentre({ x: col, y: row }, grid);
}

/** The box a square covers on the table, cut off where the table ends. */
function clippedBox(
  col: number,
  row: number,
  size: number,
  clip: { readonly width: number; readonly height: number }
): { left: number; top: number; right: number; bottom: number } {
  const left = col * size;
  const top = row * size;
  return {
    left,
    top,
    right: Math.max(left, Math.min(left + size, clip.width)),
    bottom: Math.max(top, Math.min(top + size, clip.height)),
  };
}

function clippedCentre(
  col: number,
  row: number,
  size: number,
  clip: { readonly width: number; readonly height: number }
): CellPoint {
  const box = clippedBox(col, row, size, clip);
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

/**
 * The index of the cell under a point in table pixels, or -1 when the point is off the grid or the
 * grid has no size.
 */
export function cellIndexAt(grid: CellGrid, x: number, y: number): number {
  if (grid.sizePx <= 0) return -1;
  const originCol = grid.originCol ?? 0;
  const originRow = grid.originRow ?? 0;
  if (!isHexGrid(grid.type)) {
    if (grid.clip && (x >= grid.clip.width || y >= grid.clip.height)) return -1;
    return cellIndexOf(grid, Math.floor(x / grid.sizePx) - originCol, Math.floor(y / grid.sizePx) - originRow);
  }
  const { col, row } = pixelToHexCell(x, y, grid.sizePx, isFlatTopGrid(grid.type));
  return cellIndexOf(grid, col - originCol, row - originRow);
}

/**
 * The outline of a cell in table pixels: four corners on squares, six on hexes, and a square cut off
 * by the table's edge cut off with it.
 */
export function cellPolygonOf(grid: CellGrid, index: number): CellPoint[] {
  if (grid.clip && !isHexGrid(grid.type)) {
    const { col, row } = tableColRowOf(grid, index);
    const box = clippedBox(col, row, grid.sizePx, grid.clip);
    return [
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.right, y: box.bottom },
      { x: box.left, y: box.bottom },
    ];
  }
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
  const originCol = grid.originCol ?? 0;
  const originRow = grid.originRow ?? 0;
  if (!isHexGrid(grid.type)) {
    const minX = originCol * grid.sizePx;
    const minY = originRow * grid.sizePx;
    const maxX = (originCol + grid.cols) * grid.sizePx;
    const maxY = (originRow + grid.rows) * grid.sizePx;
    if (!grid.clip) return { minX, minY, maxX, maxY };
    return { minX, minY, maxX: Math.min(maxX, grid.clip.width), maxY: Math.min(maxY, grid.clip.height) };
  }
  const { colSpacing, rowSpacing, circumradius } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  const extent = {
    minX: -circumradius,
    minY: -circumradius,
    maxX: colSpacing * grid.cols + circumradius,
    maxY: rowSpacing * grid.rows + circumradius,
  };
  if (originCol === 0 && originRow === 0) return extent;
  const left = colSpacing * originCol;
  const top = rowSpacing * originRow;
  return { minX: extent.minX + left, minY: extent.minY + top, maxX: extent.maxX + left, maxY: extent.maxY + top };
}

/**
 * A function giving the centre of the cell at a column and row, with the grid's measurements looked
 * up once rather than for every cell.
 */
function cellCentreFinder(grid: CellGrid): (col: number, row: number) => CellPoint {
  const originCol = grid.originCol ?? 0;
  const originRow = grid.originRow ?? 0;
  if (!isHexGrid(grid.type)) {
    const size = grid.sizePx;
    const clip = grid.clip;
    if (clip) return (col, row) => clippedCentre(col + originCol, row + originRow, size, clip);
    return (col, row) => ({ x: (col + originCol + 0.5) * size, y: (row + originRow + 0.5) * size });
  }
  const { colSpacing, rowSpacing, isFlatTop } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  return (col, row) => hexCellCenter(col + originCol, row + originRow, colSpacing, rowSpacing, isFlatTop);
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
  const originCol = grid.originCol ?? 0;
  const originRow = grid.originRow ?? 0;
  if (!isHexGrid(grid.type)) {
    return { col: Math.floor(x / grid.sizePx) - originCol, row: Math.floor(y / grid.sizePx) - originRow };
  }
  const { col, row } = pixelToHexCell(x, y, grid.sizePx, isFlatTopGrid(grid.type));
  return { col: col - originCol, row: row - originRow };
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
