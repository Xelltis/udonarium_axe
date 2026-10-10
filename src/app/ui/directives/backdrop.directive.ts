import { DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';
import { BackdropFrameService, BackdropPlacement } from '@axe/application/ui/backdrop-frame.service';

/**
 * Keeps a backdrop moved for the way the camera stands.
 *
 * The element's transform is written by the frame that moves the table rather than by change
 * detection, so a camera being turned or moved wakes nothing on the page. The bound function says
 * where the backdrop stands for a camera; a new function replaces the old one at once.
 */
@Directive({
  selector: '[appBackdrop]',
})
export class BackdropDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly frame = inject(BackdropFrameService);

  readonly appBackdrop = input.required<BackdropPlacement>();

  private release: (() => void) | null = null;

  constructor() {
    effect(() => {
      const place = this.appBackdrop();
      this.release?.();
      this.release = this.frame.register(this.element.nativeElement, place);
    });
    inject(DestroyRef).onDestroy(() => this.release?.());
  }
}
