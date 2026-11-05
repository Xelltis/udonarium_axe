import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CardTargetService, TargetArrow } from '@axe/application/card/card-target.service';
import { type FloorMark, floorMarkLayersOf, type FloorPoint, layFloorMarks } from '@axe/ui/tabletop/floor-marks';

const ARROW_COLOR = 'rgba(255, 86, 86, 0.85)';
const SHAFT_THICKNESS = 6;
const HEAD_LENGTH = 26;
const HEAD_THICKNESS = 20;
const ARROW_LIFT = 4;

/**
 * The marks an arrow from a piece to its target is drawn with on the floor: a shaft, and a head at
 * the target's end.
 */
export function targetArrowMarksOf(arrow: TargetArrow): FloorMark[] {
  const turn = (arrow.angle * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const at = (along: number, across: number): FloorPoint => ({
    x: arrow.x + cos * along - sin * across,
    y: arrow.y + sin * along + cos * across,
  });
  const shaft = Math.max(arrow.length - HEAD_LENGTH, 1);
  return [
    {
      kind: 'line',
      points: [at(0, 0), at(shaft, 0)],
      stroke: { colour: ARROW_COLOR, widthPx: SHAFT_THICKNESS },
    },
    {
      kind: 'line',
      closed: true,
      points: [at(shaft, -HEAD_THICKNESS / 2), at(shaft + HEAD_LENGTH, 0), at(shaft, HEAD_THICKNESS / 2)],
      fill: { colour: ARROW_COLOR },
    },
  ];
}

/**
 * Draws an arrow from each piece to its target on the floor, at the height of the higher of the two,
 * over the ground's rise and fall. What is drawn is listed on the page as well, unseen.
 */
@Component({
  selector: 'table-target-overlay',
  templateUrl: './table-target-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableTargetOverlayComponent {
  private readonly cardTargetService = inject(CardTargetService);

  readonly arrows = computed<TargetArrow[]>(() => this.cardTargetService.arrows());

  constructor() {
    layFloorMarks('target-arrows', () =>
      floorMarkLayersOf(
        this.arrows().map((arrow) => ({ heightPx: arrow.z + ARROW_LIFT, marks: targetArrowMarksOf(arrow) }))
      )
    );
  }

  /** Where an arrow ends, at its target. */
  protected tipOf(arrow: TargetArrow): FloorPoint {
    const turn = (arrow.angle * Math.PI) / 180;
    return { x: arrow.x + Math.cos(turn) * arrow.length, y: arrow.y + Math.sin(turn) * arrow.length };
  }
}
