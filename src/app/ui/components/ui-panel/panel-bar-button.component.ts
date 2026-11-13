import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * One button of a frame's title bar, drawn as every other there is.
 *
 * It is named for the pointer and the reader alike, says whether it is on where it is a switch,
 * and grows to a thumb's size on a narrow screen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'panel-bar-button',
  templateUrl: './panel-bar-button.component.html',
  host: { class: 'contents' },
  imports: [NgClass],
})
export class PanelBarButtonComponent {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  /** Whether it is drawn large enough for a thumb, as on a narrow screen. */
  readonly compact = input(false);
  /** Whether the switch it stands for is on; null for a button that is no switch. */
  readonly active = input<boolean | null>(null);
  readonly disabled = input(false);
  readonly testId = input<string | null>(null);

  readonly press = output<void>();
}
