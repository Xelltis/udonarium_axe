import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { moveCostsOn, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/**
 * The ground of the table that costs more to cross than plain footing.
 *
 * Everyone is shown it. A piece that wades in comes up short, so the shape of a reach gives
 * the ground away whatever anybody meant by it, and a room that can see why a piece stopped
 * is a room that stops asking.
 */
@Injectable({ providedIn: 'root' })
export class TableMoveCostService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectChange = inject(ObjectChangeService);

  /** Every stretch of dear ground on the table, dearest last so the dearest is drawn on top. */
  all(): TableMoveCost[] {
    this.objectChange.collectionOf(TableMoveCost.aliasName)();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    const areas = moveCostsOn(table);
    for (const area of areas) this.objectChange.versionOf(area.identifier)();
    return [...areas].sort((a, b) => a.charge - b.charge);
  }
}
