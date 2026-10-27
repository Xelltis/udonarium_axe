import { GameCharacter } from '@axe/domain/character/game-character';
import { cellCenterOf, CellGrid, cellIndexAt, cellIndexOf, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  cellPxOf,
  fineGridOf,
  fitsOnCell,
  isSquareGrid,
  moveGridOf,
  spanOf,
  SquaredTable,
  squareSpanOf,
} from '@axe/domain/tabletop/move/move-grid';

/**
 * How far a piece's corner sits from the middle of the cell it stands on.
 *
 * A piece is placed by its corner while a cell is found by its middle. One an odd number of
 * cells across has a middle cell to sit on; one an even number across has its middle where
 * four cells meet, and asking which cell that point is in answers with the one down and to
 * the right, which throws the whole reach a cell that way. It steps back half a cell to the
 * one up and to the left instead.
 */
export function cornerShiftOf(character: GameCharacter, gridSize: number): number {
  return sizeShiftOf(character.size, gridSize);
}

/**
 * The same shift for a size given outright rather than read off a piece.
 *
 * A piece squeezing through a gap takes up less of the board than it is, and where its corner
 * goes has to be worked out for the space it is folding itself into rather than the one it
 * usually fills.
 */
export function sizeShiftOf(span: number, gridSize: number): number {
  const size = Math.max(1, span);
  const middle = (gridSize * size) / 2;
  const onACorner = size % 2 === 0 ? gridSize / 2 : 0;
  return middle - onACorner;
}

/**
 * How far a piece's corner sits from the middle of the cell it stands on, on a grid whose cells are
 * `span` of the table's cells across, each `cellPx` across.
 *
 * On the table's own cells this is {@link sizeShiftOf}. On a grid of squares, a piece no wider than
 * a square has its middle on the middle of the square, and a wider one covers as many squares as
 * it takes, with its middle where they meet when that is an even number across. Its size is kept
 * in the table's cells either way.
 */
export function moveShiftOf(size: number, cellPx: number, span: number): number {
  if (span <= 1) return sizeShiftOf(size, cellPx);
  const across = Math.max(1, size);
  const squares = Math.max(1, Math.ceil(across / span));
  const middle = (cellPx * across) / 2;
  return squares % 2 === 0 ? middle - (span * cellPx) / 2 : middle;
}

/** The shift of {@link moveShiftOf} for a piece on a grid, which knows its own squares. */
function shiftOn(grid: CellGrid, character: GameCharacter, gridSize: number): number {
  const span = spanOf(grid);
  return span > 1 ? moveShiftOf(character.size, cellPxOf(grid), span) : cornerShiftOf(character, gridSize);
}

/**
 * The cell a piece stands on.
 *
 * `at` is where a hand is holding it this moment, which is not where the piece says it is: a
 * dragged piece writes its place down every sixty-six milliseconds, and a hand that has
 * crossed three cells by then is still being answered for where it set out.
 */
export function pieceCellOf(
  grid: CellGrid,
  character: GameCharacter,
  gridSize: number,
  at: { x: number; y: number } = character.location
): number {
  const shift = shiftOn(grid, character, gridSize);
  return cellIndexAt(grid, at.x + shift, at.y + shift);
}

/** How far, in px, a piece may be off a place and still count as standing on it. */
export const ON_PLACE_PX = 0.5;

/** Whether a piece's corner stands at a place, to within {@link ON_PLACE_PX}. */
export function standsAt(character: GameCharacter, corner: { x: number; y: number }): boolean {
  const { x, y } = character.location;
  return Math.abs(x - corner.x) <= ON_PLACE_PX && Math.abs(y - corner.y) <= ON_PLACE_PX;
}

/** How wide a piece stands, in px, on cells `cellPx` across. */
export function pieceWidthPx(character: GameCharacter, cellPx: number): number {
  const size = Number(character.size);
  return (size > 0 ? size : 1) * cellPx;
}

