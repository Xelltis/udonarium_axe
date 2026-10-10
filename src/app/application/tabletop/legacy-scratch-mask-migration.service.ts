import { DestroyRef, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeEvent, ObjectChangeService } from '@axe/application/sync/object-change.service';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
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
 *
 * A pass runs only on what can let a mask be converted: a legacy mask arriving or changing, a piece
 * of one that was left waiting, or the table it names; and the seat coming to be allowed to convert,
 * which is noticed on the seats' cursors and on those same changes, as a replay that lets go of the
 * table puts the room back and hears from the seats again.
 */
@Injectable({ providedIn: 'root' })
export class LegacyScratchMaskMigrationService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private couldConvert = this.canConvert();
  private readonly waitingMasks = new Set<string>();
  private readonly awaitedTables = new Set<string>();
  private awaitsAnyTable = false;

  constructor() {
    this.objectChange.onObjectChangedForAlias(
      [GameTableScratchMask.aliasName, DataElement.aliasName, GameTable.aliasName],
      (event) => this.onRelatedObjectChanged(event),
      this.destroyRef
    );
    this.objectChange.onObjectChangedForSingleAlias(PeerCursor.aliasName, () => this.mayConvertNow(), this.destroyRef);
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
   * pass, which the arrival of the rest of it or of that table brings on.
   */
  migrate(): number {
    this.couldConvert = this.canConvert();
    if (this.couldConvert) {
      for (const legacy of this.objectStore.getObjects(GameTableScratchMask)) {
        convertLegacyScratchMask(legacy, this.tableSelecter.viewTable);
      }
    }
    const remaining = this.objectStore.getObjects(GameTableScratchMask);
    this.rememberWaiting(remaining);
    return remaining.length;
  }

  private canConvert(): boolean {
    return !isNetworkIsolated() && this.rolePermission.canEditTabletop;
  }

  /** Whether this seat may convert now, scheduling a pass when it may again after it could not. */
  private mayConvertNow(): boolean {
    const can = this.canConvert();
    if (can && !this.couldConvert) this.schedule();
    this.couldConvert = can;
    return can;
  }

  private onRelatedObjectChanged(event: ObjectChangeEvent): void {
    if (!this.mayConvertNow()) return;
    if (event.aliasName === GameTableScratchMask.aliasName || this.mayCompleteWaitingMask(event)) this.schedule();
  }

  private mayCompleteWaitingMask(event: ObjectChangeEvent): boolean {
    if (this.waitingMasks.size < 1) return false;
    if (event.aliasName === GameTable.aliasName) {
      return this.awaitsAnyTable || this.awaitedTables.has(event.identifier);
    }
    let holder = this.objectStore.get<ObjectNode>(event.identifier)?.parent ?? null;
    while (holder instanceof DataElement) holder = holder.parent;
    return holder !== null && this.waitingMasks.has(holder.identifier);
  }

  private rememberWaiting(remaining: readonly GameTableScratchMask[]): void {
    this.waitingMasks.clear();
    this.awaitedTables.clear();
    let anyUnplaced = false;
    for (const legacy of remaining) {
      this.waitingMasks.add(legacy.identifier);
      if (!legacy.parentIsAssigned) anyUnplaced = true;
      else if (legacy.parentIsUnknown && !legacy.parentIsDestroyed) this.awaitedTables.add(legacy.parentId);
    }
    this.awaitsAnyTable = anyUnplaced && this.objectStore.getObjects(GameTable).length < 1;
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.migrate();
    }, PASS_DELAY_MS);
  }
}
