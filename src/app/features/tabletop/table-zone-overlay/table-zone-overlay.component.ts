import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { zoneOverlayModelOf } from '@axe/features/tabletop/table-zone-overlay/zone-overlay-model';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/**
 * Draws the engagement zones on the floor of the table: each zone's circle or square, its count
 * against its limit for the master, a warmer colour while it holds more than its limit and a dashed
 * edge while it is declared but not yet in force, and a ring about every piece standing in a zone
 * without being in it. A zone of none but pieces the reader does not see, and a piece the reader does
 * not see, are not drawn.
 */
@Component({
  selector: 'table-zone-overlay',
  templateUrl: './table-zone-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableZoneOverlayComponent {
  private readonly zones = inject(EngagementZoneService);
  private readonly tabletopService = inject(TabletopService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);
  private readonly objectStore = inject(ObjectStore);

  protected readonly zTransform = translateZCss(Z_OFFSET_RANGE_PX);

  protected readonly extent = computed(() => {
    const table = this.tabletopService.currentTableVersion();
    return { width: Math.max(0, table.width * table.gridSize), height: Math.max(0, table.height * table.gridSize) };
  });

  protected readonly ringPx = computed(() => this.tabletopService.currentTableVersion().gridSize * 0.55);

  protected readonly model = computed(() =>
    zoneOverlayModelOf(this.zones.state(), this.rolePermission.canSeeHidden, (id) => {
      const piece = this.objectStore.get<GameCharacter>(id);
      return piece instanceof GameCharacter && this.vision.isTokenVisible(piece);
    })
  );
}
