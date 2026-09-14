import { Injectable, signal, untracked } from '@angular/core';

export interface PointerCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface PointerData extends PointerCoordinate {
  identifier: number;
}

const MOUSE_IDENTIFIER = -9999;
const LONG_PRESS_DELAY_MS = 400;
const TOUCH_CONTEXT_MENU_SLOP_PX = 12;

@Injectable({
  providedIn: 'root',
})
export class PointerDeviceService {
  private callbackOnPointerDown = (e: MouseEvent | TouchEvent) => this.onPointerDown(e);
  private callbackOnPointerMove = (e: MouseEvent | TouchEvent) => this.onPointerMove(e);
  private callbackOnPointerUp = (e: MouseEvent | TouchEvent) => this.onPointerUp(e);
  private callbackOnContextMenu = (e: MouseEvent) => this.onContextMenu(e);
  private callbackOnWindowBlur = () => this.resetDraggingState();
  private callbackOnVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.resetDraggingState();
  };

  private _isAllowedToOpenContextMenu: boolean = false;
  /**
   * Whether a context menu may open, which it may not once the pointer has moved since it was
   * pressed.
   *
   * A drag that ends with a right click or a long press would otherwise open a menu where it was
   * dropped.
   */
  get isAllowedToOpenContextMenu(): boolean {
    return this._isAllowedToOpenContextMenu;
  }

  /**
   * Treats the pointer as pressed and still at this point, so a menu opened from code is allowed
   * and anchored there.
   */
  primeForContextMenu(pageX: number, pageY: number) {
    this._isAllowedToOpenContextMenu = true;
    const primed: PointerData = { x: pageX, y: pageY, z: 0, identifier: MOUSE_IDENTIFIER };
    this.startPosition = primed;
    this.pointers = [primed];
    this.primaryPointer = primed;
  }

  targetElement: HTMLElement = document.body;

  pointers: PointerData[] = [{ x: 0, y: 0, z: 0, identifier: -1 }];
  private startPosition: PointerData = this.pointers[0];
  private primaryPointer: PointerData = this.pointers[0];
  /** The primary pointer on the page: the mouse, or the first finger on the screen. */
  get pointer(): PointerCoordinate {
    return this.primaryPointer;
  }
  /** The primary pointer's page x. */
  get pointerX(): number {
    return this.primaryPointer.x;
  }
  /** The primary pointer's page y. */
  get pointerY(): number {
    return this.primaryPointer.y;
  }

  private _isDragging = signal(false);
  /**
   * Whether something on the page is being dragged, readable as a signal.
   *
   * It is cleared on its own when the pointer is released, the window loses focus, the tab is
   * hidden, or the mouse moves with no button held.
   */
  get isDragging(): boolean {
    return this._isDragging();
  }
  set isDragging(isDragging: boolean) {
    const currentDragging = untracked(() => this._isDragging());
    if (isDragging === currentDragging) return;
    this._isDragging.set(isDragging);
  }

  /** Starts following the mouse and touches on the page. Call once when the app starts. */
  initialize() {
    this.addEventListeners();
  }

  /** Stops following the mouse and touches. */
  destroy() {
    this.removeEventListeners();
  }

  private onPointerDown(e: MouseEvent | TouchEvent) {
    this.onPointerMove(e);
    this._isAllowedToOpenContextMenu = true;
    this.startPosition = this.pointers[0];
    if ((e as TouchEvent).touches) this.startLongPress(e as TouchEvent);
  }

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTarget: EventTarget | null = null;

  private startLongPress(e: TouchEvent): void {
    this.cancelLongPress();
    if (e.touches.length !== 1) return;

    this.longPressTarget = e.target;
    const { pageX, pageY, clientX, clientY } = e.touches[0];
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      if (!this._isAllowedToOpenContextMenu) return;

      this.primeForContextMenu(pageX, pageY);
      this.longPressTarget?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY })
      );
    }, LONG_PRESS_DELAY_MS);
  }

  /** Drops a long press that has not opened its menu yet, for a gesture that has already opened one of its own. */
  cancelPendingContextMenu(): void {
    this.cancelLongPress();
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.longPressTarget = null;
  }

  private onPointerMove(e: MouseEvent | TouchEvent): void {
    if ((e as TouchEvent).touches) {
      this.onTouchMove(e as TouchEvent);
    } else {
      this.onMouseMove(e as MouseEvent);
    }
    this.targetElement = e.target as HTMLElement;
  }

  private onPointerUp(e: MouseEvent | TouchEvent) {
    this.cancelLongPress();
    this.resetDraggingState();
    this.onPointerMove(e);
  }

  private onMouseMove(e: MouseEvent) {
    if (this.isDragging && e.buttons === 0) {
      this.resetDraggingState();
    }
    if (!Number.isFinite(e.pageX) || !Number.isFinite(e.pageY)) return;
    const mousePointer: PointerData = { x: e.pageX, y: e.pageY, z: 0, identifier: MOUSE_IDENTIFIER };
    if (this.isSyntheticEvent(mousePointer)) return;
    if (this._isAllowedToOpenContextMenu) this.preventContextMenuIfNeeded(mousePointer);
    this.pointers = [mousePointer];
    this.primaryPointer = mousePointer;
  }

  private onTouchMove(e: TouchEvent) {
    const length = e.touches.length;
    if (length === 0) return;
    this.pointers = [];
    for (let i = 0; i < length; i++) {
      const touch = e.touches[i];
      const touchPointer: PointerData = { x: touch.pageX, y: touch.pageY, z: 0, identifier: touch.identifier };
      if (this._isAllowedToOpenContextMenu) this.preventContextMenuIfNeeded(touchPointer, TOUCH_CONTEXT_MENU_SLOP_PX);
      this.pointers.push(touchPointer);
    }
    this.primaryPointer = this.pointers[0];
  }

  private onContextMenu(e: MouseEvent | TouchEvent) {
    this._isAllowedToOpenContextMenu = true;
    this.resetDraggingState();
    this.onPointerUp(e);
  }

  private resetDraggingState() {
    this.isDragging = false;
  }

  private preventContextMenuIfNeeded(pointer: PointerCoordinate, threshold: number = 3) {
    const distance = (pointer.x - this.startPosition.x) ** 2 + (pointer.y - this.startPosition.y) ** 2;
    if (threshold ** 2 < distance) {
      this._isAllowedToOpenContextMenu = false;
      this.cancelLongPress();
    }
  }

  private isSyntheticEvent(mosuePointer: PointerData, threshold: number = 15): boolean {
    for (const pointer of this.pointers) {
      if (pointer.identifier === mosuePointer.identifier) continue;
      const distance = (mosuePointer.x - pointer.x) ** 2 + (mosuePointer.y - pointer.y) ** 2;
      if (distance < threshold ** 2) return true;
    }
    return false;
  }

  private addEventListeners() {
    document.body.addEventListener('mousedown', this.callbackOnPointerDown, true);
    document.body.addEventListener('mousemove', this.callbackOnPointerMove, true);
    document.body.addEventListener('mouseup', this.callbackOnPointerUp, true);
    document.body.addEventListener('touchstart', this.callbackOnPointerDown, true);
    document.body.addEventListener('touchmove', this.callbackOnPointerMove, true);
    document.body.addEventListener('touchend', this.callbackOnPointerUp, true);
    document.body.addEventListener('touchcancel', this.callbackOnPointerUp, true);
    document.body.addEventListener('drop', this.callbackOnPointerUp, true);
    document.body.addEventListener('contextmenu', this.callbackOnContextMenu, true);
    window.addEventListener('blur', this.callbackOnWindowBlur, true);
    document.addEventListener('visibilitychange', this.callbackOnVisibilityChange, true);
  }

  private removeEventListeners() {
    document.body.removeEventListener('mousedown', this.callbackOnPointerDown, true);
    document.body.removeEventListener('mousemove', this.callbackOnPointerMove, true);
    document.body.removeEventListener('mouseup', this.callbackOnPointerUp, true);
    document.body.removeEventListener('touchstart', this.callbackOnPointerDown, true);
    document.body.removeEventListener('touchmove', this.callbackOnPointerMove, true);
    document.body.removeEventListener('touchend', this.callbackOnPointerUp, true);
    document.body.removeEventListener('touchcancel', this.callbackOnPointerUp, true);
    document.body.removeEventListener('drop', this.callbackOnPointerUp, true);
    document.body.removeEventListener('contextmenu', this.callbackOnContextMenu, true);
    window.removeEventListener('blur', this.callbackOnWindowBlur, true);
    document.removeEventListener('visibilitychange', this.callbackOnVisibilityChange, true);
  }
}
