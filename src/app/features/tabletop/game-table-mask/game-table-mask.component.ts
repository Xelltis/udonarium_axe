import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { sheetPanelBox, sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ImageFile, imageFileEqual } from '@axe/core/storage/image-file';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GridType } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { hexCircumradius, isFlatTopGrid, isHexGrid, pixelToHexCell } from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { buildGameTableMaskContextMenu } from '@axe/features/tabletop/game-table-mask/game-table-mask-context-menu';
import {
  buildHexOuterBorderSvg,
  buildHexOutlineMask,
  buildMaskCss,
  type BuildMaskCssParams,
  buildScratchedMaskCss,
  buildScratchingGridInfos,
  type ScratchGridInfo,
} from '@axe/features/tabletop/game-table-mask/game-table-mask-helpers';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { setupInputHandler, setupMovableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_MASK_PX } from '@axe/ui/tabletop/z-offset';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-table-mask',
  templateUrl: './game-table-mask.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, SelectableDirective, NgStyle, SafePipe, TranslocoModule],
  host: {
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(pointerdown)': 'onInputStartPointer($event)',
    '(pointermove)': 'onInputMovePointer($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class GameTableMaskComponent {
  private static readonly GRID_PATTERN = /^\d+:\d+$/;
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly modalService = inject(ModalService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  constructor() {
    setupMovableForPiece(this, {
      target: this.gameTableMask,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_MASK_PX),
      snapOrigin: () => {
        const geo = computeHexMaskGeometry(this.width, this.height, this.gridSize, this.gridType());
        return geo ? { x: geo.offsetX, y: geo.offsetY } : undefined;
      },
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this._scratchingTimerId);
    });
  }

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
    onMove: (e) => this.onInputMove(e),
  });

  private get input() {
    return this.inputRef.current;
  }

  readonly gameTableMask = input<GameTableMask | null>(null);

  /** Whether a locked mask shows its lock mark; setting it writes straight to the mask. */
  get dispLockMark(): boolean {
    const mask = this.gameTableMask();
    return mask?.dispLockMark ?? false;
  }
  set dispLockMark(disp: boolean) {
    const mask = this.gameTableMask();
    if (mask) mask.dispLockMark = disp;
  }

  readonly name = computed(() => {
    const mask = this.gameTableMask();
    if (!mask) return '';
    this.objectChange.versionOf(mask.identifier)();
    return mask.name;
  });

  protected readonly maskVersion = computed<number>(() => {
    const mask = this.gameTableMask();
    if (!mask) return 0;
    return this.objectChange.versionOf(mask.identifier)();
  });

  /** The mask's width in cells, never negative. */
  get width(): number {
    const mask = this.gameTableMask();
    return Math.max(0, mask?.width ?? 0);
  }
  /** The mask's height in cells, never negative. */
  get height(): number {
    const mask = this.gameTableMask();
    return Math.max(0, mask?.height ?? 0);
  }
  /** The mask's own opacity, or 0 when there is no mask. */
  get opacity(): number {
    const mask = this.gameTableMask();
    return mask?.opacity ?? 0;
  }
  readonly imageFile = computed(
    () => {
      const mask = this.gameTableMask();
      this.objectChange.fileVersion();
      if (!mask) throw new Error('gameTableMask is not set');
      this.objectChange.versionOf(mask.identifier)();
      return mask.imageFile;
    },
    { equal: imageFileEqual() }
  );
  /** Whether the mask is locked in place; setting it writes straight to the mask. */
  get isLock(): boolean {
    const mask = this.gameTableMask();
    return mask?.isLock ?? false;
  }
  set isLock(isLock: boolean) {
    const mask = this.gameTableMask();
    if (mask) mask.isLock = isLock;
  }

  /** The blend type for the mask picture, always 0, which draws it with hard-light blending. */
  get blendType(): number {
    return 0;
  }

  /**
   * The mask's `color`, its colour element's `value`; setting it writes straight to the mask.
   *
   * Nothing in the app reads or writes it: the template fills a mask that has no picture with
   * `bgcolor`.
   */
  get color(): string {
    const mask = this.gameTableMask();
    return mask?.color ?? '';
  }
  set color(color: string) {
    const mask = this.gameTableMask();
    if (mask) mask.color = color;
  }
  /**
   * The background colour a mask without a picture is filled with; setting it writes straight to
   * the mask.
   */
  get bgcolor(): string {
    const mask = this.gameTableMask();
    return mask?.bgcolor ?? '';
  }
  set bgcolor(bgcolor: string) {
    const mask = this.gameTableMask();
    if (mask) mask.bgcolor = bgcolor;
  }

  /**
   * Whether the scratcher has asked to preview the pending scratch; setting it writes straight to
   * the mask.
   */
  get isPreview(): boolean {
    const mask = this.gameTableMask();
    return mask?.isPreview ?? false;
  }
  set isPreview(isPreview: boolean) {
    const mask = this.gameTableMask();
    if (mask) mask.isPreview = isPreview;
  }
  /**
   * Whether the mask is shown as it will look once the pending scratch is done, which only the
   * scratcher sees.
   */
  get isPreviewMode(): boolean {
    const mask = this.gameTableMask();
    if (!mask) return false;
    return mask.isPreview && mask.isMine;
  }

  /** The altitude rounded to one decimal place, for the altitude label. */
  get gameTableMaskAltitude(): number {
    return +this.altitude.toFixed(1);
  }

  /**
   * The cells scratched open, as a comma-separated list of `col:row`; setting it writes straight to
   * the mask.
   */
  get scratchedGrids() {
    const mask = this.gameTableMask();
    return mask?.scratchedGrids ?? '';
  }
  set scratchedGrids(scratchedGrids: string) {
    const mask = this.gameTableMask();
    if (mask) mask.scratchedGrids = scratchedGrids;
  }

  /**
   * The cells picked in the scratch in progress and not yet applied, in the same form as the open
   * cells; setting it writes straight to the mask.
   */
  get scratchingGrids() {
    const mask = this.gameTableMask();
    return mask?.scratchingGrids ?? '';
  }
  set scratchingGrids(scratchingGrids: string) {
    const mask = this.gameTableMask();
    if (mask) mask.scratchingGrids = scratchingGrids;
  }

  /** Whether no cell of the mask has been scratched open. */
  get isNonScratched(): boolean {
    const mask = this.gameTableMask();
    return !mask?.scratchedGrids;
  }

  /**
   * Whether no cell is picked in the scratch in progress, counting picks not yet written to the
   * mask.
   */
  get isNonScratching(): boolean {
    const mask = this.gameTableMask();
    return !(mask?.scratchingGrids || this._currentScratchingSet);
  }

  /**
   * The CSS mask that cuts the open cells out of the mask, or shows the pending scratch in preview
   * mode.
   */
  get masksCss(): string {
    return this.masksCssValue();
  }

  private readonly masksCssValue = computed(() => {
    this.readScratchState();
    const params = this.maskCssParams();
    // An untouched hex mask is cut to exactly its outline, which is already built for its size.
    if (isHexGrid(params.gridType) && !params.isPreviewMode && params.isNonScratched && this.hexGeometry()) {
      return this.hexOutlineMaskCss();
    }
    return buildMaskCss(params);
  });

  readonly scratchedColor = computed(() => {
    const mask = this.gameTableMask();
    if (!mask) return '';
    this.objectChange.versionOf(mask.identifier)();
    return mask.scratchedColor;
  });

  readonly scratchedImageFile = computed(
    () => {
      this.objectChange.fileVersion();
      const mask = this.gameTableMask();
      if (!mask) return ImageFile.Empty;
      this.objectChange.versionOf(mask.identifier)();
      return mask.scratchedImageFile;
    },
    { equal: imageFileEqual() }
  );

  /**
   * The CSS mask cutting the after-scratch layer to the open cells, or empty when that layer is not
   * drawn at all: the mask has neither an after-scratch colour nor picture, or no cell is open.
   */
  get scratchedLayerMask(): string {
    return this.scratchedLayerMaskValue();
  }

  private readonly scratchedLayerMaskValue = computed(() => {
    if (this.scratchedColor().length < 1 && this.scratchedImageFile().url.length < 1) return '';
    this.readScratchState();
    return buildScratchedMaskCss(this.maskCssParams());
  });

  private maskCssParams(): BuildMaskCssParams {
    return {
      currentScratchingSet: this._currentScratchingSet,
      gridSize: this.gridSize,
      gridType: this.gridType(),
      height: this.height,
      isNonScratched: this.isNonScratched,
      isPreviewMode: this.isPreviewMode,
      scratchedGrids: this.scratchedGrids,
      scratchingGrids: this.scratchingGrids,
      width: this.width,
    };
  }

  /** The markers drawn over open and picked cells while the mask is being scratched. */
  get scratchingGridInfos(): ScratchGridInfo[] {
    return this.scratchingGridInfosValue();
  }

  private readonly scratchingGridInfosValue = computed<ScratchGridInfo[]>(() => {
    this.readScratchState();
    return buildScratchingGridInfos({
      currentScratchingSet: this._currentScratchingSet,
      gridSize: this.gridSize,
      gridType: this.gridType(),
      hasGameTableMask: !!this.gameTableMask(),
      height: this.height,
      isNonScratched: this.isNonScratched,
      isNonScratching: this.isNonScratching,
      scratchedGrids: this.scratchedGrids,
      scratchingGrids: this.scratchingGrids,
      width: this.width,
    });
  });

  /**
   * The opacity the mask is drawn at: dimmed to 60% for the peer scratching it, and never under 0.4
   * while anyone is scratching.
   */
  get operateOpacity(): number {
    const mask = this.gameTableMask();
    const ret = (mask?.opacity ?? 0) * (mask?.isMine ? 0.6 : 1);
    return ret < 0.4 && this.isScratching ? 0.4 : ret;
  }

  /** How high the mask floats above the table, in cells; setting it writes straight to the mask. */
  get altitude(): number {
    const mask = this.gameTableMask();
    return mask?.altitude ?? 0;
  }
  set altitude(altitude: number) {
    const mask = this.gameTableMask();
    if (mask) mask.altitude = altitude;
  }

  /**
   * Whether the mask shows a line and label for its altitude; setting it writes straight to the
   * mask.
   */
  get isAltitudeIndicate(): boolean {
    const mask = this.gameTableMask();
    return mask?.isAltitudeIndicate ?? false;
  }
  set isAltitudeIndicate(isAltitudeIndicate: boolean) {
    const mask = this.gameTableMask();
    if (mask) mask.isAltitudeIndicate = isAltitudeIndicate;
  }

  /**
   * Whether the table is turned more than a quarter either way, so the scratcher's name is turned
   * over to stay readable.
   */
  get isInverse(): boolean {
    return Math.abs(this.viewRotateZ()) % 360 > 90 && Math.abs(this.viewRotateZ()) % 360 < 270;
  }
  /** Whether someone is scratching the mask, which is whenever it has an owner. */
  get isScratching(): boolean {
    const mask = this.gameTableMask();
    return !!mask?.owner;
  }

  /** Whether a peer has taken the mask to scratch it. */
  get hasOwner(): boolean {
    const mask = this.gameTableMask();
    return mask?.hasOwner ?? false;
  }
  /**
   * Whether the peer scratching the mask is still connected; the scratcher's banner only shows
   * while they are.
   */
  get ownerIsOnline(): boolean {
    const mask = this.gameTableMask();
    return mask?.ownerIsOnline ?? false;
  }
  /** The name of the peer scratching the mask, or empty when there is none. */
  get ownerName(): string {
    const mask = this.gameTableMask();
    return mask?.ownerName ?? '';
  }
  /** The colour of the banner naming the scratcher. */
  get ownerColor(): string {
    const mask = this.gameTableMask();
    return mask?.ownerColor ?? '';
  }

  /** The size of one table cell, in pixels. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }
  math = Math;
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

  readonly gridType = computed(() => {
    const table = this.tableSelecter.viewTable;
    if (!table) return GridType.SQUARE;
    this.objectChange.versionOf(table.identifier)();
    return table.gridType;
  });

  /**
   * Half the hex circumradius, the reach of the cross markers drawn on hex cells while scratching.
   */
  get hexMarkerR(): number {
    return hexCircumradius(this.gridSize) * 0.5;
  }

  /**
   * What the mask's hex shapes are built from, compared field by field so a change to anything else
   * about the mask leaves them alone.
   */
  private readonly maskShape = computed(
    () => {
      this.maskVersion();
      return { width: this.width, height: this.height, gridSize: this.gridSize, gridType: this.gridType() };
    },
    {
      equal: (a, b) =>
        a.width === b.width && a.height === b.height && a.gridSize === b.gridSize && a.gridType === b.gridType,
    }
  );

  private readonly hexGeometry = computed(() => {
    const { width, height, gridSize, gridType } = this.maskShape();
    return computeHexMaskGeometry(width, height, gridSize, gridType);
  });

  private readonly hexOutlineMaskCss = computed(() => {
    const { width, height, gridSize, gridType } = this.maskShape();
    return buildHexOutlineMask(gridSize, gridType, width, height);
  });

  private readonly hexOuterBorderCss = computed(() => {
    const { width, height, gridSize, gridType } = this.maskShape();
    return buildHexOuterBorderSvg(gridSize, gridType, width, height);
  });

  /** A CSS mask in the shape of the mask's hex cells, or empty on a square grid. */
  get hexOutlineMask(): string {
    return this.hexOutlineMaskCss();
  }

  /** A CSS background tracing the outer edge of the mask's hex cells, or empty on a square grid. */
  get hexOuterBorder(): string {
    return this.hexOuterBorderCss();
  }

  /** The mask's width in pixels, measured by how its hexes lie on a hex grid. */
  get pixelWidth(): number {
    return this.hexGeometry()?.pixelW ?? this.width * this.gridSize;
  }

  /** The mask's height in pixels, measured by how its hexes lie on a hex grid. */
  get pixelHeight(): number {
    return this.hexGeometry()?.pixelH ?? this.height * this.gridSize;
  }

  readonly movableOption = signal<MovableOption>({});

  private buildScratchingGrids(set: Set<string>): string {
    const grids: string[] = [];
    for (const g of set) {
      if (g && GameTableMaskComponent.GRID_PATTERN.test(g)) grids.push(g);
    }
    return grids.sort().join(',');
  }

  /** Stops the browser starting a native drag on the mask. */
  onDragstart(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Stops a press on a locked mask from going any further, unless the mask is being scratched. */
  onMaskMouseDown(e: MouseEvent) {
    if (this.isLock && !this.isScratching) {
      e.stopPropagation();
    }
  }

  /**
   * Cancels the input handler's gesture unless the local peer is scratching this mask.
   *
   * On a browser without pointer events, a left press by the scratcher picks the cell under it.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    const mask = this.gameTableMask();
    if (!mask) return;

    if (!this.isScratching || !mask.isMine) {
      if (this.input) this.input.cancel();
    } else if (!window.PointerEvent && (e as MouseEvent).button < 2 && (e as MouseEvent).buttons < 2) {
      this.scratching(true);
    }
  }

  /** Picks the cell under a left press when the local peer is scratching this mask. */
  onInputStartPointer(e: PointerEvent) {
    const mask = this.gameTableMask();
    if (!mask) return;

    if (this.isScratching && mask.isMine && e.button < 2 && e.buttons < 2) {
      this.scratching(true, { offsetX: e.offsetX, offsetY: e.offsetY });
    }
  }

  private _scratchingGridX = -1;
  private _scratchingGridY = -1;
  /** Picks cells as the scratcher drags, on a browser without pointer events. */
  onInputMove(_e: MouseEvent | TouchEvent) {
    const mask = this.gameTableMask();
    if (!window.PointerEvent && mask && this.isScratching && mask.isMine && this.input?.isDragging) {
      this.scratching(false);
    }
  }

  /**
   * Picks cells as the scratcher drags across the mask, and keeps the move from reaching the table.
   */
  onInputMovePointer(e: PointerEvent) {
    const mask = this.gameTableMask();
    if (mask && this.isScratching && mask.isMine && this.input?.isDragging && e.buttons < 2) {
      this.scratching(false, { offsetX: e.offsetX, offsetY: e.offsetY });
    }
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * The picks of the scratch in progress not yet written to the mask. A plain set tells nobody it
   * changed, so every change to it is followed by {@link touchScratching}.
   */
  private _currentScratchingSet: Set<string> | null = null;
  private readonly scratchingTick = signal(0);
  private _scratchingTimerId: ReturnType<typeof setTimeout> | undefined;

  private touchScratching(): void {
    this.scratchingTick.update((tick) => tick + 1);
  }

  /** Everything the mask's strings are drawn from that is not already a signal read on the way. */
  private readScratchState(): void {
    this.maskVersion();
    this.scratchingTick();
    this.objectChange.trackMyCursor();
  }
  /**
   * Toggles the cell under the pointer in the scratch in progress; only the peer scratching the
   * mask can.
   *
   * While dragging, a cell is toggled once as the pointer enters it; a fresh press may toggle the
   * same cell again. Picks are written to the mask after 250 ms without a new one, so a drag
   * reaches other peers as one change. A point off the mask is ignored. When the table's grid is
   * hidden, its grid clip is cleared.
   */
  scratching(isStart: boolean, position: { offsetX: number; offsetY: number } | null = null) {
    const mask = this.gameTableMask();
    if (!mask || !mask.isMine) return;
    const tableSelecter = this.tableSelecter;

    if (!tableSelecter.viewTable?.gridShow) {
      const viewTable = tableSelecter.viewTable;
      if (viewTable)
        viewTable.gridClipRect = {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        };
    }
    let offsetX;
    let offsetY;
    if (position) {
      offsetX = position.offsetX;
      offsetY = position.offsetY;
    } else {
      const scratchingPosition = this.coordinateService.calcTabletopLocalCoordinate(
        this.pointerDeviceService.pointers[0],
        this.elementRef.nativeElement
      );
      offsetX = scratchingPosition.x - mask.location.x;
      offsetY = scratchingPosition.y - mask.location.y;
    }
    if (offsetX < 0 || this.pixelWidth <= offsetX || offsetY < 0 || this.pixelHeight <= offsetY) return;

    let gridX: number;
    let gridY: number;
    const gridType = this.gridType();
    if (isHexGrid(gridType)) {
      const isFlatTop = isFlatTopGrid(gridType);
      const geo = computeHexMaskGeometry(this.width, this.height, this.gridSize, gridType);
      if (!geo) return;
      const { col, row } = pixelToHexCell(offsetX - geo.offsetX, offsetY - geo.offsetY, this.gridSize, isFlatTop);
      if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
      gridX = col;
      gridY = row;
    } else {
      gridX = Math.floor(offsetX / this.gridSize);
      gridY = Math.floor(offsetY / this.gridSize);
    }

    if (!isStart && this._scratchingGridX === gridX && this._scratchingGridY === gridY) return;
    const tempScratching = `${gridX}:${gridY}`;
    this._scratchingGridX = gridX;
    this._scratchingGridY = gridY;
    if (!this._currentScratchingSet) this._currentScratchingSet = new Set(this.scratchingGrids.split(/,/g));
    if (this._currentScratchingSet.has(tempScratching)) {
      this._currentScratchingSet.delete(tempScratching);
    } else {
      this._currentScratchingSet.add(tempScratching);
    }
    this.touchScratching();
    clearTimeout(this._scratchingTimerId);
    this._scratchingTimerId = setTimeout(() => {
      if (this._currentScratchingSet) {
        this.scratchingGrids = this.buildScratchingGrids(this._currentScratchingSet);
      }
      this._currentScratchingSet = null;
      this.touchScratching();
    }, 250);
  }

  /**
   * Applies the scratch in progress to the open cells: a picked covered cell opens and a picked
   * open cell is covered again.
   *
   * Picks not yet written to the mask are written first. The picks themselves are left for the
   * caller to clear.
   */
  scratched() {
    const mask = this.gameTableMask();
    if (!mask) return;

    const currentScratchedAry: string[] = this.scratchedGrids ? this.scratchedGrids.split(/,/g) : [];
    if (this._currentScratchingSet) {
      clearTimeout(this._scratchingTimerId);
      this.scratchingGrids = this.buildScratchingGrids(this._currentScratchingSet);
      this._currentScratchingSet = null;
      this.touchScratching();
    }
    const currentScratchingAry: string[] = this.scratchingGrids.split(/,/g);
    const aSet = new Set(currentScratchedAry);
    const bSet = new Set(currentScratchingAry);
    this.scratchedGrids = [
      ...currentScratchedAry.filter((x) => !bSet.has(x)),
      ...currentScratchingAry.filter((x) => !aSet.has(x)),
    ]
      .filter((grid) => grid && GameTableMaskComponent.GRID_PATTERN.test(grid))
      .sort()
      .join(',');
  }

  /**
   * Opens the mask's right-click menu, or the menu for the whole selection when the mask is part of
   * one.
   *
   * Starting a scratch there makes the local peer the owner, taking over from anyone scratching
   * before. Finishing applies the scratch and releases the mask; cancelling releases it without
   * applying anything.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    const mask = this.gameTableMask();
    if (!mask) return;

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const menuPosition = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(mask, this.gridSize, menuPosition)) return;
    const objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    const menuArray = buildGameTableMaskContextMenu({
      mask: mask,
      gridSize: this.gridSize,
      objectPosition,
      inventoryService: this.inventoryService,
      tabletopActionService: this.tabletopActionService,
      onStartScratch: () => {
        if (mask.owner != '') {
          this.isPreview = false;
          clearTimeout(this._scratchingTimerId);
          this._currentScratchingSet = null;
          this.touchScratching();
        }
        mask.owner = getPeerContext().userId;
        this._scratchingGridX = -1;
        this._scratchingGridY = -1;
      },
      onFinishScratch: () => {
        this.scratchDone();
        this.isPreview = false;
        mask.owner = '';
      },
      onCancelScratch: () => {
        mask.owner = '';
      },
      onEdit: (m) => this.showDetail(m),
      t: this.translateFn,
    });
    this.contextMenuService.open(menuPosition, menuArray, this.name());
  }

  /** Plays the pick-up sound when a drag of the mask starts. */
  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  /** Plays the put-down sound when a drag of the mask ends. */
  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  /** Finishes the scratch when the done button is pressed with the primary button. */
  onScratchDonePointerDown(e: PointerEvent) {
    if (e.button !== 0) return false;
    return this.scratchDone(e);
  }

  /** Cancels the scratch when the cancel button is pressed with the primary button. */
  onScratchCancelPointerDown(e: PointerEvent) {
    if (e.button !== 0) return false;
    return this.scratchCancel(e);
  }

  /**
   * Applies the scratch in progress, clears the picks and the preview, and releases the mask.
   *
   * Only the peer scratching the mask can finish it. It returns false either way, so a bound event
   * goes no further.
   */
  scratchDone(e: Event | null = null) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const mask = this.gameTableMask();
    if (!mask || !mask.isMine) return false;
    this.scratched();
    mask.owner = '';
    this.scratchingGrids = '';
    this.isPreview = false;
    this._scratchingGridX = -1;
    this._scratchingGridY = -1;
    SoundEffect.play(PresetSound.cardPut);
    return false;
  }

  /**
   * Throws the scratch in progress away and releases the mask without applying it.
   *
   * Another peer may only cancel once the scratcher has gone offline. It returns false either way,
   * so a bound event goes no further.
   */
  scratchCancel(e: Event | null = null) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const mask = this.gameTableMask();
    if (mask && !mask.isMine && this.ownerIsOnline) return false;
    if (mask) mask.owner = '';
    this.scratchingGrids = '';
    this.isPreview = false;
    this._scratchingGridX = -1;
    this._scratchingGridY = -1;
    SoundEffect.play(PresetSound.unlock);
    return false;
  }

  private showDetail(gameObject: GameTableMask) {
    this.selectionSignalService.selectObject(gameObject.identifier, gameObject.aliasName);
    const option: PanelOption = {
      title: sheetPanelTitle(this.translateFn('feature.tabletop.panel.mask'), gameObject.name),
      ...sheetPanelBox(this.pointerDeviceService.pointers[0], 500, 600),
    };
    this.panelService.openLazy(
      () =>
        import('@axe/features/tabletop/game-table-mask-sheet/game-table-mask-sheet.component').then(
          (m) => m.GameTableMaskSheetComponent
        ),
      option,
      (component) => (component.gameTableMask = gameObject)
    );
  }

  /** Tracks list items by identifier, falling back to their index when they have none. */
  identify(index: number, item: { identifier?: string } | null): string | number {
    return item?.identifier ?? index;
  }
}
