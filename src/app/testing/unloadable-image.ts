/**
 * An image whose load fails the moment it is given a source.
 *
 * happy-dom never loads a picture, so code that waits on `load` or `error` sits out its whole
 * timeout before falling back. Failing at once sends it down the same fallback without the wait.
 */
class UnloadableImage {
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  /** Failing on the next microtask, as a broken picture would, once a source is set. */
  set src(_source: string) {
    queueMicrotask(() => this.onerror?.(new Event('error')));
  }
}

/**
 * Makes every `new Image()` in the running spec fail to load at once.
 *
 * Undo it with `vi.unstubAllGlobals()` after each test.
 */
export function stubUnloadableImages(): void {
  vi.stubGlobal('Image', UnloadableImage);
}
