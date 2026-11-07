import { NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
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
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { callResourceChange, resourceChange$ } from '@axe/core/event/domain-events';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { VolumeType } from '@axe/core/storage/audio-output';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { sameFields } from '@axe/core/util/same-fields';
import { BUFF_BADGES_PER_ROW, BuffBadge, toBuffBadges } from '@axe/domain/character/buff-badge';
import { BUFF_VIEW_LABEL_KEYS, type BuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeNumbersOf, isGaugeInverted, PieceGauge, selectPieceGauges } from '@axe/domain/character/piece-gauge';
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
import { pageOfTablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { calcHexFlowerParams, HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { pieceCornerOnSquare } from '@axe/domain/tabletop/move/piece-on-grid';
import {
  DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  multiAngleNameMotionMode,
  multiAngleOrbitAnimation,
  multiAnglePieceMotionMode,
  multiAngleRotationPhase,
} from '@axe/domain/tabletop/multi-angle';
import { RideSeat, seatOf } from '@axe/domain/tabletop/ride/ride-rules';
import { rotationSnapStep, shownAngle } from '@axe/domain/tabletop/rotation-snap';
import { asTableFacingMark, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { isOffTheFloor } from '@axe/domain/tabletop/tabletop-object';
import { PieceMotionKind } from '@axe/domain/tabletop/world/piece-motions';
import { BuffBadgeComponent } from '@axe/features/character/buff-badge/buff-badge.component';
import {
  GameCharacterMenuHost,
  GameCharacterMenuService,
  screenCentreOf,
} from '@axe/features/character/game-character/game-character-menu.service';
import { PieceRightDrag } from '@axe/features/character/game-character/piece-right-drag';
import { GameDataElementBuffComponent } from '@axe/features/character/game-data-element-buff/game-data-element-buff.component';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { KeepTouchDirective } from '@axe/ui/directives/keep-touch.directive';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { hexPedestalGrabStyle, hexPedestalRingStyle } from '@axe/ui/tabletop/hex-pedestal-style';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { makeMultiAngleCurvedName } from '@axe/ui/tabletop/multi-angle-curved-name';
import {
  makeMultiAngleBuffOrbit,
  makeMultiAngleResourceGauge,
  MAX_MULTI_ANGLE_RESOURCE_GAUGES,
} from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { pictureForCanvas } from '@axe/ui/tabletop/picture-for-canvas';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { TranslocoModule } from '@jsverse/transloco';

/** How a piece that falls falls on the canvas, by how the page plays it. */
const FALLS: Readonly<Record<string, PieceMotionKind>> = {
  dissolve: 'defeat-dissolve',
  bisect: 'defeat-bisect',
  flinch: 'defeat-flinch',
};

const DECOR_BASE_FONT_PX = 10;
const NAME_BASE_FONT_PX = 15;
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
/** How large a stamp shows in a bubble, before the labels' supersampling. */
const SPEECH_STAMP_PX = 56;
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
/** How large the handles that turn and tip a piece are drawn, whatever the size of the piece. */
const HANDLE_PX = 28;
const HANDLE_ICON_PX = 24;
/** How far the handle that tips a piece stands clear of its picture. */
const ROLL_HANDLE_GAP_PX = 7;
/** How far the ring that turns a piece reaches past its pedestal, whatever the size of the piece. */
const TURN_RING_REACH_PX = 14;
/** Where the knobs stand round the ring, clockwise from the side the piece faces: there, and behind it. */
const TURN_KNOB_ANGLES = [0, 180] as const;
/** How many points round the ring are looked at to leave out of it what the piece hides. */
const TURN_RING_SAMPLES = 48;

@Component({
  selector: 'game-character',
  templateUrl: './game-character.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KeepTouchDirective,
    BuffBadgeComponent,
    HudPlaceDirective,
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    NgClass,
    NgStyle,
    GameDataElementBuffComponent,
    NgTemplateOutlet,
    SafePipe,
    StampComponent,
    TextTooltipDirective,
    TranslocoModule,
  ],
  host: {
    class: 'block',
    '[style.display]': "isHiddenByVision() ? 'none' : null",
    '[style.z-index]': 'stackIndex()',
    '[attr.data-object-id]': 'gameCharacter()?.identifier ?? null',
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
  private readonly rotationGuide = inject(RotationGuideService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly buffViewPreference = inject(BuffViewPreferenceService);
  private readonly overlay = inject(PieceOverlayPreferenceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
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
  private readonly speechBubbles = inject(SpeechBubbleService);
  private readonly renderLite = inject(RenderLiteService);

  readonly isTargeted = computed(() => {
    this.uiSignalService.targetChange();
    return this.gameCharacter()?.targeted ?? false;
  });

  private readonly motions = inject(PieceMotionsService);
  private readonly pieces = inject(TablePiecesService);
  private readonly tableCamera = inject(TableCameraService);
  private readonly pick = inject(TablePickService);
  private readonly heldPiece = inject(HeldPieceService);
  private readonly viewport = inject(ViewportService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly pedestal = viewChild<ElementRef<HTMLElement>>('pedestal');

  /**
   * How the handles that tip the piece over are turned over a table drawn on a canvas: on the screen,
   * about the point the canvas tips the picture over about.
   */
  protected readonly rollOption: RotableOption = { turnsOnScreenAbout: () => this.rollPivotOnPage() };

  /** Where on the page the canvas tips the piece's picture over about, or null where it does not. */
  private rollPivotOnPage(): { x: number; y: number } | null {
    const character = this.gameCharacter();
    const scene = this.tableCamera.sceneMatrix();
    const pivot = character ? this.pieces.rollPivotOf(character) : null;
    return pivot && scene ? pageOfTablePoint(scene, pivot.x, pivot.y, pivot.z) : null;
  }

  /**
   * The handle that tips the piece over, over a table drawn on a canvas: the corner of the picture it
   * stands against, its top right, and how far off that corner its middle lies, on the screen. It
   * stands beside the top of the picture, clear of it, so that a press on the picture takes hold of
   * the piece, and clear of the knobs on the ring round the pedestal below it.
   */
  protected readonly rollHandles = computed(() => {
    const clear = this.rollHandleSizePx() / 2 + this.rollHandleGapPx();
    return [{ testId: 'roll-grab-head', corner: 1 as const, dx: clear, dy: this.rollHandleSizePx() / 2 }];
  });

  private readonly turnRotable = viewChild('turnRotable', { read: RotableDirective });
  private readonly rollRotable = viewChild('rollRotable', { read: RotableDirective });

  /**
   * Which handle of the piece is held just now: the ring that turns it, the one that tips it, or
   * none; from the first step of a turn by it until the turn ends, however it ends.
   */
  protected readonly turning = computed<'turn' | 'roll' | null>(() => {
    if (this.turnRotable()?.turning()) return 'turn';
    if (this.rollRotable()?.turning()) return 'roll';
    return null;
  });

  /**
   * Whether this is the piece last touched on the table on a touch screen and not in hand, which has
   * its handles out as one the pointer is over does, there being no pointer to pass over pieces. Only
   * that piece follows whether it is in hand, which changes with each step of a drag.
   */
  protected readonly touchChosen = computed(() => {
    if (!this.viewport.isTouch()) return false;
    const id = this.gameCharacter()?.identifier;
    return !!id && this.selectionSignalService.pressedObject() === id && !this.carried();
  });

  /** The way the piece faces while it is turned, in whole degrees, as the turn under way reads it out. */
  protected readonly turnAngle = computed(() => this.rotationGuide.turn()?.angle ?? shownAngle(this.rotate));

  /** The step a held Alt turns the piece by on the table in view. */
  protected readonly turnSnapStep = computed(() => rotationSnapStep(this.tabletopService.gridType()));

  /**
   * The ring round the pedestal that turns the piece, in the pedestal's own pixels: where a press
   * takes hold of it, the pedestal cut out of a hex one, as the rim of a hex pedestal is the
   * pedestal; the ring drawn, but for what the piece hides of it; and the middles of the knobs on the
   * side the piece faces and behind it, which turn with it and so tell which way it faces, each with
   * whether it is shown: a knob behind the picture is hidden by it as the ring is, and one standing
   * where the handle that tips the piece is drawn gives way to it. Both stay while the piece is turned,
   * so that the one in hand is never taken away.
   */
  protected readonly turnRing = computed(() => {
    const { grab, middle, radius } = this.turnRingShape();
    const point = (angle: number, about: number, reach: number) => {
      const radians = (angle * Math.PI) / 180;
      return { x: about + reach * Math.sin(radians), y: about - reach * Math.cos(radians) };
    };
    const seen = this.turnRingSeen();
    const clear = this.knobsClearOfRoll();
    const turning = this.turning() === 'turn';
    const knobs = TURN_KNOB_ANGLES.map((angle, at) => ({
      ...point(angle, middle, radius),
      facing: angle === 0,
      seen: turning || (seen[Math.round(angle / (360 / TURN_RING_SAMPLES)) % TURN_RING_SAMPLES] && clear[at]),
    }));
    return { grab, ring: ringBoxStyle(middle, radius), knobs, arc: ringPathOf(seen, radius), radius };
  });

  /**
   * Whether the piece is in hand, from the press on it until it is put down, however that ends: while
   * it is, nothing round its pedestal is weighed.
   */
  private readonly carried = computed(() => {
    const id = this.gameCharacter()?.identifier;
    return !!id && this.heldPiece.held()?.identifier === id;
  });

  /** The piece's picture as it is drawn now, kept as long as it is drawn the same, or null where none is. */
  private readonly ownPicture = computed(() => {
    const id = this.gameCharacter()?.identifier;
    return id ? (this.pieces.sprites().find((sprite) => sprite.id === `${id}#picture`) ?? null) : null;
  });

  /**
   * How the piece's picture stands before the eye as it is drawn now, weighed only while the handles
   * are out and the piece is not being carried: followed as the camera moves and the picture changes.
   */
  private readonly pictureSight = computed(() => {
    const looked = (this.hovered() && !this.carried()) || this.touchChosen() || this.turning() === 'turn';
    const picture = looked ? this.ownPicture() : null;
    if (!picture) return null;
    this.tableCamera.version();
    return this.pick.pictureSightOf(picture);
  });

  /** The middle of the pedestal on the face it stands on, at the height the ring round it is drawn at. */
  private readonly ringMiddle = computed(() => {
    const char = this.gameCharacter();
    if (!char) return null;
    this.objectChange.versionOf(char.identifier)();
    const middle = (this.size() * this.gridSize) / 2;
    const foot = this.pieces.footOf(char);
    return { ...foot, x: foot.x + middle, y: foot.y + middle };
  });

  /**
   * Whether each knob round the ring stands clear, on the screen, of the handle that tips the piece,
   * beside the top of its picture.
   */
  private readonly knobsClearOfRoll = computed<readonly boolean[]>(() => {
    if (this.turning() === 'turn') return TURN_KNOB_ANGLES.map(() => true);
    const sight = this.pictureSight();
    const middle = this.ringMiddle();
    if (!sight || !middle || this.mode2dEnabled() || this.imageFile().url.length < 1) {
      return TURN_KNOB_ANGLES.map(() => true);
    }
    const corner = sight.cornerOnPage(1);
    const [handle] = this.rollHandles();
    const roll = { x: corner.x + handle!.dx, y: corner.y + handle!.dy };
    const radius = this.turnRingShape().radius;
    return TURN_KNOB_ANGLES.map((angle) => {
      const radians = ((this.rotate + angle) * Math.PI) / 180;
      const x = middle.x + radius * Math.sin(radians);
      const y = middle.y - radius * Math.cos(radians);
      const page = this.surfaces.pageOf(middle.surface, x, y, middle.height);
      return !page || Math.hypot(page.x - roll.x, page.y - roll.y) >= this.rollHandleSizePx();
    });
  });

  /** Whether the pointer is over the piece, which brings its handles out. */
  protected readonly hovered = signal(false);

  /**
   * Which of the points round the ring, clockwise from the side the piece faces, the eye sees: those
   * the piece's own picture stands in front of are left out, so that the ring is drawn round the
   * piece and behind it rather than over it.
   */
  protected readonly turnRingSeen = computed<readonly boolean[]>(() => {
    const sight = this.pictureSight();
    const middle = this.ringMiddle();
    const radius = this.turnRingShape().radius;
    return Array.from({ length: TURN_RING_SAMPLES }, (_, at) => {
      if (!sight || !middle) return true;
      const angle = ((this.rotate + (at * 360) / TURN_RING_SAMPLES) * Math.PI) / 180;
      const x = middle.x + radius * Math.sin(angle);
      const y = middle.y - radius * Math.cos(angle);
      return !sight.hides(middle.surface, x, y, middle.height);
    });
  });

  /** Where the ring round the pedestal lies, in the pedestal's own pixels: a hex one's round the hex. */
  private readonly turnRingShape = computed(() => {
    const width = this.size() * this.gridSize;
    const hex = this.pedestalHexParams();
    const grab = hex
      ? hexPedestalGrabStyle(hex, { reachPx: TURN_RING_REACH_PX, pedestalCutOut: true })
      : ringBoxStyle(width / 2, width / 2 + TURN_RING_REACH_PX);
    return { grab, middle: hex ? hex.L / 2 : width / 2, radius: parseFloat(grab['width']) / 2 };
  });

  /**
   * The marks round the ring at every step a held Alt turns the piece to, the table's own directions
   * that stay put as the ring turns with the piece, on what the eye sees of the ring, in its own
   * pixels.
   */
  protected readonly turnTicks = computed(() => {
    const radius = this.turnRing().radius;
    const seen = this.turnRingSeen();
    const step = this.turnSnapStep();
    const marks: { x: number; y: number }[] = [];
    for (let table = 0; table < 360; table += step) {
      const angle = (((table - this.rotate) % 360) + 360) % 360;
      if (!seen[Math.round(angle / (360 / TURN_RING_SAMPLES)) % TURN_RING_SAMPLES]) continue;
      const radians = (angle * Math.PI) / 180;
      marks.push({ x: radius + radius * Math.sin(radians), y: radius - radius * Math.cos(radians) });
    }
    return marks;
  });

  /**
   * How far the piece leans, read out while it is tipped: in degrees either way of upright, and a
   * wedge from upright to it round a dial 20 across, with the point it reaches.
   */
  protected readonly rollGauge = computed(() => {
    const degrees = Math.round(((((this.rollSignal() % 360) + 540) % 360) - 180) * 10) / 10;
    const radians = (degrees * Math.PI) / 180;
    const tip = { x: 10 + 7.5 * Math.sin(radians), y: 10 - 7.5 * Math.cos(radians) };
    const sweep = degrees >= 0 ? 1 : 0;
    const wedge = degrees === 0 ? '' : `M10 10 L10 2.5 A7.5 7.5 0 0 ${sweep} ${tip.x} ${tip.y} Z`;
    return { degrees: Math.round(degrees), wedge, tip };
  });

  /** Stands the piece upright again, as a double click on the handle that tips it asks. */
  protected standUpright(event: MouseEvent): void {
    event.stopPropagation();
    if (this.canHandle()) this.roll = 0;
  }

  /** Whether this seat may turn and tip pieces, as one only watching may not, and so is shown no handles for it. */
  protected readonly canHandle = computed(() => this.rolePermission.canEditTabletop());

  /**
   * Whether the table's canvas draws the piece, from its picture and a picture of its pedestal taken
   * here; the screen over the canvas then holds only the piece's labels and handles.
   */
  readonly drawnOnCanvas = computed(() => !!this.gameCharacter() && !this.isHiddenByVision());

  /** The part of the piece its labels hang over on the screen over a canvas: its picture, or its pedestal where it has none. */
  protected readonly labelledPart = computed(() => (this.imageFile().url.length > 0 ? 'picture' : 'pedestal'));
  /** The middle of the piece's pedestal over a canvas, which its labels round it, seen from above, circle. */
  protected readonly pedestalMiddle = computed(() => {
    const ring = this.ringMiddle();
    return ring ? { ...ring, height: ring.height + this.altitude() * this.gridSize } : undefined;
  });

  /**
   * The guide down from a piece raised off the face it stands on, or up to one sunk under it, over a
   * canvas: from the height its picture floats at to the face, with what is written at its ends and
   * halfway. Nothing for a piece within half a cell of the face, or one set not to show it.
   */
  protected readonly altitudeGuide = computed(() => {
    const char = this.gameCharacter();
    const lifted = this.pedestalMiddle();
    const altitude = this.altitude();
    if (!char || !lifted || !char.isAltitudeIndicate || Math.abs(altitude) < 0.5) return null;
    const ground = { ...lifted, height: lifted.height - altitude * this.gridSize };
    return {
      lifted,
      ground,
      middle: { ...lifted, height: (lifted.height + ground.height) / 2 },
      altitude: Math.abs(altitude),
    };
  });

  /** The labels' sizes on the screen over a canvas, which draws them at the size the piece is drawn at. */
  protected readonly hudDecorFontSizePx = DECOR_BASE_FONT_PX;
  protected readonly hudNameFontSizePx = NAME_BASE_FONT_PX;
  protected readonly hudSpeechStampPx = SPEECH_STAMP_PX;

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

    pictureForCanvas({
      identifier: () => this.gameCharacter()?.identifier ?? '',
      element: () => this.pedestal()?.nativeElement,
      pictured: () => this.drawnOnCanvas(),
      follows: () => {
        this.size();
        this.isTargeted();
        this.isSharedView();
        this.pedestalStyleShown();
        this.pedestalOuterStyle();
        this.showFacingArrow();
        this.facingArrowSizePx();
        this.facingArrowOffsetPx();
      },
      region: (element) => this.pedestalRegion(element),
    });
    setupMovableRotableForPiece(this, {
      target: this.gameCharacter,
      collideLayers: ['terrain'],
      snapStyle: (char) => (char.size % 1 !== 0 ? GridSnapStyle.VERTEX : undefined),
      snapToSquare: (char, at) => pieceCornerOnSquare(this.tabletopService.currentTable, char, at),
      footprint: () => ({ width: this.size() * this.gridSize, height: this.size() * this.gridSize }),
    });
    effect(() => {
      const char = this.gameCharacter();
      if (!char) return;
      const turning =
        this.drawnOnCanvas() && this.multiAngleNameOrbitEnabled()
          ? {
              mode: multiAnglePieceMotionMode(this.tabletopService.display().multiAngleMotionMode),
              revolutionSeconds: this.multiAnglePieceRevolutionSeconds(),
              pauseSeconds: this.tabletopService.display().multiAnglePauseSeconds,
              phase: this.multiAnglePiecePhase(),
            }
          : null;
      untracked(() => this.motions.turnOnItsOwn(char.identifier, turning));
    });
    afterNextRender(() => {
      const char = this.gameCharacter();
      if (char && this.drawnOnCanvas()) this.motions.play(char.identifier, 'bounce-in');
    });
    let felling: string | null = null;
    effect(() => {
      const reaction = this.defeatReaction();
      const char = this.gameCharacter();
      untracked(() => {
        if (felling) this.motions.stop(felling);
        felling = null;
        const falls = FALLS[reaction];
        if (!char || !this.drawnOnCanvas() || !falls) return;
        this.motions.play(char.identifier, falls, { holds: true });
        felling = char.identifier;
      });
    });
    effect(() => {
      if (this.hitFlash() !== 'damage' || this.defeatReaction()) return;
      const char = this.gameCharacter();
      untracked(() => {
        if (char && this.drawnOnCanvas()) this.motions.play(char.identifier, 'hit-shake');
      });
    });

    this.destroyRef.onDestroy(() => {
      const char = this.gameCharacter();
      if (char) {
        this.motions.turnOnItsOwn(char.identifier, null);
        this.motions.stop(char.identifier);
      }
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

  /** Whether the mount's own labels are drawn in its riding card rather than over it. */
  protected readonly labelsInRidingCard = computed(
    () => this.ridingCard().length > 0 && !this.multiAngleNameOrbitEnabled()
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
  protected readonly buffViewMode = linkedSignal<BuffViewMode>(() => this.buffViewPreference.mode());
  /** How large this reader has the buff icons drawn, as a share of their usual size. */
  protected readonly buffIconScale = computed(() => this.buffViewPreference.iconScale() / 100);
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
  /** How large the handles are drawn: one size for every piece, so a big one's are not in the way and a small one's are not lost. */
  readonly rollHandleSizePx = computed(() => HANDLE_PX);

  readonly rollHandleIconSizePx = computed(() => HANDLE_ICON_PX);

  private readonly rollHandleGapPx = computed(() => ROLL_HANDLE_GAP_PX);

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

  readonly showFacingArrow = computed(() => !this.isPoster() && this.facingMark() === 'arrow');

  /**
   * The mark sits just outside the piece, pointing the way the picture's own head points.
   *
   * It is drawn as boldly as the target marker: a piece's facing is read at a glance across
   * the whole table, and a faint mark on a painted floor is read at none.
   */
  readonly facingArrowSizePx = computed(() => Math.max(16, Math.round(this.gridSize * 0.44)));

  /**
   * The part of the pedestal the canvas is handed a picture of: the cell, above it the mark of which
   * way the piece faces where one is shown, which stands half out past the cell's edge, and on a hex
   * grid the whole outline of the cells the piece stands on, which reaches past the cell's box for a
   * piece of more than one cell.
   */
  private pedestalRegion(element: HTMLElement) {
    let left = 0;
    let top = this.showFacingArrow() ? -(this.facingArrowSizePx() / 2 + this.facingArrowOffsetPx()) : 0;
    let right = element.offsetWidth;
    let bottom = element.offsetHeight;
    const hex = this.pedestalHexParams();
    if (hex) {
      left = Math.min(left, Math.floor(hex.bbox.minX + hex.L / 2));
      top = Math.min(top, Math.floor(hex.bbox.minY + hex.L / 2));
      right = Math.max(right, Math.ceil(hex.bbox.maxX + hex.L / 2));
      bottom = Math.max(bottom, Math.ceil(hex.bbox.maxY + hex.L / 2));
    }
    return { left, top, width: right - left, height: bottom - top };
  }

  readonly facingArrowOffsetPx = computed(() => {
    const baseOffset = Math.round(this.gridSize * 0.06);
    if (!this.multiAngleResourceBuffOrbitEnabled()) return baseOffset;
    const gauge = this.multiAngleResourceGaugeLayout();
    return gauge.segments.length > 0 ? baseOffset + gauge.strokeWidth : baseOffset;
  });

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

  /** The columns the buff icons are laid out in, the same count the panel's height is reckoned by. */
  protected readonly buffBadgeColumns = `repeat(${BUFF_BADGES_PER_ROW}, minmax(0, 1fr))`;

  protected multiAngleBuffOrbitTransform(angle: number, radius: number): string {
    return `rotate(${angle}deg) translateY(${-radius}px)`;
  }

  /**
   * What the character is saying, over its piece; none while the room or this seat hides it, or the
   * screen is in novel mode.
   */
  readonly speechBubble = computed(() => {
    const character = this.gameCharacter();
    if (!character || !this.overlay.speech() || !this.speechBubbles.showsHere()) return null;
    return this.speechBubbles.bubbleOf(character.identifier)();
  });

  /** The shadow under a bubble, left off where the table is drawn the lighter way. */
  readonly speechShadow = computed(() => (this.renderLite.active() ? '' : 'shadow-[0_0.15em_0.4em_rgba(0,0,0,0.45)]'));

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

/** The box of a circle round a middle of a pedestal, in the pedestal's own pixels, as a style. */
function ringBoxStyle(middle: number, radius: number): Record<string, string> {
  return {
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
    left: `${middle - radius}px`,
    top: `${middle - radius}px`,
    borderRadius: '50%',
  };
}

/**
 * The ring round a pedestal as a path, in the ring's own pixels: the whole circle where every point
 * round it is seen, or else each run of points seen, round from where one is not.
 */
function ringPathOf(seen: readonly boolean[], radius: number): string {
  const count = seen.length;
  if (seen.every(Boolean)) {
    return `M${radius} 0 A${radius} ${radius} 0 1 1 ${radius} ${radius * 2} A${radius} ${radius} 0 1 1 ${radius} 0`;
  }
  const pointAt = (at: number) => {
    const radians = (at * 2 * Math.PI) / count;
    return `${radius + radius * Math.sin(radians)} ${radius - radius * Math.cos(radians)}`;
  };
  const hidden = seen.indexOf(false);
  let path = '';
  let drawing = false;
  for (let step = 1; step <= count; step++) {
    const at = (hidden + step) % count;
    if (!seen[at]) {
      drawing = false;
      continue;
    }
    path += `${drawing ? 'L' : 'M'}${pointAt(at)} `;
    drawing = true;
  }
  return path.trim();
}
