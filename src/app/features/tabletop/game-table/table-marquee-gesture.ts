export interface MarqueePoint {
  x: number;
  y: number;
}

export interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MarqueeModifiers {
  shift: boolean;
  ctrl: boolean;
  touch: boolean;
}

export type MarqueeStartHandler = (point: MarqueePoint, modifiers: MarqueeModifiers) => void;
export type MarqueeUpdateHandler = (point: MarqueePoint) => void;
export type MarqueeEndHandler = (rect: MarqueeRect, modifiers: MarqueeModifiers) => void;

type ScreenToTablePoint = (screenX: number, screenY: number) => MarqueePoint;

export const MARQUEE_MOUSE_LONG_PRESS_MS = 350;
export const MARQUEE_TOUCH_LONG_PRESS_MS = 300;
export const MARQUEE_MOVE_CANCEL_THRESHOLD_PX = 6;
export const MARQUEE_DRAG_THRESHOLD_PX = 8;

export class TableMarqueeGesture {
  onMarqueeStart: MarqueeStartHandler | null = null;
  onMarqueeUpdate: MarqueeUpdateHandler | null = null;
  onMarqueeEnd: MarqueeEndHandler | null = null;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private isTouchGesture = false;
  private dragged = false;
  private startScreenX = 0;
  private startScreenY = 0;
  private startTablePoint: MarqueePoint | null = null;
  private currentTablePoint: MarqueePoint | null = null;

  constructor(private readonly toTablePoint: ScreenToTablePoint) {}

  /**
   * Whether a marquee is open and the pointer has gone far enough to be dragging it out, rather
   * than holding still after the long press.
   */
  get isDragging(): boolean {
    return this.active && this.dragged;
  }

  /**
   * Starts the long press that opens a marquee, dropping any marquee before it.
   *
   * Only a primary press without Ctrl, Alt or Meta is taken up, which is what the answer says. The
   * marquee opens once the press has been held long enough, a little sooner for touch and pen.
   */
  arm(event: PointerEvent | MouseEvent): boolean {
    this.cancel();
    this.dragged = false;
    if (event.button !== 0) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const pointerType = (event as PointerEvent).pointerType ?? 'mouse';
    const isTouchLike = pointerType === 'touch' || pointerType === 'pen';
    this.isTouchGesture = isTouchLike;
    const delay = isTouchLike ? MARQUEE_TOUCH_LONG_PRESS_MS : MARQUEE_MOUSE_LONG_PRESS_MS;
    this.startScreenX = event.pageX;
    this.startScreenY = event.pageY;
    const modifiers: MarqueeModifiers = { shift: event.shiftKey, ctrl: event.ctrlKey, touch: isTouchLike };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire(modifiers);
    }, delay);
    return true;
  }

  private fire(modifiers: MarqueeModifiers): void {
    const point = this.toTablePoint(this.startScreenX, this.startScreenY);
    this.active = true;
    this.startTablePoint = point;
    this.currentTablePoint = point;
    this.onMarqueeStart?.(point, modifiers);
  }

  /**
   * Follows the pointer: before the marquee opens, straying too far calls the long press off, and
   * once it is open the marquee is stretched to the pointer.
   */
  updatePointer(screenX: number, screenY: number): void {
    if (!this.active) {
      if (this.timer != null) {
        const dx = screenX - this.startScreenX;
        const dy = screenY - this.startScreenY;
        if (dx * dx + dy * dy > MARQUEE_MOVE_CANCEL_THRESHOLD_PX ** 2) {
          this.cancel();
        }
      }
      return;
    }
    const dx = screenX - this.startScreenX;
    const dy = screenY - this.startScreenY;
    if (dx * dx + dy * dy > MARQUEE_DRAG_THRESHOLD_PX ** 2) this.dragged = true;
    const point = this.toTablePoint(screenX, screenY);
    this.currentTablePoint = point;
    this.onMarqueeUpdate?.(point);
  }

  /**
   * Closes the marquee and hands its rectangle to the end handler, with the Shift and Ctrl keys as
   * they are at release.
   *
   * Says whether a marquee was open; a press let go before it opened is simply called off.
   */
  release(event?: PointerEvent | MouseEvent): boolean {
    if (!this.active) {
      this.cancel();
      return false;
    }
    const start = this.startTablePoint;
    const end = this.currentTablePoint ?? this.startTablePoint;
    if (!start || !end) {
      this.reset();
      return false;
    }
    const modifiers: MarqueeModifiers = {
      shift: event?.shiftKey ?? false,
      ctrl: event?.ctrlKey ?? false,
      touch: this.isTouchGesture,
    };
    const rect: MarqueeRect = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    this.reset();
    this.onMarqueeEnd?.(rect, modifiers);
    return true;
  }

  /** Calls off the marquee, or the long press waiting to open one, without selecting anything. */
  cancel(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.reset();
  }

  private reset(): void {
    this.active = false;
    this.dragged = false;
    this.startTablePoint = null;
    this.currentTablePoint = null;
  }

  /** Whether a marquee is open. */
  get isActive(): boolean {
    return this.active;
  }

  /** Whether a long press is under way that will open a marquee if it is held. */
  get isArmed(): boolean {
    return this.timer != null;
  }
}
