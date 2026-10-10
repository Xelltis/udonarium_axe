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
  untracked,
} from '@angular/core';
import { CoinFlipService } from '@axe/application/coin/coin-flip.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { Coin, CoinFace } from '@axe/domain/coin/coin';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { buildCoinContextMenu } from '@axe/features/coin/coin/coin-context-menu';
import { laurelLeaves, starPoints } from '@axe/features/coin/coin/coin-emblem';
import { MovableDirective, MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableDirective, RotableOption } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { DoubleTap } from '@axe/ui/tabletop/double-tap';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_TABLETOP_OBJECT_PX } from '@axe/ui/tabletop/z-offset';

const EDGE_SEGMENT_COUNT = 24;
const EMBLEM_CENTER = 50;
const EDGE_SEGMENT_OVERLAP = 1.06;
const THICKNESS_RATIO = 0.11;
const MIN_THICKNESS_PX = 5;

@Component({
  selector: 'coin',
  templateUrl: './coin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, RotableDirective, SelectableDirective, NgStyle, SafePipe],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class CoinComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly panelService = inject(PanelService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tabletopService = inject(TabletopService);
  private readonly imageService = inject(ImageService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly coinFlip = inject(CoinFlipService);

  readonly isHiddenByFog = computed(() => {
    const piece = this.coin();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, this.size());
  });

  readonly coin = input.required<Coin>();

  readonly isSpinning = signal(false);

  private readonly spin = signal<{ from: CoinFace; to: CoinFace } | null>(null);

  /** Whether the coin is locked in place, which stops it being dragged. */
  get isLock(): boolean {
    return this.coin().isLock;
  }
  /** The table's grid cell size in pixels, which the coin's diameter and a copy's offset are measured in. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly size = computed(() => {
    this.objectChange.versionOf(this.coin().identifier)();
    const size = this.coin().size;
    return size > 0 ? size : 1;
  });

  readonly modelFace = computed<CoinFace>(() => {
    this.objectChange.versionOf(this.coin().identifier)();
    return this.coin().face;
  });

  readonly displayedFace = computed<CoinFace>(() => this.spin()?.from ?? this.modelFace());

  readonly isFront = computed(() => this.displayedFace() === 'front');

  readonly landsOnOtherFace = computed(() => {
    const spin = this.spin();
    return spin !== null && spin.from !== spin.to;
  });

  readonly frontLabel = computed(() => this.translateFn('feature.coin.face.front'));
  readonly backLabel = computed(() => this.translateFn('feature.coin.face.back'));

  readonly starPoints = starPoints(EMBLEM_CENTER, 25, 10.5);
  readonly starRayPoints = starPoints(EMBLEM_CENTER, 33, 4, 12);
  readonly laurelLeaves = laurelLeaves(EMBLEM_CENTER, 28);

  readonly frontImage = computed(
    () => {
      this.objectChange.fileVersion();
      this.objectChange.versionOf(this.coin().identifier)();
      return this.imageService.getEmptyOr(this.coin().frontImage);
    },
    { equal: imageFileEqual() }
  );

  readonly backImage = computed(
    () => {
      this.objectChange.fileVersion();
      this.objectChange.versionOf(this.coin().identifier)();
      return this.imageService.getEmptyOr(this.coin().backImage);
    },
    { equal: imageFileEqual() }
  );

  readonly diameter = computed(() => this.size() * this.gridSize);

  readonly thickness = computed(() => Math.max(MIN_THICKNESS_PX, this.diameter() * THICKNESS_RATIO));

  readonly faceTransform = computed(
    () => `translateZ(${this.thickness() / 2}px) rotateY(${this.isFront() ? 0 : 180}deg)`
  );

  readonly frontFaceTransform = computed(() => `translateZ(${this.thickness() / 2}px)`);

  readonly backFaceTransform = computed(() => `rotateY(180deg) translateZ(${this.thickness() / 2}px)`);

  readonly edgeSegments = computed(() => {
    const radius = this.diameter() / 2;
    const thickness = this.thickness();
    const width = ((2 * Math.PI * radius) / EDGE_SEGMENT_COUNT) * EDGE_SEGMENT_OVERLAP;

    return Array.from({ length: EDGE_SEGMENT_COUNT }, (_, index) => {
      const angle = (360 / EDGE_SEGMENT_COUNT) * index;
      const lit = 0.5 + 0.5 * Math.cos(((angle - 45) * Math.PI) / 180);
      return {
        width: `${width}px`,
        height: `${thickness}px`,
        marginLeft: `${-width / 2}px`,
        marginTop: `${-thickness / 2}px`,
        background: `hsl(41, 58%, ${26 + 32 * lit}%)`,
        transform: `rotateZ(${angle}deg) translateY(${-radius}px) rotateX(90deg)`,
      };
    });
  });

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly doubleTap = new DoubleTap(() => this.input);

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }

  constructor() {
    this.objectChange.flipCoin$.subscribe((event) => {
      if (event.identifier === this.coin().identifier) this.startSpin(event.face as CoinFace);
    }, this.destroyRef);
    setupMovableRotableForPiece(this, {
      target: this.coin,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_TABLETOP_OBJECT_PX),
    });
    this.destroyRef.onDestroy(() => this.doubleTap.cancel());
  }

  /** Ends the flip animation, after which the coin shows the face it is really on. */
  onSpinEnd() {
    this.isSpinning.set(false);
    this.spin.set(null);
  }

  /** Stops the browser's own drag of the coin's element, so only the table's drag moves it. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** On a press on the coin, brings it to the top and starts watching for a double tap. */
  onInputStart(e: MouseEvent | TouchEvent) {
    this.startDoubleClickTimer(e);
    this.coin().toTopmost();
  }

  /** Counts a press towards a double tap, which flips the coin when the second one lands. */
  startDoubleClickTimer(e: MouseEvent | TouchEvent) {
    this.doubleTap.handle(e, () => this.onDoubleClick());
  }

  /** Flips the coin on a double tap, if this player may edit the table and the pointer has not moved. */
  onDoubleClick() {
    this.doubleTap.cancel();
    if (!this.rolePermission.canEditTabletop) return;
    if (this.doubleTap.isInPlace()) this.flip();
  }

  /**
   * Tosses the coin to a random face.
   *
   * Every peer sees it spin, the face is synced, and the result is announced in chat shortly after.
   */
  flip() {
    this.coinFlip.flip(this.coin());
  }

  /**
   * Opens the coin's right-click menu, with the table-switching entries after it where there are any.
   *
   * When several pieces are selected, the menu for the selection opens instead.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.coin(), this.gridSize, position)) return;

    const baseMenu = buildCoinContextMenu(
      this.coin(),
      this.gridSize,
      {
        onFlip: () => this.flip(),
        onShowDetail: () => this.showDetail(),
      },
      this.translateFn
    );
    const surfaceEntries = buildSurfaceSwitchContextMenu(
      this.coin(),
      this.tabletopService.currentTable,
      this.translateFn
    );
    this.contextMenuService.open(
      position,
      surfaceEntries.length > 0 ? [...baseMenu, ContextMenuSeparator, ...surfaceEntries] : baseMenu,
      this.coin().name
    );
  }

  /** Plays the pick-up sound when a drag or a turn of the coin begins. */
  onMove() {
    SoundEffect.play(PresetSound.piecePick);
  }

  /** Plays the put-down sound when a drag or a turn of the coin ends. */
  onMoved() {
    SoundEffect.play(PresetSound.piecePut);
  }

  private startSpin(to: CoinFace) {
    const current = this.spin();
    if (current && current.to === to) return;

    this.spin.set({ from: current?.from ?? untracked(this.modelFace), to });
    this.isSpinning.set(false);
    setTimeout(() => this.isSpinning.set(true));
  }

  private showDetail() {
    const coin = this.coin();
    this.selectionSignalService.selectObject(coin.identifier, coin.aliasName);
    const coordinate = this.pointerDeviceService.pointers[0];
    const title = sheetPanelTitle(this.translateFn('feature.coin.sheet.title'), coin.name);
    const option: PanelOption = {
      title,
      ...sheetPanelBox(coordinate, 400, 380),
    };
    this.panelService.openLazy(
      () => import('@axe/features/coin/coin-sheet/coin-sheet.component').then((m) => m.CoinSheetComponent),
      option,
      (component) => (component.coin = coin)
    );
  }
}
