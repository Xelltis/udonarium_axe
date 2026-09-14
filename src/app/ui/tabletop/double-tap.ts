/** How long to wait for a second tap, in ms. A finger aims less precisely, so it gets longer. */
const MOUSE_WINDOW_MS = 300;
const TOUCH_WINDOW_MS = 500;
/** How far apart two taps can be and still count as the same place, in px. */
const SLOP_PX = 10;

interface PointerInput {
  pointer: { x: number; y: number };
  onEnd: ((event: MouseEvent | TouchEvent) => void) | null;
}

/**
 * Recognises a piece on the board being tapped twice.
 *
 * With a finger, the second tap acts on release. Acting on the press would turn a finger
 * meant to flip a card into a drag.
 */
export class DoubleTap {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPoint = { x: 0, y: 0 };

  constructor(private readonly inputOf: () => PointerInput | null) {}

  /** Remembers the first tap; calls `run` on the second. */
  handle(event: MouseEvent | TouchEvent, run: () => void): void {
    const input = this.inputOf();
    if (!input) return;

    if (!this.timer) {
      this.cancel();
      this.timer = setTimeout(() => this.cancel(), isTouch(event) ? TOUCH_WINDOW_MS : MOUSE_WINDOW_MS);
      this.firstPoint = input.pointer;
      return;
    }

    if (isTouch(event)) input.onEnd = () => run();
    else run();
  }

  /** Whether the second tap landed where the first did. Far apart means a different target. */
  isInPlace(): boolean {
    const input = this.inputOf();
    if (!input) return false;
    const dx = this.firstPoint.x - input.pointer.x;
    const dy = this.firstPoint.y - input.pointer.y;
    return dx * dx + dy * dy < SLOP_PX * SLOP_PX;
  }

  /** Forgets the first tap and drops any action waiting for a finger to lift. */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const input = this.inputOf();
    if (input) input.onEnd = null;
  }
}

function isTouch(event: MouseEvent | TouchEvent): boolean {
  return (event as TouchEvent).touches != null;
}
