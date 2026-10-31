import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** The keys that move along a toolbar, and where each goes from the button that has the focus. */
const MOVES: Readonly<Record<string, (at: number, count: number) => number>> = {
  ArrowRight: (at, count) => (at + 1) % count,
  ArrowLeft: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/**
 * A row of buttons that the Tab key passes in one step, as a toolbar is: one of its buttons takes
 * the focus from Tab, the last one used or else the first, and the arrow keys, Home and End move
 * along the rest. The buttons of a popover opened from the row are left to themselves, and the
 * buttons are read again as the row changes, so those that come later are taken in.
 */
@Directive({
  selector: '[uiRovingToolbar]',
  host: { '(keydown)': 'onKeyDown($event)', '(focusin)': 'onFocusIn($event)' },
})
export class RovingToolbarDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private current: HTMLElement | null = null;
  private observer: MutationObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.settle();
      this.observer = new MutationObserver(() => this.settle());
      this.observer.observe(this.host.nativeElement, { childList: true, subtree: true });
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  /** The buttons along the row, those of a popover opened from it left out. */
  private buttons(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('button')).filter(
      (button) => !button.closest('[popover]') && !(button as HTMLButtonElement).disabled
    );
  }

  /** Leaves one button for Tab to stop at, the one last used where it is still there. */
  private settle(): void {
    const buttons = this.buttons();
    if (!this.current || !buttons.includes(this.current)) this.current = buttons[0] ?? null;
    for (const button of buttons) {
      const tabIndex = button === this.current ? '0' : '-1';
      if (button.getAttribute('tabindex') !== tabIndex) button.setAttribute('tabindex', tabIndex);
    }
  }

  protected onFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target || !this.buttons().includes(target)) return;
    this.current = target;
    this.settle();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const move = MOVES[event.key];
    const buttons = this.buttons();
    const at = buttons.indexOf(event.target as HTMLElement);
    if (!move || at < 0) return;
    event.preventDefault();
    this.current = buttons[move(at, buttons.length)];
    this.settle();
    this.current.focus();
  }
}
