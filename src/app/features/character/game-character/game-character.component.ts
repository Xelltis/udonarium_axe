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
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { SpeechBubbleService } from '@axe/application/chat/speech-bubble.service';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
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
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PiecePartPickService } from '@axe/application/tabletop/piece-part-pick.service';
import { PiecePartsService } from '@axe/application/tabletop/piece-parts.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MultiMovableService } from '@axe/application/ui/multi-movable.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { sameEntries } from '@axe/core/util/same-fields';
import { BUFF_BADGES_PER_ROW, BuffBadge, countBuffs, toBuffBadges } from '@axe/domain/character/buff-badge';
import { BUFF_VIEW_LABEL_KEYS, type BuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { HIDDEN_GAUGE_STRIPES, PieceGauge, selectPieceGauges, shownGauge } from '@axe/domain/character/piece-gauge';
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
import { multiAnglePieceMotionMode } from '@axe/domain/tabletop/multi-angle';
import { asTableFacingMark, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { isOffTheFloor } from '@axe/domain/tabletop/tabletop-object';
import { PieceMotionKind } from '@axe/domain/tabletop/world/piece-motions';
import { BuffBadgeComponent } from '@axe/features/character/buff-badge/buff-badge.component';
import {
  GameCharacterMenuHost,
  GameCharacterMenuService,
  screenCentreOf,
} from '@axe/features/character/game-character/game-character-menu.service';
import { PieceMultiAngleOrbit } from '@axe/features/character/game-character/piece-multi-angle-orbit';
import { PieceResourceChanges } from '@axe/features/character/game-character/piece-resource-changes';
import { PieceRidingLabels } from '@axe/features/character/game-character/piece-riding-labels';
import { PieceRightDrag } from '@axe/features/character/game-character/piece-right-drag';
import { PieceTurnHandles } from '@axe/features/character/game-character/piece-turn-handles';
import { GameDataElementBuffComponent } from '@axe/features/character/game-data-element-buff/game-data-element-buff.component';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { KeepTouchDirective } from '@axe/ui/directives/keep-touch.directive';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { hexPedestalRingStyle } from '@axe/ui/tabletop/hex-pedestal-style';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { MAX_MULTI_ANGLE_RESOURCE_GAUGES } from '@axe/ui/tabletop/multi-angle-orbit-decoration';
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

/** How large a stamp shows in a bubble, before the labels' supersampling. */
const SPEECH_STAMP_PX = 56;
/** How large the handles that turn and tip a piece are drawn, whatever the size of the piece. */
const HANDLE_PX = 28;
const HANDLE_ICON_PX = 24;
/** How far the handle that tips a piece stands clear of its picture. */
const ROLL_HANDLE_GAP_PX = 7;

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
    TooltipDirective,
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
  private readonly effectTargeting = inject(EffectTargetingService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly buffViewPreference = inject(BuffViewPreferenceService);
  private readonly overlay = inject(PieceOverlayPreferenceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly names = inject(PieceNameService);
  private readonly moveRangeService = inject(MoveRangeService);
  private readonly triggerFire = inject(TriggerFireService);
  private readonly movePlan = inject(MovePlannerService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly effectAutoPlay = inject(EffectAutoPlayService);
  private readonly effectPlayback = inject(EffectPlaybackService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly engagementZones = inject(EngagementZoneService);
  private readonly links = inject(PieceLinksService);
  private readonly multiMovable = inject(MultiMovableService);
  private readonly ride = inject(RideService);
  private readonly parts = inject(PiecePartsService);
  private readonly partPick = inject(PiecePartPickService);
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

  private readonly turnRotable = viewChild('turnRotable', { read: RotableDirective });
  private readonly rollRotable = viewChild('rollRotable', { read: RotableDirective });

  private readonly turnHandles = new PieceTurnHandles({
    character: () => this.gameCharacter(),
    size: () => this.size(),
    gridSize: () => this.gridSize,
    rotate: () => this.rotate,
    roll: () => this.rollSignal(),
    flat: () => this.mode2dEnabled(),
    hasPicture: () => this.imageFile().url.length > 0,
    hexPedestal: () => this.pedestalHexParams(),
    turningByRing: () => this.turnRotable()?.turning() ?? false,
    tippingByHandle: () => this.rollRotable()?.turning() ?? false,
    handleSizePx: () => this.rollHandleSizePx(),
    handleGapPx: () => this.rollHandleGapPx(),
  });
  /** The handle that tips the piece over, beside the top of its picture. */
  protected readonly rollHandles = this.turnHandles.rollHandles;
  /** Which handle of the piece is held just now: the ring that turns it, the one that tips it, or none. */
  protected readonly turning = this.turnHandles.turning;
  /** Whether this is the piece pressed on the table as a finger presses and not in hand. */
  protected readonly pressChosen = this.turnHandles.pressChosen;
  /** Whether the handles take a press at all. */
  protected readonly handlesPressable = this.turnHandles.pressable;
  /** The way the piece faces while it is turned, in whole degrees. */
  protected readonly turnAngle = this.turnHandles.angle;
  /** The step a held Alt turns the piece by on the table in view. */
  protected readonly turnSnapStep = this.turnHandles.snapStep;
  /** The ring round the pedestal that turns the piece, with its knobs. */
  protected readonly turnRing = this.turnHandles.ring;
  /** Whether the pointer is over the piece, which brings its handles out where the main pointer can hover. */
  protected readonly hovered = this.turnHandles.hovered;
  /** Which of the points round the ring the eye sees. */
  protected readonly turnRingSeen = this.turnHandles.ringSeen;
  /** The marks round the ring at every step a held Alt turns the piece to. */
  protected readonly turnTicks = this.turnHandles.ticks;
  /** How far the piece leans, read out while it is tipped. */
  protected readonly rollGauge = this.turnHandles.rollGauge;
  private readonly ringMiddle = this.turnHandles.ringMiddle;

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
      const highlight = this.selectionSignalService.highlightedObject();
      const char = this.gameCharacter();
      const root = this.rootElementRef();
      if (!highlight || !char || !root) return;
      if (char.identifier !== highlight.identifier) return;
      if (char.location.name !== 'table') return;

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

    effect(() => {
      const over = this.hovered();
      const char = this.gameCharacter();
      if (char) untracked(() => this.effectTargeting.hoverPiece(char.identifier, over));
    });

    this.destroyRef.onDestroy(() => {
      const char = this.gameCharacter();
      if (char) {
        this.effectTargeting.hoverPiece(char.identifier, false);
        this.motions.turnOnItsOwn(char.identifier, null);
        this.motions.stop(char.identifier);
      }
      clearTimeout(this.highlightTimer);
      clearTimeout(this.unhighlightTimer);
      this.rightDrag.dispose();
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
  private readonly riding: PieceRidingLabels = new PieceRidingLabels({
    character: () => this.gameCharacter(),
    followedTree: (root) => this.followedTree(root),
    name: () => this.name(),
    hideName: () => this.hideName(),
    hideBuff: () => this.hideBuff(),
    gaugeRows: () => this.gaugeRows(),
    buffBadges: () => this.buffBadges(),
    buffRows: () => this.buffChildren(),
    buffCount: () => this.buffNum(),
    buffViewMode: () => this.buffViewMode(),
    labelsRunRound: (): boolean => this.multiAngleNameOrbitEnabled(),
  });
  /** How many ride this piece where it is a mount, shown by its name since they stand where it stands. */
  readonly ridersAboard = this.riding.ridersAboard;
  /** The mount this piece rides, while it rides one, in whose riding label its own labels are drawn. */
  readonly ridingMount = this.riding.ridingMount;
  /** The pieces riding this one, as its riding label shows them over its own labels. */
  readonly ridingLabels = this.riding.ridingLabels;

  /** The colour a part's number is drawn in while an effect is aimed, as the marks on the table are. */
  protected readonly pickColor = computed(() => this.effectTargeting.markColor());

  /** The parts of this piece, listed under its own labels as those riding it are listed over them. */
  readonly partLabels = this.riding.partLabels;
  /** The riding card over a mount ridden, one label for all on it; empty where nobody rides it. */
  readonly ridingCard = this.riding.ridingCard;

  /** Aims at a part listed in the piece's card, or lets go of it, from a press on its row. */
  protected aimAtPart(identifier: string, event: Event): void {
    event.stopPropagation();
    const part = this.objectStore.get<GameCharacter>(identifier);
    if (part instanceof GameCharacter && this.parts.bodyOf(part) === this.gameCharacter()) this.aimAtPiece(part);
  }

  /**
   * Aims at a part, or lets go of it; while an effect's targets are being picked, picks it among them
   * instead, as a press on a piece drawn as itself does.
   */
  private aimAtPiece(part: GameCharacter): void {
    if (this.effectTargeting.isPicking()) {
      this.selectionSignalService.selectObject(part.identifier, part.aliasName);
      return;
    }
    this.pieceTarget.toggle(part);
  }

  /** Opens the menu of a part listed in the piece's card, as a right-click on the part would. */
  protected openPartMenu(identifier: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const part = this.objectStore.get<GameCharacter>(identifier);
    if (!(part instanceof GameCharacter) || this.parts.bodyOf(part) !== this.gameCharacter()) return;
    this.menu.open(part, this.menuHost, { x: event.clientX, y: event.clientY, z: 0 });
  }

  /** The parts of the piece, in a card of their own under it while its name and bars run round it. */
  protected readonly partCardInOrbit = this.riding.partCardInOrbit;
  /** Whether the mount's own labels are drawn in its riding card rather than over it. */
  protected readonly labelsInRidingCard = this.riding.labelsInRidingCard;

  /** How much larger a name stands in the riding card than the bars beside it, as on the piece's own label. */
  protected readonly ridingNameEm = NAME_BASE_FONT_PX / DECOR_BASE_FONT_PX;

  /** Names go unshown for a piece hiding its name here, and for every piece while this seat has them switched off. */
  readonly hideName = computed(() => {
    const char = this.gameCharacter();
    if (!char) return false;
    if (!this.overlay.names()) return true;
    this.objectChange.versionOf(char.identifier)();
    this.objectChange.trackMyCursor();
    return this.names.isKept(char);
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

  readonly gaugeRows = computed<{ gauge: PieceGauge; numbers: string; kept: boolean }[]>(() => {
    const readable = this.gaugeNumbersReadable();
    return this.pieceGauges().map((gauge) => shownGauge(gauge, readable));
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

  /** The bars drawn round the piece, as the reader is shown them: those of a piece kept from them full and grey. */
  readonly orbitPieceGauges = computed(() =>
    this.gaugeRows()
      .slice(0, MAX_MULTI_ANGLE_RESOURCE_GAUGES)
      .map((row) => row.gauge)
  );

  private readonly resourceChanges = new PieceResourceChanges({
    character: () => this.gameCharacter(),
    partsOf: (character) => this.parts.partsOfFollowed(character),
    followedTree: (root) => this.followedTree(root),
    localChangeCountOf: (identifier) => this.objectStore.localChangeCountOf(identifier),
    partNameOf: (identifier) => this.partNameOf(identifier),
    playEffects: (character, changes) => this.effectAutoPlay.play(character, changes),
    destroyRef: this.destroyRef,
  });
  /** The changes to its resources floating over the piece now. */
  readonly floatingChanges = this.resourceChanges.floating;
  /** The flash the piece is drawn with for a moment after a hit or a heal. */
  readonly hitFlash = this.resourceChanges.hitFlash;

  private readonly orbit = new PieceMultiAngleOrbit({
    standsFlat: () => !this.isPoster() && this.tabletopService.mode2d(),
    display: () => this.tabletopService.display(),
    identifier: () => this.gameCharacter()?.identifier,
    name: () => this.name(),
    riderNames: () =>
      this.ridingLabels()
        .map((label) => label.name)
        .filter((name) => name.length > 0),
    hideName: () => this.hideName(),
    hideBuff: () => this.hideBuff(),
    riding: () => !!this.ridingMount(),
    footprint: () => this.size() * this.gridSize,
    gauges: () => this.orbitPieceGauges(),
    buffs: () => this.buffBadges(),
    buffIconScale: () => this.buffIconScale(),
  });
  readonly multiAngleNameOrbitEnabled = this.orbit.nameEnabled;
  readonly multiAngleResourceBuffOrbitEnabled = this.orbit.resourceBuffEnabled;
  readonly multiAngleCurvedNameLayout = this.orbit.curvedName;
  readonly multiAngleLabelText = this.orbit.labelText;

  /** How a bar kept from this reader is filled: slanting stripes rather than a full bar. */
  protected readonly keptStripes = HIDDEN_GAUGE_STRIPES;
  /** The fills of the flash on a piece that took damage and of the ring and glow on one that was healed. */
  protected readonly damageFlashFill = 'radial-gradient(circle, rgba(255,60,60,0.85) 0%, rgba(255,60,60,0) 70%)';
  protected readonly healAuraFill =
    'radial-gradient(circle, rgba(120,255,170,0) 42%, rgba(120,255,170,0.9) 60%, rgba(120,255,170,0) 76%)';
  protected readonly healGlowFill = 'radial-gradient(circle, rgba(90,230,120,0.7) 0%, rgba(90,230,120,0) 70%)';
  /**
   * The name of the stripes the ring round this piece is drawn with, its own: another piece's, in a
   * part of the page that is not drawn, would leave the ring unpainted.
   */
  protected readonly keptStripesId = computed(() => `kept-gauge-stripes-${this.gameCharacter()?.identifier ?? ''}`);
  /** The bars on the ring round the piece kept from this reader, which are drawn striped. */
  protected readonly keptGaugeIds = computed(
    () =>
      new Set(
        this.gaugeRows()
          .filter((row) => row.kept)
          .map((row) => row.gauge.identifier)
      )
  );

  readonly multiAngleResourceGaugeLayout = this.orbit.resourceGauge;
  readonly multiAngleBuffOrbitLayout = this.orbit.buffOrbit;
  readonly multiAngleOrbitVisible = this.orbit.visible;
  readonly multiAngleCurvedNamePathId = this.orbit.curvedNamePathId;
  readonly multiAngleNameOrbitAnimation = this.orbit.nameAnimation;
  readonly multiAngleResourceBuffOrbitAnimation = this.orbit.resourceBuffAnimation;
  private readonly multiAnglePiecePhase = this.orbit.piecePhase;
  readonly multiAngleNameOrbitDelaySeconds = this.orbit.nameDelaySeconds;
  readonly multiAngleResourceBuffOrbitDelaySeconds = this.orbit.resourceBuffDelaySeconds;
  readonly multiAnglePieceRevolutionSeconds = this.orbit.pieceRevolutionSeconds;

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

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const part = this.partPressed(e);
    if (part) {
      this.menu.open(part, this.menuHost, this.pointerDeviceService.pointers[0]);
      return;
    }
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

  /**
   * How a part is named over its body where a change to it is shown: its name as its row shows it, or
   * the word for a part where this seat is not shown its name.
   */
  private partNameOf(identifier: string): string {
    const part = this.objectStore.get<GameCharacter>(identifier);
    const shown = part instanceof GameCharacter && part.name !== '' && this.overlay.names() && !this.names.isKept(part);
    return shown ? part.name : this.translateFn('feature.ride.part.someone');
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
        this.snackbar.show(
          this.translateFn(why, {
            name: this.names.shown(character),
            mount: carriedBy ? this.names.shown(carriedBy) : '',
          })
        );
        return;
      }
      const rideRefusal = this.ride.moveRefusal(character);
      if (rideRefusal) {
        queueMicrotask(() => this.movableRef()?.cancel());
        const mount = this.ride.mountOf(character) ?? this.ride.leftMountOf(character);
        this.snackbar.show(
          this.translateFn(`feature.ride.${rideRefusal}`, {
            name: this.names.shown(character),
            mount: mount ? this.names.shown(mount) : '',
          })
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
        this.snackbar.show(
          this.translateFn(why, {
            name: this.names.shown(character),
            holder: holder instanceof GameCharacter ? this.names.shown(holder) : '',
          })
        );
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
   * Settles where a piece was put down: those it carries come along, and those the pieces moved with
   * it in a selection carry, these written where they stand first, so one carried with it is stood on
   * it rather than left where it was dragged; it gets off a mount it was put down off, its put-down
   * triggers fire, and a fight or a seat on a mount where it stands is offered. All that comes along
   * is brought before the triggers fire, so ground that carries the piece off has the last word.
   */
  private settlePutDown() {
    const character = this.gameCharacter();
    if (!character) return;
    this.links.carryBoundAll([character, ...this.multiMovable.carriedFollowersFor(character.identifier)]);
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
      const part = this.partPressed(key_event);
      if (part) this.aimAtPiece(part);
      else this.toggleTarget();
    }
  }

  /** The part of the piece a press lands on, where its parts are drawn as pieces of its picture; null otherwise. */
  private partPressed(event: Event): GameCharacter | null {
    const char = this.gameCharacter();
    if (!char || !(event instanceof MouseEvent)) return null;
    return this.partPick.partAt(char, event.clientX, event.clientY);
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
    for (const child of children) this.objectChange.versionOf(child.identifier)();
    return countBuffs(children);
  });
}
