import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { MoveBlockMap, moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/**
 * The ground a table is closed on.
 *
 * Reading only. The cells are painted in the map editor, alongside the terrain and the
 * covers, so that one brush lays all three rather than each having a tool of its own.
 */
@Injectable({ providedIn: 'root' })
export class MoveBlockService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectChange = inject(ObjectChangeService);

  blockedOn(grid: CellGrid): CellBits | null {
    this.objectChange.collectionOf(MoveBlockMap.aliasName)();
    const map = this.map();
    if (!map) return null;
    this.objectChange.versionOf(map.identifier)();
    return map.read(grid);
  }

  private map(): MoveBlockMap | null {
    const table = this.tableSelecter.viewTable;
    return table ? moveBlockMapOn(table) : null;
  }
}
