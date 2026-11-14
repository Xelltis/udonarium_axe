import { clamp } from '@axe/core/util/clamp';
import { InputHandler } from '@axe/ui/directives/input-handler';

type Callback = (srcEvent: TouchEvent | MouseEvent | PointerEvent) => void;
type OnTransformCallback = (
  transformX: number,
  transformY: number,
  transformZ: number,
  rotateX: number,
  rotateY: number,
  rotateZ: number,
  event: TableMouseGestureEvent,
  srcEvent: TouchEvent | MouseEvent | PointerEvent | KeyboardEvent
) => void;

export enum TableMouseGestureEvent {
  DRAG = 'drag',
  ZOOM = 'zoom',
  ROTATE = 'rotate',
  KEYBOARD = 'keyboard',
}

/** How many pixels of a right-button drag turn the view by one degree. */
const DRAG_PX_PER_DEGREE = 5;
/** The height of one line of wheel, in pixels, for a wheel that counts in lines. */
const WHEEL_LINE_PX = 16;
/** How much zoom one pixel of wheel gives; the sign makes rolling away zoom in. */
const WHEEL_ZOOM_PER_PX = -1.5;
/** The most one wheel event may zoom, either way. */
const WHEEL_ZOOM_STEP_MAX = 300;
/** How far one press of an arrow key pans the view, in pixels. */
const KEY_PAN_STEP_PX = 10;
/** How far one press of Shift and an arrow key turns the view, in degrees. */
const KEY_TURN_STEP_DEG = 2;
/** How much one press of Ctrl and the up or down arrow zooms. */
const KEY_ZOOM_STEP = 150;

enum Keyboard {
  ArrowLeft = 'ArrowLeft',
  ArrowUp = 'ArrowUp',
  ArrowRight = 'ArrowRight',
  ArrowDown = 'ArrowDown',
}

export class TableMouseGesture {
  private currentPositionX: number = 0;
  private currentPositionY: number = 0;

  private buttonCode: number = 0;
  private readonly input = new InputHandler(this.targetElement, { capture: true });
  /** Whether a press on the table is being held, moved or not. */
  get isGrabbing(): boolean {
    return this.input.isGrabbing;
  }
  /** Whether the held press has moved, which tells a drag from a click. */
  get isDragging(): boolean {
    return this.input.isDragging;
  }

  private callbackOnWheel = (e: WheelEvent) => this.onWheel(e);
  private callbackOnKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  onstart: Callback | null = null;
  onend: Callback | null = null;
  ontransform: OnTransformCallback | null = null;
  constructor(readonly targetElement: HTMLElement) {
    this.addEventListeners();
    this.input.onStart = (e) => this.onInputStart(e);
    this.input.onMove = (e) => this.onInputMove(e);
    this.input.onEnd = (e) => this.onInputEnd(e);
  }

  /** Drops the press under way, so moving the pointer further neither pans nor turns the view. */
  cancel() {
    this.input.cancel();
  }

  /** Stops listening to the mouse, the wheel and the arrow keys for good. */
  destroy() {
    this.input.destroy();
    this.removeEventListeners();
  }

  /** Notes where a press began and with which button, and passes the press on to `onstart`. */
  onInputStart(ev: MouseEvent | TouchEvent) {
    this.currentPositionX = this.input.pointer.x;
    this.currentPositionY = this.input.pointer.y;
    this.buttonCode = (ev as MouseEvent).button;
    if (this.onstart) this.onstart(ev);
  }

  /** Passes the end of a press on to `onend`. */
  onInputEnd(ev: MouseEvent | TouchEvent) {
    if (this.onend) this.onend(ev);
  }

