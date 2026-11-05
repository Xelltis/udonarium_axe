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
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { SWITCH_NOTICE_MS } from '@axe/features/tabletop/board-switch/switch-notice.service';
import { SwitchPressService } from '@axe/features/tabletop/board-switch/switch-press.service';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { AltitudeGuideComponent, altitudeGuideOf } from '@axe/ui/components/altitude-guide/altitude-guide.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';

/** How far a pointer may wander between pressing a switch and letting go, and still press it. */
const PRESS_SLOP_PX = 6;

@Component({
  selector: 'terrain',
  templateUrl: './terrain.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AltitudeGuideComponent, HudPlaceDirective, MovableDirective, RotableDirective, SelectableDirective],
  host: {
    class: 'block',
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '[attr.data-object-id]': 'terrain().identifier',
    '[attr.data-door]': "isDoor() ? (isDoorOpen() ? 'open' : 'closed') : null",
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TerrainComponent {
  private readonly imageService = inject(ImageService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  protected readonly tabletopService = inject(TabletopService);
  protected readonly visionService = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly terrainMenu = inject(TerrainMenuService);
  private readonly switchPresses = inject(SwitchPressService);
  private readonly switches = inject(BoardSwitchService);
  private readonly t = inject(TRANSLATE_FN);
  /** Whether every button on the screen is saying what it is, switches on the table among them. */
  protected readonly guide = inject(ButtonGuideService);
  private readonly pieces = inject(TablePiecesService);
  /** The corners of the block's top, round from its top left, where its handles stand. */
  protected readonly topCorners = [0, 1, 2, 3] as const;

  constructor() {
    setupMovableRotableForPiece(this, {
      target: this.terrain,
      collideLayers: ['terrain'],
      footprint: () => ({ width: this.width() * this.gridSize, height: this.depth() * this.gridSize }),
      turnsAbout: (terrain) => {
        const foot = this.pieces.footOf(terrain);
        return {
          ...foot,
          x: foot.x + (this.width() * this.gridSize) / 2,
          y: foot.y + (this.depth() * this.gridSize) / 2,
          height: foot.height + (this.altitude() + this.height()) * this.gridSize,
        };
      },
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

  readonly terrain = input.required<Terrain>();

  private readonly terrainVersion = computed(() => this.objectChange.versionOf(this.terrain().identifier)());

  readonly isLocked = computed(() => {
    this.terrainVersion();
    return this.terrain().isLocked;
  });
  readonly hasWall = computed(() => {
    this.terrainVersion();
    return this.terrain().hasWall;
  });

  readonly wallImage = computed(
    () => {
      this.objectChange.fileVersion();
      this.terrainVersion();
      return this.imageService.getSkeletonOr(this.terrain().wallImage);
    },
    { equal: imageFileEqual() }
  );

  readonly height = computed(() => {
    this.terrainVersion();
    return Math.max(0, this.terrain().height);
  });
  readonly width = computed(() => {
    this.terrainVersion();
    return Math.max(0, this.terrain().width);
  });
  readonly depth = computed(() => {
    this.terrainVersion();
    return Math.max(0, this.terrain().depth);
  });
  readonly altitude = computed(() => {
    this.terrainVersion();
    return this.terrain().altitude;
  });

  readonly doorStyle = computed(() => {
    this.terrainVersion();
    return this.terrain().doorStyle;
  });
  readonly isDoor = computed(() => this.doorStyle() !== DoorStyle.NONE);
  readonly isDoorOpen = computed(() => {
    this.terrainVersion();
    return this.terrain().isDoorOpen;
  });

  /**
   * The switch hung under the block, where the master made it one and has not retired it.
   *
   * Handed on afresh whenever the switch changes, although it is the same switch: what is written
   * over the block reads what the switch says, and would otherwise go on reading what it said first.
   */
  private readonly activeSwitch = computed(
    () => {
      this.terrainVersion();
      this.objectChange.collectionOf(BoardSwitch.aliasName)();
      const held = this.terrain().boardSwitch;
      if (!held) return null;
      this.objectChange.versionOf(held.identifier)();
      return held.retired ? null : held;
    },
    { equal: () => false }
  );

  /** Whether a click on the block presses its switch, which only a block locked in place does. */
  protected readonly pressable = computed(() => this.activeSwitch() !== null && this.isLocked());

  /**
   * What is written over the block for its switch, or nothing.
   *
   * Shown to the master whether the block is locked or not, since the master is the one setting
   * it up, and to everyone else only once it can be pressed.
   */
  protected readonly switchLabel = computed(() => {
    const held = this.activeSwitch();
    if (!held || (!this.pressable() && !this.switches.canEdit())) return '';
    return held.def.label.trim() || this.t('feature.boardSwitch.unlabeled');
  });

  /** Why the last press on the block came to nothing, shown over it for a moment. */
  protected readonly switchNotice = transientSignal('', SWITCH_NOTICE_MS);

  private pressedFrom: { x: number; y: number } | null = null;

  protected notePress(event: PointerEvent): void {
    this.pressedFrom = { x: event.clientX, y: event.clientY };
  }

  /**
   * A click on the block: its switch where it has one it can be pressed by, else its door.
   *
   * A click that ends somewhere other than where the press began is the end of turning the table
   * rather than a press, since a locked block hands a drag on to the table.
   */
  protected onBlockClick(event: MouseEvent): void {
    if (!this.pressable()) {
      this.onDoorClick();
      return;
    }
    const from = this.pressedFrom;
    this.pressedFrom = null;
    if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP_PX) return;
    void this.pressSwitch();
  }

  private async pressSwitch(): Promise<void> {
    const held = this.activeSwitch();
    if (!held) return;
    const outcome = await this.switchPresses.press(held);
    if (outcome === 'pressed' || outcome === 'busy') return;
    this.switchNotice.show(this.t(`feature.boardSwitch.refused.${outcome}`));
  }

  /** Whether this seat may open and shut a door, which a guest may not. */
  protected readonly mayOpenDoor = computed(() => this.rolePermission.canEditTabletop());

  protected onDoorClick(): void {
    if (!this.isDoor() || !this.mayOpenDoor() || this.pointerDeviceService.isDragging) return;
    const terrain = this.terrain();
    terrain.isDoorOpen = !terrain.isDoorOpen;
    SoundEffect.play(terrain.isDoorOpen ? PresetSound.unlock : PresetSound.lock);
  }

  readonly isSlope = computed(() => {
    this.terrainVersion();
    return this.terrain().isSlope;
  });
  readonly isAltitudeIndicate = computed(() => {
    this.terrainVersion();
    return this.terrain().isAltitudeIndicate;
  });

  readonly onWall = computed(() => {
    this.terrainVersion();
    return surfaceOf(this.terrain()) !== 'floor';
  });

  /** The size of one table cell, in pixels. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly isWallExist = computed(
    () => !!(this.hasWall() && this.wallImage() && this.wallImage().url && this.wallImage().url.length > 0)
  );

  /**
   * How high the guide to the block's height reaches, in cells: up to its foot, or to its top where
   * it has no wall to stand on, and down to the top of a block sunk under the face.
   */
  readonly terreinAltitude = computed(() => {
    let ret = this.altitude();
    if (this.altitude() < 0 || (!this.isSlope() && !this.isWallExist())) ret += this.height();
    return ret;
  });

  /**
   * The guide to how high the block floats, from the middle of it: down from its foot to the face
   * under it, or from the face down to the top of one sunk under it. Nothing for a block on a wall,
   * one that stands through the face, one within half a cell of it, or one set not to show it.
   */
  protected readonly altitudeGuide = computed(() => {
    if (this.onWall() || !this.isAltitudeIndicate()) return null;
    const through = (this.isSlope() || this.isWallExist()) && -this.height() < this.altitude() && this.altitude() < 0;
    if (through) return null;
    const foot = this.pieces.footOf(this.terrain());
    const middle = {
      ...foot,
      x: foot.x + (this.width() * this.gridSize) / 2,
      y: foot.y + (this.depth() * this.gridSize) / 2,
    };
    return altitudeGuideOf(middle, this.terreinAltitude(), this.gridSize);
  });

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly gridType = computed(() => {
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    this.objectChange.versionOf(this.tabletopService.currentTable.identifier)();
    return this.tabletopService.currentTable.gridType;
  });

  /** Whether the block stands on the hexes of a hex table, which it is turned by a ring round. */
  readonly isHex = computed(() => isHexGrid(this.gridType()) && Math.min(this.width(), this.depth()) >= 1);

  private readonly fogCover = computed(() => {
    const terrain = this.terrain();
    this.objectChange.versionOf(terrain.identifier)();
    return this.visionService.terrainFogCover(terrain);
  });

  /**
   * Ground nobody has walked to yet is not drawn at all.
   *
   * Only when none of it has been: a terrain the party has reached part of stays drawn, and
   * its faces are cut back to the part instead.
   */
  readonly isHiddenByFog = computed(() => {
    const cover = this.fogCover();
    return cover !== null && !cover.cleared.some((cell) => cell);
  });

  /** Stops the browser starting a native drag on the terrain. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Cancels the input handler's gesture as soon as a press starts. */
  onInputStart(_e: MouseEvent | TouchEvent) {
    this.input?.cancel();
  }

  /**
   * Opens the terrain's right-click menu, or the menu for the whole selection when the terrain is
   * part of one.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    this.terrainMenu.open(this.terrain());
  }

  /** Plays the block pick-up sound when a drag or turn of the terrain starts. */
  onMove() {
    SoundEffect.play(PresetSound.blockPick);
  }

  /** Plays the block put-down sound when a drag or turn of the terrain ends. */
  onMoved() {
    SoundEffect.play(PresetSound.blockPut);
  }
}
