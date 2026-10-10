import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { DiceTrayFrameComponent } from '@axe/ui/components/dice-roll-stage/dice-tray-frame.component';

/**
 * How a roll's frames are laid out: one under another in the width given, as in the chat log, or
 * two to a row on a stage of their own size, as in novel mode, where they have to fit the screen.
 */
export type DiceStageLayout = 'column' | 'grid';

/**
 * The dice of a chat roll under the line that answered it: tumbling for a roll just made, laid down
 * showing their numbers for one made before. A roll of more dice than one tray holds shows a frame
 * for each of its trays.
 */
@Component({
  selector: 'dice-roll-stage',
  templateUrl: './dice-roll-stage.component.html',
  imports: [DiceTrayFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class DiceRollStageComponent {
  /** The dice bot's answer whose dice are shown. */
  readonly messageIdentifier = input.required<string>();
  readonly layout = input<DiceStageLayout>('column');

  private readonly throws = inject(DiceThrowService);

  protected readonly frames = computed(() => this.throws.framesOf(this.messageIdentifier()));
}