  /**
   * Turns the movement of a held press into a change of view: with the right button it turns the
   * view, with any other it pans.
   */
  onInputMove(ev: MouseEvent | TouchEvent) {
    const x = this.input.pointer.x;
    const y = this.input.pointer.y;
    const deltaX = x - this.currentPositionX;
    const deltaY = y - this.currentPositionY;

    let transformX = 0;
    let transformY = 0;
    const transformZ = 0;

    let rotateX = 0;
    const rotateY = 0;
    let rotateZ = 0;

    let event = TableMouseGestureEvent.DRAG;

    if (this.buttonCode === 2) {
      event = TableMouseGestureEvent.ROTATE;
      rotateZ = -deltaX / DRAG_PX_PER_DEGREE;
      rotateX = -deltaY / DRAG_PX_PER_DEGREE;
    } else {
      transformX = deltaX;
      transformY = deltaY;
    }

    this.currentPositionX = x;
    this.currentPositionY = y;

    if (this.ontransform) this.ontransform(transformX, transformY, transformZ, rotateX, rotateY, rotateZ, event, ev);
  }

  /**
   * Turns the wheel into zooming, whether it counts in pixels, lines or pages, with each step
   * capped so one flick cannot leap.
   */
  onWheel(ev: WheelEvent) {
    let pixelDeltaY: number;
    switch (ev.deltaMode) {
      case WheelEvent.DOM_DELTA_LINE:
        pixelDeltaY = ev.deltaY * WHEEL_LINE_PX;
        break;
      case WheelEvent.DOM_DELTA_PAGE:
        pixelDeltaY = ev.deltaY * window.innerHeight;
        break;
      default:
        pixelDeltaY = ev.deltaY;
        break;
    }

    const transformX = 0;
    const transformY = 0;

    const rotateX = 0;
    const rotateY = 0;
    const rotateZ = 0;

    const transformZ = clamp(pixelDeltaY * WHEEL_ZOOM_PER_PX, -WHEEL_ZOOM_STEP_MAX, WHEEL_ZOOM_STEP_MAX);

    if (this.ontransform)
      this.ontransform(transformX, transformY, transformZ, rotateX, rotateY, rotateZ, TableMouseGestureEvent.ZOOM, ev);
  }

  /**
   * Moves the view with the arrow keys, which are listened for on the whole page.
   *
   * Plain arrows pan, Shift with an arrow turns the view, and Ctrl with up or down zooms. Every
   * other key is left alone.
   */
  onKeydown(ev: KeyboardEvent) {
    let transformX = 0;
    let transformY = 0;
    let transformZ = 0;

    let rotateX = 0;
    const rotateY = 0;
    let rotateZ = 0;

    const key = ev.key;
    switch (key) {
      case Keyboard.ArrowLeft:
        if (ev.shiftKey) {
          rotateZ = -KEY_TURN_STEP_DEG;
        } else {
          transformX = KEY_PAN_STEP_PX;
        }
        break;
      case Keyboard.ArrowUp:
        if (ev.shiftKey) {
          rotateX = -KEY_TURN_STEP_DEG;
        } else if (ev.ctrlKey) {
          transformZ = KEY_ZOOM_STEP;
        } else {
          transformY = KEY_PAN_STEP_PX;
        }
        break;
      case Keyboard.ArrowRight:
        if (ev.shiftKey) {
          rotateZ = KEY_TURN_STEP_DEG;
        } else {
          transformX = -KEY_PAN_STEP_PX;
        }
        break;
      case Keyboard.ArrowDown:
        if (ev.shiftKey) {
          rotateX = KEY_TURN_STEP_DEG;
        } else if (ev.ctrlKey) {
          transformZ = -KEY_ZOOM_STEP;
        } else {
          transformY = -KEY_PAN_STEP_PX;
        }
        break;
    }
    const isArrowKey = (Keyboard as Record<string, string>)[key] != null;
    if (isArrowKey && this.ontransform)
      this.ontransform(
        transformX,
        transformY,
        transformZ,
        rotateX,
        rotateY,
        rotateZ,
        TableMouseGestureEvent.KEYBOARD,
        ev
      );
  }

  private addEventListeners() {
    this.targetElement.addEventListener('wheel', this.callbackOnWheel, { passive: false });
    document.body.addEventListener('keydown', this.callbackOnKeydown, false);
  }

  private removeEventListeners() {
    this.targetElement.removeEventListener('wheel', this.callbackOnWheel, false);
    document.body.removeEventListener('keydown', this.callbackOnKeydown, false);
  }
}
