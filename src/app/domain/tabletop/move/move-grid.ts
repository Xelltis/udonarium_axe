import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import {
  cellCenterOf,
  cellColRow,
  cellCount,
  CellGrid,
  cellGridOf,
  cellIndexAt,
  cellIndexOf,
  cellPolygonOf,
  forEachCellInBox,
} from '@axe/domain/tabletop/fog/cell-grid';
import { GridSnapStyle, keepsPiecesOnCells } from '@axe/domain/tabletop/grid-snap-style';
import { GridType } from '@axe/domain/tabletop/grid-type';

/** The most cells across a square of a table may be made of. */
export const MAX_SQUARE_SPAN = 4;

/**
 * A grid of squares each made of several cells of a table, which is what a piece moves and a
 * range is counted over when a table counts several cells as one square.
 */
export interface SquareGrid extends CellGrid {
  /** How many of the table's cells a square is across. */
  readonly span: number;
  /** The table's own cells, which hold the map: terrain, paint, heights and pieces. */
  readonly fine: CellGrid;
  /**
   * Whether a piece put on a square keeps to its cells rather than going to its middle, as a table
   * snapping to the grid has it.
   */
  readonly keepsToCells?: boolean;
}

/** What a table says about its cells and its squares. */
export interface SquaredTable {
  width: number;
  height: number;
  gridSize: number;
  gridType: GridType;
  squareSpan: number;
  /** Whether pieces snap to the grid at all, and to which points; read for {@link keepsPiecesOnCells}. */
  gridSnap?: boolean;
  gridSnapStyle?: GridSnapStyle | number;
}

/**
 * How many cells across one square of a table is, from 1 to {@link MAX_SQUARE_SPAN}.
 *
 * Only square grids are counted in squares; hex cells cannot be put together into larger ones, so
 * a hex table, and one with no grid, count each cell, whatever the table holds.
 */
export function squareSpanOf(table: Pick<SquaredTable, 'gridType' | 'squareSpan'>): number {
  if (Number(table.gridType) !== GridType.SQUARE) return 1;
  const span = Math.round(Number(table.squareSpan));
  return Number.isFinite(span) ? Math.min(MAX_SQUARE_SPAN, Math.max(1, span)) : 1;
}

/**
 * The grid a piece on the table moves over: the table's own cells, or its squares when it counts
 * several cells as one. Along a far edge the table's size does not divide, the squares are cut off
 * where the table ends, and each still counts as a square.
 */
export function moveGridOf(table: SquaredTable): CellGrid {
  const fine = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  const span = squareSpanOf(table);
  if (span < 2) return fine;
  const squares = squareGridOver(fine, span);
  if (!keepsPiecesOnCells(table)) return squares;
  const kept: SquareGrid = { ...squares, keepsToCells: true };
  return kept;
}

/**
 * The squares `span` cells across over a grid of cells, those along the far edges cut off where
 * the cells end.
 */
export function squareGridOver(fine: CellGrid, span: number): SquareGrid {
  const cols = Math.ceil(fine.cols / span);
  const rows = Math.ceil(fine.rows / span);
  const whole = cols * span === fine.cols && rows * span === fine.rows;
  return {
    cols,
    rows,
    sizePx: fine.sizePx * span,
    type: fine.type,
    span,
    fine,
    ...(whole ? {} : { clip: { width: fine.cols * fine.sizePx, height: fine.rows * fine.sizePx } }),
  };
}

/** Whether a grid is made of squares of several cells rather than of the table's own cells. */
export function isSquareGrid(grid: CellGrid): grid is SquareGrid {
  return 'span' in grid && 'fine' in grid && (grid as SquareGrid).span > 1;
}

/** How much wider than a cell, in px, a piece may be counted and still fit, for sizes no binary fraction holds. */
const FIT_SLACK_PX = 1e-6;

