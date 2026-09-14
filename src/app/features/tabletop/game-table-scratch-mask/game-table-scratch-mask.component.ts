import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { buildScratchMaskContextMenu } from '@axe/features/tabletop/game-table-scratch-mask/game-table-scratch-mask-context-menu';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { setupMovableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';

@Component({
  selector: 'game-table-scratch-mask',
  templateUrl: './game-table-scratch-mask.component.html',
  host: { class: 'block absolute' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective],
})
export class GameTableScratchMaskComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly translateFn = inject(TRANSLATE_FN);

  readonly gameTableScratchMask = input<GameTableScratchMask | null>(null);

  /** The size of one table cell, in pixels. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }
  readonly movableOption = signal<MovableOption>({});

  constructor() {
    setupMovableForPiece(this, {
      target: this.gameTableScratchMask,
      collideLayers: ['terrain'],
    });
  }

  readonly name = computed(() => {
    const mask = this.gameTableScratchMask();
    if (!mask) return '';
    this.objectChange.versionOf(mask.identifier)();
    return mask.name;
  });
  /**
   * The mask as it stands, once the read of its version has been taken.
   *
   * It is the same mask every time, so under the default equality a new version never reaches
   * anything that reads this.
   */
  private readonly version = computed(
    () => {
      const mask = this.gameTableScratchMask();
      if (mask) this.objectChange.versionOf(mask.identifier)();
      return mask;
    },
    { equal: () => false }
  );

  readonly width = computed(() => {
    const mask = this.version();
    return mask ? Math.max(1, mask.width) : 1;
  });
  readonly height = computed(() => {
    const mask = this.version();
    return mask ? Math.max(1, mask.height) : 1;
  });
  readonly isLock = computed(() => this.version()?.isLock ?? false);
  readonly color = computed(() => this.version()?.color ?? '');
  /** Whether the scratch mask is owned by the local user. */
  get isMine(): boolean {
    return this.gameTableScratchMask()?.isMine ?? false;
  }

  readonly posX = computed(() => this.version()?.location.x ?? 0);
  readonly posY = computed(() => this.version()?.location.y ?? 0);
  readonly posZ = computed(() => this.version()?.posZ ?? 0);

  /**
   * Called when a drag of the scratch mask starts; the scratch mask plays no sound, so it does
   * nothing.
   */
  onMove() {}
  /** Called when a drag of the scratch mask ends; it does nothing. */
  onMoved() {}

  /**
   * Opens the scratch mask's right-click menu, with lock or unlock and delete; not once the pointer
   * has moved since the press.
   */
  onContextMenu(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const mask = this.gameTableScratchMask();
    if (!mask) return;
    const coordinate = this.pointerDeviceService.pointers[0];
    const actions = buildScratchMaskContextMenu(
      mask,
      this.isLock(),
      {
        lock: () => this.lock(),
        unlock: () => this.unlock(),
      },
      this.translateFn
    );
    this.contextMenuService.open(coordinate, actions, this.name());
  }

  /** Locks the scratch mask in place, which stops it being dragged, and plays the lock sound. */
  lock() {
    const mask = this.gameTableScratchMask();
    if (mask) mask.isLock = true;
    SoundEffect.play(PresetSound.lock);
  }

  /** Unlocks the scratch mask so it can be dragged again, and plays the unlock sound. */
  unlock() {
    const mask = this.gameTableScratchMask();
    if (mask) mask.isLock = false;
    SoundEffect.play(PresetSound.unlock);
  }

  /**
   * Opens the scratch mask's detail sheet in a panel, keeping the triggering event from reaching
   * the table.
   */
  openSheet(e: Event) {
    e.stopPropagation();
    const mask = this.gameTableScratchMask();
    if (!mask) return;
    const title = sheetPanelTitle(this.translateFn('feature.tabletop.panel.scratchMask'), this.name());
    this.objectPanels.openSheet(mask, title, { width: 400, height: 300 });
  }
}
