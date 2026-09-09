import { NgClass, NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { buildOverlapContextMenu } from '@axe/application/ui/overlap-context-menu';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { callResourceChange, resourceChange$ } from '@axe/core/event/domain-events';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BuffBadge, toBuffBadges } from '@axe/domain/character/buff-badge';
import { BUFF_VIEW_LABEL_KEYS, type BuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isInternalResource } from '@axe/domain/character/internal-resource';
import { gaugeNumbersOf, isGaugeInverted, PieceGauge, selectPieceGauges } from '@axe/domain/character/piece-gauge';
import {
  diffResourceSnapshots,
  loudestChange,
  ResourceChange,
  ResourceChangeKind,
  ResourceChangeSeverity,
  resourceChangeSeverity,
  ResourceSnapshot,
} from '@axe/domain/character/resource-change';
import {
  playsEffectOnChange,
  playsSoundOnChange,
  ResourceSoundSet,
  soundSetOnChange,
} from '@axe/domain/character/resource-feedback';
import { DataElement } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import {
  DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  multiAngleNameMotionMode,
  multiAngleOrbitAnimation,
  multiAnglePieceMotionMode,
  multiAngleRotationPhase,
} from '@axe/domain/tabletop/multi-angle';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { asTableFacingMark, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { buildGameCharacterContextMenuModel } from '@axe/features/character/game-character/game-character-context-menu';
import { GameCharacterBuffViewComponent } from '@axe/features/character/game-character-buff-view/game-character-buff-view.component';
import { GameDataElementBuffComponent } from '@axe/features/character/game-data-element-buff/game-data-element-buff.component';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { LightSettingsComponent } from '@axe/features/tabletop/light-settings/light-settings.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import {
  makeBillboardTransform,
  makeLabelOrbitTransform,
  makeScreenLiftTransform,
} from '@axe/ui/tabletop/billboard-transform';
import { buildHexRingClipPath, calcHexFlowerParams, HexFlowerParams } from '@axe/ui/tabletop/hex-pedestal-geometry';
import { makeMultiAngleCurvedName } from '@axe/ui/tabletop/multi-angle-curved-name';
import {
  makeMultiAngleBuffOrbit,
  makeMultiAngleResourceGauge,
  MAX_MULTI_ANGLE_RESOURCE_GAUGES,
} from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { pieceImageView } from '@axe/ui/tabletop/piece-image-view';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_TALL_OBJECT_PX } from '@axe/ui/tabletop/z-offset';
import { TranslocoModule } from '@jsverse/transloco';

const DECOR_SUPERSAMPLE = 3;
const DECOR_BASE_FONT_PX = 10;
const NAME_BASE_FONT_PX = 15;
const GAUGE_ROW_HEIGHT_PX = 13;
const MULTI_ANGLE_RESOURCE_BUFF_DURATION_FACTOR = 1.25;

type PresetSoundKey = Exclude<keyof typeof PresetSound, 'prototype'>;

const RESOURCE_CHANGE_SOUND_KEYS: Record<
  ResourceSoundSet,
  Record<ResourceChangeKind, Record<ResourceChangeSeverity, PresetSoundKey>>
> = {
  flesh: {
    damage: { small: 'damageSmall', medium: 'damageMedium', large: 'damageLarge' },
    heal: { small: 'healSmall', medium: 'healMedium', large: 'healLarge' },
  },
  mech: {
    damage: { small: 'mechDamageSmall', medium: 'mechDamageMedium', large: 'mechDamageLarge' },
    heal: { small: 'mechHealSmall', medium: 'mechHealMedium', large: 'mechHealLarge' },
  },
};

function resourceChangeSound(kind: ResourceChangeKind, ratio: number, soundSet: ResourceSoundSet): string {
  return PresetSound[RESOURCE_CHANGE_SOUND_KEYS[soundSet][kind][resourceChangeSeverity(ratio)]];
}

const FLOATING_CHANGE_MS = 1300;
const FLOATING_CHANGE_LIMIT = 6;
const HIT_FLASH_MS = 420;
const HEAL_AURA_MS = 760;
const GAUGE_STACK_GAP_PX = 32;
const BUFF_STACK_GAP_PX = 40;
const TARGET_STACK_GAP_PX = 52;
const BUFF_DETAIL_ROW_HEIGHT_PX = 12;
const BUFF_BADGE_ROW_HEIGHT_PX = 22;
const BUFF_BADGES_PER_ROW = 5;
const ROLL_HANDLE_MIN_PX = 20;
const ROLL_HANDLE_MAX_PX = 56;
const ROLL_HANDLE_SIZE_RATIO = 0.56;
const ROLL_HANDLE_GAP_RATIO = 0.25;
const ROLL_HANDLE_ICON_RATIO = 24 / 28;
const RIGHT_DRAG_THRESHOLD_PX = 3;

interface PieceRightDrag {
  pointerId: number;
  startX: number;
  startY: number;
  dragged: boolean;
}

