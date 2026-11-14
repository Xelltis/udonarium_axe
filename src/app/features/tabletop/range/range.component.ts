import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OutputRefSubscription,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { panelOptionAt, type PointerPanelBox, sheetPanelBox, sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { isInStore, ObjectStore } from '@axe/core/sync/object-store';
import { PERF_RANGE_RENDER, perfCounters } from '@axe/core/util/perf-counters';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { squareCentreAt } from '@axe/domain/tabletop/move/move-grid';
import { RangeArea } from '@axe/domain/tabletop/range';
import { ROTATABLE_RANGE_TYPES, SINGLE_GRAB_RANGE_TYPES } from '@axe/domain/tabletop/range-coverage';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { CreateObjectMenuService } from '@axe/features/tabletop/create-menu/create-object-menu.service';
import { buildRangeContextMenuModel } from '@axe/features/tabletop/range/range-context-menu';
import { PictureRegion } from '@axe/infrastructure/image/element-picture';
import {
  initialRangeClip,
  paintRange,
  RangeClip,
  rangeClipOutline,
  rangeClipPathCss,
  rangeQuadrantCells,
  regionWithinOutline,
  usableOutline,
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

/** The panel for choosing the character a range follows, opened by the pointer. */
const FOLLOW_PANEL: PointerPanelBox = { width: 350, height: 200, reachLeft: 250, reachUp: 175 };

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
    class: 'group',
    '[attr.data-object-id]': 'range().identifier',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class RangeComponent {
  private readonly createMenu = inject(CreateObjectMenuService);
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
  private readonly pieceTarget = inject(PieceTargetService);

  readonly range = input.required<RangeArea>();

  readonly gridCanvas = viewChild<ElementRef<HTMLCanvasElement>>('gridCanvas');
  readonly rangeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('rangeCanvas');
  private readonly cells = viewChild<ElementRef<HTMLElement>>('cells');

  private readonly pieces = inject(TablePiecesService);
  private readonly pictures = inject(PiecePicturesService);
  private readonly standing = inject(StandingGroundService);
  private readonly transient = inject(TransientPlacementService);

  /**
   * What the box the pointer rests on over the range's picture is cut to, as CSS: the shape the range
   * is painted as, noted first of what is painted, in the picture's pixels, so the pointer rests on the
   * range only over its shape; nothing for a range of its own cells, which the whole picture serves.
   */
  readonly pointerClipPath = computed<string | null>(() => {
    const range = this.range();
    const shape = this.pictures.pictureOf(range.identifier)?.pickAreas?.[0];
    if (!shape || shape.length < 3 || range.type === 'CUSTOM') return null;
    const px = (value: number) => `${Math.round(value * 100) / 100}px`;
    return `polygon(${shape.map((point) => `${px(point.x)} ${px(point.y)}`).join(', ')})`;
  });

  /** What the cells are cut to now: as they were last painted, or by the range's type before the first paint. */
  private clip(): RangeClip {
    return this.painted() ?? initialRangeClip(this.range().type);
  }

  readonly clipPath = computed<string>(() => {
    this._clipVersion();
    return rangeClipPathCss(this.clip(), this.range(), this.squarePx);
  });

  /**
   * The outline the cells are cut to, as {@link clipPath} cuts them, in the pixels of the box they are
   * cut in; null where it cannot be told, as for a length that is no number, which pictures and picks
   * the whole of the canvases as before.
   */
  private clipOutline(): { x: number; y: number }[] | null {
    return usableOutline(rangeClipOutline(this.clip(), this.range(), this.squarePx));
  }

  /**
   * Where the range is painted, as polygons in the pixels of the box its cells are cut in: its shape
   * and each cell filled, as last painted, which a press must land in to take it; before the first
   * paint, or where nothing that can be told was painted, what the cells are cut to.
   */
  private paintedAreas(): { x: number; y: number }[][] | null {
    const painted = (this.painted()?.painted ?? [])
      .map((area) => usableOutline(area))
      .filter((area): area is { x: number; y: number }[] => area !== null);
    if (painted.length > 0) return painted;
    const outline = this.clipOutline();
    return outline ? [outline] : null;
  }

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
    return ROTATABLE_RANGE_TYPES.includes(range.type);
  });

  readonly isCustomRangeType = computed(() => {
    this.rangeVersion();
    return this.range().type === 'CUSTOM';
  });

  readonly usesSingleRotateGrab = computed(() => {
    this.rangeVersion();
    return SINGLE_GRAB_RANGE_TYPES.includes(this.range().type);
  });

  readonly rotateGrabDistancePx = computed(() => Math.max(1, this.length()) * this.tabletopService.squarePx());

  readonly singleRotateGrabX = 0;

  /** The point the range turns about over a table drawn on a canvas: its own point, at its height. */
  readonly turnPoint = computed(() => {
    const range = this.range();
    this.rangeVersion();
    const foot = this.pieces.footOf(range);
    return { ...foot, height: foot.height + this.altitude() * this.gridSize };
  });

  /**
   * Where the range's handle stands over a table drawn on a canvas: off its point, turned as it is,
   * and on the ground there where the range lies on the ground, as the range follows the raised ground.
   */
  readonly grabPoint = computed(() => {
    const range = this.range();
    const about = this.turnPoint();
    const across = this.usesSingleRotateGrab() ? this.singleRotateGrabX : this.rotateGrabDistancePx();
    const down = this.usesSingleRotateGrab() ? this.singleRotateGrabY() : 0;
    const turn = (range.rotate * Math.PI) / 180;
    const x = about.x + across * Math.cos(turn) - down * Math.sin(turn);
    const y = about.y + across * Math.sin(turn) + down * Math.cos(turn);
    const placedZ = this.transient.placed().get(range.identifier)?.z ?? range.posZ;
    const onGround = about.surface === 'floor' && Math.abs(placedZ) < 1;
    const height = onGround ? this.standing.heightPxAt(x, y) + this.altitude() * this.gridSize : about.height;
    return { ...about, x, y, height };
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
        return [
          range.identifier,
          ...collectDataElements(range.rootDataElement).map((element) => element.identifier),
          range.followingCharacterIdentifier,
          this.currentTable.identifier,
        ];
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
        const covering = regionCovering(canvases.map((canvas) => boxWithin(canvas!, cells)));
        const outline = this.clipOutline();
        return (outline && regionWithinOutline(covering, outline)) ?? covering;
      },
      pickAreas: () => this.paintedAreas(),
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
      freeOfGrid: (range) => range.placesFreely,
      turnsAbout: () => this.turnPoint(),
    });
    afterNextRender(() => {
      this._initialized = true;
      this.setRange();
    });
    this.destroyRef.onDestroy(() => this.editorSaved?.unsubscribe());
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
      this.range(),
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
    this.pieceContextMenu.openPieceMenu(menuPosition, menu, this.name());
  }

  /** Aims at every piece the range takes in, counted in the table's squares, and at nothing else. */
  targetInside(range: RangeArea): void {
    this.pieceTarget.targetInsideRange(range, this.squarePx);
  }

  /** Opens the panel for choosing a character for the range to follow, from the follow menu entry. */
  dockingWindowOpen() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.translateFn('feature.tabletop.panel.rangeFollow'),
      ...panelOptionAt(coordinate, FOLLOW_PANEL),
    };
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
    this.editorSaved?.unsubscribe();
    this.editorSaved = editor.saved.subscribe((result) => {
      range.cellPattern = result.cellPattern;
      range.customGridType = result.gridType;
      range.gridColor = result.gridColor;
      range.rangeColor = result.rangeColor;
      range.isRotatable = result.isRotatable;
      if (result.name) range.name = result.name;
      range.fitToPattern();
      this.objectChange.notifyChanged(range.identifier);
      this.setRange();
    });
  }

  /**
   * What the shape editor last opened says on saving, let go of with the range, so an editor
   * outliving it paints nothing on canvases that are gone.
   */
  private editorSaved: OutputRefSubscription | null = null;

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
