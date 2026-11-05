import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { zoneFloorMarksOf, zoneOverlayModelOf } from '@axe/features/tabletop/table-zone-overlay/zone-overlay-model';
import { layFloorMarks } from '@axe/ui/tabletop/floor-marks';
import { Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/**
 * Draws the engagement zones on the floor of the table, over the ground's rise and fall: each zone's
 * circle or square, its count against its limit for the master, a warmer colour while it holds more
 * than its limit and a dashed edge while it is declared but not yet in force, and a ring about every
 * piece standing in a zone without being in it. A zone of none but pieces the reader does not see,
 * and a piece the reader does not see, are not drawn. What is drawn is listed on the page as well,
 * unseen, a zone to an item with its count.
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

  protected readonly ringPx = computed(() => this.tabletopService.currentTableVersion().gridSize * 0.55);

  protected readonly model = computed(() =>
    zoneOverlayModelOf(this.zones.state(), this.rolePermission.canSeeHidden(), (id) => {
      const piece = this.objectStore.get<GameCharacter>(id);
      return piece instanceof GameCharacter && this.vision.isTokenVisible(piece);
    })
  );

  constructor() {
    layFloorMarks('zones', () => [
      { heightPx: Z_OFFSET_RANGE_PX, marks: zoneFloorMarksOf(this.model(), this.ringPx()) },
    ]);
  }
}
