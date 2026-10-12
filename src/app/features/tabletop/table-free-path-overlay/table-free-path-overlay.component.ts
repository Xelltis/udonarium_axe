import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { freePathOverlayModelOf } from '@axe/features/tabletop/table-free-path-overlay/free-path-overlay-model';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/**
 * Draws a move on a table with no grid as it is worked out: the settled legs, the leg running ahead
 * of the pointer, and how far the move still reaches from the last corner; and, thinner, the ways the
 * rest of the room are drawing for pieces this reader can see.
 */
@Component({
  selector: 'table-free-path-overlay',
  templateUrl: './table-free-path-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableFreePathOverlayComponent {
  private readonly freePlan = inject(FreeMovePlanService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);

  protected readonly zTransform = translateZCss(Z_OFFSET_RANGE_PX);

  protected readonly extent = computed(() => {
    const table = this.tabletopService.currentTableVersion();
    return { width: Math.max(0, table.width * table.gridSize), height: Math.max(0, table.height * table.gridSize) };
  });

  /** The ways the other peers are drawing on the table in view, for pieces this reader can see. */
  private readonly sent = computed<string[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const table = this.tabletopService.currentTableVersion();
    const mine = PeerCursor.myCursor?.identifier;
    const ways: string[] = [];
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (cursor.identifier === mine) continue;
      if (!cursor.movingCharacterIdentifier || cursor.movingTableIdentifier !== table.identifier) continue;
      this.objectChange.versionOf(cursor.identifier)();
      if (!cursor.movingPoints) continue;
      const piece = this.objectStore.get<GameCharacter>(cursor.movingCharacterIdentifier);
      if (!(piece instanceof GameCharacter) || !this.vision.isTokenVisible(piece)) continue;
      ways.push(cursor.movingPoints);
    }
    return ways;
  });

  protected readonly model = computed(() => freePathOverlayModelOf(this.freePlan.plan(), this.sent()));
}
