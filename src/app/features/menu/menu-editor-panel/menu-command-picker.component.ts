import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { MenuCommand } from '@axe/domain/ui/menu-command';
import { AnchoredPopover } from '@axe/ui/anchored-popover';
import { TranslocoModule } from '@jsverse/transloco';

const LIST_WIDTH = 320;
const LIST_MIN_HEIGHT = 220;

/**
 * Choosing something to put on a menu.
 *
 * The list stays open as one is chosen and the chosen one leaves it, since a menu is usually built
 * several entries at a time and shutting the list between each would make that a chore.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'menu-command-picker',
  templateUrl: './menu-command-picker.component.html',
  host: { class: 'flex' },
  imports: [FormsModule, TranslocoModule],
})
export class MenuCommandPickerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  private readonly popoverRef = viewChild.required<ElementRef<HTMLElement>>('popover');
  private readonly searchRef = viewChild<ElementRef<HTMLInputElement>>('search');

  /** What this seat may still put on the menu, in the order the command table names them. */
  readonly commands = input<readonly MenuCommand[]>([]);

  /** The command that was chosen, by key. */
  readonly picked = output<string>();

  private readonly list = new AnchoredPopover(
    () => this.host.nativeElement,
    () => this.popoverRef().nativeElement,
    { width: LIST_WIDTH, minHeight: LIST_MIN_HEIGHT, align: 'start' }
  );

  protected readonly isOpen = this.list.isOpen;
  protected readonly query = signal('');

  /** Those whose name or key answers to what was typed, or all of them before anything is. */
  protected readonly matches = computed<readonly MenuCommand[]>(() => {
    const asked = this.query().trim().toLowerCase();
    if (asked.length < 1) return this.commands();
    return this.commands().filter(
      (command) => this.t(command.labelKey).toLowerCase().includes(asked) || command.key.toLowerCase().includes(asked)
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.list.destroy());
  }

  protected labelOf(command: MenuCommand): string {
    return this.t(command.labelKey);
  }

  protected toggle(): void {
    this.query.set('');
    if (this.list.toggle()) this.searchRef()?.nativeElement.focus();
  }

  protected choose(command: MenuCommand): void {
    this.picked.emit(command.key);
  }
}
