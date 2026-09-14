import { DestroyRef, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { convertLegacyScratchMask } from '@axe/domain/tabletop/legacy-scratch-mask';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/**
 * How long after the first sign of a legacy mask the pass runs. A mask a peer sends arrives as
 * several objects, and one pass for all of them is cheaper than one for each.
 */
const PASS_DELAY_MS = 100;

/**
 * Turns scratch masks of the legacy kind into regular masks wherever they turn up: in a room file
 * being loaded, or sent by a seat still running a version that makes them.
 *
 * Nothing draws the legacy kind, so a legacy mask is invisible until it is converted. Only a seat
 * that may change the table converts one, because converting writes a mask to the room and deletes
 * another; a guest leaves it for such a seat. While a replay holds the table nothing is converted,
 * as the recording names its masks by the identifiers they were recorded under.
 */
@Injectable({ providedIn: 'root' })
export class LegacyScratchMaskMigrationService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private legacyMasksRemain = false;

  constructor() {
    this.objectChange.onObjectChangedForSingleAlias(
      GameTableScratchMask.aliasName,
      () => this.schedule(),
      this.destroyRef
    );
    const scheduleWhileAnyRemain = () => {
      if (this.legacyMasksRemain) this.schedule();
    };
    this.objectChange.objectAdded$.subscribe(scheduleWhileAnyRemain, this.destroyRef);
    this.objectChange.objectChanged$.subscribe(scheduleWhileAnyRemain, this.destroyRef);
    this.objectChange.childrenChanged$.subscribe(scheduleWhileAnyRemain, this.destroyRef);
    this.destroyRef.onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    });
    this.schedule();
  }

  /**
   * Converts every legacy mask in the room that can be converted now, and gives how many are left.
   *
   * A mask still arriving from a peer, or one on a table that has not arrived, is left for a later
   * pass, which any change in the room brings on for as long as legacy masks remain.
   */
  migrate(): number {
    if (!isNetworkIsolated() && this.rolePermission.canEditTabletop) {
      for (const legacy of this.objectStore.getObjects(GameTableScratchMask)) {
        convertLegacyScratchMask(legacy, this.tableSelecter.viewTable);
      }
    }
    const remaining = this.objectStore.getObjects(GameTableScratchMask).length;
    this.legacyMasksRemain = remaining > 0;
    return remaining;
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.migrate();
    }, PASS_DELAY_MS);
  }
}
