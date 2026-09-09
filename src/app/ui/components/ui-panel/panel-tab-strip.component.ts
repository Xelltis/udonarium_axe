import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The row of names along the top of a frame holding more than one panel.
 *
 * It draws names and nothing else: which panels a frame holds is the frame's business, and
 * the strip is told what to say and answers with what was pressed.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'panel-tab-strip',
  templateUrl: './panel-tab-strip.component.html',
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class PanelTabStripComponent {
  readonly tabs = input.required<readonly string[]>();
  readonly active = input.required<number>();
  /** How far down the strip sits, which is wherever the title bar leaves off. */
  readonly top = input('28px');

  readonly chose = output<number>();
  readonly closed = output<number>();
}
