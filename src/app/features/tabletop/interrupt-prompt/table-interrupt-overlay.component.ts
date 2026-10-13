import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MoveInterruptService } from '@axe/application/tabletop/move-interrupt.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { spanPath } from '@axe/domain/tabletop/zone/interrupt';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/**
 * Lights the stretches of a declared move's way that the pieces chosen to step in reach, and marks
 * the point along it they would step in at.
 */
@Component({
  selector: 'table-interrupt-overlay',
  templateUrl: './table-interrupt-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableInterruptOverlayComponent {
  private readonly interrupts = inject(MoveInterruptService);
  private readonly tabletopService = inject(TabletopService);

  protected readonly zTransform = translateZCss(Z_OFFSET_RANGE_PX);

  protected readonly extent = computed(() => {
    const table = this.tabletopService.currentTableVersion();
    return { width: Math.max(0, table.width * table.gridSize), height: Math.max(0, table.height * table.gridSize) };
  });

  protected readonly model = computed(() => {
    const offer = this.interrupts.offer();
    const choice = this.interrupts.choice();
    if (!offer || !choice) return null;
    return {
      lit: choice.spans.map((span) =>
        spanPath(offer.path, span)
          .map((point) => `${point.x},${point.y}`)
          .join(' ')
      ),
      point: choice.point,
    };
  });
}
