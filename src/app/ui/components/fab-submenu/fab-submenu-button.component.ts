import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * One button in a menu opened beside the drawer.
 *
 * It is named the way the drawer names its own items: in a bubble beside it that shows at once on
 * hover or focus, and turns to whichever side the drawer writes its names on. The browser's own
 * tooltip, which only shows after a wait, is not used.
 */
@Component({
  selector: 'ui-fab-submenu-button',
  templateUrl: './fab-submenu-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class UiFabSubmenuButtonComponent {
  /** The icon shown; left out when a short text is written instead. */
  readonly icon = input<string | null>(null);
  /** A few letters written in place of an icon. */
  readonly text = input<string | null>(null);
  readonly label = input.required<string>();
  /** Whether something the button shows or hides is out; left unsaid when null. */
  readonly lit = input<boolean | null>(null);
  readonly disabled = input(false);
  readonly testId = input<string | null>(null);

  readonly press = output<MouseEvent>();
}
