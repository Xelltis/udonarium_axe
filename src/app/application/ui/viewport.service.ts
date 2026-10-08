import { DestroyRef, inject, Injectable, signal, WritableSignal } from '@angular/core';

export const COMPACT_VIEWPORT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
export const TOUCH_POINTER_QUERY = '(pointer: coarse)';
export const FINE_POINTER_QUERY = '(any-pointer: fine)';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _isCompact = signal(matchQuery(COMPACT_VIEWPORT_QUERY));
  private readonly _isTouch = signal(matchQuery(TOUCH_POINTER_QUERY));
  private readonly _hasFinePointer = signal(matchQuery(FINE_POINTER_QUERY));

  readonly isCompact = this._isCompact.asReadonly();
  readonly isTouch = this._isTouch.asReadonly();

  /**
   * Whether any pointer can point finely, such as a mouse or a touchpad.
   *
   * A PC with a touch screen may count its finger as the main pointer and so be `isTouch`, while
   * it still has a mouse or a touchpad beside it; this tells it from a phone or a tablet.
   */
  readonly hasFinePointer = this._hasFinePointer.asReadonly();

  constructor() {
    this.watch(COMPACT_VIEWPORT_QUERY, this._isCompact);
    this.watch(TOUCH_POINTER_QUERY, this._isTouch);
    this.watch(FINE_POINTER_QUERY, this._hasFinePointer);
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
