import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PaintedMat } from '@axe/application/ui/skin.service';
import { feltWeave } from '@axe/ui/components/dice-roll-stage/felt-weave';

/**
 * The mat dice land on, filling the element it is put in: its colour woven as felt, its picture
 * laid over that if it has one, and the light of the studio the dice are drawn in falling across
 * it, brighter to the upper left and darker toward the edges.
 */
@Component({
  selector: 'dice-mat',
  templateUrl: './dice-mat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class DiceMatComponent {
  readonly mat = input.required<PaintedMat>();

  protected readonly weave = feltWeave();
}
