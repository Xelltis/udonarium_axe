export interface DragPoint {
  x: number;
  y: number;
}

/** How far a press must travel before it is a drag rather than a press that wandered. */
export const DRAG_THRESHOLD_PX = 6;

/**
 * A press on a slot on its way to becoming a drag.
 *
 * A press that goes nowhere is a press, so nothing is lifted until the pointer has travelled
 * far enough to mean it. Letting go after that is a drop rather than a press, and the click
 * the browser sends afterwards belongs to the drag, not to the slot underneath.
 */
export class HotbarSlotDrag {
  private from: number | null = null;
  private start: DragPoint = { x: 0, y: 0 };
  private lifted = false;
  private dropped = false;

  /** Which slot is being carried, or null while a press has not travelled far enough. */
  get carrying(): number | null {
    return this.lifted ? this.from : null;
  }

  /** A press on nothing to carry still begins a press, and forgets the drag before it. */
  press(slotIndex: number | null, at: DragPoint): void {
    this.from = slotIndex;
    this.start = at;
    this.lifted = false;
    this.dropped = false;
  }

  /** The browser took the gesture away, so nothing was carried and nothing was dropped. */
  cancel(): void {
    this.from = null;
    this.lifted = false;
    this.dropped = false;
  }

  /**
   * Follows the pointer during a press, and says whether a slot is being carried.
   *
   * The press becomes a drag once it has travelled far enough, and stays one until it is let go. A
   * press on nothing to carry never does.
   */
  move(at: DragPoint): boolean {
    if (this.from === null || this.lifted) return this.lifted;

    const travelled = Math.abs(at.x - this.start.x) + Math.abs(at.y - this.start.y);
    if (travelled >= DRAG_THRESHOLD_PX) this.lifted = true;
    return this.lifted;
  }

  /** The slot let go of, where a drag was under way. Null for a press that never became one. */
  release(): number | null {
    const from = this.lifted ? this.from : null;
    this.from = null;
    this.lifted = false;
    this.dropped = from !== null;
    return from;
  }

  /**
   * Whether the click that follows belongs to a drag just finished.
   *
   * The answer is given once. A drag let go of outside the bar sends no click at all, and
   * the next press begins by saying so, so an unanswered drop cannot swallow it.
   */
  takeDrop(): boolean {
    const dropped = this.dropped;
    this.dropped = false;
    return dropped;
  }
}
