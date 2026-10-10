import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { groundInSight } from '@axe/domain/tabletop/ground-in-sight';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/**
 * The looks laid over the ground, as this seat is allowed to see them.
 *
 * Most of them are landmarks and everybody sees them. One laid ahead of a party is not: a bank
 * of fog nobody has come upon yet is drawn for the master alone, or for whoever's eyes reach it.
 */
@Injectable({ providedIn: 'root' })
export class TableAmbienceService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);

  /** Every look on the table, whether or not this seat may see it. */
  all(): TableAmbience[] {
    this.objectChange.collectionOf(TableAmbience.aliasName)();
    const looks = this.tabletopService.ambiences;
    for (const look of looks) this.objectChange.versionOf(look.identifier)();
    return looks;
  }

  /** The ones to draw: everything for the master, and whatever the rest have been shown. */
  shown(): TableAmbience[] {
    this.objectChange.trackMyCursor();
    const looks = this.all();
    if (this.rolePermission.canSeeHidden) return looks;
    if (looks.every((look) => look.shows === 'room')) return looks;
    const seen = this.vision.overlayVision()?.visible ?? null;
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0) return looks.filter((look) => look.shows !== 'master');
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const size = table.gridSize;
    return looks.filter((look) => {
      if (look.shows === 'room') return true;
      if (look.shows === 'master') return false;
      const rect = {
        col: Math.round(look.location.x / size),
        row: Math.round(look.location.y / size),
        width: Math.max(1, Math.round(look.width)),
        height: Math.max(1, Math.round(look.height)),
      };
      return groundInSight(grid, rect, seen);
    });
  }
}
