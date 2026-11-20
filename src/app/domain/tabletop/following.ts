import { pieceCentreOf, PlacedPiece } from '@axe/domain/tabletop/move/piece-on-grid';
import { TabletopLocation } from '@axe/domain/tabletop/tabletop-object';

/**
 * Moves a follower placed by its middle, such as a range, onto the middle of the piece it follows, on
 * cells `gridSize` across.
 *
 * It writes the follower's location directly, so on a synced object the move reaches every peer.
 */
export function centerFollowerOnCharacter(
  follower: { location: TabletopLocation },
  character: PlacedPiece,
  gridSize: number
): void {
  const centre = pieceCentreOf(character, gridSize);
  follower.location.x = centre.x;
  follower.location.y = centre.y;
}

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