@Component({
  selector: 'game-character',
  templateUrl: './game-character.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    NgClass,
    NgStyle,
    GameDataElementBuffComponent,
    SafePipe,
    TranslocoModule,
  ],
  host: {
    class: 'block',
    '[style.display]': "isHiddenByVision() ? 'none' : null",
    '[style.z-index]': 'stackIndex()',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class GameCharacterComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly characterDice = inject(CharacterDiceService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly buffViewPreference = inject(BuffViewPreferenceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly rangeShapeInvoke = inject(RangeShapeInvokeService);
  private readonly moveRangeService = inject(MoveRangeService);
  private readonly triggerFire = inject(TriggerFireService);
  private readonly movePlan = inject(MovePlanService);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly effectCast = inject(EffectCastService);
  private readonly effectAutoPlay = inject(EffectAutoPlayService);
  private readonly effectPlayback = inject(EffectPlaybackService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly visionService = inject(VisionService);

  readonly isTargeted = computed(() => {
    this.uiSignalService.targetChange();
    return this.gameCharacter()?.targeted ?? false;
  });

  readonly isPoster = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    const surface = char.location.surface ?? 'floor';
    return surface !== 'floor';
  });

  constructor() {
    effect(() => {
      const snapshot = this.resourceSnapshot();
      const previous = this.previousResources;
      this.previousResources = snapshot;
      if (!previous) return;

      const names = untracked(this.resourceNames);
      const changes = diffResourceSnapshots(previous, snapshot, (identifier) => names.get(identifier) ?? '');
      if (changes.length < 1) return;

      // It is drawn here and announced elsewhere. Watching for the difference at each end
      // would count a value replaced by a load or a sync as a change.
      const character = untracked(this.gameCharacter);
      if (!character) return;
      untracked(() => this.showResourceChanges(changes));
      callResourceChange({ characterIdentifier: character.identifier, changes });
    });

    // What another end changed is drawn on word from it; what this end changed is already drawn.
    resourceChange$.subscribe((event) => {
      if (event.emittedBy === getPeerContext().peerId) return;
      if (event.characterIdentifier !== this.gameCharacter()?.identifier) return;
      this.showResourceChanges(event.changes as ResourceChange[]);
    }, this.destroyRef);

    effect(() => {
      const highlight = this.selectionSignalService.highlightedObject();
      const char = this.gameCharacter();
      const root = this.rootElementRef();
      if (!highlight || !char || !root) return;
      if (char.identifier !== highlight.identifier) return;
      if (char.location.name != 'table') return;

      if (this.highlightTimer != null) return;

      if (root.nativeElement.classList.contains('animate-focused')) {
        clearTimeout(this.unhighlightTimer);
        root.nativeElement.classList.remove('animate-focused');
      }

      this.highlightTimer = setTimeout(() => {
        this.highlightTimer = undefined;
        root.nativeElement.classList.add('animate-focused');
      }, 0);

      this.unhighlightTimer = setTimeout(() => {
        this.unhighlightTimer = undefined;
        root.nativeElement.classList.remove('animate-focused');
      }, 1010);
    });

    setupMovableRotableForPiece(this, {
      target: this.gameCharacter,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_TALL_OBJECT_PX),
      snapStyle: (char) => (char.size % 1 !== 0 ? GridSnapStyle.VERTEX : undefined),
    });

    this.destroyRef.onDestroy(() => {
      clearTimeout(this.highlightTimer);
      clearTimeout(this.unhighlightTimer);
      this.clearNativeContextMenuSuppression();
      this.removeRightDragCenterMarker();
      for (const timer of this.floatingTimers) clearTimeout(timer);
      this.floatingTimers.clear();
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

  readonly gameCharacter = input<GameCharacter | null>(null);
  readonly rootElementRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly movableRef = viewChild(MovableDirective);

  readonly isHiddenByVision = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    return !this.visionService.isTokenVisible(char);
  });

  get isLock(): boolean {
    const char = this.gameCharacter();
    return char?.isLock ?? false;
  }
  set isLock(isLock: boolean) {
    const char = this.gameCharacter();
    if (char) char.isLock = isLock;
  }

  readonly name = computed(() => {
    const char = this.gameCharacter();
    if (!char) return '';
    this.objectChange.versionOf(char.identifier)();
    return char.name;
  });
  readonly hideName = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    this.objectChange.trackMyCursor();
    return char.hideName && !this.rolePermission.canSeeHidden;
  });
  readonly hideBuff = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    return char.hideBuff;
  });
  readonly size = computed(() => {
    const char = this.gameCharacter();
    this.objectChange.versionOf(char?.identifier ?? '')();
    return Math.max(0, char?.size ?? 0);
  });
  readonly altitude = computed(() => {
    const char = this.gameCharacter();
    this.objectChange.versionOf(char?.identifier ?? '')();
    return char?.altitude ?? 0;
  });
  setAltitude(altitude: number) {
    const char = this.gameCharacter();
    if (char) char.altitude = altitude;
  }
  readonly imageFile = computed(
    () => {
      this.objectChange.fileVersion();
      const char = this.gameCharacter();
      if (!char) throw new Error('gameCharacter is not set');
      this.objectChange.versionOf(char.identifier)();
      return char.imageFile;
    },
    { equal: imageFileEqual() }
  );
  get rotate(): number {
    const char = this.gameCharacter();
    return char?.rotate ?? 0;
  }
  set rotate(rotate: number) {
    const char = this.gameCharacter();
    if (char) char.rotate = rotate;
  }
  get roll(): number {
    const char = this.gameCharacter();
    return char?.roll ?? 0;
  }
  set roll(roll: number) {
    const char = this.gameCharacter();
    if (char) char.roll = roll;
  }
  readonly rollSignal = computed(() => {
    const char = this.gameCharacter();
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    return char.roll;
  });
  readonly komaImageHeightSignal = computed(() => {
    const char = this.gameCharacter();
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    return char.komaImageHeight;
  });
  readonly specifyKomaImageFlag = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    return char.specifyKomaImageFlag;
  });
  get isDropShadow(): boolean {
    const char = this.gameCharacter();
    return char?.isDropShadow ?? false;
  }
  set isDropShadow(isDropShadow: boolean) {
    const char = this.gameCharacter();
    if (char) char.isDropShadow = isDropShadow;
  }
  get isAltitudeIndicate(): boolean {
    const char = this.gameCharacter();
    return char?.isAltitudeIndicate ?? false;
  }
  set isAltitudeIndicate(isAltitudeIndicate: boolean) {
    const char = this.gameCharacter();
    if (char) char.isAltitudeIndicate = isAltitudeIndicate;
  }

  protected readonly entryBounce = signal(true);

  protected onEntryBounceEnd(event: AnimationEvent): void {
    if (event.animationName !== 'bounceIn') return;
    this.entryBounce.set(false);
  }

  protected readonly buffViewMode = linkedSignal<BuffViewMode>(() => this.buffViewPreference.mode());
  protected readonly foldingBuff = computed(() => this.buffViewMode() !== 'detail');
  protected readonly buffViewLabelKey = computed(() => BUFF_VIEW_LABEL_KEYS[this.buffViewMode()]);

  protected cycleBuffView(event: MouseEvent): void {
    const fromPress = event.type === 'mousedown';
    if (fromPress && event.button !== 0) return;
    if (!fromPress && event.detail !== 0) return;
    event.stopPropagation();
    this.buffViewMode.update(nextBuffViewMode);
  }

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }
  math = Math;

  viewRotateX = 50;
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

  readonly rotateSignal = computed(() => {
    const char = this.gameCharacter();
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    return char.rotate;
  });

  readonly billboardTransform = computed(() => (this.isPoster() ? '' : this.makeBillboardTransform(30)));

  readonly billboardTransformBuff = computed(() =>
    this.isPoster() ? '' : this.makeBillboardTransform(BUFF_STACK_GAP_PX + this.gaugePanelHeightEstimate())
  );

  readonly billboardTransformImage = computed(() =>
    this.isPoster() ? '' : this.makeBillboardTransform(0, this.imageTurnsWithPiece())
  );

  readonly imageBillboardEnabled = computed(() => {
    if (this.isPoster()) return true;
    return this.tabletopService.imageBillboard() || this.tabletopService.mode2d();
  });

  readonly multiAnglePiecePedestalRotation = computed(() =>
    this.multiAngleNameOrbitEnabled() ? 'rotateZ(var(--multi-angle-piece-angle, 0deg))' : ''
  );

  readonly multiAnglePieceImageRotation = computed(() =>
    this.multiAngleNameOrbitEnabled() ? 'rotateZ(var(--multi-angle-piece-angle, 0deg))' : ''
  );

  private readonly pieceImageBillboardTransform = computed(() =>
    [this.billboardTransformImage(), this.multiAnglePieceImageRotation()].filter((part) => part.length > 0).join(' ')
  );

  /** Whether this screen holds a piece's picture to the ground it stands on. */
  /**
   * Whether a piece is kept inside its cell, which the room answers for everyone.
   *
   * Only while the table is looked at from above: standing along the table, a piece is meant
   * to rise out of its cell, and holding it down would leave nothing but a tile.
   */
  readonly fitsImageInCell = computed(() => {
    if (!this.tabletopService.mode2d()) return false;
    const table = this.tabletopService.currentTable;
    this.objectChange.versionOf(table.identifier)();
    this.objectChange.versionOf('Config')();
    const config = this.objectStore.get<Config>('Config') ?? null;
    return resolveRoomRules(config?.roomRuleAnswers ?? null, table).pieceImageInCell;
  });

  readonly imageView = pieceImageView({
    imageUrl: computed(() => this.imageFile().url),
    isPoster: this.isPoster,
    sizePx: computed(() => this.size() * this.gridSize),
    specifiedHeightPx: computed(() =>
      this.specifyKomaImageFlag() && !this.fitsImageInCell() ? this.komaImageHeightSignal() : null
    ),
    billboardEnabled: this.imageBillboardEnabled,
    billboardTransform: this.pieceImageBillboardTransform,
    squarePoster: true,
    fitInCell: this.fitsImageInCell,
  });

  private readonly pieceCenterShift = computed(
    () => `translateX(-50%) translateX(${(this.size() * this.gridSize) / 2}px)`
  );

  readonly rollHandleSizePx = computed(() => {
    const scaled = this.size() * this.gridSize * ROLL_HANDLE_SIZE_RATIO;
    return Math.round(Math.min(ROLL_HANDLE_MAX_PX, Math.max(ROLL_HANDLE_MIN_PX, scaled)));
  });

  readonly rollHandleIconSizePx = computed(() => Math.round(this.rollHandleSizePx() * ROLL_HANDLE_ICON_RATIO));

  private readonly rollHandleGapPx = computed(() => Math.round(this.rollHandleSizePx() * ROLL_HANDLE_GAP_RATIO));

  readonly rollHandleHeadTransform = computed(() => this.pieceCenterShift());

  readonly rollHandleFootTransform = computed(
    () => `${this.pieceCenterShift()} translateY(100%) translateY(${this.rollHandleGapPx()}px)`
  );

  readonly mode2dEnabled = computed(() => {
    if (this.isPoster()) return true;
    return this.tabletopService.mode2d();
  });

  /** What the room asks of a piece that has to show which way it faces. */
  readonly facingMark = computed<TableFacingMark>(() => {
    const table = this.tabletopService.currentTable;
    this.objectChange.versionOf(table.identifier)();
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    this.objectChange.versionOf('Config')();
    const config = this.objectStore.get<Config>('Config') ?? null;
    const mark = asTableFacingMark(resolveRoomRules(config?.roomRuleAnswers ?? null, table).facingMark);
    // A piece that turns to face every side of a flat screen has no one facing to mark.
    const multiAngle = this.tabletopService.mode2d() && this.tabletopService.display().multiAngleEnabled;
    return mark === 'turn' && multiAngle ? 'none' : mark;
  });

  /**
   * Whether the piece may be turned at all.
   *
   * Seen from above there was nothing turning it would show, so it was held still. A table
   * that shows facing has something to show, and hands the handles back.
   */
  readonly canTurn = computed(() => {
    if (this.isPoster()) return false;
    return !this.mode2dEnabled() || this.facingMark() !== 'none';
  });

  /** The picture itself turns with the piece, rather than staying square to the reader. */
  readonly imageTurnsWithPiece = computed(() => this.mode2dEnabled() && this.facingMark() === 'turn');

  readonly showFacingArrow = computed(() => !this.isPoster() && this.facingMark() === 'arrow');

  /**
   * The mark sits just outside the piece, pointing the way the picture's own head points.
   *
   * It is drawn as boldly as the target marker: a piece's facing is read at a glance across
   * the whole table, and a faint mark on a painted floor is read at none.
   */
  readonly facingArrowSizePx = computed(() => Math.max(16, Math.round(this.gridSize * 0.44)));

  readonly facingArrowOffsetPx = computed(() => {
    const baseOffset = Math.round(this.gridSize * 0.06);
    if (!this.multiAngleResourceBuffOrbitEnabled()) return baseOffset;
    const gauge = this.multiAngleResourceGaugeLayout();
    return gauge.segments.length > 0 ? baseOffset + gauge.strokeWidth : baseOffset;
  });

  private labelOrbitTransform(distance3d: number, distance2d: number): string {
    return makeLabelOrbitTransform({
      rotation: this.uiSignalService.tableViewRotation(),
      distance3d,
      distance2d,
      mode2d: this.mode2dEnabled(),
    });
  }

  readonly pieceGauges = computed<PieceGauge[]>(() => {
    const char = this.gameCharacter();
    const detail = char?.detailDataElement;
    if (!detail) return [];
    this.objectChange.versionOf(detail.identifier)();
    this.objectChange.collectionOf('data')();
    for (const element of collectDataElements(detail)) this.objectChange.versionOf(element.identifier)();
    return selectPieceGauges(detail);
  });

  /**
   * Whether the reader may read the numbers on this piece's bars.
   *
   * The same answer that settles whether they may open its sheet: a piece kept to the master
   * or to a few names has its readings kept with it, wherever those readings are shown.
   */
  readonly gaugeNumbersReadable = computed<boolean>(() => {
    const char = this.gameCharacter();
    if (!char) return true;
    this.objectChange.versionOf(char.identifier)();
    this.objectChange.trackMyCursor();
    return this.disclosureService.canView(char);
  });

  readonly gaugeRows = computed<{ gauge: PieceGauge; numbers: string }[]>(() => {
    const readable = this.gaugeNumbersReadable();
    return this.pieceGauges().map((gauge) => ({ gauge, numbers: gaugeNumbersOf(gauge, readable) }));
  });

  readonly buffBadges = computed<BuffBadge[]>(() => {
    const char = this.gameCharacter();
    const buffEl = char?.buffDataElement;
    if (!buffEl) return [];
    this.objectChange.versionOf(buffEl.identifier)();
    this.objectChange.collectionOf('data')();
    for (const element of collectDataElements(buffEl)) this.objectChange.versionOf(element.identifier)();
    return toBuffBadges(buffEl);
  });

  readonly orbitPieceGauges = computed(() => this.pieceGauges().slice(0, MAX_MULTI_ANGLE_RESOURCE_GAUGES));

  protected readonly decorFontSizePx = DECOR_BASE_FONT_PX * DECOR_SUPERSAMPLE;
  protected readonly nameFontSizePx = NAME_BASE_FONT_PX * DECOR_SUPERSAMPLE;
  private readonly decorScale = `scale(${(1 / DECOR_SUPERSAMPLE).toFixed(6)})`;

  private readonly resourceSnapshot = computed<Map<string, ResourceSnapshot>>(() => {
    const char = this.gameCharacter();
    const detail = char?.detailDataElement;
    const snapshot = new Map<string, ResourceSnapshot>();
    if (!detail) return snapshot;

    this.objectChange.versionOf(detail.identifier)();
    this.objectChange.collectionOf('data')();
    for (const element of collectDataElements(detail)) {
      this.objectChange.versionOf(element.identifier)();
      if (!element.isNumberResource || isInternalResource(element)) continue;
      snapshot.set(element.identifier, {
        current: Number(element.currentValue),
        max: Number(element.value),
        inverted: isGaugeInverted(element),
        playsEffect: playsEffectOnChange(element),
        playsSound: playsSoundOnChange(element),
        soundSet: soundSetOnChange(element),
        changedBySelf: this.objectStore.localChangeCountOf(element.identifier),
      });
    }
    return snapshot;
  });

  private readonly resourceNames = computed(() => {
    const detail = this.gameCharacter()?.detailDataElement;
    const names = new Map<string, string>();
    if (!detail) return names;
    for (const element of collectDataElements(detail)) names.set(element.identifier, element.name);
    return names;
  });

  readonly floatingChanges = signal<(ResourceChange & { key: number })[]>([]);
  readonly hitFlash = transientSignal<'damage' | 'heal' | null>(null, HIT_FLASH_MS);

  private previousResources: Map<string, ResourceSnapshot> | null = null;
  private floatingKey = 0;
  private readonly floatingTimers = new Set<ReturnType<typeof setTimeout>>();

  readonly gaugeStackTransform = computed(
    () => `${this.billboardTransformGauge()} ${this.decorScale} translateX(-50%)`
  );

  readonly buffStackTransform = computed(() => `${this.billboardTransformBuff()} ${this.decorScale} translateX(-50%)`);

  readonly nameStackTransform = computed(() => `${this.billboardTransform()} ${this.decorScale} translateX(-50%)`);

  readonly floatStackTransform = computed(
    () => `${this.isPoster() ? '' : this.makeBillboardTransform(56)} ${this.decorScale} translateX(-50%)`
  );

  readonly floatLabelOrbit = computed(() => {
    if (this.isPoster()) return `translateY(${-(this.size() * this.gridSize + 20)}px)`;
    return this.labelOrbitTransform(56, 96);
  });

  private readonly gaugePanelHeightEstimate = computed(() =>
    this.multiAngleResourceBuffOrbitEnabled() ? 0 : this.pieceGauges().length * GAUGE_ROW_HEIGHT_PX
  );

  readonly billboardTransformGauge = computed(() =>
    this.isPoster() ? '' : this.makeBillboardTransform(GAUGE_STACK_GAP_PX + this.gaugePanelHeightEstimate() / 2)
  );

  readonly gaugeLabelOrbit = computed(() => {
    if (this.isPoster()) return `translateY(${-(this.size() * this.gridSize + 8 + this.gaugePanelHeightEstimate())}px)`;
    return this.labelOrbitTransform(
      GAUGE_STACK_GAP_PX + this.gaugePanelHeightEstimate(),
      64 + this.gaugePanelHeightEstimate()
    );
  });

  readonly nameLabelOrbit = computed(() => {
    if (this.isPoster()) return `translateY(${-(this.size() * this.gridSize + 5)}px)`;
    return this.labelOrbitTransform(30, 60);
  });

  readonly multiAngleNameOrbitEnabled = computed(() => {
    return !this.isPoster() && this.tabletopService.mode2d() && this.tabletopService.display().multiAngleEnabled;
  });

  readonly multiAngleResourceBuffOrbitEnabled = computed(() => {
    return this.multiAngleNameOrbitEnabled() && this.tabletopService.display().multiAngleResourceBuffEnabled;
  });

  readonly multiAngleCurvedNameLayout = computed(() =>
    makeMultiAngleCurvedName(this.multiAngleLabelText(), this.size() * this.gridSize)
  );

  readonly multiAngleLabelText = computed(() => {
    if (this.hideBuff() || this.multiAngleResourceBuffOrbitEnabled()) return this.name();
    const buffNames = this.buffBadges()
      .map((buff) => buff.name.trim())
      .filter((name) => name.length > 0)
      .join('・');
    if (buffNames.length < 1) return this.name();
    const leadingBuff = Array.from(buffNames).slice(0, 5).join('');
    return `${this.name()}/${leadingBuff}`;
  });

  readonly multiAngleResourceGaugeLayout = computed(() =>
    makeMultiAngleResourceGauge(this.orbitPieceGauges(), this.size() * this.gridSize)
  );

  readonly multiAngleBuffOrbitLayout = computed(() => {
    const name = this.multiAngleCurvedNameLayout();
    const gauge = this.multiAngleResourceGaugeLayout();
    const innerExtent = Math.max(name.radius + name.fontSize / 2 + name.strokeWidth / 2, gauge.outerExtent);
    return makeMultiAngleBuffOrbit(this.buffBadges().length, this.size() * this.gridSize, innerExtent);
  });

  readonly multiAngleOrbitVisible = computed(
    () =>
      this.multiAngleNameOrbitEnabled() &&
      ((this.name().length > 0 && !this.hideName()) ||
        (this.multiAngleResourceBuffOrbitEnabled() &&
          (this.orbitPieceGauges().length > 0 || (!this.hideBuff() && this.buffBadges().length > 0))))
  );

  readonly multiAngleCurvedNamePathId = computed(
    () => `multi-angle-curved-name-${this.gameCharacter()?.identifier ?? 'unknown'}`
  );

  readonly multiAngleNameOrbitAnimation = computed(() => {
    const display = this.tabletopService.display();
    return multiAngleOrbitAnimation(
      multiAngleNameMotionMode(display.multiAngleMotionMode),
      display.multiAngleRevolutionSeconds,
      display.multiAnglePauseSeconds
    );
  });

  readonly multiAngleResourceBuffOrbitAnimation = computed(() => {
    const nameAnimation = this.multiAngleNameOrbitAnimation();
    return {
      durationSeconds: nameAnimation.durationSeconds * MULTI_ANGLE_RESOURCE_BUFF_DURATION_FACTOR,
      timingFunction: nameAnimation.timingFunction,
    };
  });

  private readonly multiAngleNamePhase = computed(() =>
    multiAngleRotationPhase(`${this.gameCharacter()?.identifier ?? 'unknown'}:name`)
  );

  private readonly multiAngleResourceBuffPhase = computed(() =>
    multiAngleRotationPhase(`${this.gameCharacter()?.identifier ?? 'unknown'}:resource-buff`)
  );

  private readonly multiAnglePiecePhase = computed(() =>
    multiAngleRotationPhase(`${this.gameCharacter()?.identifier ?? 'unknown'}:piece`)
  );

  readonly multiAngleNameOrbitDelaySeconds = computed(
    () => -this.multiAngleNamePhase() * this.multiAngleNameOrbitAnimation().durationSeconds
  );

  readonly multiAngleResourceBuffOrbitDelaySeconds = computed(
    () => -this.multiAngleResourceBuffPhase() * this.multiAngleResourceBuffOrbitAnimation().durationSeconds
  );

  readonly multiAnglePieceRevolutionSeconds = computed(() => {
    const seconds = this.tabletopService.display().multiAnglePieceRevolutionSeconds;
    return Number.isFinite(seconds)
      ? Math.min(300, Math.max(5, seconds))
      : DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS;
  });

  readonly multiAnglePieceRotationAnimation = computed(() => {
    const display = this.tabletopService.display();
    return multiAngleOrbitAnimation(
      multiAnglePieceMotionMode(display.multiAngleMotionMode),
      this.multiAnglePieceRevolutionSeconds(),
      display.multiAnglePauseSeconds
    );
  });

  readonly multiAnglePieceRotationDelaySeconds = computed(
    () => -this.multiAnglePiecePhase() * this.multiAnglePieceRotationAnimation().durationSeconds
  );

  readonly buffLabelOrbit = computed(() => {
    if (this.isPoster())
      return `translateY(${-(this.size() * this.gridSize + 12 + this.gaugePanelHeightEstimate())}px)`;
    return this.labelOrbitTransform(
      BUFF_STACK_GAP_PX + this.gaugePanelHeightEstimate(),
      68 + this.gaugePanelHeightEstimate()
    );
  });

  private readonly buffPanelHeightEstimate = computed(() => {
    if (this.multiAngleResourceBuffOrbitEnabled() || this.hideBuff() || this.buffNum() < 1) return 0;
    if (this.buffViewMode() === 'detail') return this.buffChildren().length * BUFF_DETAIL_ROW_HEIGHT_PX;
    if (this.buffViewMode() === 'count') return BUFF_BADGE_ROW_HEIGHT_PX;
    return Math.ceil(this.buffBadges().length / BUFF_BADGES_PER_ROW) * BUFF_BADGE_ROW_HEIGHT_PX;
  });

  protected multiAngleBuffOrbitTransform(angle: number, radius: number): string {
    return `rotate(${angle}deg) translateY(${-radius}px)`;
  }

  private readonly pieceImageHeightEstimate = computed(() => {
    if (!this.gameCharacter() || this.imageFile().url.length < 1) return 0;
    if (this.specifyKomaImageFlag()) return this.komaImageHeightSignal();
    const natural = this.imageView.naturalSize();
    if (!natural) return this.size() * this.gridSize;
    return (this.size() * this.gridSize * natural.height) / natural.width;
  });

  readonly targetLabelOrbit = computed(() => {
    const stack = this.gaugePanelHeightEstimate() + this.buffPanelHeightEstimate();
    if (this.isPoster()) return `translateY(${-(this.size() * this.gridSize + 20 + stack)}px)`;
    return this.screenLiftOrbit(TARGET_STACK_GAP_PX + stack, 84 + stack);
  });

  readonly targetStackTransform = computed(
    () => `${this.isPoster() ? '' : this.makeBillboardTransform(0)} ${this.decorScale} translateX(-50%)`
  );

  private screenLiftOrbit(screenLift3d: number, distance2d: number): string {
    return makeScreenLiftTransform({
      rotation: this.uiSignalService.tableViewRotation(),
      pieceRotate: this.rotateSignal(),
      pieceRoll: this.rollSignal(),
      worldHeight3d: this.pieceImageHeightEstimate(),
      screenLift3d,
      distance2d,
      mode2d: this.mode2dEnabled(),
    });
  }

  /**
   * The frame everything above the pedestal hangs from.
   *
   * The existing flat/multi-angle renderer takes the piece's turn back out on each billboard.
   * Counter-rotating this shared 3D frame as well makes the image plane disappear in some
   * browsers when the table switches to 2D, so the frame itself keeps the original transform.
   */
  readonly standTransform = computed(() => {
    if (this.isPoster()) return 'translateY(-50%)';
    return (
      'rotateY(90deg) rotateZ(-90deg) rotateY(-90deg) ' +
      `translateY(-50%) translateY(${-this.altitude() * this.gridSize}px)`
    );
  });

  private makeBillboardTransform(verticalOffset3D: number, turnsWithPiece = false): string {
    // In 2D every billboard cancels the piece's turn, except the picture when the table asks it
    // to turn with the piece. This also composes with the multi-angle image rotation.
    const pieceRotate = this.mode2dEnabled() && turnsWithPiece ? 0 : this.rotateSignal();
    return makeBillboardTransform({
      rotation: this.uiSignalService.tableViewRotation(),
      pieceRotate,
      pieceRoll: this.rollSignal(),
      parentInverseRotation: 'rotateY(90deg) rotateZ(90deg) rotateY(-90deg)',
      verticalOffset3D,
      mode2d: this.mode2dEnabled(),
    });
  }

  readonly movableOption = signal<MovableOption>({});

  readonly rotableOption = signal<RotableOption>({});

  readonly pedestalHexParams = computed<HexFlowerParams | null>(() => {
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    this.objectChange.versionOf(this.tabletopService.currentTable.identifier)();
    const char = this.gameCharacter();
    if (!char) return null;
    this.objectChange.versionOf(char.identifier)();
    const gridType = this.tabletopService.currentTable.gridType;
    if (!isHexGrid(gridType)) return null;
    return calcHexFlowerParams(this.size(), this.gridSize, isFlatTopGrid(gridType));
  });

  private readonly pedestalRing = computed<Record<string, string> | null>(() => {
    const params = this.pedestalHexParams();
    if (!params) return null;
    const { outline, bbox, L } = params;
    const W = bbox.maxX - bbox.minX;
    const H = bbox.maxY - bbox.minY;
    return {
      clipPath: buildHexRingClipPath(outline, bbox, 6),
      border: 'none',
      borderRadius: '0',
      width: `${W}px`,
      height: `${H}px`,
      left: `${bbox.minX + L / 2}px`,
      top: `${bbox.minY + L / 2}px`,
    };
  });

  private pedestalStyleOf(borderColor: string): Record<string, string> {
    const ring = this.pedestalRing();
    return ring ? { background: borderColor, ...ring } : { border: `solid 6px ${borderColor}` };
  }

  protected readonly pedestalStyleShown = computed(() => this.pedestalStyleOf('#FFCC80'));
  protected readonly pedestalStyleHidden = computed(() => this.pedestalStyleOf('#A0E0FF'));
  protected readonly pedestalStyleTargeted = computed(() => this.pedestalStyleOf('#ff3b30'));

  // The pedestal styles ran as getters on every change-detection pass and built a fresh
  // record each time. Computed, they hand back the same object until something changes,
  // which saves a thousand allocations and as many clip paths a pass with three hundred characters on the table.
  protected readonly pedestalOuterStyle = computed<Record<string, string>>(() => {
    const params = this.pedestalHexParams();
    if (!params) return {} as Record<string, string>;
    const { outline, bbox, L } = params;
    const W = bbox.maxX - bbox.minX;
    const H = bbox.maxY - bbox.minY;
    return {
      background: '#212121',
      clipPath: buildHexRingClipPath(outline, bbox, 2),
      border: 'none',
      borderRadius: '0',
      width: `${W}px`,
      height: `${H}px`,
      left: `${bbox.minX + L / 2}px`,
      top: `${bbox.minY + L / 2}px`,
    };
  });

  protected readonly pedestalGrabStyle = computed<Record<string, string>>(() => {
    const params = this.pedestalHexParams();
    if (!params) return {} as Record<string, string>;
    const { bbox, L } = params;
    const halfW = (bbox.maxX - bbox.minX) / 2;
    const halfH = (bbox.maxY - bbox.minY) / 2;
    const radius = Math.sqrt(halfW * halfW + halfH * halfH) + 12;
    const diameter = radius * 2;
    return {
      width: `${diameter}px`,
      height: `${diameter}px`,
      left: `${L / 2 - radius}px`,
      top: `${L / 2 - radius}px`,
      borderRadius: '50%',
    };
  });

  protected readonly pedestalGrabBorderStyle = computed<Record<string, string>>(() => {
    if (!this.pedestalHexParams()) return {} as Record<string, string>;
    return {
      borderTop: 'solid 16px #999',
      borderLeft: 'solid 16px #999',
      borderRight: 'solid 16px #ccc',
      borderBottom: 'solid 16px #ccc',
      borderRadius: '50%',
    };
  });

  private highlightTimer: ReturnType<typeof setTimeout> | undefined;
  private unhighlightTimer: ReturnType<typeof setTimeout> | undefined;

  get elevation(): number {
    const char = this.gameCharacter();
    if (!char) return 0;
    return +((char.posZ + this.altitude() * this.gridSize) / this.gridSize).toFixed(1);
  }

  get chatBubbleAltitude(): number {
    return 0;
  }

  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  onInputStart(_e: MouseEvent | TouchEvent) {
    if (this.input) this.input.cancel();
  }

  private rightDrag: PieceRightDrag | null = null;
  private rightDragCenterMarker: HTMLElement | null = null;
  private nativeContextMenuSuppressionTimer: ReturnType<typeof setTimeout> | null = null;
  private nativeContextMenuSuppressor: ((event: MouseEvent) => void) | null = null;

  protected onPiecePointerDown(event: PointerEvent): void {
    this.checkKey(event);
    if (event.button !== 2 || !this.mode2dEnabled()) return;

    this.selectionSignalService.cancelTableGesture();
    this.rightDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    };
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  protected onPiecePointerMove(event: PointerEvent): void {
    const drag = this.rightDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.dragged) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      drag.dragged = dx * dx + dy * dy > RIGHT_DRAG_THRESHOLD_PX * RIGHT_DRAG_THRESHOLD_PX;
      if (!drag.dragged) return;
      // Some platforms raise contextmenu on the press rather than the release. Once this is
      // known to be a drag, remove that early menu and replace it at the release point.
      this.contextMenuService.close();
    }

    this.showRightDragCenterMarker(event.clientX, event.clientY);
    if (event.cancelable) event.preventDefault();
  }

  protected onPiecePointerUp(event: PointerEvent): void {
    const drag = this.rightDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.releasePiecePointer(event);
    this.removeRightDragCenterMarker();
    this.rightDrag = null;
    if (!drag.dragged) return;

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    this.suppressNextNativeContextMenu();

    const menuPosition: PointerCoordinate = { x: event.clientX, y: event.clientY, z: 0 };
    const anchor = this.pieceScreenCenter(menuPosition);
    this.openCharacterContextMenu(menuPosition, menuPosition, anchor);
  }

  protected onPiecePointerCancel(event: PointerEvent): void {
    if (!this.rightDrag || this.rightDrag.pointerId !== event.pointerId) return;
    this.releasePiecePointer(event);
    this.removeRightDragCenterMarker();
    this.rightDrag = null;
  }

  private showRightDragCenterMarker(x: number, y: number): void {
    let marker = this.rightDragCenterMarker;
    if (!marker) {
      marker = document.createElement('div');
      marker.dataset['pieceRightDragCenter'] = '';
      marker.className = 'piece-right-drag-center';
      marker.setAttribute('aria-hidden', 'true');
      document.body.appendChild(marker);
      this.rightDragCenterMarker = marker;
    }
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
  }

  private removeRightDragCenterMarker(): void {
    this.rightDragCenterMarker?.remove();
    this.rightDragCenterMarker = null;
  }

  private releasePiecePointer(event: PointerEvent): void {
    const element = event.currentTarget as HTMLElement | null;
    if (element?.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
  }

  private suppressNextNativeContextMenu(): void {
    this.clearNativeContextMenuSuppression();
    const suppressor = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.clearNativeContextMenuSuppression();
    };
    this.nativeContextMenuSuppressor = suppressor;
    document.addEventListener('contextmenu', suppressor, true);
    // A contextmenu generated by this release is dispatched in the same task. Do not let this
    // guard consume a separate right click made later.
    this.nativeContextMenuSuppressionTimer = setTimeout(() => this.clearNativeContextMenuSuppression(), 0);
  }

  private clearNativeContextMenuSuppression(): void {
    if (this.nativeContextMenuSuppressor) {
      document.removeEventListener('contextmenu', this.nativeContextMenuSuppressor, true);
      this.nativeContextMenuSuppressor = null;
    }
    if (this.nativeContextMenuSuppressionTimer !== null) {
      clearTimeout(this.nativeContextMenuSuppressionTimer);
      this.nativeContextMenuSuppressionTimer = null;
    }
  }

  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    const char = this.gameCharacter();
    if (!char) return;

    if (!this.disclosureService.canView(char)) return;
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const position = this.pointerDeviceService.pointers[0];
    this.openCharacterContextMenu(position);
  }

  private openCharacterContextMenu(
    position: PointerCoordinate,
    radialCenter?: { x: number; y: number },
    radialAnchor?: { x: number; y: number }
  ): void {
    const char = this.gameCharacter();
    if (!char || !this.disclosureService.canView(char)) return;

    if (this.pieceContextMenu.openForSelection(char, this.gridSize, position)) return;
    const overlapEntries = buildOverlapContextMenu(
      this.tabletopOverlap,
      char,
      position.x,
      position.y,
      this.translateFn
    );
    const table = this.tabletopService.currentTable;
    const display = this.tabletopService.display();
    const surfaceEntries = buildSurfaceSwitchContextMenu(char, table, this.translateFn);
    const menu = buildGameCharacterContextMenuModel(
      char,
      this.gridSize,
      this.inventoryService,
      {
        onShowDetail: () => this.showDetail(char),
        onShowChatPalette: () => this.showChatPalette(char),
        onShowRemoteController: () => this.showRemoteController(char),
        onShowBuffEdit: () => this.showBuffEdit(char),
        onSelectBuffView: (mode: string) => this.buffViewMode.set(mode as BuffViewMode),
        onShowLightSettings: () => this.showLightSettings(char),
        onInvokeRangeShape: (value) => this.rangeShapeInvoke.spawnForCharacter(char, value),
        onInvokeEffect: (name) => this.invokeEffect(char, name),
        onDeployDice: () => this.characterDice.deploy(char),
        onPlanMove: this.moveRangeService.canPlan(char) ? () => void this.movePlan.begin(char) : undefined,
        onToggleTarget: () => this.toggleTarget(),
        onClearTargets: this.anythingTargeted() ? () => this.clearEveryTarget() : undefined,
      },
      this.translateFn,
      overlapEntries,
      this.buffViewMode(),
      surfaceEntries
    );
    if (!this.tabletopService.mode2d() || display.tabletopMenuStyle === 'standard') {
      this.contextMenuService.open(position, menu.actions, this.name());
      return;
    }

    const rootBounds = this.rootElementRef()?.nativeElement.getBoundingClientRect();
    const menuCenter = radialCenter ?? this.pieceScreenCenter(position, rootBounds);
    const menuClearanceRadius = rootBounds ? this.contextMenuClearanceRadius(rootBounds) : 0;
    const menuOcclusionHalfExtent = rootBounds ? Math.max(rootBounds.width, rootBounds.height) / 2 : 0;
    const args = [
      menuCenter,
      menu.actions,
      menu.radialGroups,
      this.name(),
      display.tabletopMenuStyle === 'radial',
      display.radialMenuRotationSpeed,
      multiAngleFontScaleFactor(display.multiAngleFontScale),
      menuClearanceRadius,
      menuOcclusionHalfExtent,
    ] as const;
    if (radialAnchor) {
      this.contextMenuService.openRadial(...args, radialAnchor);
    } else {
      this.contextMenuService.openRadial(...args);
    }
  }

  private pieceScreenCenter(fallback: { x: number; y: number }, rootBounds?: DOMRect): { x: number; y: number } {
    const bounds = rootBounds ?? this.rootElementRef()?.nativeElement.getBoundingClientRect();
    return bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : { x: fallback.x, y: fallback.y };
  }

  private contextMenuClearanceRadius(rootBounds: DOMRect): number {
    const pieceDiameter = this.size() * this.gridSize;
    const renderedDiameter = Math.max(rootBounds.width, rootBounds.height);
    if (pieceDiameter <= 0 || renderedDiameter <= 0) return 0;

    const renderedScale = renderedDiameter / pieceDiameter;
    const curvedName = this.multiAngleCurvedNameLayout();
    const nameExtent = curvedName.radius + curvedName.fontSize / 2 + curvedName.strokeWidth / 2;
    const buffOrbit = this.multiAngleBuffOrbitLayout();
    const resourceBuffExtent =
      this.multiAngleResourceBuffOrbitEnabled() && !this.hideBuff() && this.buffBadges().length > 0
        ? buffOrbit.radius + buffOrbit.iconSize / 2
        : 0;
    if (this.size() <= 1) return resourceBuffExtent * renderedScale;
    return Math.max(nameExtent, resourceBuffExtent) * renderedScale;
  }

  /** How it goes down, set only while an effect is aimed at it. */
  readonly defeatReaction = computed<string>(() => {
    const identifier = this.gameCharacter()?.identifier;
    if (!identifier) return '';
    return this.effectPlayback.tokenReactions().get(identifier) ?? '';
  });

  private showResourceChanges(changes: ResourceChange[]) {
    const entries = changes.map((change) => ({ ...change, key: ++this.floatingKey }));
    this.floatingChanges.update((current) => [...current, ...entries].slice(-FLOATING_CHANGE_LIMIT));

    const kind = entries.some((entry) => entry.kind === 'damage') ? 'damage' : 'heal';
    this.hitFlash.show(kind, kind === 'damage' ? HIT_FLASH_MS : HEAL_AURA_MS);

    const heard = entries.filter((entry) => entry.playsSound);
    const loudest = loudestChange(heard);
    // One line is heard, so all three of what is heard come from it. Taken apart, a point of
    // damage alongside a large heal was played as a large hurt, in the heal's own voice.
    if (loudest) SoundEffect.playLocal(resourceChangeSound(loudest.kind, loudest.ratio, loudest.soundSet));

    const shown = entries.filter((entry) => entry.playsEffect);
    const char = this.gameCharacter();
    if (char && shown.length > 0) this.effectAutoPlay.play(char, shown);

    const keys = new Set(entries.map((entry) => entry.key));
    const floatTimer = setTimeout(() => {
      this.floatingTimers.delete(floatTimer);
      this.floatingChanges.update((current) => current.filter((entry) => !keys.has(entry.key)));
    }, FLOATING_CHANGE_MS);
    this.floatingTimers.add(floatTimer);
  }

  readonly stackIndex = computed(() => {
    const char = this.gameCharacter();
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    return char.zindex;
  });

  onMove() {
    this.gameCharacter()?.toTopmost();
    SoundEffect.play(PresetSound.piecePick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.piecePut);
  }

  /** Whether this piece is the one whose move is being worked out, and so is not to be dragged. */
  readonly isPlanningMove = computed(() => {
    const plan = this.movePlan.plan();
    return plan != null && plan.characterIdentifier === this.gameCharacter()?.identifier;
  });

  /**
   * Working a move out, rather than carrying the piece to where it should end up.
   *
   * The press is turned away rather than followed: a planned move leaves the piece standing
   * while the way is drawn, and a piece that came along with the hand would be standing
   * somewhere the way was never drawn from. Turned away once the press has finished being
   * taken up, not in the middle of it: the drag puts the piece's transition and its
   * collidable layer aside after saying it has started, and a refusal that arrives first is
   * undone by the very setting up it refused.
   *
   * A room that holds pieces to a way they could have walked works out every move, since
   * being sent back after the fact and being shown the way beforehand are the same rule, and
   * having them behave differently only depending on which hand opened the move made two
   * features out of one.
   *
   * Shift asks for the other kind of move to the room's own: the way drawn out beforehand
   * where a press would carry the piece, and the piece carried where a press would draw it.
   */
  onGrab(event: PointerEvent) {
    if (event.altKey) return;
    if (this.asksForTheOtherMove(event) === this.isStrictMove()) return;
    const character = this.gameCharacter();
    if (!character || this.isLock) return;
    if (!this.movePlan.begin(character)) return;
    queueMicrotask(() => this.movableRef()?.cancel());
  }

  /**
   * Whether the press asks for the other kind of move to the one the room works in.
   *
   * Shift asks for it. In a room that holds pieces to a way they could have walked, it is the
   * game master's to ask: a rule anybody at the table could step out of by holding a key down
   * is not a rule the table is held to.
   */
  private asksForTheOtherMove(event: PointerEvent): boolean {
    if (!event.shiftKey) return false;
    return !this.isStrictMove() || PeerCursor.isMyselfGameMaster;
  }

  private isStrictMove(): boolean {
    return this.objectStore.get<Config>('Config')?.moveStrict === true;
  }

  onPickUp() {
    this.onMove();
    const character = this.gameCharacter();
    if (!character) return;
    this.moveRangeService.show(character);
    this.triggerFire.pickedUp(character);
  }

  onPutDown() {
    this.onMoved();
    this.moveRangeService.hide();
    const character = this.gameCharacter();
    if (character) this.triggerFire.putDown(character);
  }

  onLetGo() {
    this.moveRangeService.hide();
  }

  checkKey(event: KeyboardEvent | MouseEvent) {
    const key_event = (event || window.event) as KeyboardEvent | MouseEvent;
    const key_shift = key_event.shiftKey;
    const _key_ctrl = key_event.ctrlKey;
    const key_alt = key_event.altKey;
    const _key_meta = key_event.metaKey;

    if (key_shift && key_alt) {
      key_event.preventDefault();
      key_event.stopPropagation();
      this.clearEveryTarget();
      return;
    }

    if (key_alt) {
      key_event.preventDefault();
      key_event.stopPropagation();
      this.toggleTarget();
    }
  }

  /** Marks the piece as one an effect is aimed at, or takes the mark off it. */
  toggleTarget(): void {
    const char = this.gameCharacter();
    if (!char) return;
    char.targeted = !char.targeted;
    this.uiSignalService.notifyTargetChange(char.identifier, char.aliasName);
  }

  clearEveryTarget(): void {
    for (const object of this.objectStore.getObjects(GameCharacter)) {
      if (!object.targeted) continue;
      object.targeted = false;
      this.uiSignalService.notifyTargetChange(object.identifier, object.aliasName);
    }
  }

  /** Whether anything on the table is aimed at, which is what makes clearing worth offering. */
  private anythingTargeted(): boolean {
    return this.objectStore.getObjects(GameCharacter).some((object) => object.targeted);
  }

  /** Fires an effect from a character sheet. It is looked up by name, so the same row works in any room. */
  private invokeEffect(char: GameCharacter, name: string): void {
    const preset = this.effectLibrary.findByName(name);
    if (preset) this.effectCast.fireFromCharacter(preset, char);
  }

  private showDetail(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.character.panel.sheet'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 800, height: 600 });
  }

  private showChatPalette(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    this.objectPanels.openChatPalette(gameObject);
  }

  private showRemoteController(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    this.objectPanels.openRemoteController(gameObject);
  }

  private showBuffEdit(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x,
      top: coordinate.y,
      width: 420,
      height: 300,
    };
    option.title = this.translateFn('feature.character.panel.buffEditWithName', { name: gameObject.name });
    const component = this.panelService.open<GameCharacterBuffViewComponent>(GameCharacterBuffViewComponent, option);
    component.character.set(gameObject);
  }

  private showLightSettings(gameObject: GameCharacter) {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.translateFn('feature.character.contextMenu.lightSettings'),
      ...sheetPanelBox(coordinate, 360, 460),
    };
    const component = this.panelService.open<LightSettingsComponent>(LightSettingsComponent, option);
    component.target = gameObject;
    component.showVision = true;
  }

  protected readonly buffChildren = computed<DataElement[]>(() => {
    const char = this.gameCharacter();
    const buffEl = char?.buffDataElement;
    if (!buffEl) return [];
    this.objectChange.versionOf(buffEl.identifier)();
    return buffEl.children.slice() as DataElement[];
  });

  protected readonly buffNum = computed<number>(() => {
    const children = this.buffChildren();
    let count = 0;
    for (const child of children) {
      this.objectChange.versionOf(child.identifier)();
      if (child.children.length > 0) {
        count += child.children.length;
      } else if (child.isNumberResource) {
        count += 1;
      }
    }
    return count;
  });
}
