/** The inputs that say somebody is at the page. */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * When somebody last used the page, by the pointer, the keys, the wheel or touch, so that a room
 * server can tell a page left open from one in use. The page being opened counts as a use.
 */
export class PageActivity {
  private lastAt: number;
  private watching = false;
  private readonly listeners = new Set<(at: number) => void>();

  constructor(private readonly now: () => number = () => Date.now()) {
    this.lastAt = now();
  }

  /** When the page was last used, in Unix milliseconds. */
  get lastInputAt(): number {
    return this.lastAt;
  }

  /** Starts listening for inputs on the window, once; without a window, nothing is heard. */
  watch(): void {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    const noted = () => this.noteInput();
    for (const type of INPUT_EVENTS) window.addEventListener(type, noted, { capture: true, passive: true });
  }

  /** Takes the page as used just now, and tells whoever listens. */
  noteInput(): void {
    this.lastAt = this.now();
    for (const listener of [...this.listeners]) listener(this.lastAt);
  }

  /** Hears each use of the page until the returned function is called. */
  onInput(listener: (at: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** The page's own record of its use. */
export const pageActivity = new PageActivity();
