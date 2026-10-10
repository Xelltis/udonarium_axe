import { NgStyle } from '@angular/common';
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
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_RANGE_RENDER, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { cellPatternBoundingBox, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { buildRangeContextMenuModel } from '@axe/features/tabletop/range/range-context-menu';
import {
  initialRangeClip,
  paintRange,
  RangeClip,
  rangeClipPathCss,
  rangeQuadrantCells,
} from '@axe/features/tabletop/range/range-paint';
import { RangeDockingCharacterComponent } from '@axe/features/tabletop/range-docking-character/range-docking-character.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

@Component({
  selector: 'range',
  templateUrl: './range.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, TooltipDirective, RotableDirective, SelectableDirective, NgStyle],
  host: {
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class RangeComponent {
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  protected readonly tabletopService = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  readonly range = input.required<RangeArea>();

  readonly gridCanvas = viewChild<ElementRef<HTMLCanvasElement>>('gridCanvas');
  readonly rangeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('rangeCanvas');

  readonly clipPath = computed<string>(() => {
    this._clipVersion();
    const range = this.range();
    return rangeClipPathCss(this.painted() ?? initialRangeClip(range.type), range, this.gridSize);
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

  readonly rotateGrabDistancePx = computed(() => Math.max(1, this.length()) * this.gridSize);

  readonly singleRotateGrabX = 0;

  readonly singleRotateGrabY = computed(() => -Math.max(1, this.length()) * this.gridSize);

  readonly altitude = computed(() => {
    this.rangeVersion();
    return this.range().altitude;
  });

  readonly isFollowed = computed(() => {
    this.rangeVersion();
    return this.objectStore.get(this.range().followingCharacterIdentifier) != null;
  });
  readonly followingCharacter = computed(() => {
    this.rangeVersion();
    const obj = this.objectStore.get(this.range().followingCharacterIdentifier);
    return obj instanceof GameCharacter ? obj : null;
  });
  readonly elevation = this.altitude;
  readonly textShadowCss = '0px 0px 2px #fff, 0px 0px 2px #fff, 0px 0px 2px #fff';

  readonly isAltitudeIndicate = computed(() => {
    this.rangeVersion();
    return this.range().isAltitudeIndicate;
  });

  private readonly _clipVersion = signal(0);

  /** The table's grid cell size in pixels, which the range's length, width and altitude are measured in. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }
  math = Math;

  viewRotateX = 50;
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

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
        if (e.identifier === range.followingCharacterIdentifier) range.following();
        this.setRange();
      },
      this.destroyRef
    );
    setupMovableRotableForPiece(this, {
      target: this.range,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_RANGE_PX),
      snapOrigin: () => {
        const half = this.gridSize / 2;
        const snapXY = isHexGrid(this.currentTable.gridType) ? 0 : half;
        return { x: snapXY, y: snapXY };
      },
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
    const objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    const menu = buildRangeContextMenuModel(
      this.range()!,
      this.gridSize,
      objectPosition,
      this.objectStore,
      this.inventoryService,
      this.tabletopActionService,
      () => this.dockingWindowOpen(),
      (r) => this.showDetail(r),
      this.translateFn,
      (r) => this.openCellEditor(r)
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
    const component = this.panelService.open<RangeDockingCharacterComponent>(RangeDockingCharacterComponent, option);
    component.tabletopObject = this.range();
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
    const { RangeShapeEditorComponent } =
      await import('@axe/features/tabletop/range-shape-editor/range-shape-editor.component');
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
        gridSize: this.gridSize,
        gridType: this.currentTable.gridType,
        docked: this.objectStore.get(range.followingCharacterIdentifier) !== null,
        degree,
      })
    );
    this._clipVersion.update((v) => v + 1);
  }
}
