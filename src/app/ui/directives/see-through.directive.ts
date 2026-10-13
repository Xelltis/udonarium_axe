import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { SeeThroughService } from '@axe/application/ui/see-through.service';

/**
 * Lets a press on the clear parts of a picture land on whatever is beneath it.
 *
 * A mouse or pen moving over the picture with no button held opens it wherever it is clear under
 * the pointer; {@link SeeThroughService} closes it again and hands touches on.
 */
@Directive({
  selector: 'img[appSeeThrough]',
})
export class SeeThroughDirective {
  constructor() {
    const picture = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
    const seeThrough = inject(SeeThroughService);
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0 || event.pointerType === 'touch') return;
      seeThrough.hover(picture, event.offsetX, event.offsetY);
    };
    seeThrough.watch(picture);
    picture.addEventListener('pointermove', onPointerMove, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      picture.removeEventListener('pointermove', onPointerMove);
      seeThrough.unwatch(picture);
    });
  }
}
