import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, input, output } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeEvent, ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { GridType } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { QUARTER_TURN_DEGREES, rotationSnapStep, shownAngle, snapAngle } from '@axe/domain/tabletop/rotation-snap';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { InputHandler } from '@axe/ui/directives/input-handler';

export interface RotableTabletopObject extends TabletopObject {
  rotate: number;
}

export interface RotableOption {
  readonly tabletopObject?: RotableTabletopObject;
  readonly grabbingSelecter?: string;
  readonly transformCssOffset?: string;
}

@Directive({ selector: '[appRotable]' })
export class RotableDirective {
  private readonly elementRef = inject(ElementRef);
  private readonly batchService = inject(BatchService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly rotationGuide = inject(RotationGuideService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly destroyRef = inject(DestroyRef);

  private tabletopObject: RotableTabletopObject | null = null;

  private transformCssOffset: string = '';
  private grabbingSelecter: string = '.rotate-grab';
  readonly option = input<RotableOption | undefined>(undefined, { alias: 'rotable.option' });
  readonly isDisable = input(false, { alias: 'rotable.disable' });
  readonly onstart = output<PointerEvent>({ alias: 'rotable.onstart' });
  readonly ondragstart = output<PointerEvent>({ alias: 'rotable.ondragstart' });
  readonly ondrag = output<PointerEvent>({ alias: 'rotable.ondrag' });
  readonly ondragend = output<PointerEvent>({ alias: 'rotable.ondragend' });
  readonly onend = output<PointerEvent>({ alias: 'rotable.onend' });

  private get nativeElement(): HTMLElement {
    return this.elementRef.nativeElement;
  }

  private _rotate: number = 0;
  /**
   * The angle the element is shown turned to, in degrees.
   *
   * Setting it redraws at once, and within a few frames emits `rotable.valueChange` and writes
   * the angle to the piece, which syncs it.
   */
  get rotate(): number {
    return this._rotate;
  }
  set rotate(rotate: number) {
    this._rotate = rotate;
    this.setUpdateTimer();
  }
  readonly value = input(0, { alias: 'rotable.value' });
  readonly valueChange = output<number>({ alias: 'rotable.valueChange' });

  private get isAllowedToRotate(): boolean {
    if (!this.grabbingElement || !this.nativeElement) return false;
    if (this.grabbingSelecter.length < 1) return true;
    const elements = this.nativeElement.querySelectorAll(this.grabbingSelecter);
    let macth: boolean;
    for (let i = 0; i < elements.length; i++) {
      macth = elements[i].contains(this.grabbingElement);
      if (macth) return true;
    }
    return false;
  }

  private rotateOffset: number = 0;
  /** Where the pointer last put the turn, before any snap. */
  private freeAngle: number = 0;
  /** Whether Alt is held, which snaps the turn while it is under way. */
  private snapping = false;
  private readonly onSnapKey = (e: KeyboardEvent) => this.snapKey(e);
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private grabbingElement: HTMLElement | null = null;
  private input: InputHandler | null = null;

  constructor() {
    effect(() => {
      const opt = this.option();
      if (opt == null) return;
      if (opt.tabletopObject != null) this.tabletopObject = opt.tabletopObject;
      if (opt.grabbingSelecter != null) this.grabbingSelecter = opt.grabbingSelecter;
      if (opt.transformCssOffset != null) this.transformCssOffset = opt.transformCssOffset;
      this.refreshObjectChangeListener();
    });
    effect(() => {
      this._rotate = this.value();
      this.updateTransformCss();
    });
    afterNextRender(() => {
      this.batchService.add(() => this.initialize(), this.elementRef);
      if (this.tabletopObject) {
        this.setRotate(this.tabletopObject);
      } else {
        this.updateTransformCss();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.settlePendingUpdate();
      this.cancel();
      this.input?.destroy();
      this.batchService.remove(this);
      this.batchService.remove(this.elementRef);
    });
  }

  private _objectChangeUnsubscribe: (() => void) | null = null;
  private _objectChangeId: string | null = null;

  private refreshObjectChangeListener(): void {
    const id = this.tabletopObject?.identifier ?? null;
    if (id === this._objectChangeId) return;
    if (this._objectChangeUnsubscribe) {
      this._objectChangeUnsubscribe();
      this._objectChangeUnsubscribe = null;
    }
    this._objectChangeId = id;
    if (id == null || id === '') return;
    this._objectChangeUnsubscribe = this.objectChange.onObjectChangedForIdentifier(
      id,
      (event) => this.handleObjectChange(event),
      this.destroyRef
    );
  }

  private handleObjectChange(event: ObjectChangeEvent): void {
    const tabletopObject = this.tabletopObject;
    if (!tabletopObject) return;
    if (!this.input) return;
    if (event.isSendFromSelf && this.input.isGrabbing) return;
    if (!this.shouldTransition(tabletopObject)) return;
    this.batchService.add(() => {
      if (this.input?.isGrabbing) {
        this.cancel();
      } else {
        this.setAnimatedTransition(true);
      }
      this.stopTransition();
      this.setRotate(tabletopObject);
    }, this);
  }

  /**
   * Starts listening for presses on the element and draws it at the piece's angle, or at the
   * bound value when there is no piece.
   */
  initialize() {
    this.input = new InputHandler(this.nativeElement);
    this.input.onStart = (e) => this.onInputStart(e);
    this.input.onMove = (e) => this.onInputMove(e);
    this.input.onEnd = (e) => this.onInputEnd(e);
    this.input.onContextMenu = (e) => this.onContextMenu(e);

    if (this.tabletopObject) {
      this.setRotate(this.tabletopObject);
    } else {
      this.updateTransformCss();
    }
  }

  /** Ends a turn in progress, forgets what was grabbed and turns the glide animation back on. */
  cancel() {
    this.input?.cancel();
    this.grabbingElement = null;
    this.setAnimatedTransition(true);
    this.stopListeningForSnap();
    this.rotationGuide.end(this);
  }

  private get isReadOnly(): boolean {
    return !this.rolePermission.canEditTabletop;
  }

  /**
   * Called when the element is pressed; starts a turn when the press is on a grab handle.
   *
   * A disabled element, a read-only role, a press outside the handles, and a middle or right
   * press all cancel instead.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    this.grabbingElement = e.target as HTMLElement;
    if (
      this.isDisable() ||
      this.isReadOnly ||
      !this.isAllowedToRotate ||
      (e as MouseEvent).button === 1 ||
      (e as MouseEvent).button === 2
    )
      return this.cancel();
    const input = this.input;
    const grabbingElement = this.grabbingElement;
    const parentElement = this.nativeElement.parentElement;
    if (!input || !grabbingElement || !parentElement) return this.cancel();

    e.stopPropagation();
    this.onstart.emit(e as PointerEvent);

    const pointer = this.coordinateService.convertLocalToLocal(input.pointer, grabbingElement, parentElement);
    this.rotateOffset = this.calcRotate(pointer, this.rotate);
    this.setAnimatedTransition(false);
  }

  /**
   * Called on each pointer move during a turn; turns the element towards the pointer about its
   * middle, keeping the angle it was grabbed at. With Alt held it turns in steps, by the sides and
   * diagonals of a square grid or the faces and corners of a hex one, and the screen says how far
   * it has turned all the while.
   */
  onInputMove(e: MouseEvent | TouchEvent) {
    if (this.input?.isGrabbing && !this.pointerDeviceService.isDragging) {
      return this.cancel();
    }
    if (this.isDisable() || this.isReadOnly || !this.input?.isGrabbing) return this.cancel();

    const input = this.input;
    const grabbingElement = this.grabbingElement;
    const parentElement = this.nativeElement.parentElement;
    if (!input || !grabbingElement || !parentElement) return this.cancel();

    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const pointer3d = this.coordinateService.convertLocalToLocal(input.pointer, grabbingElement, parentElement);
    this.freeAngle = this.calcRotate(pointer3d, this.rotateOffset);
    this.snapping = (e as MouseEvent).altKey === true;

    if (!this.input?.isDragging) {
      this.ondragstart.emit(e as PointerEvent);
      this.listenForSnap();
    }
    this.ondrag.emit(e as PointerEvent);
    this.turnTo();
  }

  /**
   * The step a held snap turns by on the table being viewed. A custom range lies only at quarter
   * turns, which is where it settles once let go, so it is snapped by quarters on any grid.
   */
  private get snapStep(): number {
    if (this.turnsByQuarters) return QUARTER_TURN_DEGREES;
    return rotationSnapStep(this.tableSelecter.viewTable?.gridType ?? GridType.SQUARE);
  }

  /** Whether the object turns only by quarter turns, as a custom range does. */
  private get turnsByQuarters(): boolean {
    return this.tabletopObject instanceof RangeArea && this.tabletopObject.type === 'CUSTOM';
  }

  private turnTo(): void {
    const step = this.snapStep;
    this.rotate = this.snapping ? snapAngle(this.freeAngle, step) : this.freeAngle;
    this.rotationGuide.report(this, { angle: shownAngle(this.rotate), step, snapping: this.snapping });
  }

  /**
   * Snaps the turn the moment Alt goes down, and frees it the moment Alt comes up, without waiting
   * for the pointer to move. The key goes no further, so the browser does not take it for its menu.
   */
  private snapKey(e: KeyboardEvent): void {
    if (e.key !== 'Alt' || !this.input?.isGrabbing) return;
    e.preventDefault();
    const snapping = e.type === 'keydown';
    if (snapping === this.snapping) return;
    this.snapping = snapping;
    this.turnTo();
  }

  private listenForSnap(): void {
    const document = this.nativeElement.ownerDocument;
    document.addEventListener('keydown', this.onSnapKey, true);
    document.addEventListener('keyup', this.onSnapKey, true);
  }

  private stopListeningForSnap(): void {
    const document = this.nativeElement.ownerDocument;
    document.removeEventListener('keydown', this.onSnapKey, true);
    document.removeEventListener('keyup', this.onSnapKey, true);
    this.snapping = false;
  }

  /** Called when a turn is let go: ends it, snaps the angle, and emits `rotable.onend`. */
  onInputEnd(e: MouseEvent | TouchEvent) {
    if (this.isDisable() || this.isReadOnly) return this.cancel();
    e.stopPropagation();
    if (this.input?.isDragging) this.ondragend.emit(e as PointerEvent);
    this.cancel();
    this.snapToPolygonal();
    this.onend.emit(e as PointerEvent);
  }

  /** Called when a context menu is opened during a turn: ends it and snaps the angle. */
  onContextMenu(e: MouseEvent | TouchEvent) {
    if (this.isDisable()) return this.cancel();
    if (e.cancelable) e.preventDefault();
    this.cancel();
    this.snapToPolygonal();
  }

  private calcRotate(pointer: PointerCoordinate, rotateOffset: number): number {
    const centerX = this.nativeElement.clientWidth / 2;
    const centerY = this.nativeElement.clientHeight / 2;
    const x = pointer.x - centerX;
    const y = pointer.y - centerY;
    const rad = Math.atan2(y, x);
    return ((rad * 180) / Math.PI - rotateOffset) % 360;
  }

  /**
   * Rounds the angle to the nearest of `polygonal` equal steps round a circle.
   *
   * A custom range snaps to quarter turns, and a range that asks for fine steps to 240 of them.
   * A count of one or less leaves the angle alone.
   */
  snapToPolygonal(polygonal: number = 24) {
    if (polygonal <= 1) return;
    if (this.tabletopObject instanceof RangeArea) {
      const range = this.tabletopObject as RangeArea;
      if (this.turnsByQuarters) polygonal = 360 / QUARTER_TURN_DEGREES;
      else if (range.subDivisionSnapPolygonal) polygonal = 240;
    }
    this.rotate = this.rotate < 0 ? this.rotate - 180 / polygonal : this.rotate + 180 / polygonal;
    this.rotate -= this.rotate % (360 / polygonal);
  }

  /**
   * Writes a turn still waiting on its timer to the piece at once, as the element goes. Nothing is
   * emitted, since whoever listened has gone with it.
   */
  private settlePendingUpdate(): void {
    if (this.updateTimer === null) return;
    clearTimeout(this.updateTimer);
    this.updateTimer = null;
    if (this.tabletopObject) this.tabletopObject.rotate = this.rotate;
  }

  private setUpdateTimer() {
    if (this.updateTimer === null) {
      this.updateTimer = setTimeout(() => {
        this.valueChange.emit(this.rotate);
        if (this.tabletopObject) this.tabletopObject.rotate = this.rotate;
        this.updateTimer = null;
      }, 66);
    }
    this.updateTransformCss();
  }

  private setRotate(object: RotableTabletopObject) {
    if (object) this._rotate = object.rotate;
    this.updateTransformCss();
  }

  private setAnimatedTransition(isEnable: boolean) {
    this.nativeElement.style.transition = isEnable ? 'transform 132ms linear' : '';
  }

  private shouldTransition(object: RotableTabletopObject): boolean {
    return object.rotate !== this.rotate;
  }

  private stopTransition() {
    this.nativeElement.style.transform = window.getComputedStyle(this.nativeElement).transform;
  }

  private updateTransformCss() {
    const css = `${this.transformCssOffset} rotateZ(${this.rotate.toFixed(4)}deg)`;
    this.nativeElement.style.transform = css;
  }
}
