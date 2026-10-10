import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * One volume slider: a button that turns the sound off and on, its name with an optional line
 * saying what it covers, and the slider itself.
 *
 * It only shows what it is given and reports what the listener does; whoever holds it keeps the
 * value. A sound turned off keeps its slider where it was, dimmed, to come back at that level.
 */
@Component({
  selector: 'ui-volume-row',
  templateUrl: './volume-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'block' },
})
export class UiVolumeRowComponent {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  /** A short line under the name saying which sounds the slider covers; none when empty. */
  readonly hint = input('');
  /** The volume, from 0 to `max`. */
  readonly value = input.required<number>();
  readonly max = input(1);
  readonly muted = input(false);
  /** Whether the slider and the button cannot be used, as for a volume the listener may not change. */
  readonly disabled = input(false);
  /** Whether the row offers to turn the sound off at all; a volume shared with the room does not. */
  readonly canMute = input(true);
  /** The name of the slider's input, by which forms and tests find it. */
  readonly name = input.required<string>();
  /** The classes of the column holding the name, which sets how wide it is. */
  readonly labelClass = input('w-12 text-right');

  /** The volume the slider was moved to, sent as it moves. */
  readonly valueChange = output<number>();
  /** Whether the listener asked for the sound to be off. */
  readonly mutedChange = output<boolean>();

  protected onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).valueAsNumber);
  }
}
