import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

/** Something a picker offers: what is written when it is picked, and what it is listed as. */
export interface SwitchChoice {
  value: string;
  name: string;
}

/**
 * One picker of the list of things a switch does, drawn onto the `<select>` it is written on.
 *
 * It offers a blank where it is given a label for one, then keys listed under their translations,
 * then choices listed under their names. A value nothing on offer goes by stays listed where the
 * picker is told what to call it, so opening the list does not quietly swap it for something else.
 */
@Component({
  selector: 'select[switchChoice]',
  templateUrl: './switch-choice-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: {
    class:
      'border-ui-border-panel bg-ui-elevated text-ui-text min-w-0 rounded-[3px] border border-solid px-1.5 py-0.5 text-[12px]',
    '(change)': 'picked.emit($any($event.target).value)',
  },
})
export class SwitchChoiceSelectComponent {
  /** What is picked now; empty for nothing. */
  readonly value = input.required<string>();
  /** The things on offer that have names of their own. */
  readonly choices = input<readonly SwitchChoice[]>([]);
  /** The things on offer that are listed under a translation, found by the prefix and the key. */
  readonly keys = input<readonly string[]>([]);
  /** What comes before a key in the name of its translation. */
  readonly keyLabelPrefix = input('');
  /** What the blank at the top reads; no blank is offered without it. */
  readonly blankLabel = input<string | null>(null);
  /**
   * What to call the picked value where nothing on offer goes by it; it is listed then as missing
   * from the room. Left null, such a value is not listed.
   */
  readonly missingName = input<string | null>(null);
  /** The value picked by the user. */
  readonly picked = output<string>();

  /** The picked value and what to call it, where it has to be listed as missing. */
  protected readonly missing = computed<SwitchChoice | null>(() => {
    const name = this.missingName();
    const value = this.value().trim();
    if (name === null || value.length < 1) return null;
    if (this.keys().includes(value) || this.choices().some((choice) => choice.value === value)) return null;
    return { value, name };
  });
}
