import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';

/**
 * The ground that goes off, as this seat is allowed to see it.
 *
 * A trap nobody has found is a trap nobody is shown: the ground is on the table for everyone,
 * since whoever moves a piece has to be able to spring it, but only the master and whatever
 * was painted as open is drawn.
 */
@Injectable({ providedIn: 'root' })
export class TableTriggerService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

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

  /** The ones to draw: everything for the master, and whatever was painted open for the rest. */
  shown(): TableTrigger[] {
    this.objectChange.trackMyCursor();
    const master = this.rolePermission.canSeeHidden;
    return this.all().filter((trigger) => master || trigger.open);
  }
}
