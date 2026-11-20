import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { WhiteBoardService } from '@axe/application/tabletop/white-board.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';

/**
 * Taking a table away, however this seat asks: the table settings panel, its delete button, an AI.
 *
 * Every way goes through here, so none of them leaves the room with no table to stand on.
 */
@Injectable({ providedIn: 'root' })
export class GameTableService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly boards = inject(WhiteBoardService);

  /**
   * Whether this seat may take a table away: one still in the room and not its last, on a seat that may
   * change the table. Read in a computed, it follows tables being made and taken away.
   */
  mayRemove(table: GameTable | null): boolean {
    this.objectChange.collectionOf(GameTable.aliasName)();
    if (!table || !this.permission.canEditTabletop()) return false;
    const tables = this.objectStore.getObjects(GameTable);
    return tables.length > 1 && tables.includes(table);
  }

  /**
   * Takes a table away with everything it carries, where this seat may (see {@link mayRemove}); answers
   * whether it did. What stands on its boards without being carried by the table, as a piece does, is put
   * back on the table where it appeared to be first, rather than left on a board that is gone.
   */
  remove(table: GameTable): boolean {
    if (!this.mayRemove(table)) return false;
    for (const board of table.whiteBoards) this.boards.clear(board);
    table.destroy();
    return true;
  }
}
