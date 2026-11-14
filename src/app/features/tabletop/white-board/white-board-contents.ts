import { boardSurfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';

/** Everything that names this board as the face it stands on. */
export function standingOn(board: WhiteBoard, candidates: readonly TabletopObject[]): TabletopObject[] {
  return candidates.filter((object) => boardSurfaceOf(object) === board.identifier);
}

/**
 * Puts one piece back on the table, in the place it appeared to be.
 *
 * What stands on a board is held in the board's own coordinates, so handing it back means
 * adding where the board is to where it was on the board; otherwise it jumps to the corner.
 */
export function detachFromBoard(board: WhiteBoard, object: TabletopObject): void {
  object.location = {
    name: 'table',
    x: board.location.x + object.location.x,
    y: board.location.y + object.location.y,
  };
  object.update();
}

/** Puts every piece standing on a board back on the table, each where it appeared to be. */
export function detachAllFrom(board: WhiteBoard, standing: readonly TabletopObject[]): void {
  for (const object of standing) detachFromBoard(board, object);
}
