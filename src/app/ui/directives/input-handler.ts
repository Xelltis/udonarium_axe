import { PointerCoordinate, PointerData } from '@axe/application/input/pointer-device.service';

const MOUSE_IDENTIFIER = -9999;

interface InputHandlerOption {
  readonly capture?: boolean;
  readonly passive?: boolean;
  readonly always?: boolean;
}

export class InputHandler {
  onStart: ((ev: MouseEvent | TouchEvent) => void) | null = null;
  onMove: ((ev: MouseEvent | TouchEvent) => void) | null = null;
  onEnd: ((ev: MouseEvent | TouchEvent) => void) | null = null;
  onContextMenu: ((ev: MouseEvent | TouchEvent) => void) | null = null;

  private callbackOnMouse = (e: MouseEvent) => this.onMouse(e);
  private callbackOnTouch = (e: TouchEvent) => this.onTouch(e);
  private callbackOnMenu = (e: MouseEvent | TouchEvent) => this.onMenu(e);

  private lastPointers: PointerData[] = [];
  private primaryPointer: PointerData = { x: 0, y: 0, z: 0, identifier: MOUSE_IDENTIFIER };
  /**
   * Where the pointer that started the gesture is, in page coordinates.
   *
   * With several fingers down this follows the first one to touch, and ignores the rest.
   */
  get pointer(): PointerCoordinate {
    return this.primaryPointer;
  }

  private _isDragging: boolean = false;
  private _isGrabbing: boolean = false;
  /** Whether the pointer has moved since it was pressed, which tells a drag from a click. */
  get isDragging(): boolean {
    return this._isDragging;
  }
  /** Whether a press on the target is being held, moved or not. */
  get isGrabbing(): boolean {
    return this._isGrabbing;
  }

  private _isDestroyed: boolean = false;
  /** Whether `destroy()` has been called and the target is no longer listened to. */
  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  private readonly option: InputHandlerOption;
  constructor(
    readonly target: HTMLElement,
    option: InputHandlerOption = { capture: false, passive: false, always: false }
  ) {
    this.option = {
      capture: !!option.capture,
      passive: !!option.passive,
      always: !!option.always,
    };
    this.initialize();
  }

  private initialize() {
    this.target.addEventListener('mousedown', this.callbackOnMouse, this.option.capture);
    this.target.addEventListener('touchstart', this.callbackOnTouch, this.option.capture);
    if (this.option.always) this.addEventListeners();
  }

  /** Ends any gesture in progress and removes every listener this handler put on the page. */
  destroy() {
    this.cancel();
    this._isDestroyed = true;
    this.target.removeEventListener('mousedown', this.callbackOnMouse, this.option.capture);
    this.target.removeEventListener('touchstart', this.callbackOnTouch, this.option.capture);
    this.removeEventListeners();
  }

  /**
   * Drops the gesture in progress without calling `onEnd`.
   *
   * The document-wide move and release listeners come off again unless the handler was made
   * with `always`, so later moves reach no callback until the next press.
   */
  cancel() {
    this._isDragging = this._isGrabbing = false;
    if (!this.option.always) this.removeEventListeners();
  }

  private onMouse(e: MouseEvent) {
    const mosuePointer: PointerData = { x: e.pageX, y: e.pageY, z: 0, identifier: MOUSE_IDENTIFIER };
    if (this.isSyntheticEvent(mosuePointer)) return;
    this.lastPointers = [mosuePointer];
    this.primaryPointer = mosuePointer;

    this.onPointer(e);
  }

  private onTouch(e: TouchEvent) {
    const length = e.changedTouches.length;
    if (length < 1) return;
    this.lastPointers = [];
    for (let i = 0; i < length; i++) {
      const touch = e.changedTouches[i];
      const touchPointer: PointerData = { x: touch.pageX, y: touch.pageY, z: 0, identifier: touch.identifier };
      this.lastPointers.push(touchPointer);
    }

    if (e.type === 'touchstart') {
      this.primaryPointer = this.lastPointers[0];
    } else {
      const changedTouches = Array.from(e.changedTouches);
      const touch = changedTouches.find((touch) => touch.identifier === this.primaryPointer.identifier);
      if (touch == null) {
        const isTouchContinues =
          Array.from(e.touches).find((touch) => touch.identifier === this.primaryPointer.identifier) != null;
        if (!isTouchContinues) {
          if (this.onEnd) this.onEnd(e);
          this.cancel();
        }
        return;
      }
      const touchPointer: PointerData = { x: touch.pageX, y: touch.pageY, z: 0, identifier: touch.identifier };
      this.primaryPointer = touchPointer;
    }

    this.onPointer(e);
  }

  private onPointer(e: MouseEvent | TouchEvent) {
    switch (e.type) {
      case 'mousedown':
      case 'touchstart':
        this._isGrabbing = true;
        this._isDragging = false;
        this.addEventListeners();
        if (this.onStart) this.onStart(e);
        break;
      case 'mousemove':
      case 'touchmove':
        if (this.onMove) this.onMove(e);
        this._isDragging = this._isGrabbing;
        break;
      default:
        if (this.onEnd) this.onEnd(e);
        this.cancel();
        break;
    }
  }

  private onMenu(e: MouseEvent | TouchEvent) {
    if (this.onContextMenu) this.onContextMenu(e);
  }

  private isSyntheticEvent(mosuePointer: PointerData, threshold: number = 15): boolean {
    for (const pointer of this.lastPointers) {
      if (pointer.identifier === mosuePointer.identifier) continue;
      const distance = (mosuePointer.x - pointer.x) ** 2 + (mosuePointer.y - pointer.y) ** 2;
      if (distance < threshold ** 2) {
        return true;
      }
    }
    return false;
  }

  private addEventListeners() {
    const option: AddEventListenerOptions = {
      capture: this.option.capture,
      passive: this.option.passive,
    };
    this.target.ownerDocument.addEventListener('mousemove', this.callbackOnMouse, option);
    this.target.ownerDocument.addEventListener('mouseup', this.callbackOnMouse, option);
    this.target.ownerDocument.addEventListener('touchmove', this.callbackOnTouch, option);
    this.target.ownerDocument.addEventListener('touchend', this.callbackOnTouch, option);
    this.target.ownerDocument.addEventListener('touchcancel', this.callbackOnTouch, option);
    this.target.ownerDocument.addEventListener('contextmenu', this.callbackOnMenu, option);
    this.target.ownerDocument.addEventListener('drop', this.callbackOnMouse, option);
  }

  private removeEventListeners() {
    const option: EventListenerOptions = {
      capture: this.option.capture,
    };
    this.target.ownerDocument.removeEventListener('mousemove', this.callbackOnMouse, option);
    this.target.ownerDocument.removeEventListener('mouseup', this.callbackOnMouse, option);
    this.target.ownerDocument.removeEventListener('touchmove', this.callbackOnTouch, option);
    this.target.ownerDocument.removeEventListener('touchend', this.callbackOnTouch, option);
    this.target.ownerDocument.removeEventListener('touchcancel', this.callbackOnTouch, option);
    this.target.ownerDocument.removeEventListener('contextmenu', this.callbackOnMenu, option);
    this.target.ownerDocument.removeEventListener('drop', this.callbackOnMouse, option);
  }
}
