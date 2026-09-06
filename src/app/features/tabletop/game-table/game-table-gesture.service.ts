import { inject, Injectable } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { marqueeApply, selectByRect } from '@axe/application/ui/rect-hit-test';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  MarqueeModifiers,
  MarqueePoint,
  MarqueeRect,
  TableMarqueeGesture,
} from '@axe/features/tabletop/game-table/table-marquee-gesture';
import { TableMouseGesture, TableMouseGestureEvent } from '@axe/features/tabletop/game-table/table-mouse-gesture';
import { TableTouchGesture, TableTouchGestureEvent } from '@axe/features/tabletop/game-table/table-touch-gesture';

@Injectable()
export class GameTableGestureService {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tabletopService = inject(TabletopService);
  private readonly coordinateService = inject(CoordinateService);

  isTableTransformMode = false;
  isTableTransformed = false;

  viewPositionX = 100;
  viewPositionY = 0;
  viewPositionZ = 0;
  viewRotateX = 50;
  viewRotateY = 0;
  viewRotateZ = 10;

  tiltLocked = false;
  orthographicProjection = false;
  /** A display lying flat under miniatures is touched constantly; the view holds still. */
  viewLocked = false;

  private frame: number | null = null;
  private turned = false;

  private mouseGesture: TableMouseGesture | null = null;
  private touchGesture: TableTouchGesture | null = null;
  private marqueeGesture: TableMarqueeGesture | null = null;

  private gameTableEl!: HTMLElement;
  private gameObjectsEl!: HTMLElement;
  private gridCanvasEl!: HTMLCanvasElement;
  private getGridShow!: () => boolean;

  initialize(
    rootEl: HTMLElement,
    gameTableEl: HTMLElement,
    gameObjectsEl: HTMLElement,
    gridCanvasEl: HTMLCanvasElement,
    getGridShow: () => boolean
  ): void {
    this.gameTableEl = gameTableEl;
    this.gameObjectsEl = gameObjectsEl;
    this.gridCanvasEl = gridCanvasEl;
    this.getGridShow = getGridShow;

    this.touchGesture = new TableTouchGesture(rootEl);
    this.touchGesture.onstart = () => this.onTableTouchStart();
    this.touchGesture.onend = () => this.onTableTouchEnd();
    this.touchGesture.ongesture = () => this.onTableTouchGesture();
    this.touchGesture.ontransform = (tX, tY, tZ, rX, rY, rZ, ev, src) =>
      this.onTableTouchTransform(tX, tY, tZ, rX, rY, rZ, ev, src);

    this.mouseGesture = new TableMouseGesture(rootEl);
    this.mouseGesture.onstart = (e) => this.onTableMouseStart(e);
    this.mouseGesture.onend = (e) => this.onTableMouseEnd(e);
    this.mouseGesture.ontransform = (tX, tY, tZ, rX, rY, rZ, ev, src) =>
      this.onTableMouseTransform(tX, tY, tZ, rX, rY, rZ, ev, src);

    this.marqueeGesture = new TableMarqueeGesture((screenX, screenY) => this.screenToTablePoint(screenX, screenY));
    this.marqueeGesture.onMarqueeStart = (point, mods) => this.onMarqueeStart(point, mods);
    this.marqueeGesture.onMarqueeUpdate = (point) => this.onMarqueeUpdate(point);
    this.marqueeGesture.onMarqueeEnd = (rect, mods) => this.onMarqueeEnd(rect, mods);
    this.touchGesture.shouldSynthesizeContextMenu = () => !(this.marqueeGesture?.isDragging ?? false);
    this.touchGesture.onSynthesizeContextMenu = () => this.pointerDeviceService.cancelPendingContextMenu();
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.mouseGesture?.destroy();
    this.mouseGesture = null;
    this.touchGesture?.destroy();
    this.touchGesture = null;
    this.marqueeGesture?.cancel();
    this.marqueeGesture = null;
  }

  cancelInput(): void {
    if (!this.gridCanvasEl) return;
    this.mouseGesture?.cancel();
    this.marqueeGesture?.cancel();
    this.selectionSignalService.marqueeState.set(null);
    this.isTableTransformMode = true;
    this.pointerDeviceService.isDragging = false;
    const opacity = this.getGridShow() ? 1.0 : 0.0;
    this.gridCanvasEl.style.opacity = opacity + '';
  }

