import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { boardSurfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { clearBoard, detachFromBoard, standingOnBoard } from '@axe/domain/tabletop/white-board-contents';

/**
 * What is set on the white boards, and taking it off them, however this seat asks: the board's menu,
 * its editor, putting the tutorial away, taking a table down, an AI.
 *
 * Every way reads the room through here, so none of them leaves a kind of thing behind on a board that
 * is taken away, to fall to the floor at the place it held on the board.
 */
@Injectable({ providedIn: 'root' })
export class WhiteBoardService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  /**
   * The kinds of thing the room has held that can lie out on the table, which a list read in a computed
   * follows; the first of a kind new to the room adds it as it arrives.
   */
  private readonly kinds = signal<ReadonlySet<string>>(kindsAmong(this.objectStore.getObjects()));

  constructor() {
    this.objectChange.objectAdded$.subscribe((event) => {
      if (this.kinds().has(event.aliasName)) return;
      if (!(this.objectStore.get(event.identifier) instanceof TabletopObject)) return;
      this.kinds.update((kinds) => new Set([...kinds, event.aliasName]));
    }, inject(DestroyRef));
  }

  /**
   * Everything set on a board (see `standingOnBoard`). Read in a computed, it follows things of every
   * kind being added, taken away or moved from one face to another.
   */
  standingOn(board: WhiteBoard): TabletopObject[] {
    for (const kind of this.kinds()) this.objectChange.collectionOf(kind)();
    return standingOnBoard(board, this.objectStore.getObjects());
  }

  /** Takes one thing set on a board back to the table, where it appeared to be; nothing for one not on that board. */
  takeOff(board: WhiteBoard, object: TabletopObject): void {
    if (boardSurfaceOf(object) !== board.identifier) return;
    detachFromBoard(board, object);
  }

  /** Puts everything set on a board back on the table, each where it appeared to be. */
  clear(board: WhiteBoard): void {
    clearBoard(board, this.objectStore.getObjects());
  }

  /** Takes a board away, first putting everything set on it back on the table where it appeared to be. */
  takeDown(board: WhiteBoard): void {
    this.clear(board);
    board.destroy();
  }
}

/** The kinds of thing among `objects` that can lie out on the table. */
function kindsAmong(objects: readonly GameObject[]): ReadonlySet<string> {
  const kinds = new Set<string>();
  for (const object of objects) if (object instanceof TabletopObject) kinds.add(object.aliasName);
  return kinds;
}
