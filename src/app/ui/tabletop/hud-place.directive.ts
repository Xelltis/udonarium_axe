import { DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';
import { HudAnchor, HudFrameService } from '@axe/application/tabletop/hud-frame.service';

/**
 * Puts an element of the screen over a table drawn on a canvas where the piece it goes with is
 * drawn, against the whole piece or a part of it. The element is laid at the top left corner of
 * what it lies in, and moved from there.
 */
@Directive({
  selector: '[appHudPlace]',
  host: {
    '[style.position]': "'absolute'",
    '[style.left.px]': '0',
    '[style.top.px]': '0',
    '[style.transform-origin]': "'0 0'",
  },
})
export class HudPlaceDirective {
  readonly anchor = input.required<HudAnchor>({ alias: 'appHudPlace' });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const frame = inject(HudFrameService);
    let stop: (() => void) | null = null;
    effect(() => {
      const anchor = this.anchor();
      stop?.();
      stop = frame.place(element, anchor);
    });
    inject(DestroyRef).onDestroy(() => stop?.());
  }
}
