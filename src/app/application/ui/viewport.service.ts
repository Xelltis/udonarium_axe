import { computed, DestroyRef, inject, Injectable, signal, WritableSignal } from '@angular/core';

export const COMPACT_VIEWPORT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
export const TOUCH_POINTER_QUERY = '(pointer: coarse)';
export const FINE_POINTER_QUERY = '(any-pointer: fine)';
export const HOVER_QUERY = '(hover: hover)';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _isCompact = signal(matchQuery(COMPACT_VIEWPORT_QUERY));
  private readonly _isTouch = signal(matchQuery(TOUCH_POINTER_QUERY));
  private readonly _hasFinePointer = signal(matchQuery(FINE_POINTER_QUERY));
  private readonly _canHover = signal(matchQuery(HOVER_QUERY));
  private readonly _sawMouse = signal(false);

  readonly isCompact = this._isCompact.asReadonly();
  readonly isTouch = this._isTouch.asReadonly();

  /**
   * Whether any pointer can point finely, such as a mouse or a touchpad.
   *
   * A PC with a touch screen may count its finger as the main pointer and so be `isTouch`, while
   * it still has a mouse or a touchpad beside it; this tells it from a phone or a tablet. Some such
   * PCs do not tell the browser about the mouse at all, so a mouse seen moving counts too.
   */
  readonly hasFinePointer = computed(() => this._hasFinePointer() || this._sawMouse());

  /**
   * Whether the main pointer can pass over things without pressing them, as a mouse or a touchpad
   * can and a finger cannot: what the styles that bring things out on hover ask of the screen.
   */
  readonly canHover = this._canHover.asReadonly();

  /** Whether a finger is all there is to point with, as on a phone or a tablet with nothing beside it. */
  readonly touchOnly = computed(() => this._isTouch() && !this.hasFinePointer());

  constructor() {
    this.watch(COMPACT_VIEWPORT_QUERY, this._isCompact);
    this.watch(TOUCH_POINTER_QUERY, this._isTouch);
    this.watch(FINE_POINTER_QUERY, this._hasFinePointer);
    this.watch(HOVER_QUERY, this._canHover);
    this.watchForMouse();
  }

  private watchForMouse(): void {
    const options = { capture: true, passive: true };
    const stop = () => {
      window.removeEventListener('pointermove', seen, options);
      window.removeEventListener('pointerdown', seen, options);
    };
    const seen = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      this._sawMouse.set(true);
      stop();
    };
    window.addEventListener('pointermove', seen, options);
    window.addEventListener('pointerdown', seen, options);
    this.destroyRef.onDestroy(stop);
  }

  private watch(query: string, target: WritableSignal<boolean>): void {
    const mql = window.matchMedia?.(query);
    if (!mql) return;

    const listener = (event: MediaQueryListEvent) => target.set(event.matches);
    mql.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => mql.removeEventListener('change', listener));
  }
}

function matchQuery(query: string): boolean {
  return window.matchMedia?.(query).matches ?? false;
}
