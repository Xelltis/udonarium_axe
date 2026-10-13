import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Starts the animations of the element at the start of the page's own clock rather than when the
 * element was made.
 *
 * Water is drawn in pieces, and a piece made later than its neighbours, when a pond is widened or
 * a wall is laid in it, would move a beat apart from them: the net of light would break at the
 * join and the waves along a shore would come in out of step. Started together, every piece is at
 * the same point of the same movement.
 */
@Directive({ selector: '[appWaterPhase]' })
export class WaterPhaseDirective {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (typeof host.getAnimations !== 'function') return;
      for (const animation of host.getAnimations()) animation.startTime = 0;
    });
  }
}
