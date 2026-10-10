import { DestroyRef, inject, Injectable, signal } from '@angular/core';

const MIN_INSET_PX = 32;

@Injectable({ providedIn: 'root' })
export class KeyboardInsetService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _inset = signal(0);
  readonly inset = this._inset.asReadonly();

  private isWatching = false;

  /**
   * Starts following the visual viewport, so `inset` tracks how much an on-screen keyboard covers.
   *
   * Called once as the app comes up. Later calls, and browsers without a visual viewport, do
   * nothing. The listeners come off when the service is destroyed.
   */
  initialize(): void {
    if (this.isWatching) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    this.isWatching = true;

    const update = () => this._inset.set(measureKeyboardInset(viewport, window.innerHeight));
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();

    this.destroyRef.onDestroy(() => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      this.isWatching = false;
    });
  }
}

/**
 * How many pixels at the bottom of the layout viewport an on-screen keyboard is covering.
 *
 * A pinch-zoomed page shrinks the visual viewport too, so anything zoomed in answers zero. So does
 * a gap under 32px, which is too small to be a keyboard.
 */
export function measureKeyboardInset(
  viewport: { height: number; offsetTop: number; scale?: number },
  innerHeight: number
): number {
  if ((viewport.scale ?? 1) > 1.01) return 0;

  const hidden = Math.round(innerHeight - (viewport.height + viewport.offsetTop));
  return hidden < MIN_INSET_PX ? 0 : hidden;
}
