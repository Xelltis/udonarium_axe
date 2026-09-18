import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, input, output } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeEvent, ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { MultiMovableService } from '@axe/application/ui/multi-movable.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import {
  footprintOf,
  TabletopOverlapRegistryEntry,
  TabletopOverlapService,
} from '@axe/application/ui/tabletop-overlap.service';
import { perfCounters, perfTimed } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ALTITUDE_STEP_CELLS, steppedAltitude } from '@axe/domain/tabletop/altitude-step';
import { GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { clearRunAlong, MoveBlock } from '@axe/domain/tabletop/move/blocked-path';
import { SurfaceDims, surfaceWorldBox, WorldBox } from '@axe/domain/tabletop/surface-space';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import {
  boardSurfaceOf,
  isOffTheFloor,
  surfaceOf,
  TableSurface,
  TabletopObject,
} from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { terrainSlopeRoofOf, terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';
import { InputHandler } from '@axe/ui/directives/input-handler';
import {
  applyPointerEvents,
  beamRestPosition,
  calcHexAllSnapPosition,
  calcHexBothSnapPosition,
  calcHexSnapPosition,
  calcHexVertexSnapPosition,
  calcSnapNum,
  collectCollidableElements,
  ContactFootprint,
  contactRestLevels,
  ContactRider,
  dropTargetSurface,
  findContactSupport,
  findContactSupportZ,
  MovableLayerItem,
  nextContactLevel,
  registerLayer,
  setLayerCollidable,
  shouldTransitionTo,
  toTransformCss,
  unregisterLayer,
  wheelSpin,
} from '@axe/ui/directives/movable-helpers';
import {
  dragPointer2d,
  handleContextMenu,
  handleInputEnd,
  handleInputMove,
  handleInputStart,
  MovableInteractionContext,
} from '@axe/ui/directives/movable-interaction';

const WALL_OCCLUSION_INSET_PX = 2;
/** How far short of a sheer face a piece is put down, so whole pixels keep it on the outside. */
const BLOCK_GAP_PX = 1;
const GRID_PX = 50;

export interface MovableOption {
  readonly tabletopObject?: TabletopObject;
  readonly layerName?: string;
  readonly colideLayers?: string[];
  readonly transformCssOffset?: string;
  readonly snapOrigin?: { x: number; y: number };
  readonly snapStyle?: GridSnapStyle;
}

@Directive({ selector: '[appMovable]' })
export class MovableDirective implements MovableInteractionContext {
  private readonly elementRef = inject(ElementRef);
  private readonly batchService = inject(BatchService);
  readonly pointerDeviceService = inject(PointerDeviceService);
  readonly coordinateService = inject(CoordinateService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly heldPiece = inject(HeldPieceService);
  private readonly multiMovableService = inject(MultiMovableService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
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

  private tabletopObject!: TabletopObject;
  layerName: string = '';
  private colideLayers: string[] = [];
  private transformCssOffset: string = '';
  private snapOrigin: { x: number; y: number } | undefined;
  private snapStyle: GridSnapStyle | undefined;

  readonly option = input.required<MovableOption>({ alias: 'movable.option' });
  readonly isDisable = input(false, { alias: 'movable.disable' });
  readonly isScratcOwner = input(false, { alias: 'movable.scratch_owner' });

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
    this._posZ = this.mathFloor ? Math.floor(posZ * 8) / 8 : posZ;
    this.setUpdateTimer();
  }

  pointerOffset2d: PointerCoordinate = { x: 0, y: 0, z: 0 };
  pointerStart3d: PointerCoordinate = { x: 0, y: 0, z: 0 };

  targetStartRect!: DOMRect;

  height: number = 0;
  width: number = 0;
  ratio: number = 1.0;

  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private collidableElements: HTMLElement[] = [];
  input: InputHandler | null = null;

  /**
   * Whether a piece let go of snaps to the grid of the table being viewed.
   *
   * Follows the table's setting, on when there is no table; never for a piece stuck to a board.
   */
  get isGridSnap(): boolean {
    // A board is not ruled into squares. What is stuck to one keeps the spot it was put on
    // it, the way a sticker does, rather than jumping to the nearest line of the table.
    if (this.tabletopObject && boardSurfaceOf(this.tabletopObject)) return false;
    return this.tableSelecter.viewTable?.gridSnap ?? true;
  }

  constructor() {
    effect(() => {
      const opt = this.option();
      if (opt.tabletopObject != null) this.tabletopObject = opt.tabletopObject;
      if (opt.layerName != null) this.layerName = opt.layerName;
      if (opt.colideLayers != null) this.colideLayers = opt.colideLayers;
      if (opt.transformCssOffset != null) this.transformCssOffset = opt.transformCssOffset;
      this.snapOrigin = opt.snapOrigin;
      this.snapStyle = opt.snapStyle;
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
      if (this.input) this.input.destroy();
      this.unregister();
      this.unregisterOverlap();
      this.unregisterMultiMovable();
      this.batchService.remove(this);
      this.batchService.remove(this.elementRef);
    });
  }

  private _multiAdapter: import('@axe/application/ui/multi-movable.service').MovableLike | null = null;
  private _multiAdapterId: string | null = null;

  private refreshMultiMovableRegistration(): void {
    const id = this.tabletopObject?.identifier ?? null;
    if (id === this._multiAdapterId) return;
    if (this._multiAdapter) this.multiMovableService.unregister(this._multiAdapter);
    this._multiAdapter = null;
    this._multiAdapterId = id;
    if (!id) return;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this._multiAdapter = {
      get identifier() {
        return self.tabletopObject?.identifier ?? '';
      },
      get tabletopObject() {
        return self.tabletopObject;
      },
      get posX() {
        return self.posX;
      },
      set posX(v: number) {
        self.posX = v;
      },
      get posY() {
        return self.posY;
      },
      set posY(v: number) {
        self.posY = v;
      },
    };
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

  private handleObjectChange(event: ObjectChangeEvent): void {
    if (!this.tabletopObject) return;
    if (!this.input) return;
    if (event.isSendFromSelf && this.input.isGrabbing) return;
    if (!this.shouldTransition(this.tabletopObject)) return;
    this.batchService.add(() => {
      if (this.input!.isGrabbing) {
        this.cancel();
      } else {
        this.setAnimatedTransition(true);
      }
      this.stopTransition();
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
    this.tabletopOverlap.register(obj, this.nativeElement);
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
    const gridSize = this.tableGridSize();
    const altitudePx = surfaceOf(self) === 'floor' ? self.altitude * gridSize : 0;
    const ridesUp = !(self instanceof Terrain);
    return {
      altitudePx,
      thicknessPx: self instanceof Terrain ? self.height * gridSize : 0,
      ridesUp,
      restingZ: this.dragReachZ ?? (ridesUp ? this.posZ : altitudePx + this.posZ),
      restingOn: this.dragRestingOn,
    };
  }

  private readonly onWheelWhileGrabbed = (e: WheelEvent) => this.liftByWheel(e);

  private liftByWheel(e: WheelEvent): void {
    if (!this.input?.isGrabbing) return;
    if ((this.isDisable() && !this.isScratcOwner()) || this.isReadOnly()) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const self = this.tabletopObject;
    const spin = wheelSpin(e);
    if (!self || spin === 0) return;
    if (e.shiftKey && this.sendAloft(self, spin < 0)) return;
    if (this.contactProbe === null) this.contactProbe = this.buildContactProbe();
    const rider = this.contactRider(self);
    const center = this.coordinateService.convertToLocal(dragPointer2d(this), this.surfaceElement());
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

  /**
   * How high a sloping block's surface stands over a point, for the probe to ask as the piece
   * moves, or nothing for anything with a level top.
   */
  private slopeTopReader(
    object: TabletopObject,
    selfSurface: TableSurface,
    gridSize: number
  ): ((x: number, y: number) => number) | undefined {
    if (!(object instanceof Terrain) || selfSurface !== 'floor' || surfaceOf(object) !== 'floor') return undefined;
    const gridType = this.tableSelecter.viewTable?.gridType ?? GridType.SQUARE;
    if (!terrainSlopeRoofOf(object, gridSize, gridType)) return undefined;
    return (x, y) => terrainTopPxAt(object, gridSize, gridType, x, y);
  }

  private buildContactProbe(): ContactFootprint[] {
    const self = this.tabletopObject;
    if (!self) return [];
    const selfSurface = surfaceOf(self);
    const gridSize = this.tableGridSize();
    const sheer = this.walksTheTable();
    const footprints: ContactFootprint[] = [];
    for (const entry of this.tabletopOverlap.entries()) {
      if (entry.object.identifier === self.identifier) continue;
      if (surfaceOf(entry.object) !== selfSurface) continue;
      const left = entry.object.location.x;
      const top = entry.object.location.y;
      const footprint = footprintOf(entry, gridSize);
      footprints.push({
        left,
        top,
        right: left + footprint.width,
        bottom: top + footprint.height,
        bottomZ: GravityService.contactBottomZ(entry.object, selfSurface, gridSize),
        topZ: GravityService.contactTopZ(entry.object, selfSurface, gridSize),
        climbable: !(sheer && entry.object instanceof Terrain && entry.object.blocksClimb),
        topAt: this.slopeTopReader(entry.object, selfSurface, gridSize),
        identifier: entry.object.identifier,
      });
    }
    return footprints;
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
    return this.tabletopObject instanceof GameCharacter && !this.rolePermission.isGameMaster;
  }

  /**
   * How far a piece hangs over the cell it stands in, which is what the ground beside it owes.
   *
   * A piece is stopped by where its middle is, and a piece of one cell already owns the cell
   * its middle is in, so the block itself is all that need stand in its way: grown by half a
   * piece as well, a gap one cell wide would be a gap of no width at all and nothing would
   * ever walk between two walls. What a piece wider than a cell hangs over is another matter,
   * and that much is asked of the ground beside the block.
   */
  private climbSpread(): { x: number; y: number } {
    const gridSize = this.tableGridSize();
    return {
      x: Math.max(0, (this.width - gridSize) / 2),
      y: Math.max(0, (this.height - gridSize) / 2),
    };
  }

  /** The ground the piece in hand may not walk onto. */
  private buildClimbBlocks(): MoveBlock[] {
    const self = this.tabletopObject;
    if (!self) return [];
    const selfSurface = surfaceOf(self);
    const gridSize = this.tableGridSize();
    const spread = this.climbSpread();
    const blocks: MoveBlock[] = [];
    for (const entry of this.tabletopOverlap.entries()) {
      const object = entry.object;
      if (object.identifier === self.identifier) continue;
      if (!(object instanceof Terrain) || !object.blocksClimb) continue;
      if (surfaceOf(object) !== selfSurface) continue;
      if (object.isDoor && object.isDoorOpen) continue;
      const box = terrainBoxOf(object, gridSize);
      blocks.push({
        minX: box.minX - spread.x,
        minY: box.minY - spread.y,
        maxX: box.maxX + spread.x,
        maxY: box.maxY + spread.y,
      });
    }
    return blocks;
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
   * is cleared, and what the piece could stand on is forgotten until the next drag.
   */
  cancel() {
    window.removeEventListener('wheel', this.onWheelWhileGrabbed, { capture: true });
    this.heldPiece.letGo(this.tabletopObject?.identifier);
    if (this.input) this.input.cancel();
    this.promoteWhileMoving(false);
    this.setPointerEvents(true);
    this.setAnimatedTransition(true);
    this.setCollidableLayer(false);
    this.clearContactProbe();
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

  /**
   * Looks up the table point under the pointer for a scratch owner's drag.
   *
   * Nothing is kept or moved: the piece stays where it is.
   */
  scratchObjectPosition(_start: boolean) {
    const pointerScratch2d = {
      x: this.input!.pointer.x,
      y: this.input!.pointer.y,
      z: 0,
    };
    pointerScratch2d.x = Math.min(window.innerWidth - 0.1, Math.max(pointerScratch2d.x, 0.1));
    pointerScratch2d.y = Math.min(window.innerHeight - 0.1, Math.max(pointerScratch2d.y, 0.1));

    const elementScratch = document.elementFromPoint(pointerScratch2d.x, pointerScratch2d.y) as HTMLElement;
    if (elementScratch == null) return;

    const pointerSchratch3d = this.coordinateService.calcTabletopLocalCoordinate(pointerScratch2d, elementScratch);

    pointerSchratch3d.x -= this.posX;
    pointerSchratch3d.y -= this.posY;
  }

  /** Whether the local user's role may not edit the tabletop, which locks the piece in place. */
  isReadOnly(): boolean {
    return !this.rolePermission.canEditTabletop;
  }

  /**
   * Called when the piece is pressed: selects it, joins a drag of the whole selection, and
   * starts listening to the wheel for raising or lowering it while it is held.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    this.callSelectedEvent();
    this.promoteWhileMoving(true);
    if (this.collidableElements.length < 1) this.findCollidableElements();

    if (this._multiAdapter) this.multiMovableService.beginDrag(this._multiAdapter);
    window.addEventListener('wheel', this.onWheelWhileGrabbed, { capture: true, passive: false });
    this.takeUpPiece();
    handleInputStart(this, e);
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
    const overDifferentSurface = pointerSurface !== null && pointerSurface !== this.surfaceElement();
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

  /** The face under the pointer that this piece could be put down on, or nothing. */
  private surfaceUnderPointer(): HTMLElement | null {
    const pointer = this.input?.pointer;
    if (!pointer) return null;
    const under = perfTimed('hitTest', () => document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null);
    return dropTargetSurface(this.nativeElement, under);
  }

  private dragPreviewElement: HTMLElement | null = null;
  private dragPreviewSurface: HTMLElement | null = null;

  private updateDragPreview(targetSurface: HTMLElement | null): void {
    if (!this.input?.isDragging) {
      this.clearDragPreview();
      return;
    }
    const pointer = this.input.pointer;
    if (!pointer) {
      this.clearDragPreview();
      return;
    }
    if (!targetSurface || targetSurface === this.surfaceElement()) {
      this.clearDragPreview();
      return;
    }
    const local = this.coordinateService.convertToLocal({ x: pointer.x, y: pointer.y, z: 0 }, targetSurface);
    const surfaceW = targetSurface.offsetWidth || targetSurface.clientWidth;
    const surfaceH = targetSurface.offsetHeight || targetSurface.clientHeight;
    const tolerance = 0;
    if (
      local.x < -tolerance ||
      local.x > surfaceW + tolerance ||
      local.y < -tolerance ||
      local.y > surfaceH + tolerance
    ) {
      this.clearDragPreview();
      return;
    }
    if (this.dragPreviewSurface !== targetSurface) {
      this.clearDragPreview();
      this.dragPreviewSurface = targetSurface;
      this.dragPreviewElement = this.createDragPreviewElement();
      targetSurface.appendChild(this.dragPreviewElement);
    }
    const rawX = local.x - this.width / 2;
    const rawY = local.y - this.height / 2;
    const overflows = targetSurface.hasAttribute('data-surface-overflow');
    const x = overflows ? rawX : Math.max(0, Math.min(Math.max(0, surfaceW - this.width), rawX));
    const y = overflows ? rawY : Math.max(0, Math.min(Math.max(0, surfaceH - this.height), rawY));
    this.dragPreviewElement!.style.transform = `translate3d(${Math.floor(x)}px, ${Math.floor(y)}px, 0)`;
  }

  private createDragPreviewElement(): HTMLElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = `${this.width}px`;
    el.style.height = `${this.height}px`;
    el.style.pointerEvents = 'none';
    el.style.boxSizing = 'border-box';
    el.style.borderRadius = '12px';
    el.style.outline = '3px dashed rgba(80, 200, 255, 0.95)';
    el.style.outlineOffset = '-3px';
    el.style.backgroundColor = 'rgba(80, 200, 255, 0.18)';
    el.style.willChange = 'transform';
    el.style.transformStyle = 'preserve-3d';
    el.dataset.dragPreview = '';
    return el;
  }

  private clearDragPreview(): void {
    if (this.dragPreviewElement) {
      this.dragPreviewElement.remove();
      this.dragPreviewElement = null;
      this.dragPreviewSurface = null;
    }
  }

  /**
   * The surface the piece's position is measured on: the wall or board it stands on, or the
   * table itself.
   */
  surfaceElement(): HTMLElement {
    const closest = this.nativeElement.closest<HTMLElement>('[data-surface]');
    return closest ?? this.coordinateService.tabletopOriginElement;
  }

  /**
   * Called when the piece is let go.
   *
   * A piece dropped on a beam or on another surface moves onto it; then the drag ends as usual,
   * including the snap to the grid, and the selection's shared drag is finished.
   */
  onInputEnd(e: MouseEvent | TouchEvent) {
    if (this.input?.isDragging && !this.isScratcOwner()) {
      this.maybeSwitchSurfaceOnDrop();
    }
    this.clearDragPreview();
    handleInputEnd(this, e);
    if (this._multiAdapter) this.multiMovableService.endDrag(this._multiAdapter);
  }

  private maybeSwitchSurfaceOnDrop() {
    if (!this.tabletopObject) return;
    const pointer = this.input?.pointer;
    if (!pointer) return;
    if (this.restOnBeamUnderPointer(pointer)) return;
    const targetSurfaceEl = this.surfaceUnderPointer();
    if (!targetSurfaceEl) return;
    const currentSurfaceEl = this.surfaceElement();
    if (targetSurfaceEl === currentSurfaceEl) return;
    const targetSurface = (targetSurfaceEl.dataset.surface ?? 'floor') as TableSurface;
    const local = this.coordinateService.convertToLocal({ x: pointer.x, y: pointer.y, z: 0 }, targetSurfaceEl);
    const surfaceW = targetSurfaceEl.offsetWidth || targetSurfaceEl.clientWidth;
    const surfaceH = targetSurfaceEl.offsetHeight || targetSurfaceEl.clientHeight;
    const tolerance = 0;
    if (
      local.x < -tolerance ||
      local.x > surfaceW + tolerance ||
      local.y < -tolerance ||
      local.y > surfaceH + tolerance
    ) {
      return;
    }
    const rawX = local.x - this.width / 2;
    const rawY = local.y - this.height / 2;
    // A board lets a piece hang over its edge; a wall of the table does not.
    const overflows = targetSurfaceEl.hasAttribute('data-surface-overflow');
    const clampedX = overflows ? rawX : Math.max(0, Math.min(Math.max(0, surfaceW - this.width), rawX));
    const clampedY = overflows ? rawY : Math.max(0, Math.min(Math.max(0, surfaceH - this.height), rawY));
    const newX = this.mathFloor ? Math.floor(clampedX) : clampedX;
    const newY = this.mathFloor ? Math.floor(clampedY) : clampedY;
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this._posX = newX;
    this._posY = newY;
    this._posZ = 0;
    this.tabletopObject.location.x = newX;
    this.tabletopObject.location.y = newY;
    this.tabletopObject.location.surface = targetSurface === 'floor' ? undefined : targetSurface;
    this.tabletopObject.posZ = 0;
    this.updateTransformCss();
  }

  private restOnBeamUnderPointer(pointer: PointerCoordinate): boolean {
    const rest = this.computeBeamRest(pointer);
    if (!rest) return false;
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this._posX = rest.x;
    this._posY = rest.y;
    this._posZ = rest.z;
    this.tabletopObject.location.x = rest.x;
    this.tabletopObject.location.y = rest.y;
    this.tabletopObject.location.surface = undefined;
    this.tabletopObject.posZ = rest.z;
    this.updateTransformCss();
    return true;
  }

  /** How wide a cell is on the table being looked at, which is not always the usual fifty. */
  private tableGridSize(): number {
    const size = this.tableSelecter.viewTable?.gridSize ?? 0;
    return size > 0 ? size : GRID_PX;
  }

  private computeBeamRest(pointer: PointerCoordinate): { x: number; y: number; z: number } | null {
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    const gridSize = this.tableGridSize();
    const dims: SurfaceDims = {
      widthPx: table.width * gridSize,
      depthPx: table.height * gridSize,
      wallHeightPx: table.wallHeight * gridSize,
    };
    const beam = this.highestBeamUnderPointer(pointer, dims);
    if (!beam) return null;
    const world = this.coordinateService.convertToLocal({ x: pointer.x, y: pointer.y, z: 0 }, this.surfaceElement());
    return beamRestPosition(beam, world.x, world.y, this.width, this.height);
  }

  private highestBeamUnderPointer(pointer: PointerCoordinate, dims: SurfaceDims): WorldBox | null {
    const selfId = this.tabletopObject.identifier;
    const gridSize = this.tableGridSize();
    let best: WorldBox | null = null;
    for (const obj of this.tabletopOverlap.findAt(pointer.x, pointer.y)) {
      if (obj.identifier === selfId) continue;
      if (!(obj instanceof Terrain)) continue;
      const surface = surfaceOf(obj);
      if (surface === 'floor') continue;
      const entry: TabletopOverlapRegistryEntry | undefined = this.tabletopOverlap.get(obj.identifier);
      if (!entry) continue;
      const footprint = footprintOf(entry, gridSize);
      const box = surfaceWorldBox(
        surface,
        obj.location.x,
        obj.location.y,
        footprint.width,
        footprint.height,
        obj.altitude * gridSize + obj.posZ,
        obj.height * gridSize,
        dims
      );
      if (!best || box.maxZ > best.maxZ) best = box;
    }
    return best;
  }

  /** Called when a context menu is opened while the piece is pressed; ends the drag first. */
  onContextMenu(e: MouseEvent | TouchEvent) {
    handleContextMenu(this, e);
  }

  private callSelectedEvent() {
    if (this.tabletopObject)
      this.selectionSignalService.selectObject(this.tabletopObject.identifier, this.tabletopObject.aliasName);
  }

  /**
   * Moves the piece to the nearest spot the table's grid and snap style allow, square or hex.
   *
   * `gridSize` is used only when no table is being viewed. A player's character is still
   * stopped at terrain it may not walk over on the way to that spot.
   */
  snapToGrid(gridSize: number = 25) {
    const beforeX = this.posX;
    const beforeY = this.posY;
    this.snapToGridNow(gridSize);
    // Snapping is a move like any other: on hexes it reaches for the middle of a cell, which
    // from against a face is as often as not the middle of the cell behind it.
    if (this.walksTheTable()) this.holdAtBlocks(beforeX, beforeY);
  }

  private snapToGridNow(gridSize: number = 25) {
    const table = this.tableSelecter.viewTable;
    const effectiveGridSize = table?.gridSize ?? gridSize;
    const gridType = table?.gridType ?? GridType.SQUARE;
    const snapStyle = this.snapStyle ?? table?.gridSnapStyle ?? GridSnapStyle.CENTER;

    if (isHexGrid(gridType)) {
      const originX = this.snapOrigin?.x ?? this.width / 2;
      const originY = this.snapOrigin?.y ?? this.height / 2;
      const anchor = { x: this.posX + originX, y: this.posY + originY };
      const hexSnap =
        snapStyle === GridSnapStyle.VERTEX
          ? calcHexVertexSnapPosition
          : snapStyle === GridSnapStyle.BOTH
            ? calcHexBothSnapPosition
            : snapStyle === GridSnapStyle.ALL
              ? calcHexAllSnapPosition
              : calcHexSnapPosition;
      const snapped = hexSnap(anchor.x, anchor.y, effectiveGridSize, gridType, originX, originY);
      this.posX = snapped.x;
      this.posY = snapped.y;
    } else {
      if (snapStyle === GridSnapStyle.ALL) {
        const centerX = this.posX + this.width / 2;
        const centerY = this.posY + this.height / 2;
        const half = effectiveGridSize / 2;
        // Cell: top-left snapped to grid
        const cellX = calcSnapNum(this.posX, effectiveGridSize);
        const cellY = calcSnapNum(this.posY, effectiveGridSize);
        // Vertex: center snapped to grid intersection
        const vCX = calcSnapNum(centerX, effectiveGridSize);
        const vCY = calcSnapNum(centerY, effectiveGridSize);
        const vertexX = vCX - this.width / 2;
        const vertexY = vCY - this.height / 2;
        // Edge H: center-x snapped to half-grid, center-y to grid intersection
        const eHCX = calcSnapNum(centerX - half, effectiveGridSize) + half;
        const eHCY = calcSnapNum(centerY, effectiveGridSize);
        const edgeHX = eHCX - this.width / 2;
        const edgeHY = eHCY - this.height / 2;
        // Edge V: center-x to grid intersection, center-y snapped to half-grid
        const eVCX = calcSnapNum(centerX, effectiveGridSize);
        const eVCY = calcSnapNum(centerY - half, effectiveGridSize) + half;
        const edgeVX = eVCX - this.width / 2;
        const edgeVY = eVCY - this.height / 2;

        const candidates = [
          { x: cellX, y: cellY },
          { x: vertexX, y: vertexY },
          { x: edgeHX, y: edgeHY },
          { x: edgeVX, y: edgeVY },
        ];
        let bestX = cellX;
        let bestY = cellY;
        let bestDist = Infinity;
        for (const c of candidates) {
          const dx = this.posX - c.x;
          const dy = this.posY - c.y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestX = c.x;
            bestY = c.y;
          }
        }
        this.posX = bestX;
        this.posY = bestY;
      } else if (snapStyle === GridSnapStyle.VERTEX || snapStyle === GridSnapStyle.BOTH) {
        const centerX = this.posX + this.width / 2;
        const centerY = this.posY + this.height / 2;
        const snappedX = calcSnapNum(centerX, effectiveGridSize);
        const snappedY = calcSnapNum(centerY, effectiveGridSize);
        if (snapStyle === GridSnapStyle.BOTH) {
          const cellX = calcSnapNum(this.posX, effectiveGridSize);
          const cellY = calcSnapNum(this.posY, effectiveGridSize);
          const dcx = this.posX - cellX;
          const dcy = this.posY - cellY;
          const dvx = this.posX - (snappedX - this.width / 2);
          const dvy = this.posY - (snappedY - this.height / 2);
          if (dcx * dcx + dcy * dcy <= dvx * dvx + dvy * dvy) {
            this.posX = cellX;
            this.posY = cellY;
          } else {
            this.posX = snappedX - this.width / 2;
            this.posY = snappedY - this.height / 2;
          }
        } else {
          this.posX = snappedX - this.width / 2;
          this.posY = snappedY - this.height / 2;
        }
      } else {
        const originX = this.snapOrigin?.x ?? 0;
        const originY = this.snapOrigin?.y ?? 0;
        this.posX = calcSnapNum(this.posX + originX, effectiveGridSize) - originX;
        this.posY = calcSnapNum(this.posY + originY, effectiveGridSize) - originY;
      }
    }
  }

  private isOnWallSurface(): boolean {
    const object = this.tabletopObject;
    if (!object?.location) return false;
    return isOffTheFloor(object);
  }

  private setPosition(object: TabletopObject) {
    if (!object?.location) return;
    this._posX = this.mathFloor ? Math.floor(object.location.x) : object.location.x;
    this._posY = this.mathFloor ? Math.floor(object.location.y) : object.location.y;
    this._posZ = this.mathFloor ? Math.floor(object.posZ * 8) / 8 : object.posZ;

    this.updateTransformCss();
  }

  private setUpdateTimer() {
    if (this.updateTimer === null && this.tabletopObject) {
      this.updateTimer = setTimeout(() => {
        this.tabletopObject.location.x = this.posX;
        this.tabletopObject.location.y = this.posY;
        this.tabletopObject.posZ = this.posZ;
        this.updateTimer = null;
      }, 66);
    }
    this.updateTransformCss();
    if (this.input?.isGrabbing && this._multiAdapter) {
      this.multiMovableService.applyLeaderDelta(this._multiAdapter);
    }
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

  /** Turns on the short glide used when the piece is moved from elsewhere; off while it is dragged. */
  setAnimatedTransition(isEnable: boolean) {
    this.nativeElement.style.transition = isEnable ? 'transform 132ms linear' : '';
  }

  private shouldTransition(object: TabletopObject): boolean {
    return shouldTransitionTo(object, this.posX, this.posY, this.posZ);
  }

  private stopTransition() {
    this.nativeElement.style.transform = window.getComputedStyle(this.nativeElement).transform;
  }

  private updateTransformCss() {
    const onWall = this.isOnWallSurface();
    const offset = onWall ? '' : this.transformCssOffset;
    const posZ = onWall ? -this.posZ - WALL_OCCLUSION_INSET_PX : this.posZ;
    this.nativeElement.style.transform = toTransformCss(this.posX, this.posY, posZ, offset);
  }

  /** Makes the other pieces hittable or not according to the layers this piece collides with. */
  setCollidableLayer(isCollidable: boolean) {
    setLayerCollidable(MovableDirective.layerHash, this.colideLayers, this, !!this.input?.isGrabbing, isCollidable);
  }

  private register() {
    registerLayer(MovableDirective.layerHash, this.layerName, this);
  }

  private unregister() {
    unregisterLayer(MovableDirective.layerHash, this.layerName, this);
  }
}
