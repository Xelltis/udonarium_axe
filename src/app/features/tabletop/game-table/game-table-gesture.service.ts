import { inject, Injectable, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { BackdropFrameService } from '@axe/application/ui/backdrop-frame.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { type MarqueeRect, SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { CAMERA_GLIDE_MS, easeOut } from '@axe/domain/tabletop/camera/camera-glide';
import { tableCameraAttribute, TableCameraView, type TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { SwitchNoticeService } from '@axe/features/tabletop/board-switch/switch-notice.service';
import { SwitchPressService } from '@axe/features/tabletop/board-switch/switch-press.service';
import { marqueeApply, selectByRect } from '@axe/features/tabletop/game-table/rect-hit-test';
import {
  MarqueeModifiers,
  MarqueePoint,
  TableMarqueeGesture,
} from '@axe/features/tabletop/game-table/table-marquee-gesture';
import { TableMouseGesture, TableMouseGestureEvent } from '@axe/features/tabletop/game-table/table-mouse-gesture';
import { TableTouchGesture, TableTouchGestureEvent } from '@axe/features/tabletop/game-table/table-touch-gesture';

/**
 * How near the wheel and the keys may bring the camera: five times life size, a piece standing a good
 * part of the screen high, but well short of the eye. Brought nearer, the pictures standing up off
 * the board and the floor at the foot of a tilted view come nearer the eye than the table is drawn
 * from, and are cut away.
 */
export const MOUSE_ZOOM_MAX_Z = TABLE_PERSPECTIVE_PX * 0.8;

/** How far back any gesture may take the camera. */
export const ZOOM_MIN_Z = -6000;

/** The size of a cell the two limits above are set for. */
const ZOOM_LIMITS_CELL_PX = 50;

/**
 * How far the zoom limits follow a table's cell size: a little, by the square root of how many
 * times the usual cell it is, held between 0.75 and 1.5. A board of large cells can then be taken
 * in whole from further back, and one of small cells looked at more closely.
 */
export function zoomReachFor(gridSize: number): number {
  if (!(gridSize > 0)) return 1;
  return Math.min(1.5, Math.max(0.75, Math.sqrt(gridSize / ZOOM_LIMITS_CELL_PX)));
}

/** How much room is left round a board taken in whole, as a share of its width across. */
const WHOLE_BOARD_MARGIN = 1.2;

/**
 * How far back any gesture may take the camera over a table whose cells are `gridSize` across: as
 * far as {@link ZOOM_MIN_Z} reaches for its cells, and over a board too large to be seen whole from
 * there, as a board of a hundred cells of 256 pixels, as far as it takes for the whole of it to fit
 * across the screen's shorter side however it is turned.
 */
export function zoomOutLimitZ(
  gridSize: number,
  layout?: Pick<TableLayout, 'width' | 'height' | 'boardWidth' | 'boardHeight'> | null
): number {
  const usual = ZOOM_MIN_Z * zoomReachFor(gridSize);
  if (!layout) return usual;
  const across = Math.hypot(layout.boardWidth, layout.boardHeight) * WHOLE_BOARD_MARGIN;
  const screen = Math.max(1, Math.min(layout.width, layout.height));
  return Math.min(usual, TABLE_PERSPECTIVE_PX - (TABLE_PERSPECTIVE_PX * across) / screen);
}

/**
 * How many times over a step of the wheel or a pinch takes the camera back or in, where it stands
 * further back than the usual limit for its cells lets it: as many times as it stands that much
 * further off, so a large board is crossed in as many steps as a usual one. Nearer, once.
 */
export function zoomStepFor(gridSize: number, positionZ: number): number {
  const usualDepth = TABLE_PERSPECTIVE_PX - ZOOM_MIN_Z * zoomReachFor(gridSize);
  return Math.max(1, (TABLE_PERSPECTIVE_PX - positionZ) / usualDepth);
}

/**
 * How near the wheel and the keys may bring the camera over a table whose cells are `gridSize`
 * across: {@link MOUSE_ZOOM_MAX_Z} over the usual cell, magnifying a little more over smaller cells
 * and a little less over larger ones.
 */
export function mouseZoomInLimitZ(gridSize: number): number {
  const magnification = TABLE_PERSPECTIVE_PX / (TABLE_PERSPECTIVE_PX - MOUSE_ZOOM_MAX_Z);
  return TABLE_PERSPECTIVE_PX * (1 - zoomReachFor(gridSize) / magnification);
}

/** How near a touch may bring the camera: life size over the usual cell, a little nearer over smaller ones. */
export function touchZoomInLimitZ(gridSize: number): number {
  return Math.max(0, TABLE_PERSPECTIVE_PX * (1 - zoomReachFor(gridSize)));
}

/** How far a slide of the pointer turns the camera that follows a piece round it, in degrees for each pixel. */
const ORBIT_DEG_PER_PX = 0.25;

@Injectable()
export class GameTableGestureService {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly backdropFrame = inject(BackdropFrameService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tabletopService = inject(TabletopService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly tablePick = inject(TablePickService);
  private readonly tableCamera = inject(TableCameraService);
  private readonly thirdPerson = inject(ThirdPersonService);
  private readonly switchPresses = inject(SwitchPressService);
  private readonly switchNotices = inject(SwitchNoticeService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Whether a left press began on the bare table, for pressing the painted ground under it once the
   * hand lets go without having turned the view or drawn a box. A press on a block with a switch
   * of its own is the block's.
   */
  private groundPress = false;

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
  suspended = false;

  private frame: number | null = null;
  private turned = false;
  private glideFrame: number | null = null;

  private mouseGesture: TableMouseGesture | null = null;
  private touchGesture: TableTouchGesture | null = null;
  private marqueeGesture: TableMarqueeGesture | null = null;

  private rootEl: HTMLElement | null = null;
  private getGridShow: (() => boolean) | null = null;

  /**
   * How opaque the board's grid is shown, from 0 to 1: as the table has it, and wholly while a piece
   * is pressed.
   */
  readonly gridOpacity = signal(0);

  /**
   * Wires the mouse, touch and marquee gestures to the table's elements, once the view is built.
   *
   * `getGridShow` says whether the grid stays visible, since the grid is shown while a piece is
   * dragged and put back to that afterwards.
   */
  initialize(rootEl: HTMLElement, getGridShow: () => boolean): void {
    this.rootEl = rootEl;
    this.getGridShow = getGridShow;

    this.touchGesture = new TableTouchGesture(rootEl);
    this.touchGesture.onstart = () => this.onTableTouchStart();
    this.touchGesture.onend = () => this.onTableTouchEnd();
    this.touchGesture.ongesture = () => this.onTableTouchGesture();
    this.touchGesture.ontap = (_ev, pressedOn) => this.onTableTap(pressedOn);
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
    rootEl.ownerDocument.addEventListener('pointermove', this.followPress, { capture: true, passive: true });
  }

  /**
   * Hands the marquee waiting on a press every place the pointer went since the last move the page
   * saw, with when it was there, ahead of the move the table follows the pointer by.
   */
  private readonly followPress = (event: PointerEvent): void => {
    const marquee = this.marqueeGesture;
    if (!marquee?.isArmed) return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    const places = coalesced.length > 0 ? coalesced : [event];
    marquee.follow(
      places.map((place) => ({ x: place.pageX, y: place.pageY, at: place.timeStamp })),
      { pointerType: event.pointerType || 'mouse', whole: coalesced.length > 0 }
    );
  };

  /** Takes the gestures off the table, and drops a view update still waiting for its frame. */
  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.stopGlide();
    this.mouseGesture?.destroy();
    this.mouseGesture = null;
    this.touchGesture?.destroy();
    this.touchGesture = null;
    this.marqueeGesture?.cancel();
    this.marqueeGesture = null;
    this.rootEl?.ownerDocument.removeEventListener('pointermove', this.followPress, { capture: true });
  }

  /**
   * Ends whatever press is under way on the table, a mouse drag or a marquee, and puts the grid
   * back to shown or hidden as the table has it.
   *
   * Does nothing before `initialize`.
   */
  cancelInput(): void {
    if (!this.getGridShow) return;
    this.mouseGesture?.cancel();
    this.marqueeGesture?.cancel();
    this.selectionSignalService.marqueeState.set(null);
    this.isTableTransformMode = true;
    this.pointerDeviceService.isDragging = false;
    this.gridOpacity.set(this.getGridShow() ? 1 : 0);
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
    this.stopGlide();
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
    const view = this.currentView();
    if (this.rootEl) this.rootEl.dataset['camera'] = tableCameraAttribute(view);
    this.tableCamera.showView(view);

    // The backdrops follow a move of the view as well as a turn, so they are told every frame.
    this.backdropFrame.apply({
      rotateX: this.viewRotateX,
      rotateZ: this.viewRotateZ,
      positionX: this.viewPositionX,
      positionY: this.viewPositionY,
    });

    if (!this.turned) return;
    this.turned = false;
    const rotation = { x: this.viewRotateX, y: this.viewRotateY, z: this.viewRotateZ };
    this.uiSignalService.notifyTableViewRotation(rotation.x, rotation.y, rotation.z);
  }

  /** Shows the view again on the next frame, as when the camera that follows a piece moves on. */
  refreshView(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.showTransform();
    });
  }

  /** The view as the fields hold it now, or the camera that follows a piece while one is followed. */
  private currentView(): TableCameraView {
    return this.thirdPerson.view() ?? this.tableView();
  }

  /** The table's own view as the fields hold it now, whether or not a camera follows a piece. */
  tableView(): TableCameraView {
    return {
      positionX: this.viewPositionX,
      positionY: this.viewPositionY,
      positionZ: this.viewPositionZ,
      rotateX: this.viewRotateX,
      rotateY: this.viewRotateY,
      rotateZ: this.viewRotateZ,
      orthographic: this.orthographicProjection,
    };
  }

  /**
   * Slides the camera by the amounts given over {@link CAMERA_GLIDE_MS}, easing out, and shows each
   * step in its own frame, so that what reads the view on the way finds it where it is drawn. A
   * gesture that moves the view while it glides stops the glide where it has got to.
   */
  glideBy(tX: number, tY: number, tZ: number): void {
    this.stopGlide();
    if (typeof requestAnimationFrame !== 'function') {
      this.setTransform(tX, tY, tZ, 0, 0, 0);
      return;
    }
    const fromX = this.viewPositionX;
    const fromY = this.viewPositionY;
    const fromZ = this.viewPositionZ;
    let started: number | null = null;
    const step = (now: number) => {
      started ??= now;
      const along = easeOut((now - started) / CAMERA_GLIDE_MS);
      this.viewPositionX = fromX + tX * along;
      this.viewPositionY = fromY + tY * along;
      this.viewPositionZ = fromZ + tZ * along;
      this.showTransform();
      this.glideFrame = along < 1 ? requestAnimationFrame(step) : null;
    };
    this.glideFrame = requestAnimationFrame(step);
  }

  private stopGlide(): void {
    if (this.glideFrame !== null) cancelAnimationFrame(this.glideFrame);
    this.glideFrame = null;
  }

  /** Puts the camera at a place outright, facing the way it faces. */
  moveTo(place: Pick<TableCameraView, 'positionX' | 'positionY' | 'positionZ'>): void {
    this.setTransform(
      place.positionX - this.viewPositionX,
      place.positionY - this.viewPositionY,
      place.positionZ - this.viewPositionZ,
      0,
      0,
      0
    );
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

  /**
   * A finger's tap on the bare table forgets the piece a finger last pressed, which puts its handles
   * away; the selection is left as it was, as a tap has always left it.
   */
  private onTableTap(pressedOn: EventTarget | null): void {
    if (pressedOn instanceof Element && this.isBareTable(pressedOn)) {
      this.selectionSignalService.forgetPressedObject();
    }
  }

  /** Whether a press on this element is one on the table itself rather than on anything on it. */
  private isBareTable(target: Element): boolean {
    return (this.rootEl !== null && target.contains(this.rootEl)) || target.closest('[data-table-passthrough]') != null;
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
    if (this.suspended) return;
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
    if (this.orbitFollowed(transformX, transformY, transformZ / 100, rotateX, rotateZ)) return;

    const scale = (TABLE_PERSPECTIVE_PX + Math.abs(this.viewPositionZ)) / TABLE_PERSPECTIVE_PX;
    transformX *= scale;
    transformY *= scale;
    transformZ *= 3;
    if (80 < rotateX + this.viewRotateX) rotateX += 80 - (rotateX + this.viewRotateX);
    if (rotateX + this.viewRotateX < 0) rotateX += 0 - (rotateX + this.viewRotateX);

    const gridSize = this.tabletopService.gridSize();
    transformZ *= zoomStepFor(gridSize, this.viewPositionZ);
    const maxZ = touchZoomInLimitZ(gridSize);
    if (maxZ < transformZ + this.viewPositionZ) transformZ += maxZ - (transformZ + this.viewPositionZ);

    const minZ = zoomOutLimitZ(gridSize, this.tableCamera.layout);
    if (transformZ + this.viewPositionZ < minZ) transformZ += minZ - (transformZ + this.viewPositionZ);

    this.setTransform(transformX, transformY, transformZ, rotateX, rotateY, rotateZ);
    this.isTableTransformed = true;
  }

  private onTableMouseStart(e: TouchEvent | MouseEvent | PointerEvent): void {
    const me = e as MouseEvent;
    const target = me.target as HTMLElement;
    const isEmptyTablePress = this.isBareTable(target) || me.button === 1 || me.button === 2;
    this.groundPress = isEmptyTablePress && me.button === 0 && target.closest('[data-switch-host]') == null;
    if (isEmptyTablePress) {
      this.isTableTransformMode = true;
      if (!this.thirdPerson.following()) this.marqueeGesture?.arm(e as PointerEvent);
    } else {
      this.isTableTransformMode = false;
      this.pointerDeviceService.isDragging = true;
      this.gridOpacity.set(1);
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

    const groundPress = this.groundPress;
    this.groundPress = false;
    if (!released && !wasMarqueeActive && !this.isTableTransformed) {
      this.selectionSignalService.clearSelection();
      if (groundPress) void this.pressGround(e as MouseEvent);
    }
  }

  /**
   * Presses the painted ground under where a click let go, at the point the click lands on, so that
   * the top of a locked block reaches the ground it stands on.
   */
  private async pressGround(e: MouseEvent): Promise<void> {
    const at = this.tablePick.landingAt(e.pageX, e.pageY);
    const outcome = await this.switchPresses.pressGroundAt(at.x, at.y);
    if (!outcome || outcome === 'pressed' || outcome === 'busy') return;
    this.switchNotices.show(this.t(`feature.boardSwitch.refused.${outcome}`), e.clientX, e.clientY);
  }

  /**
   * While a piece is followed, takes a gesture that would move the table's camera as one that moves
   * the camera round the piece instead: a turn or a slide across turns it round, a tilt or a slide up
   * and down tips it, and pulling in brings it nearer, by `nearerCells`. Answers whether it did.
   */
  private orbitFollowed(
    transformX: number,
    transformY: number,
    nearerCells: number,
    rotateX: number,
    rotateZ: number
  ): boolean {
    if (!this.thirdPerson.following()) return false;
    this.thirdPerson.turnBy(-rotateZ - transformX * ORBIT_DEG_PER_PX, -rotateX + transformY * ORBIT_DEG_PER_PX);
    if (nearerCells) this.thirdPerson.nearerBy(nearerCells);
    this.isTableTransformed = true;
    return true;
  }

  private onTableMouseTransform(
    transformX: number,
    transformY: number,
    transformZ: number,
    rotateX: number,
    rotateY: number,
    rotateZ: number,
    event: TableMouseGestureEvent,
    srcEvent: TouchEvent | MouseEvent | PointerEvent | KeyboardEvent
  ): void {
    if (this.marqueeGesture && (this.marqueeGesture.isArmed || this.marqueeGesture.isActive)) {
      const pointer =
        srcEvent instanceof MouseEvent
          ? { x: srcEvent.pageX, y: srcEvent.pageY }
          : this.pointerDeviceService.pointers[0];
      this.marqueeGesture.updatePointer(pointer.x, pointer.y);
      if (this.marqueeGesture.isActive) {
        if ((srcEvent as Event).cancelable) (srcEvent as Event).preventDefault();
        return;
      }
    }

    if (this.suspended) return;
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
    if (this.thirdPerson.following() && event === TableMouseGestureEvent.KEYBOARD) return;
    if (this.orbitFollowed(transformX, transformY, transformZ / 50, rotateX, rotateZ)) return;

    const scale = (TABLE_PERSPECTIVE_PX + Math.abs(this.viewPositionZ)) / TABLE_PERSPECTIVE_PX;
    transformX *= scale;
    transformY *= scale;
    transformZ *= 3;
    const gridSize = this.tabletopService.gridSize();
    transformZ *= zoomStepFor(gridSize, this.viewPositionZ);
    const nearest = mouseZoomInLimitZ(gridSize);
    const furthest = zoomOutLimitZ(gridSize, this.tableCamera.layout);
    if (0 < transformZ) transformZ = Math.min(transformZ, Math.max(0, nearest - this.viewPositionZ));
    if (transformZ < 0) transformZ = Math.max(transformZ, Math.min(0, furthest - this.viewPositionZ));

    this.setTransform(transformX, transformY, transformZ, rotateX, rotateY, rotateZ);
    this.isTableTransformed = true;
  }

  private screenToTablePoint(screenX: number, screenY: number): MarqueePoint {
    const local = this.coordinateService.convertToFace({ x: screenX, y: screenY, z: 0 }, 'floor');
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
    const hits = selectByRect(candidates, rect, { gridSize: this.tabletopService.gridSize() });
    const joins = marqueeApply(modifiers, this.selectionSignalService.selectionSize() > 0);
    const next = joins === 'replace' ? new Set<string>() : new Set(this.selectionSignalService.selectedObjects());
    for (const id of hits) {
      if (joins === 'toggle' && next.has(id)) next.delete(id);
      else next.add(id);
    }
    this.selectionSignalService.replaceSelection(next);
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
