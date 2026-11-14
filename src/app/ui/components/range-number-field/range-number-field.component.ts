import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * A number set either by a slider or by typing it, the two side by side and showing the same
 * value. Either one writes the value as it changes.
 */
@Component({
  selector: 'ui-range-number-field',
  templateUrl: './range-number-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  host: { class: 'flex items-center gap-2' },
})
export class UiRangeNumberFieldComponent {
  /** The number both fields show and write. */
  readonly value = model.required<number>();
  /** The least the fields offer. */
  readonly min = input.required<number>();
  /** The most the fields offer. */
  readonly max = input.required<number>();
  /** The `name` the slider carries, for a spec to find it by. */
  readonly rangeName = input<string | null>(null);
  /** The `name` the typed field carries, for a spec to find it by. */
  readonly numberName = input<string | null>(null);
  /** Whether both fields refuse input. */
  readonly disabled = input(false);
}
