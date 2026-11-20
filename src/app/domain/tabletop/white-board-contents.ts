import { GameObject } from '@axe/core/sync/game-object';
import { boardSurfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';

/**
 * Everything set on a board, out of `objects`: whatever of any kind lies out on the table naming the
 * board as the face it stands on.
 *
 * Anything that can be dragged can be dropped on a board, so no kind is left out; what is put away, or
 * held inside something else such as a card in a stack, is not on the board even where its place still
 * names it.
 */
export function standingOnBoard(board: WhiteBoard, objects: Iterable<GameObject>): TabletopObject[] {
  const standing: TabletopObject[] = [];
  for (const object of objects) {
    if (object === board || !(object instanceof TabletopObject) || !object.isVisibleOnTable) continue;
    if (boardSurfaceOf(object) === board.identifier) standing.push(object);
  }
  return standing;
}

/**
 * Puts one thing back on the table, in the place it appeared to be.
 *
 * What stands on a board is held in the board's own coordinates, so handing it back means adding where
 * the board is to where it was on the board; otherwise it jumps to the corner.
 */
export function detachFromBoard(board: WhiteBoard, object: TabletopObject): void {
  object.location = {
    name: 'table',
    x: board.location.x + object.location.x,
    y: board.location.y + object.location.y,
  };
  object.update();
}

/** Puts everything set on a board (see {@link standingOnBoard}) back on the table, each where it appeared to be. */
export function clearBoard(board: WhiteBoard, objects: Iterable<GameObject>): void {
  for (const object of standingOnBoard(board, objects)) detachFromBoard(board, object);
}
