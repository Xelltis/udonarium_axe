import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WIDGET_ROOM_RESTORE } from '@axe/application/ui/widget-place';
import { RoomRestoreOfferService } from '@axe/features/room-archive/room-restore-banner/room-restore-offer.service';
import { formatSnapshotSavedAt } from '@axe/features/room-archive/snapshot-format';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

const TOP_MARGIN = 12;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-restore-banner',
  templateUrl: './room-restore-banner.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, NgClass, TranslocoModule],
})
export class RoomRestoreBannerComponent {
  private readonly roomSnapshot = inject(RoomSnapshotService);
  private readonly offer = inject(RoomRestoreOfferService);
  protected readonly widgetName = WIDGET_ROOM_RESTORE;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, (window.innerWidth - el.offsetWidth) / 2),
    top: TOP_MARGIN,
  });
  protected readonly isCompact = inject(ViewportService).isCompact;

  protected readonly latest = this.offer.latest;

  protected readonly savedAtLabel = computed(() => {
    const latest = this.latest();
    return latest ? formatSnapshotSavedAt(latest.savedAt) : '';
  });

  protected readonly visible = this.offer.visible;

  protected readonly isRestoring = this.roomSnapshot.isRestoring;

  constructor() {
    void this.roomSnapshot.refresh();
  }

  protected async restore(): Promise<void> {
    const latest = this.latest();
    if (!latest) return;
    const isRestored = await this.roomSnapshot.restore(latest.id);
    if (isRestored) this.offer.dismiss();
  }

  protected dismiss(): void {
    this.offer.dismiss();
  }
}