  /**
   * Moves the view by the amounts given, and shows the move on the next frame.
   *
   * A mouse reports where it is far oftener than the screen is redrawn, and every report used
   * to write a transform and tell every piece on the table which way it now faces. The sums
   * are still done here, so anything asking how the view stands is answered at once; the
   * writing and the telling happen together, once, when the frame comes round.
   */
  setTransform(tX: number, tY: number, tZ: number, rX: number, rY: number, rZ: number): void {
    if (this.tiltLocked) {
      rX = -this.viewRotateX;
      rY = -this.viewRotateY;
    }
    this.viewRotateX += rX;
    this.viewRotateY += rY;
    this.viewRotateZ += rZ;
    this.viewPositionX += tX;
    this.viewPositionY += tY;
    this.viewPositionZ += tZ;

    this.turned ||= rX !== 0 || rY !== 0 || rZ !== 0;
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.showTransform();
    });
  }

  /** Writes the view out and tells the table which way it faces, both in the one frame. */
  private showTransform(): void {
    const tx = this.viewPositionX.toFixed(4);
    const ty = this.viewPositionY.toFixed(4);
    const tz = this.viewPositionZ.toFixed(4);
    const rx = this.viewRotateX.toFixed(4);
    const ry = this.viewRotateY.toFixed(4);
    const rz = this.viewRotateZ.toFixed(4);
    const projectionScale = this.orthographicProjection
      ? `scale(${(TABLE_PERSPECTIVE_PX / (TABLE_PERSPECTIVE_PX - this.viewPositionZ)).toFixed(6)}) `
      : '';
    this.gameTableEl.style.transform = `${projectionScale}translateZ(${tz}px) translateY(${ty}px) translateX(${tx}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg)`;

    this.coordinateService.invalidateTabletopTransform();

    if (!this.turned) return;
    this.turned = false;
    this.uiSignalService.notifyTableViewRotation(this.viewRotateX, this.viewRotateY, this.viewRotateZ);
  }

  /**
   * Puts the camera at a depth outright, rather than nudging it there.
   *
   * The zoom the gestures allow stops at life size, but a screen laid flat has to go past it
   * for a square to measure an inch. This is the way past, and the reason the lock exists:
   * once there, the gestures would pull the view straight back.
   */
  snapToViewPositionZ(viewPositionZ: number): void {
    this.setTransform(0, 0, viewPositionZ - this.viewPositionZ, 0, 0, 0);
  }

  private onTableTouchStart(): void {
    this.mouseGesture?.cancel();
    this.marqueeGesture?.cancel();
  }

  private onTableTouchEnd(): void {
    this.cancelInput();
  }

  private onTableTouchGesture(): void {
    this.cancelInput();
  }

  private onTableTouchTransform(
    transformX: number,
    transformY: number,
    transformZ: number,
    rotateX: number,
    rotateY: number,
    rotateZ: number,
    _event: TableTouchGestureEvent,
    srcEvent: TouchEvent | MouseEvent | PointerEvent
  ): void {
    if (!this.isTableTransformMode || document.body !== document.activeElement) return;

    // Only the movement is dropped: the long press that opens the menu is a separate path,
    // so a locked display can still be unlocked from it.
    if (this.viewLocked) {
      if (srcEvent.cancelable) srcEvent.preventDefault();
      return;
    }

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu && this.contextMenuService.isShow) {
      this.contextMenuService.close();
    }

    if (srcEvent.cancelable) srcEvent.preventDefault();

    const scale = (TABLE_PERSPECTIVE_PX + Math.abs(this.viewPositionZ)) / TABLE_PERSPECTIVE_PX;
    transformX *= scale;
    transformY *= scale;
    transformZ *= 3;
    if (80 < rotateX + this.viewRotateX) rotateX += 80 - (rotateX + this.viewRotateX);
    if (rotateX + this.viewRotateX < 0) rotateX += 0 - (rotateX + this.viewRotateX);

    const maxZ = 0;
    if (maxZ < transformZ + this.viewPositionZ) transformZ += maxZ - (transformZ + this.viewPositionZ);

    const minZ = -6000;
    if (transformZ + this.viewPositionZ < minZ) transformZ += minZ - (transformZ + this.viewPositionZ);

    this.setTransform(transformX, transformY, transformZ, rotateX, rotateY, rotateZ);
    this.isTableTransformed = true;
  }

  private onTableMouseStart(e: TouchEvent | MouseEvent | PointerEvent): void {
    const me = e as MouseEvent;
    const target = me.target as HTMLElement;
    const isEmptyTablePress =
      target.contains(this.gameObjectsEl) ||
      me.button === 1 ||
      me.button === 2 ||
      target.closest('[data-table-passthrough]') != null;
    if (isEmptyTablePress) {
      this.isTableTransformMode = true;
      this.marqueeGesture?.arm(e as PointerEvent);
    } else {
      this.isTableTransformMode = false;
      this.pointerDeviceService.isDragging = true;
      this.gridCanvasEl.style.opacity = 1.0 + '';
      this.uiSignalService.notifyTerrainGridShow();
    }
    if (!document.activeElement?.contains(me.target as Node)) {
      this.removeSelectionRanges();
      this.removeFocus();
    }
  }

  private onTableMouseEnd(e: TouchEvent | MouseEvent | PointerEvent): void {
    const wasMarqueeActive = this.marqueeGesture?.isActive ?? false;
    const released = this.marqueeGesture?.release(e as PointerEvent) ?? false;
    this.cancelInput();
    this.uiSignalService.notifyTerrainGridEnd();

    if (!released && !wasMarqueeActive && !this.isTableTransformed) {
      this.selectionSignalService.clearSelection();
    }
  }

  private onTableMouseTransform(
    transformX: number,
    transformY: number,
    transformZ: number,
    rotateX: number,
    rotateY: number,
    rotateZ: number,
    _event: TableMouseGestureEvent,
    srcEvent: TouchEvent | MouseEvent | PointerEvent | KeyboardEvent
  ): void {
    if (this.marqueeGesture && (this.marqueeGesture.isArmed || this.marqueeGesture.isActive)) {
      const pointer = this.pointerDeviceService.pointers[0];
      this.marqueeGesture.updatePointer(pointer.x, pointer.y);
      if (this.marqueeGesture.isActive) {
        if ((srcEvent as Event).cancelable) (srcEvent as Event).preventDefault();
        return;
      }
    }

    if (!this.isTableTransformMode || document.body !== document.activeElement) return;

    // The marquee above still runs, since locking holds the view rather than the selection.
    if (this.viewLocked) {
      if ((srcEvent as Event).cancelable) (srcEvent as Event).preventDefault();
      return;
    }

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu && this.contextMenuService.isShow) {
      this.contextMenuService.close();
    }

    if ((srcEvent as Event).cancelable) (srcEvent as Event).preventDefault();

    const scale = (TABLE_PERSPECTIVE_PX + Math.abs(this.viewPositionZ)) / TABLE_PERSPECTIVE_PX;
    transformX *= scale;
    transformY *= scale;
    transformZ *= 3;

    this.setTransform(transformX, transformY, transformZ, rotateX, rotateY, rotateZ);
    this.isTableTransformed = true;
  }

  private screenToTablePoint(screenX: number, screenY: number): MarqueePoint {
    const local = this.coordinateService.calcTabletopLocalCoordinate(
      { x: screenX, y: screenY, z: 0 },
      this.gameObjectsEl
    );
    return { x: local.x, y: local.y };
  }

  private onMarqueeStart(point: MarqueePoint, _modifiers: MarqueeModifiers): void {
    this.isTableTransformMode = false;
    this.selectionSignalService.marqueeState.set({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  }

  private onMarqueeUpdate(point: MarqueePoint): void {
    const current = this.selectionSignalService.marqueeState();
    if (!current) return;
    this.selectionSignalService.marqueeState.set({
      x1: current.x1,
      y1: current.y1,
      x2: point.x,
      y2: point.y,
    });
  }

  private onMarqueeEnd(rect: MarqueeRect, modifiers: MarqueeModifiers): void {
    this.selectionSignalService.marqueeState.set(null);
    const candidates = this.collectSelectableObjects();
    const hits = selectByRect(candidates, rect);
    const joins = marqueeApply(modifiers, this.selectionSignalService.selectionSize() > 0);
    if (joins === 'add') {
      for (const id of hits) this.selectionSignalService.addSelection(id);
    } else if (joins === 'toggle') {
      for (const id of hits) this.selectionSignalService.toggleSelection(id);
    } else {
      this.selectionSignalService.replaceSelection(hits);
    }
  }

  private collectSelectableObjects(): TabletopObject[] {
    return [
      ...this.tabletopService.characters,
      ...this.tabletopService.diceSymbols,
      ...this.tabletopService.tableMasks,
      ...this.tabletopService.terrains,
      ...this.tabletopService.textNotes,
      ...this.tabletopService.cards,
      ...this.tabletopService.cardStacks,
    ];
  }

  private removeSelectionRanges(): void {
    const selection = window.getSelection();
    if (!selection?.isCollapsed) {
      selection?.removeAllRanges();
    }
  }

  private removeFocus(): void {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
}
