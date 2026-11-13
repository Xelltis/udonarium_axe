import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeEvent, ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { MovableLike, MultiMovableService } from '@axe/application/ui/multi-movable.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { PieceFootprint, TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { perfCounters, perfTimed } from '@axe/core/util/perf-counters';
import { SYNC_WRITE_DELAY_MS } from '@axe/core/util/sync-write-delay';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ALTITUDE_STEP_CELLS, steppedAltitude } from '@axe/domain/tabletop/altitude-step';
import {
  ContactFootprint,
  contactRestLevels,
  ContactRider,
  findContactSupport,
  findContactSupportZ,
  nextContactLevel,
} from '@axe/domain/tabletop/contact-support';
import { GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { gridSnapPosition } from '@axe/domain/tabletop/grid-snap';
import { clearRunAlong, MoveBlock } from '@axe/domain/tabletop/move/blocked-path';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { boardSurfaceOf, surfaceKeyOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { InputHandler, isTouchPress } from '@axe/ui/directives/input-handler';
import {
  applyPointerEvents,
  collectCollidableElements,
  MovableLayerItem,
  movedElsewhere,
  registerLayer,
  setLayerCollidable,
  unregisterLayer,
  wheelSpin,
} from '@axe/ui/directives/movable-helpers';
import {
  dragPointer2d,
  handleContextMenu,
  handleInputEnd,
  handleInputMove,
  handleInputStart,
  isPressTaken,
  MovableInteractionContext,
  takePress,
} from '@axe/ui/directives/movable-interaction';
import {
  buildClimbBlocks,
  buildContactProbe,
  climbSpread,
  contactRiderOf,
  ProbeTable,
} from '@axe/ui/directives/piece-contact-probe';
import { beamRestUnder, placeOnFace } from '@axe/ui/directives/surface-switch';

/** How far short of a sheer face a piece is put down, so whole pixels keep it on the outside. */
const BLOCK_GAP_PX = 1;
const GRID_PX = 50;
/** How finely a piece's height off its surface is kept, in pixels. */
const POS_Z_STEP = 1 / 8;

export interface MovableOption {
  readonly tabletopObject?: TabletopObject;
  readonly layerName?: string;
  readonly collideLayers?: string[];
  readonly snapOrigin?: { x: number; y: number };
  readonly snapStyle?: GridSnapStyle;
  /**
   * Where the piece goes when it is snapped from a place, ahead of the table's own snap; nothing
   * leaves it to that. A piece moved over squares of several cells is put on a square this way.
   */
  readonly snapToSquare?: (at: { x: number; y: number }) => { x: number; y: number } | null;
  /**
   * How much of its face the piece covers, in the face's own pixels. Its element is a box of the
   * screen over the table's canvas, whose size is the size it is drawn at rather than the size it
   * is. Read each time the piece is pressed.
   */
  readonly footprint?: () => PieceFootprint;
  /**
   * Whether the piece is set to be put down wherever it is let go, off the table's grid whatever the
   * table snaps to, as a range set to be placed freely. Read each time the piece is let go.
   */
  readonly freeOfGrid?: () => boolean;
}

@Directive({
  selector: '[appMovable]',
  host: { '[attr.data-pressed]': "pressedHere() ? '' : null" },
})
export class MovableDirective implements MovableInteractionContext {
  private readonly elementRef = inject(ElementRef);
  private readonly batchService = inject(BatchService);
  readonly pointerDeviceService = inject(PointerDeviceService);
  readonly coordinateService = inject(CoordinateService);
  private get tableSelecter(): TableSelecter {
    return TableSelecter.instance;
  }
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly heldPiece = inject(HeldPieceService);
  private readonly multiMovableService = inject(MultiMovableService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
  private readonly tablePick = inject(TablePickService);
  private readonly tableSurfaces = inject(TableSurfaceService);
  private readonly transient = inject(TransientPlacementService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  private registeredOverlapId: string | null = null;
  private contactProbe: ContactFootprint[] | null = null;
  private climbBlocks: MoveBlock[] | null = null;
  private dragReachZ: number | null = null;
  private dragRestingOn: string | undefined = undefined;

  private static layerHash: { [layerName: string]: MovableLayerItem[] } = {};

  /**
   * Puts something hit like a piece, but not moved as one, in a layer, so a piece being dragged
   * lets the pointer through it or not along with the pieces of that layer.
   */
  static joinLayer(layerName: string, item: MovableLayerItem): void {
    registerLayer(MovableDirective.layerHash, layerName, item);
  }

  /** Takes something out of a layer it joined. */
  static leaveLayer(layerName: string, item: MovableLayerItem): void {
    unregisterLayer(MovableDirective.layerHash, layerName, item);
  }

  private tabletopObject: TabletopObject | null = null;

  /** The piece the directive moves, or null before it is given one. */
  get piece(): TabletopObject | null {
    return this.tabletopObject;
  }

  layerName: string = '';
  private collideLayers: string[] = [];
  private footprint: (() => PieceFootprint) | undefined = undefined;
  private snapOrigin: { x: number; y: number } | undefined;
  private snapStyle: GridSnapStyle | undefined;
  private snapToSquare: MovableOption['snapToSquare'];

  readonly option = input.required<MovableOption>({ alias: 'movable.option' });

  /**
   * Whether this is the thing last pressed on the table, marked on the element so a screen with no
   * pointer to pass over it, which brings nothing's handles out, brings out this one's alone.
   */
  protected readonly pressedHere = computed(() => {
    const identifier = this.option().tabletopObject?.identifier;
    return !!identifier && this.selectionSignalService.pressedObject() === identifier;
  });
  readonly isDisable = input(false, { alias: 'movable.disable' });
  readonly isScratchOwner = input(false, { alias: 'movable.scratch_owner' });

  readonly onstart = output<PointerEvent>({ alias: 'movable.onstart' });
  readonly ondragstart = output<PointerEvent>({ alias: 'movable.ondragstart' });
  readonly ondrag = output<PointerEvent>({ alias: 'movable.ondrag' });
  readonly ondragend = output<PointerEvent>({ alias: 'movable.ondragend' });
  readonly onend = output<PointerEvent>({ alias: 'movable.onend' });

  /** The element the piece is drawn in, which the directive moves by its transform. */
  get nativeElement(): HTMLElement {
    return this.elementRef.nativeElement;
  }

  private _posX: number = 0;
  private _posY: number = 0;
  private _posZ: number = 0;

  private mathFloor: boolean = true;

  /**
   * The piece's left edge on its surface, in pixels, as currently shown.
   *
   * Setting it rounds down, redraws the piece at once and writes the value back to the piece's
   * synced location within a few frames. While the piece is held, the other selected pieces
   * are moved by the same amount.
   */
  get posX(): number {
    return this._posX;
  }
  set posX(posX: number) {
    this._posX = this.mathFloor ? Math.floor(posX) : posX;
    this.setUpdateTimer();
  }
  /** The piece's top edge on its surface, in pixels; set like `posX`. */
  get posY(): number {
    return this._posY;
  }
  set posY(posY: number) {
    this._posY = this.mathFloor ? Math.floor(posY) : posY;
    this.setUpdateTimer();
  }
  /** How high the piece stands off its surface, in pixels, kept to eighths; set like `posX`. */
  get posZ(): number {
    return this._posZ;
  }
  set posZ(posZ: number) {
    this._posZ = this.mathFloor ? Math.floor(posZ / POS_Z_STEP) * POS_Z_STEP : posZ;
    this.setUpdateTimer();
  }

  pointerOffset2d: PointerCoordinate = { x: 0, y: 0, z: 0 };
  pointerStart3d: PointerCoordinate = { x: 0, y: 0, z: 0 };

  startDrawnScale: number | null = null;

  height: number = 0;
  width: number = 0;
  ratio: number = 1.0;

  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private collidableElements: HTMLElement[] = [];
  input: InputHandler | null = null;

  /**
   * Whether a piece let go of snaps to the grid of the table being viewed.
   *
   * Follows the table's setting, on when there is no table; never for a piece stuck to a board, nor
   * for one set to be put down freely moved alone. One set so that leads others in a group drag is
   * snapped as they are, which follow it by as much as it moves and would be left off the grid.
   */
  get isGridSnap(): boolean {
    // A board is not ruled into squares. What is stuck to one keeps the spot it was put on
    // it, the way a sticker does, rather than jumping to the nearest line of the table.
    if (this.tabletopObject && boardSurfaceOf(this.tabletopObject)) return false;
    if (this.option().freeOfGrid?.() && !this.leadsGroup()) return false;
    return this.tableSelecter.viewTable?.gridSnap ?? true;
  }

  /** Whether the piece leads others in a group drag now. */
  private leadsGroup(): boolean {
    const identifier = this.tabletopObject?.identifier ?? '';
    return this.multiMovableService.followerTabletopObjectsFor(identifier).length > 0;
  }

  constructor() {
    effect(() => {
      const opt = this.option();
      if (opt.tabletopObject != null) this.tabletopObject = opt.tabletopObject;
      if (opt.layerName != null) this.layerName = opt.layerName;
      if (opt.collideLayers != null) this.collideLayers = opt.collideLayers;
      this.footprint = opt.footprint;
      this.snapOrigin = opt.snapOrigin;
      this.snapStyle = opt.snapStyle;
      this.snapToSquare = opt.snapToSquare;
      this.refreshOverlapRegistration();
      this.refreshObjectChangeListener();
      this.refreshMultiMovableRegistration();
    });
    afterNextRender(() => {
      this.batchService.add(() => this.initialize(), this.elementRef);
      this.setPosition(this.tabletopObject);
      this.refreshOverlapRegistration();
      this.refreshMultiMovableRegistration();
    });
    this.destroyRef.onDestroy(() => {
      this.cancel();
      if (this.tabletopObject) this.transient.release(this.tabletopObject.identifier);
      if (this.input) this.input.destroy();
      this.unregister();
      this.unregisterOverlap();
      this.unregisterMultiMovable();
      this.batchService.remove(this);
      this.batchService.remove(this.elementRef);
    });
  }

  private _multiAdapter: MovableLike | null = null;
  private _multiAdapterId: string | null = null;

  private refreshMultiMovableRegistration(): void {
    const id = this.tabletopObject?.identifier ?? null;
    if (id === this._multiAdapterId) return;
    if (this._multiAdapter) this.multiMovableService.unregister(this._multiAdapter);
    this._multiAdapter = null;
    this._multiAdapterId = id;
    if (!id) return;
    this._multiAdapter = new MultiMoveAdapter(this);
    this.multiMovableService.register(this._multiAdapter);
  }

  private unregisterMultiMovable(): void {
    if (this._multiAdapter) {
      this.multiMovableService.unregister(this._multiAdapter);
      this._multiAdapter = null;
      this._multiAdapterId = null;
    }
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

  /**
   * Moves the element to where a change elsewhere put its piece, a moment later and together with
   * the rest. A change this seat made itself is left alone while the piece is held, also when the
   * piece was picked up between the change and the move, as just after it was made.
   */
  private handleObjectChange(event: ObjectChangeEvent): void {
    if (!this.tabletopObject) return;
    if (!this.input) return;
    if (event.isSendFromSelf && this.input.isGrabbing) return;
    if (!movedElsewhere(this.tabletopObject, this.posX, this.posY, this.posZ)) return;
    this.batchService.add(() => {
      if (event.isSendFromSelf && this.input?.isGrabbing) return;
      if (this.input?.isGrabbing) this.cancel();
      this.setPosition(this.tabletopObject);
    }, this);
  }

  private refreshOverlapRegistration() {
    const obj = this.tabletopObject;
    if (!obj) {
      this.unregisterOverlap();
      return;
    }
    if (this.registeredOverlapId && this.registeredOverlapId !== obj.identifier) {
      this.tabletopOverlap.unregister(this.registeredOverlapId, this.nativeElement);
    }
    this.tabletopOverlap.register(obj, this.nativeElement, this.footprint);
    this.registeredOverlapId = obj.identifier;
  }

  private unregisterOverlap() {
    if (this.registeredOverlapId) {
      this.tabletopOverlap.unregister(this.registeredOverlapId, this.nativeElement);
      this.registeredOverlapId = null;
    }
  }

  /**
   * The height a held piece rests at with its middle at the given point on its surface.
   *
   * What it can stand on is gathered from the pieces on the same surface once per drag. The
   * level found is remembered, so turning the wheel steps up or down from there.
   */
  contactSupportZ(centerX: number, centerY: number): number {
    if (this.contactProbe === null) this.contactProbe = this.buildContactProbe();
    const self = this.tabletopObject;
    if (!self) return findContactSupportZ(this.contactProbe, centerX, centerY);
    const rider = this.contactRider(self);
    const support = findContactSupport(this.contactProbe, centerX, centerY, rider);
    this.dragReachZ = support.z;
    this.dragRestingOn = support.on;
    return GravityService.restingPosZ(self, support.z, rider.altitudePx);
  }

  private contactRider(self: TabletopObject): ContactRider {
    return contactRiderOf(self, this.tableGridSize(), {
      posZ: this.posZ,
      reachZ: this.dragReachZ,
      restingOn: this.dragRestingOn,
    });
  }

  private readonly onWheelWhileGrabbed = (e: WheelEvent) => this.liftByWheel(e);

  private liftByWheel(e: WheelEvent): void {
    if (!this.input?.isGrabbing) return;
    if ((this.isDisable() && !this.isScratchOwner()) || this.isReadOnly()) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const self = this.tabletopObject;
    const spin = wheelSpin(e);
    if (!self || spin === 0) return;
    if (e.shiftKey && this.sendAloft(self, spin < 0)) return;
    if (this.contactProbe === null) this.contactProbe = this.buildContactProbe();
    const rider = this.contactRider(self);
    const center = this.coordinateService.convertToFace(dragPointer2d(this), this.currentSurface());
    const levels = contactRestLevels(this.contactProbe, center.x, center.y, rider);
    const next = nextContactLevel(levels, rider.restingZ, spin < 0);
    if (next === null) return;

    // Lifted off by hand, so it is no longer following the surface it was resting on.
    this.dragReachZ = next;
    this.dragRestingOn = undefined;
    this.onInputMoveNow(e);
  }

  /**
   * Holding a piece off the ground, rather than putting it down on what is under it.
   *
   * The wheel alone walks whatever the piece can stand on, which is what a table wants of it
   * nearly always. Held with it, the wheel leaves the ground behind: the height goes into the
   * piece's own altitude, which is the only height a piece keeps - what it is standing on is
   * gravity's to write, and gravity would put a floating piece straight back down.
   */
  private sendAloft(self: TabletopObject, isUp: boolean): boolean {
    if (surfaceOf(self) !== 'floor') return false;

    const next = steppedAltitude(self.altitude, isUp, ALTITUDE_STEP_CELLS);
    if (next !== self.altitude) {
      self.altitude = next;
      self.update();
    }
    this.showHeldPiece(next);
    return true;
  }

  private showHeldPiece(altitude: number): void {
    const self = this.tabletopObject;
    if (!self) return;
    this.heldPiece.take({
      identifier: self.identifier,
      x: this.posX,
      y: this.posY,
      widthPx: this.width,
      heightPx: this.height,
      altitude,
      gridSize: this.tableGridSize(),
      liftable: surfaceOf(self) === 'floor',
    });
  }

  private followWithHeldPiece(): void {
    const self = this.tabletopObject;
    if (!self || this.heldPiece.held()?.identifier !== self.identifier) return;
    this.showHeldPiece(self.altitude);
  }

  /**
   * What is in hand, said for as long as it is in hand.
   *
   * A drag can be turned into more than a drag, and the turns it takes are worth hearing
   * about while the piece is held and worth nothing afterwards. Said from the moment the
   * piece is picked up rather than once the wheel has already been turned, since somebody
   * who does not know the wheel does anything never turns it.
   */
  private takeUpPiece(): void {
    const self = this.tabletopObject;
    if (!self) return;
    this.showHeldPiece(self.altitude);
  }

  private buildContactProbe(): ContactFootprint[] {
    const self = this.tabletopObject;
    if (!self) return [];
    return buildContactProbe(self, this.tabletopOverlap.entries(), this.probeTable(), this.walksTheTable());
  }

  /** The table the piece is dragged over, as the probe asks of it. */
  private probeTable(): ProbeTable {
    return { gridSize: this.tableGridSize(), gridType: this.tableSelecter.viewTable?.gridType ?? GridType.SQUARE };
  }

  private clearContactProbe() {
    this.contactProbe = null;
    this.climbBlocks = null;
    this.dragReachZ = null;
    this.dragRestingOn = undefined;
  }

  /**
   * Whether the piece in hand is held to what the terrain will let it walk over.
   *
   * The rule is about walking a piece around the table, so it is asked of characters alone:
   * terrain is being built rather than moved. The master is building either way.
   */
  private walksTheTable(): boolean {
    return this.tabletopObject instanceof GameCharacter && !this.rolePermission.isGameMaster();
  }

  /** The ground the piece in hand may not walk onto. */
  private buildClimbBlocks(): MoveBlock[] {
    const self = this.tabletopObject;
    if (!self) return [];
    const gridSize = this.tableGridSize();
    return buildClimbBlocks(
      self,
      this.tabletopOverlap.entries(),
      gridSize,
      climbSpread(this.width, this.height, gridSize)
    );
  }

  /** Holds the piece at the near face of anything it may not walk over. */
  private holdAtBlocks(fromX: number, fromY: number): void {
    if (this.posX === fromX && this.posY === fromY) return;
    if (this.climbBlocks === null) this.climbBlocks = this.buildClimbBlocks();
    if (this.climbBlocks.length < 1) return;
    const middleX = this.width / 2;
    const middleY = this.height / 2;
    const run = clearRunAlong(
      { x: fromX + middleX, y: fromY + middleY },
      { x: this.posX + middleX, y: this.posY + middleY },
      this.climbBlocks,
      BLOCK_GAP_PX
    );
    if (run >= 1) return;
    this.posX = fromX + (this.posX - fromX) * run;
    this.posY = fromY + (this.posY - fromY) * run;
    this.posZ = this.contactSupportZ(this.posX + middleX, this.posY + middleY);
  }

  /**
   * Starts listening for presses on the piece, joins its collision layer and draws it where
   * its synced location says.
   *
   * The layer defaults to the piece's alias name when none was given.
   */
  initialize() {
    this.input = new InputHandler(this.nativeElement);
    this.input.onStart = (e) => this.onInputStart(e);
    this.input.onMove = (e) => this.onInputMove(e);
    this.input.onEnd = (e) => this.onInputEnd(e);
    this.input.onContextMenu = (e) => this.onContextMenu(e);

    if (this.layerName.length < 1 && this.tabletopObject) this.layerName = this.tabletopObject.aliasName;
    this.register();
    this.setPosition(this.tabletopObject);
  }

  /**
   * Ends whatever drag is in progress and puts the piece back to its resting state.
   *
   * Pointer hits, the move animation and the other layers are restored, the held-piece readout
   * and the outline of where it would be put down are cleared, and what the piece could stand on is
   * forgotten until the next drag.
   */
  cancel() {
    window.removeEventListener('wheel', this.onWheelWhileGrabbed, { capture: true });
    this.heldPiece.letGo(this.tabletopObject?.identifier);
    if (this.input) this.input.cancel();
    this.promoteWhileMoving(false);
    this.setPointerEvents(true);
    this.setCollidableLayer(false);
    this.clearContactProbe();
    this.clearDragPreview();
    if (this.updateTimer === null) this.releasePlacement();
  }

  /**
   * A piece being dragged is the only thing on the table that is moving.
   *
   * The table is one 3D rendering context, so what the compositor cannot hold apart it has to
   * draw again together. Saying which one moves lets it keep the rest.
   */
  private promoteWhileMoving(isMoving: boolean): void {
    this.nativeElement.style.willChange = isMoving ? 'transform' : '';
  }

  /** Stops the table's own press gesture, such as a selection box, from starting under the piece. */
  cancelTableGesture() {
    this.selectionSignalService.cancelTableGesture();
  }

  /** Whether the local user's role may not edit the tabletop, which locks the piece in place. */
  isReadOnly(): boolean {
    return !this.rolePermission.canEditTabletop();
  }

  /**
   * Called when the piece is pressed: selects it, joins a drag of the whole selection, and
   * starts listening to the wheel for raising or lowering it while it is held.
   *
   * A press a piece standing on this one has taken up is left to that piece, so a piece stuck to a
   * board is dragged off it rather than carried along with the board. A piece that does not take
   * the press, being locked, leaves it to the board.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    if (isPressTaken(e)) {
      this.input?.cancel();
      return;
    }
    this.callSelectedEvent(e);
    this.promoteWhileMoving(true);
    if (this.collidableElements.length < 1) this.findCollidableElements();

    if (this._multiAdapter) this.multiMovableService.beginDrag(this._multiAdapter);
    window.addEventListener('wheel', this.onWheelWhileGrabbed, { capture: true, passive: false });
    this.takeUpPiece();
    handleInputStart(this, e);
    if (this.input?.isGrabbing) takePress(e);
  }

  /**
   * Called on each pointer move while the piece is pressed.
   *
   * Over another surface the piece shows a drop outline there, or rests on a beam; otherwise it
   * follows the pointer, and a player's character is stopped at terrain it may not walk over.
   */
  onInputMove(e: MouseEvent | TouchEvent) {
    perfCounters.bump('inputMove');
    perfTimed('inputMove', () => this.onInputMoveNow(e));
  }

  private onInputMoveNow(e: MouseEvent | TouchEvent) {
    this.moveWhileHeld(e);
    this.followWithHeldPiece();
  }

  private moveWhileHeld(e: MouseEvent | TouchEvent) {
    const pointerSurface = this.surfaceUnderPointer();
    const overDifferentSurface = pointerSurface !== null && pointerSurface !== this.currentSurface();
    if (overDifferentSurface && this.input?.isDragging && this.input.pointer) {
      const rest = this.computeBeamRest(this.input.pointer);
      if (rest) {
        this.posX = rest.x;
        this.posY = rest.y;
        this.posZ = rest.z;
        this.clearDragPreview();
        this.ondrag.emit(e as PointerEvent);
        return;
      }
    }
    if (overDifferentSurface) {
      this.updateDragPreview(pointerSurface);
      return;
    }
    const wasX = this.posX;
    const wasY = this.posY;
    perfTimed('collide', () => handleInputMove(this, e));
    if (this.walksTheTable()) this.holdAtBlocks(wasX, wasY);
    perfTimed('dragPreview', () => this.updateDragPreview(pointerSurface));
  }

  /**
   * The face under the pointer that this piece could be put down on, or nothing: the floor, a wall
   * or a white board, named as a location names it. The line of sight stops at what this piece
   * collides with and gives the face that stands on, and passes through the rest, the piece's own
   * layer among them. The piece itself is passed through, and so is what rides on it, since a board
   * carries its own face along under the pointer and would be laid on itself.
   */
  private surfaceUnderPointer(): string | null {
    const pointer = this.input?.pointer;
    if (!pointer) return null;
    const self = this.tabletopObject?.identifier;
    return perfTimed('hitTest', () =>
      this.tablePick.faceAt(pointer.x, pointer.y, {
        excluding: new Set(self ? [self] : []),
        stopsAt: (target) => target.layer !== this.layerName && this.collideLayers.includes(target.layer),
      })
    );
  }

  /** The face this piece stands on, named as its location names it. */
  currentSurface(): string {
    return this.tabletopObject?.location ? surfaceKeyOf(this.tabletopObject) : 'floor';
  }

  /** How much of its face the piece covers; see {@link MovableOption}. */
  footprintNow(): PieceFootprint | null {
    return this.footprint ? this.footprint() : null;
  }

  /** Where a point of the page lands on a face this piece could be moved onto; see {@link placeOnFace}. */
  private placeOnFace(surface: string, pointer: PointerCoordinate): { x: number; y: number } | null {
    return placeOnFace(this.tableSurfaces, surface, pointer, { width: this.width, height: this.height });
  }

  private showsDropPreview = false;

  private updateDragPreview(targetSurface: string | null): void {
    if (!this.input?.isDragging) {
      this.clearDragPreview();
      return;
    }
    const pointer = this.input.pointer;
    if (!pointer || !targetSurface || targetSurface === this.currentSurface()) {
      this.clearDragPreview();
      return;
    }
    const placed = this.placeOnFace(targetSurface, pointer);
    if (!placed) {
      this.clearDragPreview();
      return;
    }
    const x = Math.floor(placed.x);
    const y = Math.floor(placed.y);
    this.transient.showDropPreview({ surface: targetSurface, x, y, width: this.width, height: this.height });
    this.showsDropPreview = true;
  }

  private clearDragPreview(): void {
    if (!this.showsDropPreview) return;
    this.showsDropPreview = false;
    this.transient.showDropPreview(null);
  }

  /**
   * Called when the piece is let go.
   *
   * A piece dropped on a beam or on another surface moves onto it; then the drag ends as usual,
   * including the snap to the grid, and the selection's shared drag is finished.
   */
  onInputEnd(e: MouseEvent | TouchEvent) {
    if (this.input?.isDragging && !this.isScratchOwner()) {
      this.maybeSwitchSurfaceOnDrop();
    }
    this.clearDragPreview();
    handleInputEnd(this, e);
    if (this._multiAdapter) this.multiMovableService.endDrag(this._multiAdapter);
  }

  private maybeSwitchSurfaceOnDrop() {
    const self = this.tabletopObject;
    if (!self) return;
    const pointer = this.input?.pointer;
    if (!pointer) return;
    if (this.restOnBeamUnderPointer(self, pointer)) return;
    const targetSurface = this.surfaceUnderPointer();
    if (!targetSurface || targetSurface === this.currentSurface()) return;
    const placed = this.placeOnFace(targetSurface, pointer);
    if (!placed) return;
    const newX = this.mathFloor ? Math.floor(placed.x) : placed.x;
    const newY = this.mathFloor ? Math.floor(placed.y) : placed.y;
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this._posX = newX;
    this._posY = newY;
    this._posZ = 0;
    self.location.x = newX;
    self.location.y = newY;
    self.location.surface = targetSurface === 'floor' ? undefined : targetSurface;
    self.posZ = 0;
    this.markLocation();
  }

  private restOnBeamUnderPointer(self: TabletopObject, pointer: PointerCoordinate): boolean {
    const rest = this.computeBeamRest(pointer);
    if (!rest) return false;
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this._posX = rest.x;
    this._posY = rest.y;
    this._posZ = rest.z;
    self.location.x = rest.x;
    self.location.y = rest.y;
    self.location.surface = undefined;
    self.posZ = rest.z;
    this.markLocation();
    return true;
  }

  /** How wide a cell is on the table being looked at, which is not always the usual fifty. */
  private tableGridSize(): number {
    const size = this.tableSelecter.viewTable?.gridSize ?? 0;
    return size > 0 ? size : GRID_PX;
  }

  /** Where the piece comes to rest on the highest beam under the pointer, or null with none there. */
  private computeBeamRest(pointer: PointerCoordinate): { x: number; y: number; z: number } | null {
    return beamRestUnder(this.tablePick.allAt(pointer.x, pointer.y), this.tabletopObject?.identifier, {
      width: this.width,
      height: this.height,
    });
  }

  /** Called when a context menu is opened while the piece is pressed; ends the drag first. */
  onContextMenu(e: MouseEvent | TouchEvent) {
    handleContextMenu(this, e);
  }

  private callSelectedEvent(e: MouseEvent | TouchEvent) {
    if (this.tabletopObject)
      this.selectionSignalService.pressObject(
        this.tabletopObject.identifier,
        this.tabletopObject.aliasName,
        isTouchPress(e)
      );
  }

  /**
   * Moves the piece to the nearest spot the table's grid and snap style allow, square or hex.
   *
   * `gridSize` is used only when no table is being viewed. A player's character is still
   * stopped at terrain it may not walk over on the way to that spot.
   */
  snapToGrid(gridSize: number = GRID_PX) {
    const beforeX = this.posX;
    const beforeY = this.posY;
    this.snapToGridNow(gridSize);
    // Snapping is a move like any other: on hexes it reaches for the middle of a cell, which
    // from against a face is as often as not the middle of the cell behind it.
    if (this.walksTheTable()) this.holdAtBlocks(beforeX, beforeY);
  }

  private snapToGridNow(gridSize: number = GRID_PX) {
    const square = this.snapToSquare?.({ x: this.posX, y: this.posY });
    if (square) {
      this.posX = square.x;
      this.posY = square.y;
      return;
    }
    const table = this.tableSelecter.viewTable;
    const snapped = gridSnapPosition({
      x: this.posX,
      y: this.posY,
      width: this.width,
      height: this.height,
      gridSize: table?.gridSize ?? gridSize,
      gridType: table?.gridType ?? GridType.SQUARE,
      snapStyle: this.snapStyle ?? table?.gridSnapStyle ?? GridSnapStyle.CENTER,
      origin: this.snapOrigin,
    });
    this.posX = snapped.x;
    this.posY = snapped.y;
  }

  private setPosition(object: TabletopObject | null) {
    if (!object?.location) return;
    this._posX = this.mathFloor ? Math.floor(object.location.x) : object.location.x;
    this._posY = this.mathFloor ? Math.floor(object.location.y) : object.location.y;
    this._posZ = this.mathFloor ? Math.floor(object.posZ / POS_Z_STEP) * POS_Z_STEP : object.posZ;

    this.markLocation();
  }

  /**
   * Writes where the piece stands to its object now, rather than on the next tick of the timer that
   * gathers the moves of a drag, so what reads the object at once reads where it was let go.
   */
  commitPosition(): void {
    if (this.updateTimer === null || !this.tabletopObject) return;
    clearTimeout(this.updateTimer);
    this.updateTimer = null;
    this.tabletopObject.location.x = this.posX;
    this.tabletopObject.location.y = this.posY;
    this.tabletopObject.posZ = this.posZ;
    if (!this.input?.isGrabbing) this.releasePlacement();
  }

  private setUpdateTimer() {
    const self = this.tabletopObject;
    if (this.updateTimer === null && self) {
      this.updateTimer = setTimeout(() => {
        self.location.x = this.posX;
        self.location.y = this.posY;
        self.posZ = this.posZ;
        this.updateTimer = null;
        if (!this.input?.isGrabbing) this.releasePlacement();
      }, SYNC_WRITE_DELAY_MS);
    }
    if (this.tabletopObject) {
      this.transient.place(this.tabletopObject.identifier, {
        surface: this.currentSurface(),
        x: this.posX,
        y: this.posY,
        z: this.posZ,
      });
    }
    this.markLocation();
    if (this.input?.isGrabbing && this._multiAdapter) {
      this.multiMovableService.applyLeaderDelta(this._multiAdapter);
    }
  }

  /** Lets the piece be shown where its object says, once its object has caught up with it. */
  private releasePlacement(): void {
    if (this.tabletopObject) this.transient.release(this.tabletopObject.identifier);
  }

  private findCollidableElements() {
    this.collidableElements = collectCollidableElements(this.nativeElement);
  }

  /**
   * Lets the pointer hit the piece, or passes it through to what is underneath.
   *
   * The elements affected are found on the first press, so this does nothing before then.
   */
  setPointerEvents(isEnable: boolean) {
    applyPointerEvents(this.collidableElements, isEnable);
  }

  /** Marks on the element where the piece stands, and on which face, for the tests and the tools that read it. */
  private markLocation() {
    this.nativeElement.dataset['location'] = `${this.posX},${this.posY},${this.posZ}`;
    this.nativeElement.dataset['onSurface'] = this.currentSurface();
  }

  /** Makes the other pieces hittable or not according to the layers this piece collides with. */
  setCollidableLayer(isCollidable: boolean) {
    setLayerCollidable(MovableDirective.layerHash, this.collideLayers, this, !!this.input?.isGrabbing, isCollidable);
  }

  private register() {
    registerLayer(MovableDirective.layerHash, this.layerName, this);
  }

  private unregister() {
    unregisterLayer(MovableDirective.layerHash, this.layerName, this);
  }
}

/**
 * The face a piece shows to the service that moves several at once: where it stands, which it
 * can be set, and its object, read through the directive so a piece swapped under it is followed.
 */
class MultiMoveAdapter implements MovableLike {
  constructor(private readonly directive: MovableDirective) {}

  get identifier(): string {
    return this.directive.piece?.identifier ?? '';
  }

  get tabletopObject(): TabletopObject | undefined {
    return this.directive.piece ?? undefined;
  }

  get posX(): number {
    return this.directive.posX;
  }

  set posX(v: number) {
    this.directive.posX = v;
  }

  get posY(): number {
    return this.directive.posY;
  }

  set posY(v: number) {
    this.directive.posY = v;
  }

  commitPosition(): void {
    this.directive.commitPosition();
  }
}
