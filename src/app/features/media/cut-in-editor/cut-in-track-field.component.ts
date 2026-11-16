import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * One row of the layer's properties for a value a track may move: its label, the field the value is
 * typed or slid in, and the diamond that puts a key down at the scrubber or takes it up.
 *
 * The three are laid straight into the grid the row stands in, so they line up with the rows that
 * have no track.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-track-field',
  templateUrl: './cut-in-track-field.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class CutInTrackFieldComponent {
  /** The words beside the field. */
  readonly label = input.required<string>();
  /** The field's name in the form. */
  readonly name = input.required<string>();
  /** The value at the scrubber, written as the field is typed or slid in. */
  readonly value = model.required<number>();
  /** The least the field offers, or null for no bound. */
  readonly min = input<number | null>(null);
  /** The most the field offers, or null for no bound. */
  readonly max = input<number | null>(null);
  /** Whether the value is slid along a bar rather than typed. */
  readonly slider = input(false);
  /** Whether a key stands at the scrubber, which lights the diamond. */
  readonly keyed = input(false);
  /** Whether the field and the diamond take changes. */
  readonly editable = input(false);
  /** Asks for the key at the scrubber to be put down or taken up. */
  readonly keyToggled = output<void>();
}
