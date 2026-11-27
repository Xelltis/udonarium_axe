import { pieceCentreOf, PlacedPiece } from '@axe/domain/tabletop/move/piece-on-grid';

/**
 * The corner a light following a piece is placed by, on cells `gridSize` across: half a cell up and to
 * the left of the piece's middle.
 *
 * A light stands in a box one cell across placed by its corner, and is drawn, shines and is hidden by
 * the fog from the middle of that box, which this puts on the middle of the piece.
 */
export function lightCornerOnPiece(piece: PlacedPiece, gridSize: number): { x: number; y: number } {
  const centre = pieceCentreOf(piece, gridSize);
  return { x: centre.x - gridSize / 2, y: centre.y - gridSize / 2 };
}
