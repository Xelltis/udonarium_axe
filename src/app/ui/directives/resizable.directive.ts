import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { CSSNumber } from '@axe/core/transform/css-number';
import { HandleType, ResizeHandler } from '@axe/ui/directives/resize-handler';

interface BoxSize {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function screenDeltaToElementDelta(x: number, y: number, rotationDegrees: number): PointerCoordinate {
  const radians = (-rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
    z: 0,
  };
}

@Directive({ selector: '[appResizable]' })
export class ResizableDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly isDisable = input(false, { alias: 'resizable.disable' });
  readonly boundsSelector = input('body', { alias: 'resizable.bounds' });
  readonly stackSelector = input('', { alias: 'resizable.stack' });
  readonly minWidth = input(100, { alias: 'resizable.minWidth' });
  readonly minHeight = input(100, { alias: 'resizable.minHeight' });
  readonly rotation = input(0, { alias: 'resizable.rotation' });

  readonly ostart = output<MouseEvent | TouchEvent>({ alias: 'resizable.start' });
  readonly onmove = output<MouseEvent | TouchEvent>({ alias: 'resizable.move' });
  readonly onend = output<MouseEvent | TouchEvent>({ alias: 'resizable.end' });

  private handleMap = new Map<HandleType, ResizeHandler>();
  private handleTypes: HandleType[] = [
    HandleType.N,
    HandleType.E,
    HandleType.W,
    HandleType.S,
    HandleType.NE,
    HandleType.NW,
    HandleType.SE,
    HandleType.SW,
  ];

  private startPosition: BoxSize = { left: 0, top: 0, width: 0, height: 0 };

  private startPointer: PointerCoordinate = { x: 0, y: 0, z: 0 };
  private prevTrans: BoxSize = { left: 0, top: 0, width: 0, height: 0 };

  constructor() {
    afterNextRender(() => {
      this.initialize();
      this.setForeground();
    });
    this.destroyRef.onDestroy(() => {
      this.cancel();
      this.destroy();
    });
  }

  private initialize() {
    this.handleTypes.forEach((type) => {
      const handle = new ResizeHandler(this.elementRef.nativeElement, type);
      this.handleMap.set(type, handle);
      handle.input!.onStart = (ev) => this.onResizeStart(ev, handle);
      handle.input!.onMove = (ev) => this.onResizeMove(ev, handle);
      handle.input!.onEnd = (ev) => this.onResizeEnd(ev, handle);
      handle.input!.onContextMenu = (ev) => this.onContextMenu(ev, handle);
    });
  }

  cancel() {
    this.handleMap.forEach((handle) => handle.input!.cancel());
  }

  destroy() {
    this.handleMap.forEach((handle) => handle.input!.destroy());
  }

  private onResizeStart(e: MouseEvent | TouchEvent, handle: ResizeHandler) {
    if (this.isDisable()) return this.cancel();
    if ((e as MouseEvent).button === 1 || (e as MouseEvent).button === 2) return this.cancel();
    this.setForeground();
    this.handleMap.forEach((h) => {
      if (h !== handle) h.input!.cancel();
    });

    this.startPosition = this.calcElementPosition(this.elementRef.nativeElement);
    this.startPointer = handle.input!.pointer;
    this.prevTrans = { left: 0, top: 0, width: 0, height: 0 };

    this.ostart.emit(e);
    e.stopPropagation();
  }

