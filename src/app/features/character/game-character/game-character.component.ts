import { NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
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
import { SpeechBubbleService } from '@axe/application/chat/speech-bubble.service';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { WaterService } from '@axe/application/tabletop/water.service';
import { BillboardFacing, facesAlways, NOT_TURNED } from '@axe/application/ui/billboard-frame.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { callResourceChange, resourceChange$ } from '@axe/core/event/domain-events';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { VolumeType } from '@axe/core/storage/audio-output';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BUFF_BADGES_PER_ROW, BuffBadge, toBuffBadges } from '@axe/domain/character/buff-badge';
import { BUFF_VIEW_LABEL_KEYS, type BuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeNumbersOf, isGaugeInverted, PieceGauge, selectPieceGauges } from '@axe/domain/character/piece-gauge';
import { pieceImageWidthApart } from '@axe/domain/character/piece-image-size';
import { isResourceElement } from '@axe/domain/character/resource-catalog';
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
import { calcHexFlowerParams, HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { landingLeanAt } from '@axe/domain/tabletop/move/landing-height';
import { pieceCentreOffsetPx, pieceCornerOnSquare } from '@axe/domain/tabletop/move/piece-on-grid';
import {
  DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  multiAngleNameMotionMode,
  multiAngleOrbitAnimation,
  multiAnglePieceMotionMode,
  multiAngleRotationPhase,
} from '@axe/domain/tabletop/multi-angle';
import { RideSeat, seatOf } from '@axe/domain/tabletop/ride/ride-rules';
import { asTableFacingMark, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { isOffTheFloor } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { PieceWaterLook, pieceWaterLook } from '@axe/domain/tabletop/water/submersion';
import {
  GameCharacterMenuHost,
  GameCharacterMenuService,
  screenCentreOf,
} from '@axe/features/character/game-character/game-character-menu.service';
import { PieceFigureHeightsService } from '@axe/features/character/game-character/piece-figure-heights.service';
import { PieceRightDrag } from '@axe/features/character/game-character/piece-right-drag';
import { GameDataElementBuffComponent } from '@axe/features/character/game-data-element-buff/game-data-element-buff.component';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { BillboardDirective } from '@axe/ui/directives/billboard.directive';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SeeThroughDirective } from '@axe/ui/directives/see-through.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { makeBillboardTransform, makeScreenLiftTransform } from '@axe/ui/tabletop/billboard-transform';
import { hexPedestalGrabStyle, hexPedestalRingStyle } from '@axe/ui/tabletop/hex-pedestal-style';
import { makeMultiAngleCurvedName } from '@axe/ui/tabletop/multi-angle-curved-name';
import {
  makeMultiAngleBuffOrbit,
  makeMultiAngleResourceGauge,
  MAX_MULTI_ANGLE_RESOURCE_GAUGES,
} from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { pieceImageView } from '@axe/ui/tabletop/piece-image-view';
import { pieceLabelFacings } from '@axe/ui/tabletop/piece-label-facings';
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
/** The space between a bubble and the bars and buffs under it. */
const SPEECH_STACK_GAP_PX = 6;
/** How much higher a bubble stands over a piece marked as a target, to clear the mark. */
const TARGET_MARK_HEIGHT_PX = 34;
/** How large a stamp shows in a bubble, before the labels' supersampling. */
const SPEECH_STAMP_PX = 56;
const BUFF_DETAIL_ROW_HEIGHT_PX = 12;
const BUFF_BADGE_ROW_HEIGHT_PX = 22;
/** How far over a ridden mount the foot of its riding card stands: where its name stands otherwise. */
const RIDING_CARD_LIFT_PX = 8;
/** How far across the table from a ridden mount the foot of its riding card stands, seen from above. */
const RIDING_CARD_LIFT_2D_PX = 38;
/** The room each piece in the riding card takes besides its name, bars and buffs: padding and rule. */
const RIDING_CARD_ENTRY_PX = 8;
/** How tall one name in the riding card is drawn, for reckoning what stands over it. */
const RIDING_NAME_HEIGHT_PX = 22;
/** How far in front of its mount a piece riding it is drawn, so a mount's picture never hides it. */
const RIDER_IN_FRONT_PX = 3;
/** The mark each seat is shown with in the riding label. */
const RIDING_SEAT_ICONS: Readonly<Record<RideSeat, string>> = {
  rider: 'upgrade',
  passenger: 'group',
  cargo: 'backpack',
};

/** One piece in a mount's riding card: one riding it, or the mount itself. */
interface RidingLabel {
  readonly identifier: string;
  /** Its name, empty where it is not shown to this reader. */
  readonly name: string;
  /** The mark of the seat it rides in, empty for the mount. */
  readonly icon: string;
  /** How many ride it, for the mount; 0 for one riding. */
  readonly aboard: number;
  readonly gauges: readonly { readonly gauge: PieceGauge; readonly numbers: string }[];
  readonly badges: readonly BuffBadge[];
}
const ROLL_HANDLE_MIN_PX = 20;
const ROLL_HANDLE_MAX_PX = 56;
const ROLL_HANDLE_SIZE_RATIO = 0.56;
const ROLL_HANDLE_GAP_RATIO = 0.25;
const ROLL_HANDLE_ICON_RATIO = 24 / 28;
/** How a piece standing in water is drawn on the table. */
interface PieceInWater extends PieceWaterLook {
  /** Where the ring on the surface stands over the piece's own ground, or null for a piece sunk over its head. */
  readonly ripple: string | null;
}

/** How far over the surface the ring is drawn, so the surface does not swallow it. */
const WATER_RIPPLE_LIFT_PX = 0.5;

@Component({
  selector: 'game-character',
  templateUrl: './game-character.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BillboardDirective,
    SeeThroughDirective,
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    NgClass,
    NgStyle,
    GameDataElementBuffComponent,
    NgTemplateOutlet,
    SafePipe,
    StampComponent,
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
  private readonly menu = inject(GameCharacterMenuService);
  private readonly roomRules = inject(RoomRulesService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly mobileLayout = inject(MobileLayoutService);
  private readonly buffViewPreference = inject(BuffViewPreferenceService);
  private readonly overlay = inject(PieceOverlayPreferenceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly figureHeights = inject(PieceFigureHeightsService);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly moveRangeService = inject(MoveRangeService);
  private readonly triggerFire = inject(TriggerFireService);
  private readonly movePlan = inject(MovePlannerService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly effectAutoPlay = inject(EffectAutoPlayService);
  private readonly effectPlayback = inject(EffectPlaybackService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly engagementZones = inject(EngagementZoneService);
  private readonly links = inject(PieceLinksService);
  private readonly ride = inject(RideService);
  private readonly snackbar = inject(SnackbarService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly visionService = inject(VisionService);
  private readonly water = inject(WaterService);
  private readonly speechBubbles = inject(SpeechBubbleService);
  private readonly renderLite = inject(RenderLiteService);

  readonly isTargeted = computed(() => {
    this.uiSignalService.targetChange();
    return this.gameCharacter()?.targeted ?? false;
  });

  readonly isSharedView = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    return this.firstPerson.sharedPiece() === char.identifier;
  });

  readonly isPoster = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    return isOffTheFloor(char);
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

    effect(() => {
      const identifier = this.gameCharacter()?.identifier ?? '';
      if (this.figureIdentifier !== identifier) this.figureHeights.forget(this.figureIdentifier);
      this.figureIdentifier = identifier;
      if (identifier !== '') this.figureHeights.set(identifier, this.figureHeightPx());
    });
    this.destroyRef.onDestroy(() => this.figureHeights.forget(this.figureIdentifier));

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
      snapToSquare: (char, at) => pieceCornerOnSquare(this.tabletopService.currentTable, char, at),
    });

    this.destroyRef.onDestroy(() => {
      clearTimeout(this.highlightTimer);
      clearTimeout(this.unhighlightTimer);
      this.rightDrag.dispose();
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

  /**
   * Whether the piece is in stealth. Only the game master, its owner and its party are drawn it at
   * all, and they are shown it faded with a mark, so they know the rest of the table is not.
   */
  readonly inStealth = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    return char.stealth === '1';
  });

  readonly isHiddenByVision = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    this.objectChange.versionOf(char.identifier)();
    return !this.visionService.isTokenVisible(char);
  });

  /**
   * Whether the piece is locked in place, read and written on the character; false while no
   * character is bound.
   */
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
  /** How many ride this piece where it is a mount, shown by its name since they stand where it stands. */
  readonly ridersAboard = computed(() => {
    const char = this.gameCharacter();
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    if (char.mountable !== '1') return 0;
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      this.objectChange.versionOf(piece.identifier)();
    }
    return this.ride.aboard(char).length;
  });
  /**
   * The mount this piece rides, while it rides one. The piece's name, bars and buffs are drawn in the
   * mount's riding label then, stacked over the mount's own, rather than over itself.
   */
  readonly ridingMount = computed(() => {
    const char = this.gameCharacter();
    if (!char) return null;
    this.objectChange.versionOf(char.identifier)();
    if (char.ridingOn === '') return null;
    this.objectChange.versionOf(char.ridingOn)();
    return this.ride.mountOf(char);
  });
  /**
   * The pieces riding this one, as its riding label shows them over its own labels: their names,
   * bars and buffs, the one in front nearest, as each would show over itself.
   */
  readonly ridingLabels = computed<RidingLabel[]>(
    () => {
      const char = this.gameCharacter();
      if (!char || this.ridersAboard() < 1) return [];
      this.objectChange.trackMyCursor();
      const order: Record<RideSeat, number> = { rider: 0, passenger: 1, cargo: 2 };
      return this.ride
        .aboard(char)
        .sort((a, b) => order[seatOf(a.rideSeat)] - order[seatOf(b.rideSeat)])
        .map((piece) => this.ridingLabelOf(piece));
    },
    { equal: sameRidingLabels }
  );

  private ridingLabelOf(piece: GameCharacter): RidingLabel {
    const showsName = this.overlay.names() && (!piece.hideName || this.rolePermission.canSeeHidden());
    const detail = this.overlay.resourceBars() ? (piece.detailDataElement ?? null) : null;
    const readable = this.disclosureService.canView(piece);
    const gauges =
      detail && this.followedTree(detail) !== null
        ? selectPieceGauges(detail).map((gauge) => ({ gauge, numbers: gaugeNumbersOf(gauge, readable) }))
        : [];
    const buffs = this.overlay.buffs() && !piece.hideBuff ? (piece.buffDataElement ?? null) : null;
    const badges = buffs && this.followedTree(buffs) !== null ? toBuffBadges(buffs) : [];
    return {
      identifier: piece.identifier,
      name: showsName ? piece.name : '',
      icon: RIDING_SEAT_ICONS[seatOf(piece.rideSeat)],
      aboard: 0,
      gauges,
      badges,
    };
  }

  /**
   * The riding card over a mount ridden, one label for all on it: those riding it, the one in front
   * lowest, over the mount itself, each with its name, bars and buffs. Empty where nobody rides it.
   */
  readonly ridingCard = computed<RidingLabel[]>(
    () => {
      const riders = this.ridingLabels();
      const char = this.gameCharacter();
      if (riders.length < 1 || !char) return [];
      return [
        ...[...riders].reverse(),
        {
          identifier: char.identifier,
          name: this.hideName() ? '' : this.name(),
          icon: '',
          aboard: this.ridersAboard(),
          gauges: this.gaugeRows(),
          badges: this.hideBuff() ? [] : this.buffBadges(),
        },
      ];
    },
    { equal: sameRidingLabels }
  );

  /** How tall the riding card over this mount is reckoned to stand, nothing where nobody rides it. */
  private readonly ridingCardHeightEstimate = computed(() =>
    this.ridingCard().reduce(
      (sum, label) =>
        sum +
        RIDING_CARD_ENTRY_PX +
        (label.name ? RIDING_NAME_HEIGHT_PX : 0) +
        label.gauges.length * GAUGE_ROW_HEIGHT_PX +
        Math.ceil(label.badges.length / BUFF_BADGES_PER_ROW) * BUFF_BADGE_ROW_HEIGHT_PX * this.buffIconScale(),
      0
    )
  );

  /** The piece whose picture's height this one last gave out. */
  private figureIdentifier = '';

  /** How tall the piece's picture stands over its base, where its labels hang from. */
  private readonly figureHeightPx = computed(
    () => this.imageView.boxHeightPx() ?? Math.max(this.pieceImageHeightEstimate(), this.size() * this.gridSize)
  );

  /**
   * How much higher than its own picture the riding card stands over a mount: clear of the pictures
   * of those riding it, which stand on the mount and may reach over its own.
   */
  private readonly ridingCardRise = computed(() => {
    const char = this.gameCharacter();
    if (!char || this.ridersAboard() < 1) return 0;
    const own = this.figureHeightPx();
    let top = own;
    for (const rider of this.ride.aboard(char)) {
      const height = this.figureHeights.heightOf(rider.identifier);
      if (height !== null) top = Math.max(top, rider.posZ - char.posZ + height);
    }
    return top - own;
  });

  /** Whether the mount's own labels are drawn in its riding card rather than over it. */
  protected readonly labelsInRidingCard = computed(
    () => this.ridingCard().length > 0 && !this.multiAngleNameOrbitEnabled()
  );

  readonly ridingOrbitFacing = computed<BillboardFacing>(() => this.labels.stand(this.ridingOrbit()));

  private ridingOrbit(): BillboardFacing {
    if (this.isPoster()) return facesAlways(`translateY(${-(this.size() * this.gridSize - 17)}px)`);
    return this.labels.orbit(RIDING_CARD_LIFT_PX + this.ridingCardRise(), RIDING_CARD_LIFT_2D_PX);
  }

  readonly ridingStackFacing = computed<BillboardFacing>(() =>
    this.labelStackFacing(
      this.isPoster() ? NOT_TURNED : this.billboardFacing(RIDING_CARD_LIFT_PX + this.ridingCardRise())
    )
  );

  /** How much larger a name stands in the riding card than the bars beside it, as on the piece's own label. */
  protected readonly ridingNameEm = NAME_BASE_FONT_PX / DECOR_BASE_FONT_PX;

  /** Names go unshown for a piece hiding its name here, and for every piece while this seat has them switched off. */
  readonly hideName = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    if (!this.overlay.names()) return true;
    this.objectChange.versionOf(char.identifier)();
    this.objectChange.trackMyCursor();
    return char.hideName && !this.rolePermission.canSeeHidden();
  });
  /** Buffs go unshown for a piece set to hide them, and for every piece while this seat has them switched off. */
  readonly hideBuff = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    if (!this.overlay.buffs()) return true;
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

  /**
   * How the ground under the piece leans, which its pedestal and the picture lying on it take.
   *
   * The piece itself stands upright on it, as a figure does on a hillside; only what is lying
   * on the ground follows the ground. Nothing leans on a table looked at from straight above,
   * where a lean would only squash what it turned. The blocks it could be standing on are the
   * ones it is over, so a change to one of those leans it again.
   */
  readonly groundLean = computed(() => {
    const char = this.gameCharacter();
    if (!char || this.tabletopService.mode2d()) return '';
    this.objectChange.versionOf(char.identifier)();
    this.objectChange.collectionOf(Terrain.aliasName)();
    const table = this.tabletopService.currentTable;
    const grid = table.gridSize;
    const middle = pieceCentreOffsetPx(char, grid);
    const x = char.location.x + middle;
    const y = char.location.y + middle;
    const standingOn = table.terrains.filter((terrain) => {
      const box = terrainBoxOf(terrain, grid);
      return box.minX <= x && x <= box.maxX && box.minY <= y && y <= box.maxY;
    });
    for (const terrain of standingOn) this.objectChange.versionOf(terrain.identifier)();
    const lean = landingLeanAt(standingOn, grid, x, y, table.gridType);
    if (!lean) return '';
    return `rotateY(${-Math.atan(lean.eastward).toFixed(4)}rad) rotateX(${Math.atan(lean.southward).toFixed(4)}rad)`;
  });
  /**
   * How the piece stands in water, as drawn on its picture, or null where it is dry.
   *
   * The part of the picture under the surface shows through the water and takes its colour,
   * and a ring spreads on the surface where the piece breaks it. A piece sunk over its head
   * breaks no surface and gets no ring.
   */
  protected readonly inWater = computed<PieceInWater | null>(() => {
    const char = this.gameCharacter();
    if (!char || this.isPoster()) return null;
    this.objectChange.versionOf(char.identifier)();
    const grid = this.gridSize;
    const middle = pieceCentreOffsetPx(char, grid);
    const water = this.water.waterAt(char.location.x + middle, char.location.y + middle);
    if (!water) return null;
    const pictureHeight = this.imageView.fitsInCell() ? this.size() * grid : this.pieceImageHeightEstimate();
    const look = pieceWaterLook(water, char.posZ + this.altitude() * grid, pictureHeight, grid);
    if (!look) return null;
    const rise = water.surfacePx - char.posZ - Z_OFFSET_TALL_OBJECT_PX + WATER_RIPPLE_LIFT_PX;
    return { ...look, ripple: look.share < 1 ? `translateZ(${Math.round(rise * 100) / 100}px)` : null };
  });

  /** Sets the piece's height above the table in grid cells; does nothing while no character is bound. */
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
  /**
   * The piece's turn on the table in degrees, read and written on the character; 0 while no
   * character is bound.
   */
  get rotate(): number {
    const char = this.gameCharacter();
    return char?.rotate ?? 0;
  }
  set rotate(rotate: number) {
    const char = this.gameCharacter();
    if (char) char.rotate = rotate;
  }
  /**
   * The piece's tilt in degrees, read and written on the character and set by the roll handles; 0
   * while no character is bound.
   */
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
  /** The width the picture was given apart from its height, or null where it keeps its own proportions. */
  readonly komaImageWidthApart = computed(() => {
    const char = this.gameCharacter();
    if (!char) return null;
    this.objectChange.versionOf(char.identifier)();
    return char.specifyKomaImageFlag ? pieceImageWidthApart(char.komaImageWidth) : null;
  });
  /** Whether the piece casts a drop shadow under its picture. */
  get isDropShadow(): boolean {
    const char = this.gameCharacter();
    return char?.isDropShadow ?? false;
  }
  set isDropShadow(isDropShadow: boolean) {
    const char = this.gameCharacter();
    if (char) char.isDropShadow = isDropShadow;
  }
  /** Whether the piece shows its elevation label while it is raised or lowered by half a cell or more. */
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
  /** How large this reader has the buff icons drawn, as a share of their usual size. */
  protected readonly buffIconScale = computed(() => this.buffViewPreference.iconScale() / 100);
  protected readonly foldingBuff = computed(() => this.buffViewMode() !== 'detail');
  protected readonly buffViewLabelKey = computed(() => BUFF_VIEW_LABEL_KEYS[this.buffViewMode()]);

  protected cycleBuffView(event: MouseEvent): void {
    const fromPress = event.type === 'mousedown';
    if (fromPress && event.button !== 0) return;
    if (!fromPress && event.detail !== 0) return;
    event.stopPropagation();
    this.buffViewMode.update(nextBuffViewMode);
  }

  /** The size of one grid cell on the current table, in pixels. */
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

  readonly nameFacing = computed<BillboardFacing>(() => (this.isPoster() ? NOT_TURNED : this.billboardFacing(30)));

  readonly buffFacing = computed<BillboardFacing>(() =>
    this.isPoster() ? NOT_TURNED : this.billboardFacing(BUFF_STACK_GAP_PX + this.gaugePanelHeightEstimate())
  );

  readonly imageFacing = computed<BillboardFacing>(() =>
    this.isPoster() ? NOT_TURNED : this.billboardFacing(0, this.imageTurnsWithPiece())
  );

  readonly imageBillboardEnabled = computed(() => {
    if (this.isPoster()) return true;
    return this.tabletopService.imageBillboard() || this.tabletopService.mode2d();
  });

  readonly multiAnglePiecePedestalRotation = computed(() => {
    const orbit = this.multiAngleNameOrbitEnabled() ? 'rotateZ(var(--multi-angle-piece-angle, 0deg))' : '';
    const lean = this.groundLean();
    return lean.length > 0 ? `${lean} ${orbit}`.trimEnd() : orbit;
  });

  readonly multiAnglePieceImageRotation = computed(() =>
    this.multiAngleNameOrbitEnabled() ? 'rotateZ(var(--multi-angle-piece-angle, 0deg))' : ''
  );

  /**
   * How the picture faces the reader. A piece riding a mount is drawn a little in front of it, as the
   * two stand in one place and the mount's picture would otherwise hide the rider's.
   */
  private readonly pieceImageFacing = computed<BillboardFacing>(() => {
    const billboard = this.imageFacing();
    const spin = this.multiAnglePieceImageRotation();
    const inFront = this.ridingMount() ? `translateZ(${RIDER_IN_FRONT_PX}px)` : '';
    return (rotation) => [billboard(rotation), spin, inFront].filter((part) => part.length > 0).join(' ');
  });

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
    return this.roomRules.rulesFor(table).pieceImageInCell;
  });

  readonly imageView = pieceImageView({
    imageUrl: computed(() => this.imageFile().url),
    isPoster: this.isPoster,
    sizePx: computed(() => this.size() * this.gridSize),
    specifiedHeightPx: computed(() =>
      this.specifyKomaImageFlag() && !this.fitsImageInCell() ? this.komaImageHeightSignal() : null
    ),
    specifiedWidthPx: computed(() => (this.fitsImageInCell() ? null : this.komaImageWidthApart())),
    billboardEnabled: this.imageBillboardEnabled,
    billboardFacing: this.pieceImageFacing,
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

  /**
   * How wide the picture stands: as wide as the ground, unless its height was set apart from it, when
   * it is as wide as that height makes it or as the width given with it.
   */
  private readonly pictureWidthPx = computed(() => {
    const ground = this.size() * this.gridSize;
    if (!this.specifyKomaImageFlag() || this.imageView.fitsInCell()) return ground;
    const apart = this.komaImageWidthApart();
    if (apart !== null) return apart;
    const natural = this.imageView.naturalSize();
    return natural ? (this.komaImageHeightSignal() * natural.width) / natural.height : ground;
  });

  /**
   * Whether the handles that tip the piece over stand either side of the picture rather than at its
   * head and feet.
   *
   * On a phone they stay out for good, there being no hover to wait for, and the one at the head
   * sat over the face. Beside the picture, halfway up, they keep clear of it and of the name and
   * bars above it.
   */
  readonly rollHandlesBeside = computed(() => this.mobileLayout.isActive());

  /** Where the handle at the head stands: inside the top of the picture, or off to its right. */
  readonly rollHandleHeadTransform = computed(() =>
    this.rollHandlesBeside() ? this.rollHandleBeside(1) : this.pieceCenterShift()
  );

  /** Where the handle at the feet stands: clear below the picture, or off to its left. */
  readonly rollHandleFootTransform = computed(() =>
    this.rollHandlesBeside()
      ? this.rollHandleBeside(-1)
      : `${this.pieceCenterShift()} translateY(100%) translateY(${this.rollHandleGapPx()}px)`
  );

  private rollHandleBeside(side: 1 | -1): string {
    const aside = this.pictureWidthPx() / 2 + this.rollHandleSizePx() / 2 + this.rollHandleGapPx();
    return `${this.pieceCenterShift()} translateX(${side * aside}px) translateY(-50%)`;
  }

  readonly mode2dEnabled = computed(() => {
    if (this.isPoster()) return true;
    return this.tabletopService.mode2d();
  });

  private readonly labels = pieceLabelFacings({
    mode2d: () => this.mode2dEnabled(),
    widthPx: () => this.size() * this.gridSize,
  });

  /** What the room asks of a piece that has to show which way it faces. */
  readonly facingMark = computed<TableFacingMark>(() => {
    const table = this.tabletopService.currentTable;
    this.objectChange.versionOf(table.identifier)();
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    this.objectChange.versionOf('Config')();
    const mark = asTableFacingMark(this.roomRules.rulesFor(table).facingMark);
    // A piece that turns to face every side of a flat screen has no one facing to mark.
    const multiAngle = this.tabletopService.mode2d() && this.tabletopService.display().multiAngleEnabled;
    return mark === 'turn' && multiAngle ? 'none' : mark;
  });

  /**
   * Whether the piece may be turned at all.
   *
   * Seen from above, turning a piece shows nothing, so it is held still. A table that shows
   * facing has something to show, and hands the handles back.
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

  /** What a stack of labels above a piece is turned by, the billboard and the scale it is drawn at. */
  private labelStackFacing(billboard: BillboardFacing): BillboardFacing {
    const drawnAt = ` ${this.decorScale} translateX(-50%)`;
    return (rotation) => billboard(rotation) + drawnAt;
  }

  /** The resource bars drawn over the piece, none while this seat has them switched off. */
  readonly pieceGauges = computed<PieceGauge[]>(
    () => {
      if (!this.overlay.resourceBars()) return [];
      const detail = this.gameCharacter()?.detailDataElement ?? null;
      if (this.followedTree(detail) === null || !detail) return [];
      return selectPieceGauges(detail);
    },
    { equal: sameEntries }
  );

  /**
   * Follows one part of the piece's data so that a computation hears it change, and hands back
   * everything under it.
   *
   * A part the piece does not have yet is followed through every data element, since it may be
   * added anywhere under the piece. A part it has is followed through itself, what is under it
   * and the data elements it hangs from, which are what change when it is taken away or another
   * is put in its place, rather than through every data element of every piece on the table.
   * The piece itself is not followed: moving it changes it many times a second, and none of that
   * reaches its data.
   */
  private followedTree(element: DataElement | null): DataElement[] | null {
    if (!element) {
      this.objectChange.collectionOf('data')();
      return null;
    }
    for (let node = element.parent; node instanceof DataElement; node = node.parent) {
      this.objectChange.versionOf(node.identifier)();
    }
    this.objectChange.versionOf(element.identifier)();
    const descendants = collectDataElements(element);
    for (const descendant of descendants) this.objectChange.versionOf(descendant.identifier)();
    return descendants;
  }

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

  readonly buffBadges = computed<BuffBadge[]>(
    () => {
      const buffEl = this.gameCharacter()?.buffDataElement ?? null;
      if (this.followedTree(buffEl) === null || !buffEl) return [];
      this.objectChange.fileVersion();
      return toBuffBadges(buffEl);
    },
    { equal: sameEntries }
  );

  readonly orbitPieceGauges = computed(() => this.pieceGauges().slice(0, MAX_MULTI_ANGLE_RESOURCE_GAUGES));

  protected readonly decorFontSizePx = DECOR_BASE_FONT_PX * DECOR_SUPERSAMPLE;
  protected readonly nameFontSizePx = NAME_BASE_FONT_PX * DECOR_SUPERSAMPLE;
  private readonly decorScale = `scale(${(1 / DECOR_SUPERSAMPLE).toFixed(6)})`;

  private readonly resourceSnapshot = computed<Map<string, ResourceSnapshot>>(() => {
    const snapshot = new Map<string, ResourceSnapshot>();
    const elements = this.followedTree(this.gameCharacter()?.detailDataElement ?? null);
    if (elements === null) return snapshot;

    for (const element of elements) {
      if (!isResourceElement(element)) continue;
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

  readonly gaugeStackFacing = computed<BillboardFacing>(() => this.labelStackFacing(this.gaugeFacing()));

  readonly buffStackFacing = computed<BillboardFacing>(() => this.labelStackFacing(this.buffFacing()));

  readonly nameStackFacing = computed<BillboardFacing>(() => this.labelStackFacing(this.nameFacing()));

  readonly floatStackFacing = computed<BillboardFacing>(() =>
    this.labelStackFacing(this.isPoster() ? NOT_TURNED : this.billboardFacing(56))
  );

  readonly floatOrbitFacing = computed<BillboardFacing>(() => this.labels.stand(this.floatOrbit()));

  private floatOrbit(): BillboardFacing {
    if (this.isPoster()) return facesAlways(`translateY(${-(this.size() * this.gridSize + 20)}px)`);
    return this.labels.orbit(56, 96);
  }

  private readonly gaugePanelHeightEstimate = computed(() =>
    this.multiAngleResourceBuffOrbitEnabled() ? 0 : this.pieceGauges().length * GAUGE_ROW_HEIGHT_PX
  );

  readonly gaugeFacing = computed<BillboardFacing>(() =>
    this.isPoster() ? NOT_TURNED : this.billboardFacing(GAUGE_STACK_GAP_PX + this.gaugePanelHeightEstimate() / 2)
  );

  readonly gaugeOrbitFacing = computed<BillboardFacing>(() => this.labels.stand(this.gaugeOrbit()));

  private gaugeOrbit(): BillboardFacing {
    if (this.isPoster())
      return facesAlways(`translateY(${-(this.size() * this.gridSize + 8 + this.gaugePanelHeightEstimate())}px)`);
    return this.labels.orbit(
      GAUGE_STACK_GAP_PX + this.gaugePanelHeightEstimate(),
      64 + this.gaugePanelHeightEstimate()
    );
  }

  readonly nameOrbitFacing = computed<BillboardFacing>(() => this.labels.stand(this.nameOrbit()));

  private nameOrbit(): BillboardFacing {
    if (this.isPoster()) return facesAlways(`translateY(${-(this.size() * this.gridSize + 5)}px)`);
    return this.labels.orbit(30, 60);
  }

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
    const riders = this.ridingLabels()
      .map((label) => label.name)
      .filter((name) => name.length > 0);
    if (riders.length > 0) return [...riders, this.name()].join('／');
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
    return makeMultiAngleBuffOrbit(
      this.buffBadges().length,
      this.size() * this.gridSize,
      innerExtent,
      this.buffIconScale()
    );
  });

  readonly multiAngleOrbitVisible = computed(
    () =>
      this.multiAngleNameOrbitEnabled() &&
      !this.ridingMount() &&
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

  readonly buffOrbitFacing = computed<BillboardFacing>(() => this.labels.stand(this.buffOrbit()));

  private buffOrbit(): BillboardFacing {
    if (this.isPoster())
      return facesAlways(`translateY(${-(this.size() * this.gridSize + 12 + this.gaugePanelHeightEstimate())}px)`);
    return this.labels.orbit(BUFF_STACK_GAP_PX + this.gaugePanelHeightEstimate(), 68 + this.gaugePanelHeightEstimate());
  }

  /** The columns the buff icons are laid out in, the same count the panel's height is reckoned by. */
  protected readonly buffBadgeColumns = `repeat(${BUFF_BADGES_PER_ROW}, minmax(0, 1fr))`;

  private readonly buffPanelHeightEstimate = computed(() => {
    if (this.multiAngleResourceBuffOrbitEnabled() || this.hideBuff() || this.buffNum() < 1) return 0;
    if (this.buffViewMode() === 'detail') return this.buffChildren().length * BUFF_DETAIL_ROW_HEIGHT_PX;
    if (this.buffViewMode() === 'count') return BUFF_BADGE_ROW_HEIGHT_PX;
    return Math.ceil(this.buffBadges().length / BUFF_BADGES_PER_ROW) * BUFF_BADGE_ROW_HEIGHT_PX * this.buffIconScale();
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

  readonly targetOrbitFacing = computed<BillboardFacing>(() => {
    const stand = `translateX(${(this.size() * this.gridSize) / 2}px) `;
    const orbit = this.targetOrbit();
    return (rotation) => stand + orbit(rotation);
  });

  private targetOrbit(): BillboardFacing {
    const stack = this.labelsInRidingCard()
      ? this.ridingCardRise() + this.ridingCardHeightEstimate()
      : this.gaugePanelHeightEstimate() + this.buffPanelHeightEstimate();
    if (this.isPoster()) return facesAlways(`translateY(${-(this.size() * this.gridSize + 20 + stack)}px)`);
    return this.screenLiftFacing(TARGET_STACK_GAP_PX + stack, 84 + stack);
  }

  readonly targetStackFacing = computed<BillboardFacing>(() =>
    this.labelStackFacing(this.isPoster() ? NOT_TURNED : this.billboardFacing(0))
  );

  /**
   * What the character is saying, over its piece; none while the room or this seat hides it, or the
   * screen is in novel mode.
   */
  readonly speechBubble = computed(() => {
    const character = this.gameCharacter();
    if (!character || !this.overlay.speech() || !this.speechBubbles.showsHere()) return null;
    return this.speechBubbles.bubbleOf(character.identifier)();
  });

  protected readonly speechStampPx = SPEECH_STAMP_PX * DECOR_SUPERSAMPLE;

  /** The shadow under a bubble, left off where the table is drawn the lighter way. */
  readonly speechShadow = computed(() => (this.renderLite.active() ? '' : 'shadow-[0_0.15em_0.4em_rgba(0,0,0,0.45)]'));

  /**
   * How far over the piece a bubble's foot stands: over its bars and its buffs, which it sits on
   * as the buffs sit on the bars, and over the target mark where there is one.
   */
  private readonly speechLift = computed(
    () =>
      (this.labelsInRidingCard()
        ? RIDING_CARD_LIFT_PX + this.ridingCardRise() + this.ridingCardHeightEstimate()
        : BUFF_STACK_GAP_PX + this.gaugePanelHeightEstimate() + this.buffPanelHeightEstimate()) +
      SPEECH_STACK_GAP_PX +
      (this.isTargeted() ? TARGET_MARK_HEIGHT_PX : 0)
  );

  readonly speechOrbitFacing = computed<BillboardFacing>(() => this.labels.stand(this.speechOrbit()));

  private speechOrbit(): BillboardFacing {
    const lift = this.speechLift();
    if (this.isPoster())
      return facesAlways(`translateY(${-(this.size() * this.gridSize + 12 + lift - BUFF_STACK_GAP_PX)}px)`);
    return this.labels.orbit(lift, 28 + lift);
  }

  readonly speechStackFacing = computed<BillboardFacing>(() =>
    this.labelStackFacing(this.isPoster() ? NOT_TURNED : this.billboardFacing(this.speechLift()))
  );

  private screenLiftFacing(screenLift3d: number, distance2d: number): BillboardFacing {
    const pieceRotate = this.rotateSignal();
    const pieceRoll = this.rollSignal();
    const worldHeight3d = this.pieceImageHeightEstimate();
    const mode2d = this.mode2dEnabled();
    return (rotation) =>
      makeScreenLiftTransform({
        rotation,
        pieceRotate,
        pieceRoll,
        worldHeight3d,
        screenLift3d,
        distance2d,
        mode2d,
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

  private billboardFacing(verticalOffset3D: number, turnsWithPiece = false): BillboardFacing {
    // In 2D every billboard cancels the piece's turn, except the picture when the table asks it
    // to turn with the piece. This also composes with the multi-angle image rotation.
    const pieceRotate = this.mode2dEnabled() && turnsWithPiece ? 0 : this.rotateSignal();
    const pieceRoll = this.rollSignal();
    const mode2d = this.mode2dEnabled();
    return (rotation) =>
      makeBillboardTransform({
        rotation,
        pieceRotate,
        pieceRoll,
        parentInverseRotation: 'rotateY(90deg) rotateZ(90deg) rotateY(-90deg)',
        verticalOffset3D,
        mode2d,
      });
  }

  readonly movableOption = signal<MovableOption>({});

  readonly rotableOption = signal<RotableOption>({});

  readonly pedestalHexParams = computed<HexFlowerParams | null>(() => {
    const gridType = this.tabletopService.gridType();
    const size = this.size();
    if (!this.gameCharacter()) return null;
    if (!isHexGrid(gridType)) return null;
    return calcHexFlowerParams(size, this.gridSize, isFlatTopGrid(gridType));
  });

  private pedestalStyleOf(borderColor: string): Record<string, string> {
    const params = this.pedestalHexParams();
    return params ? hexPedestalRingStyle(params, 6, borderColor) : { border: `solid 6px ${borderColor}` };
  }

  protected readonly pedestalStyleShown = computed(() => this.pedestalStyleOf('#FFCC80'));
  protected readonly pedestalStyleHidden = computed(() => this.pedestalStyleOf('#A0E0FF'));
  protected readonly pedestalStyleTargeted = computed(() => this.pedestalStyleOf('#ff3b30'));
  protected readonly pedestalStyleSharedView = computed(() => this.pedestalStyleOf('#ffd54f'));

  // Computed rather than read as getters, the pedestal styles hand back the same object until
  // something changes, instead of a fresh record on every change-detection pass: a thousand
  // allocations and as many clip paths a pass with three hundred characters on the table.
  protected readonly pedestalOuterStyle = computed<Record<string, string>>(() => {
    const params = this.pedestalHexParams();
    return params ? hexPedestalRingStyle(params, 2, '#212121') : {};
  });

  /**
   * The handle round a pedestal on a hex grid that turns the piece. The hex pedestal is only a rim,
   * so the pedestal is cut out of the handle: a press inside the rim moves the piece, as one on the
   * square pedestal standing over its handle does.
   */
  protected readonly pedestalGrabStyle = computed<Record<string, string>>(() => {
    const params = this.pedestalHexParams();
    return params ? hexPedestalGrabStyle(params, { reachPx: 12, pedestalCutOut: true }) : {};
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

  /**
   * The piece's height in grid cells, its base position and altitude together, rounded to one
   * decimal for the elevation label.
   */
  get elevation(): number {
    const char = this.gameCharacter();
    if (!char) return 0;
    return +((char.posZ + this.altitude() * this.gridSize) / this.gridSize).toFixed(1);
  }

  /** How far a chat bubble over the piece is lifted, in pixels; always 0 for this component. */
  get chatBubbleAltitude(): number {
    return 0;
  }

  /** Stops the browser's native drag of the piece's images, so only the movable directive moves it. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Takes every press straight back off the piece's own input handler, which has nothing to do with
   * a move or a release.
   *
   * The handler adds document-wide move and release listeners on each press, and cancelling removes
   * them at once. The press itself is not stopped: moving and turning the piece are left to the
   * movable and rotable directives, which listen for it themselves.
   */
  onInputStart(_e: MouseEvent | TouchEvent) {
    if (this.input) this.input.cancel();
  }

  /** The piece's menu, which a right-click or a right-drag on it opens. */
  private readonly menuHost: GameCharacterMenuHost = {
    name: () => this.name(),
    buffViewMode: () => this.buffViewMode(),
    setBuffViewMode: (mode) => this.buffViewMode.set(mode),
    bounds: () => this.rootElementRef()?.nativeElement.getBoundingClientRect(),
    clearanceRadius: (bounds) => this.contextMenuClearanceRadius(bounds),
  };

  private readonly rightDrag = new PieceRightDrag({
    flat: () => this.mode2dEnabled(),
    cancelTableGesture: () => this.selectionSignalService.cancelTableGesture(),
    closeMenu: () => this.contextMenuService.close(),
    openMenu: (at) => {
      const char = this.gameCharacter();
      if (char) this.menu.open(char, this.menuHost, at, at, screenCentreOf(this.menuHost.bounds(), at));
    },
  });

  protected onPiecePointerDown(event: PointerEvent): void {
    this.checkKey(event);
    this.rightDrag.down(event);
  }

  protected onPiecePointerMove(event: PointerEvent): void {
    this.rightDrag.move(event);
  }

  protected onPiecePointerUp(event: PointerEvent): void {
    this.rightDrag.up(event);
  }

  protected onPiecePointerCancel(event: PointerEvent): void {
    this.rightDrag.cancel(event);
  }

  /**
   * Opens the character's context menu at the pointer, if the reader may view the piece.
   *
   * When several pieces are selected the shared selection menu opens instead. Seen from above with
   * a radial menu style chosen, the menu opens as a radial menu around the piece.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    const char = this.gameCharacter();
    if (!char) return;

    if (!this.disclosureService.canView(char)) return;
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    this.menu.open(char, this.menuHost, this.pointerDeviceService.pointers[0]);
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
    // damage alongside a large heal would play as a large hurt, in the heal's own voice.
    if (loudest) {
      SoundEffect.playLocal(resourceChangeSound(loudest.kind, loudest.ratio, loudest.soundSet), VolumeType.EFFECT);
    }

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

  /** Brings the piece to the top and plays the pick-up sound when a drag or turn starts. */
  onMove() {
    this.gameCharacter()?.toTopmost();
    SoundEffect.play(PresetSound.piecePick);
  }

  /** Plays the put-down sound when a drag or turn ends. */
  onMoved() {
    SoundEffect.play(PresetSound.piecePut);
  }

  /** Whether this piece is the one whose move is being worked out, and so is not to be dragged. */
  readonly isPlanningMove = computed(() => {
    const moving = this.movePlan.movingIdentifier();
    return moving != null && moving === this.gameCharacter()?.identifier;
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
    if (!this.movePlan.begin(character)) {
      const seat = this.ride.seatOf(character);
      const carriedBy = seat === 'passenger' || seat === 'cargo' ? this.ride.mountOf(character) : null;
      const unridden = character.mountable === '1' && !this.ride.riderOf(character) && !PeerCursor.isMyselfGameMaster;
      if (carriedBy || unridden) {
        queueMicrotask(() => this.movableRef()?.cancel());
        const why = carriedBy ? 'feature.ride.carriedInPlace' : 'feature.ride.noRider';
        this.snackbar.show(this.translateFn(why, { name: character.name, mount: carriedBy?.name ?? '' }));
        return;
      }
      const rideRefusal = this.ride.moveRefusal(character);
      if (rideRefusal) {
        queueMicrotask(() => this.movableRef()?.cancel());
        const mount = this.ride.mountOf(character) ?? this.ride.leftMountOf(character);
        this.snackbar.show(
          this.translateFn(`feature.ride.${rideRefusal}`, { name: character.name, mount: mount?.name ?? '' })
        );
        return;
      }
      if (this.isHeldByZone(character)) {
        queueMicrotask(() => this.movableRef()?.cancel());
        const holder = this.objectStore.get<GameCharacter>(character.grabbedBy);
        const why =
          character.downed === '1'
            ? 'feature.zone.downInPlace'
            : character.heldFast === '1'
              ? 'feature.zone.heldFastInPlace'
              : holder instanceof GameCharacter
                ? 'feature.zone.grabbedInPlace'
                : 'feature.zone.heldInPlace';
        this.snackbar.show(this.translateFn(why, { name: character.name, holder: holder?.name ?? '' }));
      }
      return;
    }
    queueMicrotask(() => this.movableRef()?.cancel());
  }

  /**
   * Whether an engagement zone holds the piece whatever kind of move it makes, in a room that holds
   * pieces to the way they could walk. The game master may still carry it.
   */
  private isHeldByZone(character: GameCharacter): boolean {
    if (!this.isStrictMove() || PeerCursor.isMyselfGameMaster) return false;
    return this.engagementZones.kindFor(character, '') === null;
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

  /** Starts carrying the piece: raises it, shows how far it may move and fires its pick-up triggers. */
  onPickUp() {
    this.onMove();
    const character = this.gameCharacter();
    if (!character) return;
    this.moveRangeService.show(character);
    this.triggerFire.pickedUp(character);
  }

  /**
   * Puts the carried piece down: plays the put-down sound and hides the move range. What follows
   * from where it was put down waits for the press to end, when it stands where it snapped to.
   */
  onPutDown() {
    this.onMoved();
    this.moveRangeService.hide();
    this.putDownPending = true;
  }

  /**
   * Hides the move range once the press on the piece ends, whether or not it was dragged. A piece
   * put down stands where it snapped to by then, and what follows from that is settled from there.
   */
  onLetGo() {
    this.moveRangeService.hide();
    if (!this.putDownPending) return;
    this.putDownPending = false;
    this.movableRef()?.commitPosition();
    this.settlePutDown();
  }

  /** Whether a piece was put down and what follows from where it stands is still to be settled. */
  private putDownPending = false;

  /**
   * Settles where a piece was put down: those it carries come along, it gets off a mount it was put
   * down off, its put-down triggers fire, and a fight or a seat on a mount where it stands is offered.
   */
  private settlePutDown() {
    const character = this.gameCharacter();
    if (!character) return;
    this.links.carryBound(character);
    this.ride.afterPutDown(character);
    this.triggerFire.putDown(character);
    this.engagementZones.offerFight(character);
    this.ride.offerRide(character);
  }

  /**
   * Aims at the piece on an Alt press, or clears every aim on Shift+Alt, swallowing the press so it
   * does not also start a drag.
   */
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
    this.pieceTarget.toggle(char);
  }

  /** Takes the aim mark off every character in the room, signalling each change so its marker redraws. */
  clearEveryTarget(): void {
    this.pieceTarget.clear();
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

/**
 * The same list, or one holding entries of the same values in the same order.
 *
 * The bars and buff icons are drawn from those values alone, so a list worked out again from data
 * that did not change them is kept as it was and nothing drawn from it is drawn again.
 */
function sameEntries<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((entry, index) => sameFields(entry, b[index]));
}

/** The same riding label, or one showing the same pieces with the same names, bars and buffs. */
function sameRidingLabels(a: readonly RidingLabel[], b: readonly RidingLabel[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((label, index) => {
    const other = b[index];
    return (
      label.identifier === other.identifier &&
      label.name === other.name &&
      label.icon === other.icon &&
      label.aboard === other.aboard &&
      label.gauges.length === other.gauges.length &&
      label.gauges.every(
        (row, at) => row.numbers === other.gauges[at].numbers && sameFields(row.gauge, other.gauges[at].gauge)
      ) &&
      sameEntries(label.badges, other.badges)
    );
  });
}

/** Whether two flat records hold the same keys with the same values. */
function sameFields(a: object, b: object): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