/** A piece as its middle is worked out from: the corner it is placed by, and how many cells across it is. */
export interface PlacedPiece {
  readonly location: { readonly x: number; readonly y: number };
  readonly size: number;
}

/**
 * How far a piece's middle is from the corner it is placed by, in px, on cells `cellPx` across.
 *
 * Unlike {@link pieceWidthPx}, which counts a piece of no size as a cell for what it takes up, a piece
 * of no size is a point here: its middle is its corner, where it is drawn.
 */
export function pieceCentreOffsetPx(piece: PlacedPiece, cellPx: number): number {
  const size = Number(piece.size);
  return ((size > 0 ? size : 0) * cellPx) / 2;
}

/** The middle of a piece, in table px, which is where it looks out from, is lit from and stands. */
export function pieceCentreOf(piece: PlacedPiece, cellPx: number): { x: number; y: number } {
  const offset = pieceCentreOffsetPx(piece, cellPx);
  return { x: piece.location.x + offset, y: piece.location.y + offset };
}

/**
 * Where a piece's corner goes for it to stand on a given cell.
 *
 * On a grid of squares that keeps its pieces to their cells, a piece the square holds is put on
 * the cells nearest its middle, up and to the left where several are as near. On a square the
 * table's edge cuts off, a piece wider than what is left of the square is kept on the table rather
 * than hung over its edge.
 */
export function pieceCornerOn(
  grid: CellGrid,
  character: GameCharacter,
  gridSize: number,
  cell: number
): { x: number; y: number } {
  const centre = cellCenterOf(grid, cell);
  if (isSquareGrid(grid) && grid.keepsToCells) {
    const [kept] = pieceCornersNearest(grid, character, cell, nearMiddleOf(grid, centre));
    if (kept) return kept;
  }
  const shift = shiftOn(grid, character, gridSize);
  const corner = { x: centre.x - shift, y: centre.y - shift };
  const clip = grid.clip;
  if (!clip) return corner;
  const width = pieceWidthPx(character, cellPxOf(grid));
  const [topLeft, , bottomRight] = cellPolygonOf(grid, cell);
  const cutAcross = bottomRight.x - topLeft.x < grid.sizePx;
  const cutDown = bottomRight.y - topLeft.y < grid.sizePx;
  return {
    x: cutAcross ? Math.max(0, Math.min(corner.x, clip.width - width)) : corner.x,
    y: cutDown ? Math.max(0, Math.min(corner.y, clip.height - width)) : corner.y,
  };
}

/**
 * The point a piece put on a square with no cell chosen aims its middle at: the middle of the
 * square, nudged up and to the left so that of several cells as near the first is taken.
 */
export function nearMiddleOf(grid: CellGrid, centre: { x: number; y: number }): { x: number; y: number } {
  const nudge = cellPxOf(grid) / 4;
  return { x: centre.x - nudge, y: centre.y - nudge };
}

/**
 * Where a piece's corner goes to stand on the cells of a square nearest a point, the piece kept
 * inside the square, or inside what of it is on the table; on a grid of the table's own cells, or
 * for a piece wider than that, the middle of the cell as {@link pieceCornerOn} has it.
 *
 * The point is where the middle of the piece is wanted. A piece a whole number of cells across
 * lines its edges up with the cells, and one of part of a cell has its middle where they meet, as
 * the snap of a table puts them.
 */
export function pieceCornerInSquare(
  grid: CellGrid,
  character: GameCharacter,
  gridSize: number,
  square: number,
  at: { x: number; y: number }
): { x: number; y: number } {
  const [nearest] = pieceCornersNearest(grid, character, square, at);
  return nearest ?? pieceCornerOn(grid, character, gridSize, square);
}

/**
 * The places on the cells of a square a piece could stand, by where its corner goes, along the top
 * row first; none on a grid of the table's own cells, or for a piece wider than what of the square
 * is on the table. A piece a whole number of cells across lines its edges up with the cells, and
 * one of part of a cell has its middle where they meet, or in the middle of the square where no such
 * point keeps it inside.
 */