  private onResizeMove(e: MouseEvent | TouchEvent, handle: ResizeHandler) {
    const localDelta = screenDeltaToElementDelta(
      handle.input!.pointer.x - this.startPointer.x,
      handle.input!.pointer.y - this.startPointer.y,
      this.rotation()
    );
    const trans: BoxSize = {
      left: 0,
      top: 0,
      width: localDelta.x,
      height: localDelta.y,
    };

    switch (handle.type) {
      case HandleType.N:
      case HandleType.S:
        trans.width = 0;
        break;
      case HandleType.E:
      case HandleType.W:
        trans.height = 0;
        break;
    }

    switch (handle.type) {
      case HandleType.SW:
        trans.left = trans.width;
        trans.width *= -1;
        break;
      case HandleType.NE:
        trans.top = trans.height;
        trans.height *= -1;
        break;
      case HandleType.E:
      case HandleType.S:
      case HandleType.SE:
        break;
      case HandleType.N:
      case HandleType.W:
      case HandleType.NW:
        trans.left = trans.width;
        trans.top = trans.height;
        trans.width *= -1;
        trans.height *= -1;
        break;
    }

    if (trans.width + this.startPosition.width < this.minWidth()) {
      trans.width = this.minWidth() - this.startPosition.width;
      trans.left = trans.left !== 0 ? -trans.width : trans.left;
    }

    if (trans.height + this.startPosition.height < this.minHeight()) {
      trans.height = this.minHeight() - this.startPosition.height;
      trans.top = trans.top !== 0 ? -trans.height : trans.top;
    }

    const diff: BoxSize = {
      left: trans.left - this.prevTrans.left,
      top: trans.top - this.prevTrans.top,
      width: trans.width - this.prevTrans.width,
      height: trans.height - this.prevTrans.height,
    };

    const correction = this.rotation() % 360 === 0 ? this.calcCorrectionPosition(diff) : zeroBoxSize();
    trans.left += correction.left;
    trans.top += correction.top;
    trans.width += correction.width;
    trans.height += correction.height;

    this.elementRef.nativeElement.style.left = trans.left + this.startPosition.left + 'px';
    this.elementRef.nativeElement.style.top = trans.top + this.startPosition.top + 'px';
    this.elementRef.nativeElement.style.width = trans.width + this.startPosition.width + 'px';
    this.elementRef.nativeElement.style.height = trans.height + this.startPosition.height + 'px';

    this.prevTrans = trans;
    this.onmove.emit(e);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }

  private onResizeEnd(e: MouseEvent | TouchEvent, handle: ResizeHandler) {
    if (handle.input!.isDragging && e.cancelable) e.preventDefault();
    this.onend.emit(e);
    e.stopPropagation();
  }

  private onContextMenu(e: MouseEvent | TouchEvent, _handle: ResizeHandler) {
    e.stopPropagation();
  }

  private calcCorrectionPosition(diff: BoxSize = { left: 0, top: 0, width: 0, height: 0 }): BoxSize {
    const correction: BoxSize = { left: 0, top: 0, width: 0, height: 0 };
    const box = this.elementRef.nativeElement.getBoundingClientRect();
    const boundsElement = this.elementRef.nativeElement.ownerDocument.querySelector(this.boundsSelector());
    if (!boundsElement) return correction;

    const bounds = boundsElement.getBoundingClientRect();

    if (bounds.right < box.right + diff.left + diff.width) {
      correction.width += bounds.right - (box.right + diff.left + diff.width);
    }
    if (box.left + diff.left < bounds.left) {
      correction.left += bounds.left - (box.left + diff.left);
      correction.width -= correction.left;
    }

    if (bounds.bottom < box.bottom + diff.top + diff.height) {
      correction.height += bounds.bottom - (box.bottom + diff.top + diff.height);
    }
    if (box.top + diff.top < bounds.top) {
      correction.top += bounds.top - (box.top + diff.top);
      correction.height -= correction.top;
    }

    return correction;
  }

  private calcElementPosition(target: HTMLElement): BoxSize {
    const css: CSSStyleDeclaration = window.getComputedStyle(target);
    const parentWidth = target.parentElement?.offsetWidth ?? 0;
    const parentHeight = target.parentElement?.offsetHeight ?? 0;
    return {
      left: CSSNumber.relation(css.left, parentWidth, parentWidth * 0.5),
      top: CSSNumber.relation(css.top, parentHeight, parentHeight * 0.5),
      width: CSSNumber.relation(css.width, parentWidth, parentWidth * 0.5),
      height: CSSNumber.relation(css.height, parentHeight, parentHeight * 0.5),
    };
  }

  private setForeground() {
    if (this.stackSelector().length < 1) return;
    const stacks = this.elementRef.nativeElement.ownerDocument.querySelectorAll<HTMLElement>(this.stackSelector());
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

function zeroBoxSize(): BoxSize {
  return { left: 0, top: 0, width: 0, height: 0 };
}
