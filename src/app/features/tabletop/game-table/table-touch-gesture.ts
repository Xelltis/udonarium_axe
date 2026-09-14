type Callback = (srcEvent: TouchEvent | MouseEvent | PointerEvent) => void;
type OnGestureCallback = (srcEvent: TouchEvent | MouseEvent | PointerEvent) => void;
type OnTransformCallback = (
  transformX: number,
  transformY: number,
  transformZ: number,
  rotateX: number,
  rotateY: number,
  rotateZ: number,
  event: TableTouchGestureEvent,
  srcEvent: TouchEvent | MouseEvent | PointerEvent
) => void;

export enum TableTouchGestureEvent {
  PAN = 'pan',
  TAP_PINCH = 'tappinch',
  PINCH = 'pinch',
  ROTATE = 'rotate',
}

export const TABLE_LONG_PRESS_MS = 400;

export class TableTouchGesture {
  shouldSynthesizeContextMenu: (() => boolean) | null = null;
  onSynthesizeContextMenu: (() => void) | null = null;

  private activePointers = new Map<
    number,
    {
      x: number;
      y: number;
      startX: number;
      startY: number;
      startAt: number;
      moved: boolean;
      target: EventTarget | null;
    }
  >();

  private isGestureActive = false;
  private prevCenter: { x: number; y: number } | null = null;
  private pinchBaseDistance: number | null = null;
  private pinchPrevScale = 0;
  private rotateBaseAngle: number | null = null;
  private rotatePrev = 0;

  private tappedPanTimer: ReturnType<typeof setTimeout> | null = null;
  private tappedPanCenter: { x: number; y: number } = { x: 0, y: 0 };
  private isTappedPanGesture = false;

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTarget: EventTarget | null = null;
  private longPressPoint: { x: number; y: number } = { x: 0, y: 0 };
  private readonly originalTouchAction: string;

  private readonly onPointerDownBound = (ev: PointerEvent) => this.onPointerDown(ev);
  private readonly onPointerMoveBound = (ev: PointerEvent) => this.onPointerMove(ev);
  private readonly onPointerUpBound = (ev: PointerEvent) => this.onPointerUp(ev);
  private readonly onPointerCancelBound = (ev: PointerEvent) => this.onPointerCancel(ev);

  onstart: Callback | null = null;
  onend: Callback | null = null;
  ongesture: OnGestureCallback | null = null;
  ontransform: OnTransformCallback | null = null;
  constructor(readonly targetElement: Element) {
    this.originalTouchAction = (this.targetElement as HTMLElement).style.touchAction;
    this.initializeGesture();
  }

  /**
   * Stops listening to touches on the table for good, dropping any timers still waiting and giving
   * the element back its own touch action.
   */
  destroy() {
    this.clearTappedPanTimer();
    this.clearLongPressTimer();
    this.activePointers.clear();
    const element = this.targetElement as HTMLElement;
    element.style.touchAction = this.originalTouchAction;
    element.removeEventListener('pointerdown', this.onPointerDownBound);
    element.removeEventListener('pointermove', this.onPointerMoveBound);
    element.removeEventListener('pointerup', this.onPointerUpBound);
    element.removeEventListener('pointercancel', this.onPointerCancelBound);
  }

