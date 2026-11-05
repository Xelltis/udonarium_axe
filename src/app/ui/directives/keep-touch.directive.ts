import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Keeps a touch that starts on the element from reaching what holds it, as a touch inside an editor
 * is kept from the table behind it, where asked. The touch is heard without holding up the page's
 * scrolling, since it is only stopped from going further and never cancelled.
 */
@Directive({ selector: '[appKeepTouch]' })
export class KeepTouchDirective {
  /** Whether a touch starting here is kept here; it is unless set otherwise. */
  readonly keep = input(true, { alias: 'appKeepTouch', transform: (value: boolean | '') => value !== false });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const keep = (event: Event) => {
      if (this.keep()) event.stopPropagation();
    };
    element.addEventListener('touchstart', keep, { passive: true });
    inject(DestroyRef).onDestroy(() => element.removeEventListener('touchstart', keep));
  }
}
