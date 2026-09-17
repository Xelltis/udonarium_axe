import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';

/**
 * A small menu opened beside the drawer from one of its items, holding a column of buttons.
 *
 * A press anywhere outside it, or Escape, asks for it to be closed. A press on an item of the
 * drawer that opens a menu of its own is left to that item, which marks itself with
 * `data-fab-submenu-toggle`, so that pressing it again closes the menu and pressing another
 * trades one menu for the other.
 */
@Component({
  selector: 'ui-fab-submenu',
  templateUrl: './fab-submenu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class UiFabSubmenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** What the menu is, for assistive technology. */
  readonly label = input.required<string>();
  readonly testId = input<string | null>(null);

  /** Asks whoever opened it to close it. */
  readonly closed = output<void>();

  protected onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.host.contains(target)) return;
    if (target instanceof Element && target.closest('[data-fab-submenu-toggle]')) return;
    this.closed.emit();
  }
}