  private initializeGesture() {
    const element = this.targetElement as HTMLElement;
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDownBound, { passive: true });
    element.addEventListener('pointermove', this.onPointerMoveBound, { passive: false });
    element.addEventListener('pointerup', this.onPointerUpBound, { passive: true });
    element.addEventListener('pointercancel', this.onPointerCancelBound, { passive: true });
  }

  private onPointerDown(ev: PointerEvent) {
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;

    this.activePointers.set(ev.pointerId, {
      x: ev.clientX,
      y: ev.clientY,
      startX: ev.clientX,
      startY: ev.clientY,
      startAt: Date.now(),
      moved: false,
      target: ev.target,
    });

    if (!this.isGestureActive) {
      this.isGestureActive = true;
      this.prevCenter = { x: ev.clientX, y: ev.clientY };
      if (this.onstart) this.onstart(ev);
    }

    if (this.activePointers.size === 1) {
      const distance = (this.tappedPanCenter.x - ev.clientX) ** 2 + (this.tappedPanCenter.y - ev.clientY) ** 2;
      if (this.tappedPanTimer != null && distance <= 50 ** 2) {
        this.isTappedPanGesture = true;
        this.clearTappedPanTimer(false);
        if (this.ongesture) this.ongesture(ev);
      } else if (this.tappedPanTimer != null) {
        this.clearTappedPanTimer();
      }
      this.startLongPressTimer(ev);
    } else {
      this.clearLongPressTimer();
    }

    this.resetMultiTouchReferenceIfNeeded();
  }

  private onPointerMove(ev: PointerEvent) {
    const pointer = this.activePointers.get(ev.pointerId);
    if (!pointer) return;

    const moveDistance = (pointer.startX - ev.clientX) ** 2 + (pointer.startY - ev.clientY) ** 2;
    if (moveDistance > 6 ** 2) {
      pointer.moved = true;
      this.clearLongPressTimer();
    }
    pointer.x = ev.clientX;
    pointer.y = ev.clientY;

    if (this.activePointers.size === 1) {
      const center = this.getCenter();
      const prevCenter = this.prevCenter ?? center;
      const deltaX = center.x - prevCenter.x;
      const deltaY = center.y - prevCenter.y;
      this.prevCenter = center;

      if (this.isTappedPanGesture) {
        const transformZ = deltaY * 7.5;
        if (this.ongesture) this.ongesture(ev);
        if (this.ontransform) this.ontransform(0, 0, transformZ, 0, 0, 0, TableTouchGestureEvent.TAP_PINCH, ev);
      } else {
        if (this.ontransform) this.ontransform(deltaX, deltaY, 0, 0, 0, 0, TableTouchGestureEvent.PAN, ev);
      }
      return;
    }

    if (this.activePointers.size >= 2) {
      const center = this.getCenter();
      const prevCenter = this.prevCenter ?? center;
      const deltaCenterY = center.y - prevCenter.y;
      this.prevCenter = center;

      const rotateX = (-deltaCenterY / window.innerHeight) * 100;
      if (this.ongesture) this.ongesture(ev);
      if (this.ontransform) this.ontransform(0, 0, 0, rotateX, 0, 0, TableTouchGestureEvent.ROTATE, ev);

      const currentDistance = this.getDistanceBetweenTwoPointers();
      if (currentDistance != null && this.pinchBaseDistance != null && this.pinchBaseDistance > 0) {
        const currentScale = currentDistance / this.pinchBaseDistance;
        const deltaScale = currentScale - this.pinchPrevScale;
        this.pinchPrevScale = currentScale;

        const transformZ = deltaScale * 500;
        if (this.ongesture) this.ongesture(ev);
        if (this.ontransform) this.ontransform(0, 0, transformZ, 0, 0, 0, TableTouchGestureEvent.PINCH, ev);
      }

      const currentAngle = this.getAngleBetweenTwoPointers();
      if (currentAngle != null && this.rotateBaseAngle != null) {
        const currentRotation = this.normalizeAngle(currentAngle - this.rotateBaseAngle);
        const deltaRotation = this.normalizeAngle(currentRotation - this.rotatePrev);
        this.rotatePrev = currentRotation;

        if (this.ongesture) this.ongesture(ev);
        if (this.ontransform) this.ontransform(0, 0, 0, 0, 0, deltaRotation, TableTouchGestureEvent.ROTATE, ev);
      }
    }
  }

  private onPointerUp(ev: PointerEvent) {
    const pointer = this.activePointers.get(ev.pointerId);
    if (!pointer) return;

    const tapDuration = Date.now() - pointer.startAt;
    const isTap = !pointer.moved && tapDuration <= 250 && this.activePointers.size === 1;

    this.activePointers.delete(ev.pointerId);
    this.clearLongPressTimer();

    if (isTap) this.onTap(ev);

    if (this.activePointers.size === 0) {
      this.resetTouchState();
      if (this.onend) this.onend(ev);
    } else {
      this.prevCenter = this.getCenter();
      this.resetMultiTouchReferenceIfNeeded();
    }
  }

  private onPointerCancel(ev: PointerEvent) {
    if (!this.activePointers.has(ev.pointerId)) return;
    this.activePointers.delete(ev.pointerId);
    this.clearLongPressTimer();

    if (this.activePointers.size === 0) {
      this.resetTouchState();
      if (this.onend) this.onend(ev);
    } else {
      this.prevCenter = this.getCenter();
      this.resetMultiTouchReferenceIfNeeded();
    }
  }

  private onTap(ev: PointerEvent) {
    this.tappedPanCenter = { x: ev.clientX, y: ev.clientY };
    this.tappedPanTimer = setTimeout(() => {
      this.tappedPanTimer = null;
    }, 400);
    if (this.ongesture) this.ongesture(ev);
  }

  private resetTouchState() {
    this.isGestureActive = false;
    this.prevCenter = null;
    this.pinchBaseDistance = null;
    this.pinchPrevScale = 0;
    this.rotateBaseAngle = null;
    this.rotatePrev = 0;
    this.isTappedPanGesture = false;
    this.clearTappedPanTimer();
  }

  private resetMultiTouchReferenceIfNeeded() {
    if (this.activePointers.size < 2) {
      this.pinchBaseDistance = null;
      this.pinchPrevScale = 0;
      this.rotateBaseAngle = null;
      this.rotatePrev = 0;
      return;
    }
    if (this.pinchBaseDistance == null) {
      this.pinchBaseDistance = this.getDistanceBetweenTwoPointers();
      this.pinchPrevScale = 1;
    }
    if (this.rotateBaseAngle == null) {
      this.rotateBaseAngle = this.getAngleBetweenTwoPointers();
      this.rotatePrev = 0;
    }
  }

  private getFirstTwoPointers() {
    const pointers = Array.from(this.activePointers.values());
    if (pointers.length < 2) return null;
    return [pointers[0], pointers[1]] as const;
  }

  private getCenter() {
    let sumX = 0;
    let sumY = 0;
    const count = this.activePointers.size;
    for (const pointer of this.activePointers.values()) {
      sumX += pointer.x;
      sumY += pointer.y;
    }
    return { x: sumX / count, y: sumY / count };
  }

  private getDistanceBetweenTwoPointers(): number | null {
    const firstTwo = this.getFirstTwoPointers();
    if (!firstTwo) return null;
    const [a, b] = firstTwo;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private getAngleBetweenTwoPointers(): number | null {
    const firstTwo = this.getFirstTwoPointers();
    if (!firstTwo) return null;
    const [a, b] = firstTwo;
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  }

  private normalizeAngle(value: number): number {
    let angle = value;
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  private startLongPressTimer(ev: PointerEvent) {
    this.clearLongPressTimer();

    this.longPressTarget = ev.target;
    this.longPressPoint = { x: ev.clientX, y: ev.clientY };
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      if (this.shouldSynthesizeContextMenu && !this.shouldSynthesizeContextMenu()) return;
      this.onSynthesizeContextMenu?.();
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: this.longPressPoint.x,
        clientY: this.longPressPoint.y,
      });
      const target = this.longPressTarget as HTMLElement | null;
      if (!target) return;
      target.dispatchEvent(event);
    }, TABLE_LONG_PRESS_MS);
  }

  private clearTappedPanTimer(needsSetNull: boolean = true) {
    if (this.tappedPanTimer != null) {
      clearTimeout(this.tappedPanTimer);
    }
    if (needsSetNull) this.tappedPanTimer = null;
  }

  private clearLongPressTimer() {
    if (this.longPressTimer != null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTarget = null;
  }
}
