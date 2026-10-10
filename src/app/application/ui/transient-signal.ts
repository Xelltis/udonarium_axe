import { DestroyRef, inject, Signal, signal } from '@angular/core';

export interface TransientSignal<T> extends Signal<T> {
  show(value: T, holdMs?: number): void;
  clear(): void;
}

/**
 * A read-only signal that `show` sets for a while before it drops back to its resting value.
 *
 * Showing again restarts the hold, and `clear` goes back to rest at once. The timer is cancelled
 * when the injection context it was made in is destroyed, so it has to be called inside one.
 */
export function transientSignal<T>(resting: T, holdMs: number): TransientSignal<T> {
  const inner = signal<T>(resting);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const show = (value: T, ms = holdMs) => {
    cancel();
    inner.set(value);
    timer = setTimeout(() => {
      timer = null;
      inner.set(resting);
    }, ms);
  };

  const clear = () => {
    cancel();
    inner.set(resting);
  };

  inject(DestroyRef).onDestroy(cancel);
  return Object.assign(inner.asReadonly(), { show, clear });
}
