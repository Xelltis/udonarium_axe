import { DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';
import { BillboardFacing, BillboardFrameService } from '@axe/application/ui/billboard-frame.service';

/**
 * Keeps an element turned towards the camera.
 *
 * The element's transform is written by the frame that turns the table rather than by change
 * detection, so a camera that is being turned does not wake every piece on the table. The bound
 * function says where the element faces at a given turn; a new function replaces the old one at
 * once, faced the way the table stands.
 */
@Directive({
  selector: '[appBillboard]',
})
export class BillboardDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly frame = inject(BillboardFrameService);

  readonly appBillboard = input.required<BillboardFacing>();

  private release: (() => void) | null = null;

  constructor() {
    effect(() => {
      const facing = this.appBillboard();
      this.release?.();
      this.release = this.frame.register(this.element.nativeElement, facing);
    });
    inject(DestroyRef).onDestroy(() => this.release?.());
  }
}
