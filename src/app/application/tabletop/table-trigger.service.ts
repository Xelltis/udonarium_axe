import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { groundInSight } from '@axe/domain/tabletop/ground-in-sight';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';

/**
 * The ground that goes off, as this seat is allowed to see it.
 *
 * A trap nobody has found is a trap nobody is shown: the ground is on the table for everyone,
 * since whoever moves a piece has to be able to spring it, but only the master, whatever was
 * painted open, and whatever the reader's own eyes have come upon is drawn.
 */
@Injectable({ providedIn: 'root' })
export class TableTriggerService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);

  /** Every piece of trigger ground on the table, whether or not this seat may see it. */
  all(): TableTrigger[] {
    this.objectChange.collectionOf(TableTrigger.aliasName)();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    const triggers = triggersOn(table);
    for (const trigger of triggers) this.objectChange.versionOf(trigger.identifier)();
    return triggers;
  }

  /**
   * The ones to draw: everything for the master, and whatever the rest have been shown.
   *
   * Pressed ground the master has put away is the master's alone to see again.
   */
  shown(): TableTrigger[] {
    this.objectChange.trackMyCursor();
    const all = this.all();
    if (this.rolePermission.canSeeHidden) return all;
    const triggers = all.filter((trigger) => !trigger.pressSwitch?.retired);
    if (!triggers.some((trigger) => trigger.shows === 'sight')) {
      return triggers.filter((trigger) => trigger.isShown);
    }
    const seen = this.seenCells();
    const table = this.tableSelecter.viewTable;
    const grid =
      table && table.gridSize > 0 ? cellGridOf(table.width, table.height, table.gridSize, table.gridType) : null;
    return triggers.filter(
      (trigger) =>
        trigger.isShown || (trigger.shows === 'sight' && grid !== null && groundInSight(grid, trigger.rect, seen))
    );
  }

  /**
   * The cells this reader's eyes reach, or nothing where nothing on the table is hidden.
   *
   * A table with neither dark nor fog on it hides nothing, so ground shown to whoever can see
   * it is shown to everyone, which is what the table already looks like.
   */
  private seenCells(): CellBits | null {
    return this.vision.overlayVision()?.visible ?? null;
  }
}
