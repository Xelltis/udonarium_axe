import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { HEADING_ICON_GROUPS } from '@axe/features/data-element/game-data-element/data-element-icons';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The button by a group or section heading that shows its icon, and the grid of icons it opens to
 * choose another from or take the icon away.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'heading-icon-picker',
  templateUrl: './heading-icon-picker.component.html',
  host: { class: 'elm-icon-picker relative shrink-0' },
  imports: [TranslocoModule],
})
export class HeadingIconPickerComponent {
  private readonly t = inject(TRANSLATE_FN);

  /** The icon the heading shows, empty for none. */
  readonly icon = input('');

  /** Whether the grid is open, which the heading lifts itself over the rows below it for. */
  readonly open = model(false);

  /** The icon chosen, or empty where the icon is taken away. */
  readonly picked = output<string>();

  /** The icons on offer, in their groups, each group under its name in the reader's language. */
  readonly iconGroups = HEADING_ICON_GROUPS.map((group) => ({ label: this.t(group.labelKey), icons: group.icons }));

  /** Chooses an icon, or none for empty, and closes the grid. */
  select(name: string): void {
    this.picked.emit(name);
    this.open.set(false);
  }
}