export function pieceCornersInSquare(
  grid: CellGrid,
  character: GameCharacter,
  square: number
): { x: number; y: number }[] {
  const cellPx = cellPxOf(grid);
  const width = pieceWidthPx(character, cellPx);
  if (spanOf(grid) <= 1 || !fitsOnCell(grid, square, width)) return [];
  const [topLeft, , bottomRight] = cellPolygonOf(grid, square);
  const whole = Number(character.size) % 1 === 0;
  const along = (start: number, end: number) => {
    const places: number[] = [];
    const first = whole ? start : start + Math.ceil(width / 2 / cellPx) * cellPx - width / 2;
    for (let at = first; at + width <= end + ON_PLACE_PX; at += cellPx) places.push(at);
    return places.length > 0 ? places : [start + (end - start - width) / 2];
  };
  const places: { x: number; y: number }[] = [];
  for (const y of along(topLeft.y, bottomRight.y)) {
    for (const x of along(topLeft.x, bottomRight.x)) places.push({ x, y });
  }
  return places;
}

/**
 * The places {@link pieceCornersInSquare} lists, nearest first by how far the piece's middle would
 * be from a point, those as near kept in the order listed.
 */
export function pieceCornersNearest(
  grid: CellGrid,
  character: GameCharacter,
  square: number,
  at: { x: number; y: number }
): { x: number; y: number }[] {
  const half = pieceWidthPx(character, cellPxOf(grid)) / 2;
  const away = (place: { x: number; y: number }) => (place.x + half - at.x) ** 2 + (place.y + half - at.y) ** 2;
  return pieceCornersInSquare(grid, character, square).sort((a, b) => away(a) - away(b));
}

/** The table's cells a piece covers with its corner at a place, `width` across. */
export function cellsCoveredAt(grid: CellGrid, corner: { x: number; y: number }, width: number): number[] {
  const fine = fineGridOf(grid);
  const cellPx = fine.sizePx;
  const fromCol = Math.floor((corner.x + ON_PLACE_PX) / cellPx);
  const toCol = Math.ceil((corner.x + width - ON_PLACE_PX) / cellPx);
  const fromRow = Math.floor((corner.y + ON_PLACE_PX) / cellPx);
  const toRow = Math.ceil((corner.y + width - ON_PLACE_PX) / cellPx);
  const cells: number[] = [];
  for (let row = fromRow; row < toRow; row++) {
    for (let col = fromCol; col < toCol; col++) cells.push(cellIndexOf(fine, col, row));
  }
  return cells;
}

/**
 * Where a piece's corner goes to stand on the square under a place it is dropped at, on a table
 * that counts several cells as one square; nothing on a table that counts each cell, which is
 * left to snap the way it always has.
 *
 * On a table keeping its pieces to the cells, the square is the one under the piece's middle and
 * the piece goes on its cells nearest where it was let go; one wider than the square stands in
 * its middle.
 */
export function pieceCornerOnSquare(
  table: SquaredTable,
  character: GameCharacter,
  at: { x: number; y: number }
): { x: number; y: number } | null {
  if (squareSpanOf(table) < 2) return null;
  const grid = moveGridOf(table);
  if (isSquareGrid(grid) && grid.keepsToCells) {
    const half = pieceWidthPx(character, table.gridSize) / 2;
    const middle = { x: at.x + half, y: at.y + half };
    const under = cellIndexAt(grid, middle.x, middle.y);
    const square = under < 0 ? pieceCellOf(grid, character, table.gridSize, at) : under;
    return square < 0 ? null : pieceCornerInSquare(grid, character, table.gridSize, square, middle);
  }
  const square = pieceCellOf(grid, character, table.gridSize, at);
  return square < 0 ? null : pieceCornerOn(grid, character, table.gridSize, square);
}
