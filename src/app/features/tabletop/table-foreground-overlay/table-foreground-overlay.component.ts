import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  FOREGROUND_SEE_THROUGH_OPACITY,
  ForegroundSeeThroughService,
} from '@axe/application/ui/foreground-see-through.service';
import { tableForegroundOf } from '@axe/domain/tabletop/table-foreground';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/**
 * The picture the table being shown lays over the whole view, in front of the board and
 * everything on it, such as a window frame, mist on glass or a scene's picture. A click goes
 * through it to the board, and it is drawn outside the board, however the board is drawn.
 */
@Component({
  selector: 'table-foreground-overlay',
  templateUrl: './table-foreground-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // No stacking order of its own, as with the weather: with one it would come in front of the panels.
    class: 'pointer-events-none absolute inset-0 overflow-hidden',
  },
  imports: [SafePipe],
})
export class TableForegroundOverlayComponent {
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageService = inject(ImageService);
  private readonly seeThrough = inject(ForegroundSeeThroughService);

  /** The picture to lay, as drawn here, or null for none or one not yet held. */
  protected readonly shown = computed(() => {
    const foreground = tableForegroundOf(this.tabletop.currentTableVersion());
    if (!foreground) return null;
    this.objectChange.fileVersion();
    const image = this.imageService.getEmptyOr(foreground.imageIdentifier);
    if (image.isEmpty) return null;
    const opacity = foreground.opacity * (this.seeThrough.active() ? FOREGROUND_SEE_THROUGH_OPACITY : 1);
    return { url: image.url, opacity, fit: foreground.fit };
  });
}
