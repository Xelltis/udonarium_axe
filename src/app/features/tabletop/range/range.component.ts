import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { isInStore, ObjectStore } from '@axe/core/sync/object-store';
import { PERF_RANGE_RENDER, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { cellPatternBoundingBox, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { squareCentreAt } from '@axe/domain/tabletop/move/move-grid';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { RangeArea } from '@axe/domain/tabletop/range';
import { rangeCovers } from '@axe/domain/tabletop/range-coverage';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { CreateObjectMenuService } from '@axe/features/tabletop/create-menu/create-object-menu.service';
import { buildRangeContextMenuModel } from '@axe/features/tabletop/range/range-context-menu';
import { PictureRegion } from '@axe/infrastructure/image/element-picture';
import {
  initialRangeClip,
  paintRange,
  RangeClip,
  rangeClipPathCss,
  rangeQuadrantCells,
} from '@axe/infrastructure/tabletop/range/range-paint';
import { AltitudeGuideComponent, altitudeGuideOf } from '@axe/ui/components/altitude-guide/altitude-guide.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { pictureForCanvas } from '@axe/ui/tabletop/picture-for-canvas';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';

@Component({
  selector: 'range',
  templateUrl: './range.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AltitudeGuideComponent,
    HudPlaceDirective,
    MovableDirective,
    TooltipDirective,
    RotableDirective,
    SelectableDirective,
  ],
  host: {
    '[attr.data-object-id]': 'range().identifier',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class RangeComponent {
  private readonly createMenu = inject(CreateObjectMenuService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly tablePick = inject(TablePickService);
  protected readonly tabletopService = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly zones = inject(EngagementZoneService);
  private readonly vision = inject(VisionService);
  private readonly pieceTarget = inject(PieceTargetService);

  readonly range = input.required<RangeArea>();

  readonly gridCanvas = viewChild<ElementRef<HTMLCanvasElement>>('gridCanvas');
  readonly rangeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('rangeCanvas');
  private readonly cells = viewChild<ElementRef<HTMLElement>>('cells');

  private readonly pieces = inject(TablePiecesService);

  readonly clipPath = computed<string>(() => {
    this._clipVersion();
    const range = this.range();
    return rangeClipPathCss(this.painted() ?? initialRangeClip(range.type), range, this.squarePx);
  });

  /** What the canvases were last painted to be cut to, or nothing before the first paint. */
  private readonly painted = signal<RangeClip | null>(null);

  /** The room's table selector, which knows which table is being viewed. */
  get tableSelecter(): TableSelecter {
    return this.tabletopService.tableSelecter;
  }
  /** The table being viewed, whose grid type the range lines its cells up with. */
  get currentTable(): GameTable {
    return this.tabletopService.currentTable;
  }

  private readonly rangeVersion = computed(() => this.objectChange.versionOf(this.range().identifier)());

  readonly name = computed(() => {
    this.rangeVersion();
    return this.range().name;
  });
  readonly width = computed(() => {
    this.rangeVersion();
    return Math.max(0, this.range().width);
  });
  readonly length = computed(() => {
    this.rangeVersion();
    return Math.max(0, this.range().length);
  });
  readonly opacity = computed(() => {
    this.rangeVersion();
    return this.range().opacity;
  });
  readonly imageFile = computed(() => {
    this.objectChange.fileVersion();
    this.rangeVersion();
    return this.range().imageFile;
  });
  readonly isLock = computed(() => {
    this.rangeVersion();
    return this.range().isLock;
  });

  readonly areaQuadrantSize = computed(() => {
    this.rangeVersion();
    return rangeQuadrantCells(this.range());
  });

  readonly isRotatableRangeType = computed(() => {
    this.rangeVersion();
    const range = this.range();
    if (range.type === 'CUSTOM') return range.isRotatable === true;
    return ['LINE', 'CORN', 'SQUARE', 'RHOMBUS', 'TRIANGLE', 'PENTAGON', 'HEXAGON'].includes(range.type);
  });

  readonly isCustomRangeType = computed(() => {
    this.rangeVersion();
    return this.range().type === 'CUSTOM';
  });

  readonly usesSingleRotateGrab = computed(() => {
    this.rangeVersion();
    return ['SQUARE', 'RHOMBUS', 'TRIANGLE', 'PENTAGON', 'HEXAGON', 'CUSTOM'].includes(this.range().type);
  });

  readonly rotateGrabDistancePx = computed(() => Math.max(1, this.length()) * this.tabletopService.squarePx());

  readonly singleRotateGrabX = 0;

  /** The point the range turns about over a table drawn on a canvas: its own point, at its height. */
  readonly turnPoint = computed(() => {
    const range = this.range();
    this.rangeVersion();
    return {
      surface: this.pieces.surfaceOf(range),
      x: range.location.x,
      y: range.location.y,
      height: range.posZ + this.altitude() * this.gridSize,
    };
  });

  /** Where the range's handle stands over a table drawn on a canvas: off its point, turned as it is. */
  readonly grabPoint = computed(() => {
    const about = this.turnPoint();
    const across = this.usesSingleRotateGrab() ? this.singleRotateGrabX : this.rotateGrabDistancePx();
    const down = this.usesSingleRotateGrab() ? this.singleRotateGrabY() : 0;
    const turn = (this.range().rotate * Math.PI) / 180;
    return {
      ...about,
      x: about.x + across * Math.cos(turn) - down * Math.sin(turn),
      y: about.y + across * Math.sin(turn) + down * Math.cos(turn),
    };
  });

  readonly singleRotateGrabY = computed(() => -Math.max(1, this.length()) * this.tabletopService.squarePx());

  readonly altitude = computed(() => {
    this.rangeVersion();
    return this.range().altitude;
  });

  readonly isAltitudeIndicate = computed(() => {
    this.rangeVersion();
    return this.range().isAltitudeIndicate;
  });

  /**
   * The guide from the height the range floats at down to the face under its point, or up to one
   * sunk under it. Nothing for a range within half a cell of the face, or one set not to show it.
   */
  protected readonly altitudeGuide = computed(() => {
    if (!this.isAltitudeIndicate()) return null;
    return altitudeGuideOf(this.pieces.footOf(this.range()), this.altitude(), this.gridSize);
  });

  private readonly _clipVersion = signal(0);

  /** The table's grid cell size in pixels, which the range's length, width and altitude are measured in. */
  /**
   * The size of a square in px, which a range is counted and painted in: a cell, or several across
   * on a table that counts squares of several cells.
   */
  get squarePx(): number {
    return this.tabletopService.squarePx();
  }

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private _initialized = false;

  constructor() {
    // input.required<RangeArea> guarded by _initialized to avoid NG0950 during construction.
    this.objectChange.onObjectChangedFor(
      () => {
        if (!this._initialized) return [];
        const range = this.range();
        return [range.identifier, range.followingCharacterIdentifier, this.currentTable.identifier];
      },
      (e) => {
        if (!this._initialized) return;
        const range = this.range();
        if (e.identifier === range.followingCharacterIdentifier) range.following(this.gridSize);
        this.setRange();
      },
      this.destroyRef
    );
    pictureForCanvas({
      identifier: () => this.range().identifier,
      element: () => this.cells()?.nativeElement,
      pictured: () => true,
      follows: () => {
        this.rangeVersion();
        this.clipPath();
        this.opacity();
      },
      region: (cells) => {
        const canvases = [this.gridCanvas(), this.rangeCanvas()].map((canvas) => canvas?.nativeElement);
        if (!canvases[0] || !canvases[1]) return null;
        return regionCovering(canvases.map((canvas) => boxWithin(canvas!, cells)));
      },
    });
    setupMovableRotableForPiece(this, {
      target: this.range,
      collideLayers: ['terrain'],
      snapToSquare: (_, at) => squareCentreAt(this.currentTable, at),
      snapOrigin: () => {
        const half = this.gridSize / 2;
        const snapXY = isHexGrid(this.currentTable.gridType) ? 0 : half;
        return { x: snapXY, y: snapXY };
      },
      footprint: () => ({ width: this.gridSize, height: this.gridSize }),
      turnsAbout: () => this.turnPoint(),
    });
    afterNextRender(() => {
      this._initialized = true;
      this.setRange();
    });
  }

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }

  /** Stops the browser's own drag of the range's element, so only the table's drag moves it. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Lets go of a press that starts on the range, so it does not hold on to the pointer. */
  onInputStart(_e: MouseEvent | TouchEvent) {
    this.input?.cancel();
  }

  /**
   * Opens the range's right-click menu at the pointer.
   *
   * On a 2D table set to a radial menu style it opens as a radial menu. When several pieces are
   * selected, the menu for the selection opens instead.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const menuPosition = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.range(), this.gridSize, menuPosition)) return;
    const objectPosition = this.tablePick.landingAtPointer();
    const menu = buildRangeContextMenuModel(
      this.range()!,
      this.gridSize,
      objectPosition,
      this.objectStore,
      this.inventoryService,
      this.createMenu,
      () => this.dockingWindowOpen(),
      (r) => this.showDetail(r),
      this.translateFn,
      (r) => this.openCellEditor(r),
      (r) => this.targetInside(r)
    );
    const display = this.tabletopService.display();
    if (this.tabletopService.mode2d() && display.tabletopMenuStyle !== 'standard') {
      this.contextMenuService.openRadial(
        menuPosition,
        menu.actions,
        menu.radialGroups,
        this.name(),
        display.tabletopMenuStyle === 'radial',
        display.radialMenuRotationSpeed,
        multiAngleFontScaleFactor(display.multiAngleFontScale)
      );
      return;
    }
    this.contextMenuService.open(menuPosition, menu.actions, this.name());
  }

  /**
   * Aims at every piece the range takes in that the reader can see, and at nothing else. A piece in an
   * engagement zone is taken in where the range takes in the zone's centre; a piece taken out of the
   * fight is not taken in at all.
   */
  targetInside(range: RangeArea): void {
    const shape = {
      type: range.type,
      length: range.length,
      width: range.width,
      rotate: range.rotate,
      origin: { x: range.location.x, y: range.location.y },
    };
    const reading = this.zones.reading();
    const inside = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && piece.offField !== '1' && this.vision.isTokenVisible(piece))
      .filter((piece) => rangeCovers(shape, this.squarePx, reading.pointOf(piece)) === true);
    this.pieceTarget.setOnly(inside);
  }

  /** Opens the panel for choosing a character for the range to follow, from the follow menu entry. */
  dockingWindowOpen() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x - 250,
      top: coordinate.y - 175,
      width: 350,
      height: 200,
    };
    option.title = this.translateFn('feature.tabletop.panel.rangeFollow');
    const range = this.range();
    this.panelService.openLazy(
      () =>
        import('@axe/features/tabletop/range-docking-character/range-docking-character.component').then(
          (m) => m.RangeDockingCharacterComponent
        ),
      { ...option, stillWanted: () => isInStore(range) },
      (component) => (component.tabletopObject = range)
    );
  }

  /** Plays the pick-up sound when a drag or a turn of the range begins. */
  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  /** Plays the put-down sound when a drag or a turn of the range ends. */
  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  /** Redraws the range at the angle it is being turned to, while the rotate grip is dragged. */
  onRotateChanged(degree: number) {
    this.setRange(degree);
  }

  private async openCellEditor(range: RangeArea): Promise<void> {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.translateFn('feature.range.custom.editorTitle'),
      ...sheetPanelBox(coordinate, 640, 540),
    };
    const { RangeShapeEditorComponent } = await import('@axe/features/range-shape-editor/range-shape-editor.component');
    const editor = this.panelService.open(RangeShapeEditorComponent, option);
    editor.initialize({
      name: range.name,
      cellPattern: range.cellPattern,
      gridType:
        range.customGridType === 'hex-vertical' || range.customGridType === 'hex-horizontal'
          ? range.customGridType
          : 'square',
      gridColor: range.gridColor,
      rangeColor: range.rangeColor,
      isRotatable: range.isRotatable,
    });
    editor.saved.subscribe((result) => {
      range.cellPattern = result.cellPattern;
      range.customGridType = result.gridType;
      range.gridColor = result.gridColor;
      range.rangeColor = result.rangeColor;
      range.isRotatable = result.isRotatable;
      if (result.name) range.name = result.name;
      this.syncLengthWidthToPattern(range);
      this.objectChange.notifyChanged(range.identifier);
      this.setRange();
    });
  }

  private syncLengthWidthToPattern(range: RangeArea): void {
    const cells = parseCellPattern(range.cellPattern);
    const bb = cellPatternBoundingBox(cells);
    const lengthEl = range.commonDataElement?.getFirstElementByName('length');
    const widthEl = range.commonDataElement?.getFirstElementByName('width');
    if (lengthEl) lengthEl.value = Math.max(1, bb.height);
    if (widthEl) widthEl.value = Math.max(1, bb.width);
  }

  private showDetail(gameObject: RangeArea) {
    const title = sheetPanelTitle(this.translateFn('feature.tabletop.panel.range'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 400, height: 300 });
  }

  private setRange(degree: number = this.range().rotate) {
    const gridCanvasRef = this.gridCanvas();
    const rangeCanvasRef = this.rangeCanvas();
    if (!gridCanvasRef || !rangeCanvasRef) return;
    if (!gridCanvasRef.nativeElement.getContext('2d')) return;
    perfCounters.bump(PERF_RANGE_RENDER);
    const range = this.range();
    this.painted.set(
      paintRange(gridCanvasRef.nativeElement, rangeCanvasRef.nativeElement, range, {
        gridSize: this.squarePx,
        gridType: this.currentTable.gridType,
        docked: this.objectStore.get(range.followingCharacterIdentifier) !== null,
        degree,
      })
    );
    this._clipVersion.update((v) => v + 1);
  }
}

/** Where an element lies within an ancestor laid out round it, in the ancestor's own pixels. */
function boxWithin(element: HTMLElement, ancestor: HTMLElement): PictureRegion {
  let left = 0;
  let top = 0;
  for (let at: HTMLElement | null = element; at && at !== ancestor; at = at.offsetParent as HTMLElement | null) {
    left += at.offsetLeft;
    top += at.offsetTop;
  }
  return { left, top, width: element.offsetWidth, height: element.offsetHeight };
}

/** The smallest box round all the boxes given. */
function regionCovering(boxes: readonly PictureRegion[]): PictureRegion {
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}
