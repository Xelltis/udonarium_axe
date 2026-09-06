import { GameCharacter } from '@axe/domain/character/game-character';
import { cellCenterOf, CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';

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
  const size = Math.max(1, character.size);
  const middle = (gridSize * size) / 2;
  const onACorner = size % 2 === 0 ? gridSize / 2 : 0;
  return middle - onACorner;
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
  const shift = cornerShiftOf(character, gridSize);
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
  const shift = cornerShiftOf(character, gridSize);
  return { x: centre.x - shift, y: centre.y - shift };
}
