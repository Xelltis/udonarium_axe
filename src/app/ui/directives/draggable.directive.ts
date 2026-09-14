import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { CSSNumber } from '@axe/core/transform/css-number';
import { InputHandler } from '@axe/ui/directives/input-handler';

const ORIENTATION_SETTLE_MS = 250;
/** How long the window is left alone before the place it pushed something to is taken as final. */
const RESIZE_SETTLE_MS = 400;

/** Marks an element whose place in the stack was chosen for it. */
const Z_LAYER_ATTRIBUTE = 'data-z-layer';

@Directive({ selector: '[appDraggable]' })
export class DraggableDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly isDisable = input(false, { alias: 'draggable.disable' });
  readonly boundsSelector = input('body', { alias: 'draggable.bounds' });
  readonly handleSelector = input('', { alias: 'draggable.handle' });
  /**
   * What a press must not start a drag on.
   *
   * Besides the controls a press belongs to, a panel's contents can claim a region of it
   * by wearing `panel-no-drag`: a timeline being scrubbed, a stage a layer is dragged
   * around, a list being reordered. Without it the panel takes the press as well and the
   * two drags pull against each other.
   */
  readonly unhandleSelector = input('input,textarea,button,select,option,span,.panel-no-drag', {
    alias: 'draggable.unhandle',
  });
  readonly stackSelector = input('', { alias: 'draggable.stack' });
  readonly opacity = input(0.7, { alias: 'draggable.opacity' });
  readonly allowOverHalf = input(false, { alias: 'draggable.allowOverHalf' });

  readonly onstart = output<MouseEvent | TouchEvent>({ alias: 'draggable.start' });
  readonly onmove = output<MouseEvent | TouchEvent>({ alias: 'draggable.move' });
  readonly onend = output<MouseEvent | TouchEvent>({ alias: 'draggable.end' });
  /**
   * The window stopped changing shape, and what it pushed about has come to rest.
   *
   * A host that writes down where a thing sits listens for this as well as for the end of a
   * drag: a window resized around a widget moves it just as surely as a hand does.
   */
  readonly onsettle = output<void>({ alias: 'draggable.settled' });

  private callbackOnResize = () => {
    this.adjustPosition();
    this.settleLater();
  };
  private callbackOnOrientationChange = () =>
    setTimeout(() => {
      this.adjustPosition();
      this.settleLater();
    }, ORIENTATION_SETTLE_MS);
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  private input: InputHandler | null = null;
  private startPosition: PointerCoordinate = { x: 0, y: 0, z: 0 };
  private startPointer: PointerCoordinate = { x: 0, y: 0, z: 0 };
  private prevTrans: PointerCoordinate = { x: 0, y: 0, z: 0 };

  constructor() {
    afterNextRender(() => {
      this.initialize();
      this.adjustPosition();
      this.setForeground();
    });
    this.destroyRef.onDestroy(() => {
      this.cancel();
      this.destroy();
    });
  }

  private initialize() {
    this.input = new InputHandler(this.elementRef.nativeElement);
    window.addEventListener('resize', this.callbackOnResize, false);
    window.addEventListener('orientationchange', this.callbackOnOrientationChange, false);
    this.input.onStart = (e) => this.onInputStart(e);
    this.input.onMove = (e) => this.onInputMove(e);
    this.input.onEnd = (e) => this.onInputEnd(e);
    this.input.onContextMenu = (e) => this.onContextMenu(e);
  }

  /** Lets go of a drag in progress, if any, without moving the element any further. */
  cancel() {
    if (this.input) this.input.cancel();
  }

  /**
   * Stops listening for presses and for the window changing shape.
   *
   * A pending settle is dropped, so `draggable.settled` is not emitted after this.
   */
  destroy() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    window.removeEventListener('resize', this.callbackOnResize, false);
    window.removeEventListener('orientationchange', this.callbackOnOrientationChange, false);
    if (this.input) this.input.destroy();
  }

  private onInputStart(e: MouseEvent | TouchEvent) {
    if ((e as MouseEvent).button === 1 || (e as MouseEvent).button === 2) return this.cancel();
    if (this.isDisable()) return this.cancel();
    if (!this.input) return this.cancel();

    this.setForeground();
    this.startPosition = this.calcElementPosition(this.elementRef.nativeElement);

    this.startPointer = this.input.pointer;
    this.prevTrans = { x: 0, y: 0, z: 0 };

    const isHandle = this.isHandleElement(e.target as HTMLElement);
    const isUnhandle = this.isUnhandleElement(e.target as HTMLElement);
    const isScrollable = 'touches' in e ? this.isScrollableElement(e.target as HTMLElement) : false;

    if (!isHandle || isUnhandle || isScrollable) {
      this.cancel();
      return;
    }
    e.stopPropagation();
    this.onstart.emit(e);
  }

  private onInputMove(e: MouseEvent | TouchEvent) {
    const input = this.input;
    if (!input) return this.cancel();

    const trans = {
      x: input.pointer.x - this.startPointer.x,
      y: input.pointer.y - this.startPointer.y,
      z: input.pointer.z - this.startPointer.z,
    };

    const diff = {
      x: trans.x - this.prevTrans.x,
      y: trans.y - this.prevTrans.y,
      z: trans.z - this.prevTrans.z,
    };

    const correction = this.calcCorrectionPosition(diff);
    trans.x += correction.x;
    trans.y += correction.y;
    trans.z += correction.z;

    if (trans.x ** 2 + trans.y ** 2 + trans.z ** 2 > 0) {
      this.elementRef.nativeElement.style.opacity = this.opacity() + '';
    }

    this.elementRef.nativeElement.style.willChange = 'top, left';
    this.elementRef.nativeElement.style.left = trans.x + this.startPosition.x + 'px';
    this.elementRef.nativeElement.style.top = trans.y + this.startPosition.y + 'px';

    this.prevTrans = trans;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    this.onmove.emit(e);
  }

  /**
   * Letting go is what the host waits for: it is where a moved thing writes down where it
   * came to rest. The three outputs are told each time, or a host listening for the end of a
   * drag would hear nothing until the page went away.
   */
  private onInputEnd(e: MouseEvent | TouchEvent) {
    this.elementRef.nativeElement.style.opacity = '';
    this.elementRef.nativeElement.style.willChange = '';
    if (this.input?.isDragging && e.cancelable) {
      this.preventClickIfNeeded(e);
      e.preventDefault();
    }
    e.stopPropagation();
    this.onend.emit(e);
  }

  /** A window being dragged by its edge fires by the dozen, so only the last one counts. */
  private settleLater(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.onsettle.emit();
    }, RESIZE_SETTLE_MS);
  }

  private onContextMenu(e: MouseEvent | TouchEvent) {
    e.stopPropagation();
  }

  private preventClickIfNeeded(e: MouseEvent | TouchEvent) {
    if ('touches' in e) return;
    if (!this.input) return;

    const diffX = this.input.pointer.x - this.startPointer.x;
    const diffY = this.input.pointer.y - this.startPointer.y;
    const diffZ = this.input.pointer.z - this.startPointer.z;
    const distance = diffX ** 2 + diffY ** 2 + diffZ ** 2;

    if (15 ** 2 > distance) return;

    const callback = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    };

    this.elementRef.nativeElement.addEventListener('click', callback, true);
    setTimeout(() => this.elementRef.nativeElement.removeEventListener('click', callback, true));
  }

  private adjustPosition() {
    const current = this.calcElementPosition(this.elementRef.nativeElement);
    const correction = this.calcCorrectionPosition();
    this.elementRef.nativeElement.style.left = correction.x + current.x + 'px';
    this.elementRef.nativeElement.style.top = correction.y + current.y + 'px';
  }

  private isHandleElement(target: HTMLElement): boolean {
    if (this.handleSelector().length === 0) return true;
    return this.isContainsElement(target, this.handleSelector());
  }

  private isUnhandleElement(target: HTMLElement): boolean {
    if (this.unhandleSelector().length === 0) return false;
    return this.isContainsElement(target, this.unhandleSelector());
  }

  private isContainsElement(target: HTMLElement, selectors: string): boolean {
    const elms = this.elementRef.nativeElement.querySelectorAll<HTMLElement>(selectors);
    for (let i = 0; i < elms.length; i++) {
      if (elms[i].contains(target)) return true;
    }
    return false;
  }

  private isScrollableElement(target: HTMLElement) {
    const boundsElm = this.elementRef.nativeElement.ownerDocument.querySelector(this.boundsSelector());
    let node: HTMLElement | null = target;
    const overflowType = ['scroll', 'auto'];
    const positionType = ['fixed', 'sticky', '-webkit-sticky'];
    while (node && boundsElm !== node && this.elementRef.nativeElement !== node) {
      const css: CSSStyleDeclaration = window.getComputedStyle(node);
      if (overflowType.includes(css.overflowY) && node.offsetHeight < node.scrollHeight) return true;
      if (positionType.includes(css.position)) return false;
      node = node.parentElement as HTMLElement | null;
    }
    return false;
  }

  private calcCorrectionPosition(diff: PointerCoordinate = { x: 0, y: 0, z: 0 }): PointerCoordinate {
    const correction: PointerCoordinate = { x: 0, y: 0, z: 0 };
    const box = this.elementRef.nativeElement.getBoundingClientRect();
    const boundsElm = this.elementRef.nativeElement.ownerDocument.querySelector(this.boundsSelector());
    if (!boundsElm) return correction;
    const bounds = boundsElm.getBoundingClientRect();
    if (this.allowOverHalf()) {
      const boxWidth = box.right - box.left;
      const boxHeight = box.bottom - box.top;
      if (bounds.right + boxWidth / 2 < box.right + diff.x) {
        correction.x += bounds.right + boxWidth / 2 - (box.right + diff.x);
      }
      if (box.left + diff.x < bounds.left - boxWidth / 2) {
        correction.x += bounds.left - boxWidth / 2 - (box.left + diff.x);
      }
      if (bounds.bottom + boxHeight / 2 < box.bottom + diff.y) {
        correction.y += bounds.bottom + boxHeight / 2 - (box.bottom + diff.y);
      }
      if (box.top + diff.y < bounds.top - boxHeight / 2) {
        correction.y += bounds.top - boxHeight / 2 - (box.top + diff.y);
      }
    } else {
      if (bounds.right < box.right + diff.x) {
        correction.x += bounds.right - (box.right + diff.x);
      }
      if (box.left + diff.x < bounds.left) {
        correction.x += bounds.left - (box.left + diff.x);
      }
      if (bounds.bottom < box.bottom + diff.y) {
        correction.y += bounds.bottom - (box.bottom + diff.y);
      }
      if (box.top + diff.y < bounds.top) {
        correction.y += bounds.top - (box.top + diff.y);
      }
    }
    return correction;
  }

  private calcElementPosition(target: HTMLElement): PointerCoordinate {
    const css: CSSStyleDeclaration = window.getComputedStyle(target);
    const parentElm = target.parentElement;
    return {
      x: CSSNumber.relation(css.left, parentElm?.offsetWidth ?? 0, (parentElm?.offsetWidth ?? 0) * 0.5),
      y: CSSNumber.relation(css.top, parentElm?.offsetHeight ?? 0, (parentElm?.offsetHeight ?? 0) * 0.5),
      z: 0,
    };
  }

  /**
   * Brings what was taken hold of to the front of its own stack.
   *
   * Anything put on a layer of its own is left out of this on both sides: it was opened above
   * or below the ordinary stack on purpose, so it is neither shuffled down into that stack nor
   * counted as the top of it, which would carry every other panel up over the modal veil.
   */
  private setForeground() {
    if (this.stackSelector().length < 1) return;
    if (this.elementRef.nativeElement.hasAttribute(Z_LAYER_ATTRIBUTE)) return;
    const stacks = [
      ...this.elementRef.nativeElement.ownerDocument.querySelectorAll<HTMLElement>(this.stackSelector()),
    ].filter((elm) => !elm.hasAttribute(Z_LAYER_ATTRIBUTE));
    let topZindex: number = 0;
    let bottomZindex: number = 99999;
    stacks.forEach((elm) => {
      const zIndex = parseInt(elm.style.zIndex);
      if (topZindex < zIndex) topZindex = zIndex;
      if (zIndex < bottomZindex) bottomZindex = zIndex;
    });

    if (topZindex <= parseInt(this.elementRef.nativeElement.style.zIndex)) return;

    stacks.forEach((elm) => {
      elm.style.zIndex = parseInt(elm.style.zIndex) - bottomZindex + '';
    });
    this.elementRef.nativeElement.style.zIndex = topZindex + 1 + '';
  }
}
