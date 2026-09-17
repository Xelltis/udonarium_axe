import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'ui-icon-button',
  templateUrl: './icon-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class UiIconButtonComponent {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly active = input(false);
  readonly dim = input(false);
  readonly faded = input(false);
  readonly testId = input<string | null>(null);

  readonly press = output<MouseEvent>();
}
