import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MoveInterruptService } from '@axe/application/tabletop/move-interrupt.service';
import { spanPath } from '@axe/domain/tabletop/zone/interrupt';
import { type FloorMark, layFloorMarks } from '@axe/ui/tabletop/floor-marks';
import { Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/** The colour a stretch of a way within reach of the pieces stepping in is lit in, and their point marked in. */
const INTERRUPT_COLOUR = '#f97316';

/**
 * Lights the stretches of a declared move's way that the pieces chosen to step in reach, and marks
 * the point along it they would step in at, on the floor over the ground's rise and fall. What is
 * drawn is listed on the page as well, unseen.
 */
@Component({
  selector: 'table-interrupt-overlay',
  templateUrl: './table-interrupt-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableInterruptOverlayComponent {
  private readonly interrupts = inject(MoveInterruptService);

  protected readonly model = computed(() => {
    const offer = this.interrupts.offer();
    const choice = this.interrupts.choice();
    if (!offer || !choice) return null;
    return {
      lit: choice.spans.map((span) => {
        const points = spanPath(offer.path, span);
        return { points, text: points.map((point) => `${point.x},${point.y}`).join(' ') };
      }),
      point: choice.point,
    };
  });

  constructor() {
    layFloorMarks('interrupts', () => {
      const model = this.model();
      if (!model) return [];
      const marks: FloorMark[] = model.lit.map((lit) => ({
        kind: 'line',
        points: lit.points,
        stroke: { colour: INTERRUPT_COLOUR, widthPx: 8, opacity: 0.75, round: true },
      }));
      if (model.point) {
        marks.push({
          kind: 'circle',
          x: model.point.x,
          y: model.point.y,
          r: 10,
          fill: { colour: INTERRUPT_COLOUR },
          stroke: { colour: '#ffffff', widthPx: 3 },
        });
      }
      return [{ heightPx: Z_OFFSET_RANGE_PX, marks }];
    });
  }
}
