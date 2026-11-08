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
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { isInStore } from '@axe/core/sync/object-store';
import { Coin, CoinFace } from '@axe/domain/coin/coin';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { buildCoinContextMenu } from '@axe/features/coin/coin/coin-context-menu';
import { CoinFlipService } from '@axe/features/coin/coin-flip.service';
import { MovableDirective, MovableOption } from '@axe/ui/directives/movable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { DoubleTap } from '@axe/ui/tabletop/double-tap';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { setupInputHandler, setupMovableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';

@Component({
  selector: 'coin',
  templateUrl: './coin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HudPlaceDirective, MovableDirective, SelectableDirective],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '[attr.data-object-id]': 'coin().identifier',
    '[attr.data-face]': 'displayedFace()',
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
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly coinFlip = inject(CoinFlipService);

  /** Plays the coin's flip where the canvas draws it. */
  private readonly motions = inject(PieceMotionsService);

  readonly isHiddenByFog = computed(() => {
    const piece = this.coin();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, this.size());
  });

  readonly coin = input.required<Coin>();

  /** Ends the flip the canvas plays, once it has played. */
  private spinTimer: ReturnType<typeof setTimeout> | undefined;

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

  /** The face the coin shows: the one it was on until a flip has played, and then the one it is on. */
  readonly displayedFace = computed<CoinFace>(() => this.spin()?.from ?? this.modelFace());

  /** Whether a flip is playing. */
  readonly isSpinning = computed(() => this.spin() !== null);

  readonly diameter = computed(() => this.size() * this.gridSize);

  readonly movableOption = signal<MovableOption>({});

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
    setupMovableForPiece(this, {
      target: this.coin,
      collideLayers: ['terrain'],
      footprint: () => ({ width: this.diameter(), height: this.diameter() }),
    });
    this.destroyRef.onDestroy(() => {
      this.doubleTap.cancel();
      clearTimeout(this.spinTimer);
    });
  }

  /** Ends the flip, after which the coin shows the face it is really on. */
  onSpinEnd() {
    this.spin.set(null);
  }

  /** Stops the browser's own drag of the coin's element, so only the table's drag moves it. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * On a press on the coin, brings it to the top for a seat that may change the table, and starts
   * watching for a double tap.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    this.startDoubleClickTimer(e);
    if (this.rolePermission.canEditTabletop()) this.coin().toTopmost();
  }

  /** Counts a press towards a double tap, which flips the coin when the second one lands. */
  startDoubleClickTimer(e: MouseEvent | TouchEvent) {
    this.doubleTap.handle(e, () => this.onDoubleClick());
  }

  /** Flips the coin on a double tap, if this player may edit the table and the pointer has not moved. */
  onDoubleClick() {
    this.doubleTap.cancel();
    if (!this.rolePermission.canEditTabletop()) return;
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

    const from = current?.from ?? untracked(this.modelFace);
    this.spin.set({ from, to });
    const playing = this.motions.play(this.coin().identifier, from === to ? 'coin-flip' : 'coin-flip-turn', {
      backUp: from === 'back',
    });
    clearTimeout(this.spinTimer);
    this.spinTimer = setTimeout(() => this.onSpinEnd(), playing);
  }

  private showDetail() {
    const coin = this.coin();
    this.selectionSignalService.selectObject(coin.identifier, coin.aliasName);
    const coordinate = this.pointerDeviceService.pointers[0];
    const title = sheetPanelTitle(this.translateFn('feature.coin.sheet.title'), coin.name);
    const option: PanelOption = {
      title,
      ...sheetPanelBox(coordinate, 400, 380),
      stillWanted: () => isInStore(coin),
    };
    this.panelService.openLazy(
      () => import('@axe/features/coin/coin-sheet/coin-sheet.component').then((m) => m.CoinSheetComponent),
      option,
      (component) => (component.coin = coin)
    );
  }
}
