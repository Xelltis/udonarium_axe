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
import { searchIconNames } from '@axe/domain/ui/icon-font';
import { AnchoredPopover } from '@axe/ui/anchored-popover';
import { TranslocoModule } from '@jsverse/transloco';

const LIST_WIDTH = 296;
const LIST_MIN_HEIGHT = 200;

/**
 * Choosing a mark from the ones the bundled font can draw.
 *
 * The names run into the thousands, so nothing is offered until something is typed; before that
 * the caller's own marks stand in, which are the ones somebody is most likely to want. Typing
 * searches the whole catalogue.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-icon-picker',
  templateUrl: './icon-picker.component.html',
  host: { class: 'flex shrink-0' },
  imports: [FormsModule, TranslocoModule],
})
export class IconPickerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly popoverRef = viewChild.required<ElementRef<HTMLElement>>('popover');
  private readonly searchRef = viewChild<ElementRef<HTMLInputElement>>('search');

  /** The mark as it stands, drawn on the button that opens the list. */
  readonly value = input('');

  /** The marks to offer before anything is typed, which the caller picks for being close to hand. */
  readonly suggested = input<readonly string[]>([]);

  /** Whether the list also offers to take the mark away, leaving whatever the caller falls back on. */
  readonly clearable = input(false);

  /** The mark that was chosen, or the empty name where it was taken away. */
  readonly picked = output<string>();

  private readonly list = new AnchoredPopover(
    () => this.host.nativeElement,
    () => this.popoverRef().nativeElement,
    { width: LIST_WIDTH, minHeight: LIST_MIN_HEIGHT, align: 'start' }
  );

  protected readonly isOpen = this.list.isOpen;
  protected readonly query = signal('');

  /** What the list shows: the search where something is typed, the caller's own marks before that. */
  protected readonly matches = computed<readonly string[]>(() => {
    const asked = this.query().trim();
    return asked.length > 0 ? searchIconNames(asked) : this.suggested();
  });

  /** Whether the list stands empty because nothing answers, rather than because nothing was typed. */
  protected readonly foundNothing = computed(() => this.query().trim().length > 0 && this.matches().length < 1);

  constructor() {
    this.destroyRef.onDestroy(() => this.list.destroy());
  }

  /** Chooses a mark and closes the list. */
  protected pick(name: string): void {
    this.close();
    this.picked.emit(name);
  }

  /**
   * Opens the list of marks, or closes it if it is open.
   *
   * The search starts empty each time, so the list opens on the marks close to hand rather than on
   * whatever was last hunted for.
   */
  protected toggle(): void {
    this.query.set('');
    if (this.list.toggle()) this.searchRef()?.nativeElement.focus();
  }

  /** Hides the list; nothing when it is already closed. */
  protected close(): void {
    this.list.close();
  }
}
