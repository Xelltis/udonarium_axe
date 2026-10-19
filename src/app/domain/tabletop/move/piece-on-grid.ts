import { GameCharacter } from '@axe/domain/character/game-character';
import { cellCenterOf, CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { cellPxOf, moveGridOf, spanOf, SquaredTable, squareSpanOf } from '@axe/domain/tabletop/move/move-grid';

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

/** Where a piece's corner goes for it to stand on a given cell. */
export function pieceCornerOn(
  grid: CellGrid,
  character: GameCharacter,
  gridSize: number,
  cell: number
): { x: number; y: number } {
  const centre = cellCenterOf(grid, cell);
  const shift = shiftOn(grid, character, gridSize);
  return { x: centre.x - shift, y: centre.y - shift };
}

/**
 * Where a piece's corner goes to stand on the square under a place it is dropped at, on a table
 * that counts several cells as one square; nothing on a table that counts each cell, which is
 * left to snap the way it always has.
 */
export function pieceCornerOnSquare(
  table: SquaredTable,
  character: GameCharacter,
  at: { x: number; y: number }
): { x: number; y: number } | null {
  if (squareSpanOf(table) < 2) return null;
  const grid = moveGridOf(table);
  const square = pieceCellOf(grid, character, table.gridSize, at);
  return square < 0 ? null : pieceCornerOn(grid, character, table.gridSize, square);
}