/** Whether a piece `widthPx` across fits on what is on the table of a cell of a grid. */
export function fitsOnCell(grid: CellGrid, cell: number, widthPx: number): boolean {
  const [topLeft, , bottomRight] = cellPolygonOf(grid, cell);
  const room = Math.min(bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  return widthPx <= room + FIT_SLACK_PX;
}

/** How many of the table's cells one cell of a grid is across. */
export function spanOf(grid: CellGrid): number {
  return isSquareGrid(grid) ? grid.span : 1;
}

/** The table's own cells under a grid. */
export function fineGridOf(grid: CellGrid): CellGrid {
  return isSquareGrid(grid) ? grid.fine : grid;
}

/** The size of one of the table's cells, in px, under a grid. */
export function cellPxOf(grid: CellGrid): number {
  return fineGridOf(grid).sizePx;
}

/**
 * The middle of the square under a point, on a table that counts several cells as one square;
 * nothing on a table that counts each cell, or off its squares.
 */
export function squareCentreAt(table: SquaredTable, at: { x: number; y: number }): { x: number; y: number } | null {
  if (squareSpanOf(table) < 2) return null;
  const grid = moveGridOf(table);
  const square = cellIndexAt(grid, at.x, at.y);
  return square < 0 ? null : cellCenterOf(grid, square);
}

/** The size of one square of a table, in px: what a move and a range are counted in. */
export function squarePxOf(table: Pick<SquaredTable, 'gridSize' | 'gridType' | 'squareSpan'>): number {
  return squareSpanOf(table) * Number(table.gridSize);
}

/** The square holding a cell of the table. */
export function squareOfCell(grid: SquareGrid, cell: number): number {
  const col = cell % grid.fine.cols;
  const row = Math.floor(cell / grid.fine.cols);
  return cellIndexOf(grid, Math.floor(col / grid.span), Math.floor(row / grid.span));
}

/** The cell of a grid holding the table's cell at a column and row, or -1 off the table. */
export function cellHolding(grid: CellGrid, col: number, row: number): number {
  const fine = fineGridOf(grid);
  if (col < 0 || row < 0 || col >= fine.cols || row >= fine.rows) return -1;
  const span = spanOf(grid);
  return cellIndexOf(grid, Math.floor(col / span), Math.floor(row / span));
}

/**
 * The table's cells, by column and row, that a cell of a grid is made of: itself, or those of a
 * square that are on the table.
 */
export function tableCellsOf(grid: CellGrid, index: number): { col: number; row: number }[] {
  const { col, row } = cellColRow(grid, index);
  const span = spanOf(grid);
  const fine = fineGridOf(grid);
  const cells: { col: number; row: number }[] = [];
  for (let down = 0; down < span; down++) {
    for (let across = 0; across < span; across++) {
      const at = { col: col * span + across, row: row * span + down };
      if (at.col < fine.cols && at.row < fine.rows) cells.push(at);
    }
  }
  return cells;
}

/**
 * Visits the cells of a grid that a box in table px covers: those whose centres lie inside it, or
 * on a grid of squares, every square holding a cell whose centre does. A piece smaller than a
 * square then covers the one square it is in wherever it stands in it, rather than none.
 */
export function forEachCellCovered(
  grid: CellGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  visit: (index: number) => void
): void {
  if (!isSquareGrid(grid)) {
    forEachCellInBox(grid, minX, minY, maxX, maxY, (index) => visit(index));
    return;
  }
  const seen = new Set<number>();
  forEachCellInBox(grid.fine, minX, minY, maxX, maxY, (cell) => {
    const square = squareOfCell(grid, cell);
    if (square < 0 || seen.has(square)) return;
    seen.add(square);
    visit(square);
  });
}

/** The squares holding any of the marked cells. */
export function squaresWithAny(grid: SquareGrid, cells: CellBits): CellBits {
  const squares = new CellBits(cellCount(grid));
  const total = Math.min(cells.count, cellCount(grid.fine));
  for (let cell = 0; cell < total; cell++) {
    if (!cells.get(cell)) continue;
    const square = squareOfCell(grid, cell);
    if (square >= 0) squares.set(square);
  }
  return squares;
}

/**
 * The squares a line of marked cells runs right across: a row, a column or a diagonal of the
 * square marked from one side to the other, or the whole square.
 *
 * This is how walls drawn on a table's cells close its squares. A wall one cell thick closes the
 * squares it runs through, even along their edge, so nothing slips past it; a doorway a cell wide
 * breaks the line and leaves the square open; and a pillar or a heap of rubble in a corner does
 * not close the square around it. A square the table's edge cuts off is the part of it on the
 * table, a row of it as wide as that part and a column as deep, with diagonals only where that part
 * is as wide as it is deep. Any cell of a strip one cell deep runs right across it, as a wall across
 * a corridor does, so closes it; rubble in a corner of a deeper strip does not.
 */
export function squaresClosedBy(grid: SquareGrid, cells: CellBits): CellBits {
  const squares = new CellBits(cellCount(grid));
  const { span, fine } = grid;
  const marked = (col: number, row: number) => {
    const index = cellIndexOf(fine, col, row);
    return index >= 0 && index < cells.count && cells.get(index);
  };
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const left = col * span;
      const top = row * span;
      const wide = Math.min(span, fine.cols - left);
      const deep = Math.min(span, fine.rows - top);
      const line = (length: number, cellAt: (step: number) => [number, number]) => {
        for (let step = 0; step < length; step++) {
          const [c, r] = cellAt(step);
          if (!marked(c, r)) return false;
        }
        return length > 0;
      };
      let closed =
        wide === deep &&
        (line(wide, (step) => [left + step, top + step]) || line(wide, (step) => [left + wide - 1 - step, top + step]));
      for (let across = 0; across < deep && !closed; across++)
        closed = line(wide, (step) => [left + step, top + across]);
      for (let across = 0; across < wide && !closed; across++)
        closed = line(deep, (step) => [left + across, top + step]);
      if (closed) squares.set(row * grid.cols + col);
    }
  }
  return squares;
}

/** The centre of every square, in table px, in index order. */
export function squareCentresOf(grid: CellGrid): { x: number; y: number }[] {
  const centres: { x: number; y: number }[] = [];
  const total = cellCount(grid);
  for (let index = 0; index < total; index++) centres.push(cellCenterOf(grid, index));
  return centres;
}
