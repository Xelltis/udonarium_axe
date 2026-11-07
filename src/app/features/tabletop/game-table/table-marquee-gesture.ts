import type { MarqueeRect } from '@axe/application/ui/selection-signal.service';

export interface MarqueePoint {
  x: number;
  y: number;
}

export type { MarqueeRect };

export interface MarqueeModifiers {
  shift: boolean;
  ctrl: boolean;
  touch: boolean;
}

export type MarqueeStartHandler = (point: MarqueePoint, modifiers: MarqueeModifiers) => void;
export type MarqueeUpdateHandler = (point: MarqueePoint) => void;
export type MarqueeEndHandler = (rect: MarqueeRect, modifiers: MarqueeModifiers) => void;

type ScreenToTablePoint = (screenX: number, screenY: number) => MarqueePoint;

/** A place the pointer was at, on the page, and when it was there, on the clock events are stamped by. */
export interface MarqueeSample {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/** What the places a marquee is handed came from: the kind of pointer, and whether they are all it went to since the last. */
export interface MarqueeSamplesFrom {
  readonly pointerType: string;
  readonly whole: boolean;
}

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
  /** When the press waiting to open a marquee was made, on the clock events are stamped by, and how long it waits. */
  private armedAt = 0;
  private armedFor = 0;
  /** When the press was taken up, on the page's own clock, and the kind of pointer it was made with. */
  private armedClock = 0;
  private armedPointer = 'mouse';
  private armedModifiers: MarqueeModifiers = { shift: false, ctrl: false, touch: false };
  private startTablePoint: MarqueePoint | null = null;
  private currentTablePoint: MarqueePoint | null = null;

  constructor(
    private readonly toTablePoint: ScreenToTablePoint,
    private readonly now: () => number = () => performance.now()
  ) {}

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
    this.armedAt = event.timeStamp;
    this.armedFor = delay;
    this.armedClock = this.now();
    this.armedPointer = pointerType;
    this.armedModifiers = { shift: event.shiftKey, ctrl: event.ctrlKey, touch: isTouchLike };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire(this.armedModifiers);
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
   * Follows the places the pointer the press was made with went while the press waits to open a
   * marquee, in the order it went to them, as the page would have seen them had it not been too busy:
   * one to see the wait was up sees the moves made since all at once, before it sees that. The wait
   * up by the time the pointer was at a place opens the marquee, and straying too far before it calls
   * the long press off. Where only the last of the places is known, one too far off calls it off, as
   * it may have strayed before the wait was up; and the wait is up only once the page's own clock
   * says so as well, which a clock held still, as the shots hold one, does not.
   */
  follow(samples: readonly MarqueeSample[], from: MarqueeSamplesFrom): void {
    if (from.pointerType !== this.armedPointer) return;
    for (const sample of samples) {
      if (this.active || this.timer == null) return;
      const strayed = this.strayed(sample.x, sample.y);
      if (this.waitWasUp(sample.at) && (from.whole || !strayed)) {
        this.openNow();
        return;
      }
      if (strayed) {
        this.cancel();
        return;
      }
    }
  }

  /**
   * Follows the pointer: before the marquee opens, straying too far calls the long press off, and
   * once it is open the marquee is stretched to the pointer.
   */
  updatePointer(screenX: number, screenY: number): void {
    if (!this.active) {
      if (this.timer != null && this.strayed(screenX, screenY)) this.cancel();
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
    if (!this.active && this.timer != null && event && this.waitWasUp(event.timeStamp)) this.openNow();
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

  /** Opens the marquee at once, for a press found to have been held long enough before its wait was seen to be up. */
  private openNow(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.fire(this.armedModifiers);
  }

  /** Whether the press had been held long enough by a moment on the clock events are stamped by, by the page's own clock too. */
  private waitWasUp(at: number): boolean {
    return at - this.armedAt >= this.armedFor && this.now() - this.armedClock >= this.armedFor;
  }

  /** Whether a place lies too far off where the press was made for the press to be held still. */
  private strayed(screenX: number, screenY: number): boolean {
    const dx = screenX - this.startScreenX;
    const dy = screenY - this.startScreenY;
    return dx * dx + dy * dy > MARQUEE_MOVE_CANCEL_THRESHOLD_PX ** 2;
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
