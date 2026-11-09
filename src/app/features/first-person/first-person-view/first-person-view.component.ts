import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AmbienceService, type WeatherAmbience } from '@axe/application/tabletop/ambience.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TABLE_SCREEN } from '@axe/application/tabletop/table-screen';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { WaterService } from '@axe/application/tabletop/water.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { BUFF_BADGES_PER_ROW, BuffBadge, toBuffBadges } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeNumbersOf, selectPieceGauges } from '@axe/domain/character/piece-gauge';
import { pieceImageWidthApart } from '@axe/domain/character/piece-image-size';
import { DataElement } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { matrixColumns } from '@axe/domain/tabletop/camera/table-camera';
import {
  clipBillboardToEye,
  depthOf,
  eyeFrameOf,
  FirstPersonCamera,
  lateralOf,
} from '@axe/domain/tabletop/first-person/first-person-clip';
import {
  FIRST_PERSON_FOV_DEG,
  firstPersonBillboardMatrix,
  firstPersonCeilings,
  firstPersonEyeMatrix,
  firstPersonScreenMatrix,
} from '@axe/domain/tabletop/first-person/first-person-eye';
import {
  FirstPersonMove,
  FirstPersonPose,
  signedTurnDeg,
} from '@axe/domain/tabletop/first-person/first-person-lattice';
import { cameraOf } from '@axe/domain/tabletop/first-person/first-person-look';
import { roofRaisedFor, sameRoof } from '@axe/domain/tabletop/first-person/first-person-roof';
import { pieceStandPx } from '@axe/domain/tabletop/first-person/first-person-stand';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellIndexAt, CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { boardSurfaceOf, surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { murkShade } from '@axe/domain/tabletop/water/water-depth';
import { currentSeenFrom, flowCellsPerSecond } from '@axe/domain/tabletop/water/water-flow';
import { deepWaterColor, underwaterDeepColor } from '@axe/domain/tabletop/water/water-look';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';
import type { TableWorldCap } from '@axe/domain/tabletop/world/table-world';
import { EffectTargetOverlayComponent } from '@axe/features/effect/effect-target-overlay/effect-target-overlay.component';
import {
  EffectEye,
  TableEffectOverlayComponent,
} from '@axe/features/effect/table-effect-overlay/table-effect-overlay.component';
import { facingNameOf, isHexLattice, padRows } from '@axe/features/first-person/first-person-hud';
import { FirstPersonCommand, firstPersonKeyDown } from '@axe/features/first-person/first-person-keys';
import { FirstPersonLookService } from '@axe/features/first-person/first-person-look.service';
import { FirstPersonScreen } from '@axe/features/first-person/first-person-screen';
import {
  billboardHudTransform,
  billboardLiftPx,
  billboardStyle,
  billboardTextScale,
  fadeOutPx,
  FIRST_PERSON_UNIT_PX,
  NIGHT_SKY,
  nightSkyAt,
  perspectivePx,
  pieceChromeBottomPercent,
  pieceChromeHeightPx,
  projectedScaleOf,
  QuadStyle,
  scaleOf,
  shadeFor,
  waterSkyAt,
  withBillboardCut,
} from '@axe/features/first-person/first-person-style';
import {
  FirstPersonSight,
  NEAR_CELLS,
  pieceInSight,
} from '@axe/features/first-person/first-person-view/first-person-view-scene';
import { TableWeatherOverlayComponent } from '@axe/features/tabletop/table-weather-overlay/table-weather-overlay.component';
import { paintMinimap } from '@axe/infrastructure/first-person/minimap-painter';
import { MAX_MULTI_ANGLE_RESOURCE_GAUGES } from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { TranslocoModule } from '@jsverse/transloco';

/** How far over the top of a great piece the roof of its room is raised, in cells. */
const ROOF_CLEARANCE_CELLS = 0.5;
/** How wide what is told about a piece runs, against the picture of a piece one cell wide. */
const CHROME_WIDTH_RATIO = 1.3;
const GLIDE_MS = 160;
const SNAP_CELLS = 3;
const SNAP_TURN_DEG = 135;
const COMPASS_TICKS: readonly number[] = Array.from({ length: 24 }, (_, index) => index * 15);
const TARGET_CONE_DEG = 20;
const EFFECT_LIFT_CELLS = 0.15;
const EFFECT_RISE_CELLS = 0.3;
/** What keeps the effects moving while the eye is under a pond. */
const UNDER_A_POND = 'first-person-under-water';
/** How far below the top of the view what is told about a near piece keeps, clear of the toolbars. */
const CHROME_TOP_MARGIN_PX = 64;
/** The width the view is laid out for before it has been measured. */
const DEFAULT_VIEW_WIDTH_PX = 1280;
const DEFAULT_VIEW_HEIGHT_PX = 720;
const NO_CEILINGS: readonly TableWorldCap[] = [];

/** Whether two sets of ceilings are the same faces in the same places, so the canvas's scene is not built anew. */
function sameCeilings(a: readonly TableWorldCap[], b: readonly TableWorldCap[]): boolean {
  return (
    a.length === b.length &&
    a.every((ceiling, index) => {
      const other = b[index];
      const [corner] = ceiling.outline;
      return (
        ceiling.id === other.id &&
        ceiling.zPx === other.zPx &&
        corner.x === other.outline[0].x &&
        corner.y === other.outline[0].y
      );
    })
  );
}

/** What the eye is under, where it is under water: the colour of the depths, and the weather it sees. */
interface UnderWater {
  readonly deep: string;
  /** How murky the water is, from 0 for clear to 1 for water nothing can be seen through. */
  readonly turbidity: number;
  /**
   * The weather drawn over the view while the eye is under a pond on a dry map, or null where the
   * map's own weather is already the water.
   */
  readonly weather: WeatherAmbience | null;
}

interface GaugeView {
  id: string;
  name: string;
  initial: string;
  percent: number;
  color: string;
  numbers: string;
}

/** A piece standing on the floor in sight of the seat, and how large it stands. */
interface StandingPiece {
  piece: GameCharacter;
  /** How wide the ground it stands on is, in table pixels: a cell at the least, as when it moves. */
  size: number;
  centre: CellPoint;
  stand: { widthPx: number; heightPx: number };
  /** Whether the picture was given a width apart from its height, and so fills its box out of proportion. */
  stretched: boolean;
  basePx: number;
}

interface PieceView {
  id: string;
  label: string;
  url: string;
  /** Whether the picture fills its box out of proportion, as a width given apart from its height has it. */
  stretched: boolean;
  targeted: boolean;
  pick: number;
  bearing: number;
  /** Whether the eye has a line of sight to it, which aiming straight ahead asks for. */
  inLine: boolean;
  gauges: GaugeView[];
  badges: BuffBadge[];
  moreBadges: number;
  style: QuadStyle;
  hud: string | null;
  /**
   * Where what is told about the piece stands in its box, in percent from the bottom: just above
   * the top of the picture, or lower where that would leave the view.
   */
  chromeBottom: number;
}

interface SkyView {
  background: string;
  backdrops: { id: string; url: string; opacity: number }[];
  /** A night sky shading to a haze at the horizon, for a table with no picture of its own to show. */
  gradient: string | null;
  /** The colour of the depths all round, for an eye under water, which sees no sky at all. */
  deep?: string;
  /** How murky that water is, from 0 to 1. */
  murk?: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'first-person-view',
  templateUrl: './first-person-view.component.html',
  host: {
    class: 'absolute inset-0 block select-none overflow-hidden bg-black',
    '(document:keydown)': 'onKeydown($event)',
    '(window:blur)': 'looking.letGo()',
  },
  imports: [EffectTargetOverlayComponent, TranslocoModule, TableEffectOverlayComponent, TableWeatherOverlayComponent],
  providers: [FirstPersonLookService, FirstPersonScreen, { provide: TABLE_SCREEN, useExisting: FirstPersonScreen }],
})
export class FirstPersonViewComponent {
  protected readonly firstPerson = inject(FirstPersonService);
  private readonly playback = inject(EffectPlaybackService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly water = inject(WaterService);
  private readonly ambience = inject(AmbienceService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly effectTargeting = inject(EffectTargetingService);
  private readonly selection = inject(SelectionSignalService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly motion = inject(MotionService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly modal = inject(ModalService);
  private readonly movePlan = inject(MovePlannerService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly minimapCanvas = viewChild<ElementRef<HTMLCanvasElement>>('minimap');
  private readonly canvasHost = viewChild<ElementRef<HTMLElement>>('canvasHost');
  private readonly table3d = inject(Table3dService);
  private readonly eyes = inject(TableEyeService);
  private readonly screen = inject(FirstPersonScreen);

  /** The ceilings over the rooms the eye stands under, for the canvas, unchanged while the roof and the eye's height are. */
  private readonly ceilings = computed<readonly TableWorldCap[]>(
    () => {
      const roof = this.roof();
      const grid = this.firstPerson.grid();
      const eyeZ = this.firstPerson.pose()?.z;
      if (!roof || !grid || eyeZ === undefined) return NO_CEILINGS;
      return firstPersonCeilings(roof, grid, eyeZ);
    },
    { equal: sameCeilings }
  );
  protected readonly looking = inject(FirstPersonLookService);

  private readonly width = signal(0);
  private readonly height = signal(0);
  private readonly shown = signal<FirstPersonPose | null>(null);
  private frame: number | null = null;

  /** What the eye could see before its latest move, which is where the view glides away from. */
  private readonly seenBefore = linkedSignal<CellBits | null, CellBits | null>({
    source: this.firstPerson.seen,
    computation: (_seen, previous) => previous?.source ?? null,
  });

  /** The sight of every pose a glide still on its way set out from, let go once the view lands. */
  private readonly carried = signal<CellBits | null>(null);

  /**
   * The ground the view may draw: what the eye sees now and, until the view has caught up with
   * it, what it saw on the way. The sight is worked out for where a move ends, so a view still
   * turning or stepping there would otherwise show the ground it is leaving as nothing at all.
   */
  private readonly drawnSeen = computed<CellBits | null>(() => unionOf(this.firstPerson.seen(), this.carried()));

  /** What the view can show now: the board's cells, the ground drawn, how large a cell is and how far it reaches. */
  private sight(): FirstPersonSight {
    return {
      grid: this.firstPerson.grid(),
      seen: this.drawnSeen(),
      gridSize: this.gridSize(),
      reachPx: this.firstPerson.depthPx(),
    };
  }

  constructor() {
    effect(() => {
      const target = this.firstPerson.pose();
      untracked(() => this.glideTo(target));
    });
    effect(() => {
      const view = this.firstPerson.minimap();
      const context = this.minimapCanvas()?.nativeElement.getContext('2d');
      if (view && context) paintMinimap(context, view);
    });
    effect(() => {
      const viewer = this.firstPerson.piece();
      if (!viewer || this.effectTargeting.isPicking()) return;
      untracked(() => {
        if (this.selection.selectedObject()?.identifier !== viewer.identifier) {
          this.selection.selectObject(viewer.identifier, viewer.aliasName);
        }
      });
    });
    effect(() => {
      // The map's own weather keeps the effects moving; a pond's water seen from inside it has to ask.
      const moving = !!this.underWater()?.weather && this.motion.enabled();
      untracked(() => this.playback.setPersistent(UNDER_A_POND, moving));
    });
    effect((onCleanup) => {
      const host = this.canvasHost()?.nativeElement;
      if (host) onCleanup(this.table3d.lend(host));
    });
    effect(() => {
      const camera = this.viewCamera();
      const viewer = this.firstPerson.piece();
      if (!camera || !viewer) {
        untracked(() => {
          this.eyes.clear();
          this.screen.show(null);
        });
        return;
      }
      const focalPx = this.perspective();
      const eye = firstPersonEyeMatrix(camera, focalPx);
      const screen = {
        camera,
        focalPx,
        widthPx: this.width() || DEFAULT_VIEW_WIDTH_PX,
        heightPx: this.height() || DEFAULT_VIEW_HEIGHT_PX,
        scale: this.scale(),
      };
      untracked(() => this.screen.show(screen));
      this.eyes.show({
        camera: {
          eye: matrixColumns(eye),
          axes: eyeAxesOf(firstPersonEyeMatrix({ ...camera, pitch: 0 }, focalPx)),
          orthographic: false,
          width: this.width() || DEFAULT_VIEW_WIDTH_PX,
          height: this.height() || DEFAULT_VIEW_HEIGHT_PX,
          focalPx,
          nearPx: this.gridSize() * NEAR_CELLS,
          fadePx: fadeOutPx(this.firstPerson.depthPx()),
        },
        standsAt: { x: camera.x, y: camera.y },
        without: viewer.identifier,
        ceilings: this.ceilings(),
      });
    });
    this.watchSize();
    this.destroyRef.onDestroy(() => {
      this.eyes.clear();
      this.stopGlide();
      this.playback.setPersistent(UNDER_A_POND, false);
    });
  }

  protected readonly gridSize = computed(() => this.firstPerson.table()?.gridSize ?? 0);

  /**
   * How wide what is told about a piece runs, in the view's own pixels: as wide for every piece as for
   * one of a cell, so a great piece's readings stay a size to read rather than spanning the view, and
   * a small piece's are not squeezed to nothing.
   */
  protected readonly chromeWidthPx = Math.round(FIRST_PERSON_UNIT_PX * CHROME_WIDTH_RATIO);

  protected readonly scale = computed(() => scaleOf(this.gridSize()));

  protected readonly perspective = computed(() =>
    perspectivePx(this.width() || DEFAULT_VIEW_WIDTH_PX, FIRST_PERSON_FOV_DEG)
  );

  /**
   * The camera the view is drawn through: where the shown pose stands, turned and tipped as far as
   * the screen looks away from where the piece faces.
   */
  private readonly viewCamera = computed<FirstPersonCamera | null>(() => {
    const pose = this.shown();
    return pose ? cameraOf(pose, this.looking.look()) : null;
  });

  /**
   * Whether the eye is under water, and what that water is: the whole map under water, or a pond
   * whose surface stands over the eye where it stands. Null in the air.
   */
  protected readonly underWater = computed<UnderWater | null>(() => {
    const weather = this.ambience.weather();
    if (weather?.kind === 'underwater') {
      return { deep: underwaterDeepColor(weather.color), turbidity: weather.density, weather: null };
    }
    const camera = this.viewCamera();
    if (!camera) return null;
    const water = this.water.waterAt(camera.x, camera.y);
    if (!water || camera.z >= water.surfacePx) return null;
    return {
      deep: deepWaterColor(water.color),
      turbidity: water.turbidity,
      weather: {
        kind: 'underwater',
        color: water.color,
        density: Math.min(0.35 + 0.65 * water.turbidity, 1),
        current: currentSeenFrom(eyeFrameOf(camera), water.flowDirection, flowCellsPerSecond(water.flowSpeed)),
      },
    };
  });

  /** How murky the water the eye is in is, from 0 to 1; null in the air. */
  private readonly murk = computed(() => this.underWater()?.turbidity ?? null);

  /**
   * How far into the dark and the water something this far off is lost: the distance alone in
   * the air, and under water the distance or the water, whichever hides more, all the way in
   * water too murky to see past.
   */
  private shadeAt(depthPx: number, reachPx: number): number {
    const away = shadeFor(depthPx, reachPx);
    const murk = this.murk();
    const gridSize = this.gridSize();
    if (murk === null || gridSize <= 0) return away;
    return Math.max(away, murkShade(depthPx / gridSize, murk));
  }

  /** The weather drawn over the view: a pond's water while the eye is in it, or else the map's own. */
  protected readonly screenWeather = computed<WeatherAmbience | undefined>(
    () => this.underWater()?.weather ?? undefined
  );

  protected readonly effectEye = computed<EffectEye | null>(() => {
    const camera = this.viewCamera();
    const gridSize = this.gridSize();
    if (!camera || gridSize <= 0) return null;
    return {
      rotation: { x: 90 + (camera.pitch ?? 0), y: 0, z: -camera.yaw },
      liftPx: gridSize * EFFECT_LIFT_CELLS,
      risePx: gridSize * EFFECT_RISE_CELLS,
    };
  });

  protected readonly shake = this.playback.shake;

  /**
   * The roof over the ground the board shuts in, each room's raised clear over the tallest piece this
   * seat sees standing in it, so a great piece is not cut off at the top of the walls. A piece the
   * seat cannot see raises nothing, which would give it away. A piece that changes without raising
   * the roof any differently leaves the scene as it is.
   */
  private readonly roof = computed(
    () => {
      const roof = this.firstPerson.roof();
      const grid = this.firstPerson.grid();
      if (!roof || !grid) return roof;
      const standing = this.standing().map((piece) => ({
        cell: cellIndexAt(grid, piece.centre.x, piece.centre.y),
        topPx: piece.basePx + piece.stand.heightPx,
      }));
      return roofRaisedFor(roof, standing, this.gridSize() * ROOF_CLEARANCE_CELLS);
    },
    { equal: sameRoof }
  );

  /** Width over height of each piece's picture, learned as it loads, so the piece stands as tall as its picture. */
  private readonly pictureAspects = signal<ReadonlyMap<string, number>>(new Map());

  /** Learns the proportions of a piece's picture once it has loaded. */
  protected notePictureAspect(url: string, event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) return;
    const aspect = image.naturalWidth / image.naturalHeight;
    if (this.pictureAspects().get(url) === aspect) return;
    this.pictureAspects.update((aspects) => new Map(aspects).set(url, aspect));
  }

  /**
   * The pieces standing on the floor that this seat can see, other than the one it looks out of, each
   * with how large it stands: what is worked out once for them, whichever way the eye looks.
   */
  private readonly standing = computed<StandingPiece[]>(() => {
    const viewer = this.firstPerson.piece();
    const gridSize = this.gridSize();
    if (!viewer || gridSize <= 0) return [];
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const aspects = this.pictureAspects();
    const pieces: StandingPiece[] = [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (piece.identifier === viewer.identifier) continue;
      this.objectChange.versionOf(piece.identifier)();
      if (!piece.isVisibleOnTable || surfaceOf(piece) !== 'floor' || boardSurfaceOf(piece) !== '') continue;
      if (!this.vision.isTokenVisible(piece)) continue;
      const drawnCells = Math.max(0, piece.size);
      if (drawnCells <= 0) continue;
      const size = Math.max(1, drawnCells) * gridSize;
      const aspect = aspects.get(piece.imageFile.url);
      const widthApart = piece.specifyKomaImageFlag ? pieceImageWidthApart(piece.komaImageWidth) : null;
      pieces.push({
        piece,
        size,
        centre: { x: piece.location.x + size / 2, y: piece.location.y + size / 2 },
        stand: pieceStandPx({
          sizeCells: drawnCells,
          gridSize,
          aspect,
          specifiedHeightPx: piece.specifyKomaImageFlag ? piece.komaImageHeight : undefined,
          specifiedWidthPx: widthApart ?? undefined,
        }),
        stretched: widthApart !== null,
        basePx: piece.posZ + piece.altitude * gridSize,
      });
    }
    return pieces;
  });

  protected readonly pieceViews = computed<PieceView[]>(() => {
    const camera = this.viewCamera();
    const viewer = this.firstPerson.piece();
    const gridSize = this.gridSize();
    if (!camera || !viewer || gridSize <= 0) return [];
    this.objectChange.fileVersion();
    this.uiSignal.targetChange();
    this.objectChange.trackMyCursor();
    this.objectChange.collectionOf('data')();
    const master = this.rolePermission.canSeeHidden();
    const picks = this.effectTargeting.picks();
    const eye = eyeFrameOf(camera);
    const pitch = camera.pitch ?? 0;
    const nearPx = gridSize * NEAR_CELLS;
    const scale = this.scale();
    const perspective = this.perspective();
    const viewHeight = this.height();
    const reach = this.firstPerson.depthPx();
    const inLine = this.firstPerson.sight();
    const sight = this.sight();
    const grid = sight.grid;
    const under = this.murk() !== null;
    const flat = firstPersonScreenMatrix(
      camera,
      perspective,
      this.width() || DEFAULT_VIEW_WIDTH_PX,
      viewHeight || DEFAULT_VIEW_HEIGHT_PX,
      scale
    );
    const standing = new Matrix3D();
    const views: PieceView[] = [];
    for (const { piece, size, centre, stand, stretched, basePx: base } of this.standing()) {
      if (!pieceInSight(sight, eye, piece.location, size, centre)) continue;
      const badges = this.badgesOf(piece);
      const depth = depthOf(eye, centre);
      const lifted = base + billboardLiftPx(base, camera.z, depth, perspective, viewHeight, pitch);
      const kept = clipBillboardToEye(eye, centre, lifted, lifted + stand.heightPx, nearPx);
      if (!kept) continue;
      const textScale = billboardTextScale(depth, scale, perspective);
      const board = billboardStyle({ ...centre, z: lifted }, stand.widthPx, stand.heightPx, camera.yaw, scale);
      const laid = {
        ...board,
        transform: Matrix3D.multiply(
          firstPersonBillboardMatrix(
            { ...centre, z: lifted },
            stand.widthPx,
            stand.heightPx,
            camera.yaw,
            scale,
            standing
          ),
          flat,
          standing
        ).toCss(),
      };
      const gauges = this.gaugesOf(piece);
      const label = piece.hideName && !master ? '' : piece.name;
      const pick = picks.indexOf(piece.identifier) + 1;
      const chromeRows = { badges: badges.length > 0, gauges: gauges.length, label: label !== '' || pick > 0 };
      views.push({
        id: piece.identifier,
        label,
        url: piece.imageFile.url,
        stretched,
        targeted: piece.targeted,
        pick,
        bearing: Math.abs((Math.atan2(lateralOf(eye, centre), depth) * 180) / Math.PI),
        inLine: !inLine || !grid || inLine.get(cellIndexAt(grid, centre.x, centre.y)),
        gauges,
        badges: badges.slice(0, BUFF_BADGES_PER_ROW),
        moreBadges: Math.max(0, badges.length - BUFF_BADGES_PER_ROW),
        style: inTheMurk(withBillboardCut(laid, kept, lifted, stand.heightPx), under ? this.shadeAt(depth, reach) : 0),
        hud: billboardHudTransform(textScale),
        chromeBottom: pieceChromeBottomPercent({
          heightPx: stand.heightPx,
          baseZ: lifted,
          eyeZ: camera.z,
          depthPx: depth,
          pitchDeg: pitch,
          perspective,
          viewHeightPx: viewHeight,
          chromeScreenPx: pieceChromeHeightPx(chromeRows) * textScale * projectedScaleOf(depth, scale, perspective),
          marginPx: CHROME_TOP_MARGIN_PX,
        }),
      });
    }
    return views;
  });

  private gaugesOf(piece: GameCharacter): GaugeView[] {
    const detail = piece.detailDataElement;
    if (!detail) return [];
    this.trackTree(detail);
    const readable = this.disclosure.canView(piece);
    return selectPieceGauges(detail)
      .slice(0, MAX_MULTI_ANGLE_RESOURCE_GAUGES)
      .map((gauge) => ({
        id: gauge.identifier,
        name: gauge.name,
        initial: gauge.initial,
        percent: gauge.ratio * 100,
        color: gauge.color,
        numbers: gaugeNumbersOf(gauge, readable),
      }));
  }

  private badgesOf(piece: GameCharacter): BuffBadge[] {
    const buff = piece.buffDataElement;
    if (!buff || piece.hideBuff) return [];
    this.trackTree(buff);
    return toBuffBadges(buff);
  }

  private trackTree(root: DataElement): void {
    this.objectChange.versionOf(root.identifier)();
    for (const element of collectDataElements(root)) this.objectChange.versionOf(element.identifier)();
  }

  /**
   * What is seen above the walls and past the end of the view: the picture the table is laid
   * on, and over it the backdrops the table stands against, back to front. A table with neither
   * is given a night sky that lightens to a haze at the horizon, so the far end of the view fades
   * rather than stops; a table in the dark keeps the dark.
   */
  protected readonly sky = computed<SkyView | null>(() => {
    const table = this.firstPerson.table();
    if (!table) return null;
    const under = this.underWater();
    if (under) return { background: '', backdrops: [], gradient: null, deep: under.deep, murk: under.turbidity };
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
    const background = this.imageService.getEmptyOr(table.backgroundImageIdentifier).url;
    const backdrops = table.backgroundLayers
      .filter((layer) => {
        this.objectChange.versionOf(layer.identifier)();
        return layer.enabled && layer.placedBackdrop && layer.opacity > 0;
      })
      .sort((a, b) => a.order - b.order)
      .map((layer) => ({
        id: layer.identifier,
        url: this.imageService.getEmptyOr(layer.imageIdentifier).url,
        opacity: layer.opacity,
      }))
      .filter((layer) => layer.url !== '');
    if (background || backdrops.length > 0) return { background, backdrops, gradient: null };
    this.objectChange.versionOf(table.identifier)();
    return table.darknessEnabled ? null : { background: '', backdrops: [], gradient: NIGHT_SKY };
  });

  /**
   * How far the backdrops are moved across for the way the eye faces: a whole view's width for
   * each turn as wide as the view sees, as anything far enough off would be.
   */
  protected readonly skyShift = computed(
    () => -((this.viewCamera()?.yaw ?? 0) / FIRST_PERSON_FOV_DEG) * (this.width() || DEFAULT_VIEW_WIDTH_PX)
  );

  /** How far the horizon drops down the view as the eye looks up, or rises as it looks down. */
  protected readonly skyLift = computed(() => {
    const pitch = this.viewCamera()?.pitch ?? 0;
    return pitch === 0 ? 0 : this.perspective() * Math.tan((pitch * Math.PI) / 180);
  });

  /** The night sky, its haze kept at the horizon wherever the eye looks. */
  protected readonly skyGradient = computed(() => {
    const sky = this.sky();
    if (sky?.deep) return waterSkyAt(sky.deep, this.skyLift(), this.height(), sky.murk ?? 0);
    if (!sky?.gradient) return null;
    return nightSkyAt(this.skyLift(), this.height());
  });

  /**
   * The name of the piece looked out of, kept back where the piece hides its name from whoever is
   * not the master, as a view the master shares can be of such a piece.
   */
  protected readonly pieceName = computed(() => {
    const piece = this.firstPerson.piece();
    if (!piece) return '';
    this.objectChange.versionOf(piece.identifier)();
    this.objectChange.trackMyCursor();
    return piece.hideName && !this.rolePermission.canSeeHidden() ? '' : piece.name;
  });

  protected readonly facing = computed(() => facingNameOf(this.firstPerson.pose()?.yaw ?? 0));

  protected readonly compassTurn = computed(() => -(this.viewCamera()?.yaw ?? 0));

  protected readonly compassTicks = COMPASS_TICKS;

  protected readonly controlsPlace = computed(() =>
    this.mobile.isActive() ? 'left-0 max-w-full' : 'left-16 max-w-[calc(100%-16rem)]'
  );

  protected readonly torchLabelKey = computed(() =>
    this.firstPerson.torchLit() ? 'feature.firstPerson.hud.torchOff' : 'feature.firstPerson.hud.torchOn'
  );

  protected readonly padRows = computed(() => padRows(this.firstPerson.lattice()));

  protected readonly isHex = computed(() => isHexLattice(this.firstPerson.lattice()));

  protected readonly picking = this.effectTargeting.isPicking;

  protected readonly pickCount = computed(() => this.effectTargeting.picks().length);

  protected readonly anyTargeted = computed(() => {
    this.uiSignal.targetChange();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.pieceTarget.anything();
  });

  /** Aims at a piece clicked in the view, unless the click only ends a look about. */
  protected clickPiece(identifier: string): void {
    if (this.looking.takeClickAsLook()) return;
    this.aim(identifier);
  }

  private aim(identifier: string): void {
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (!(piece instanceof GameCharacter)) return;
    if (this.effectTargeting.isPicking()) {
      this.selection.selectObject(piece.identifier, piece.aliasName);
      return;
    }
    this.pieceTarget.toggle(piece);
  }

  protected clearTargets(): void {
    this.pieceTarget.clear();
  }

  protected castPicks(): void {
    this.effectTargeting.confirm();
  }

  protected cancelPicks(): void {
    this.effectTargeting.cancel();
  }

  /** Turns the view about as the pointer drags across it, a view's width for each turn as wide as it sees. */
  protected dragLook(event: PointerEvent): void {
    this.looking.drag(event, FIRST_PERSON_FOV_DEG / (this.width() || DEFAULT_VIEW_WIDTH_PX));
  }

  /**
   * Walks, turns, aims and the rest from the keys, leaving alone a key something else on the page
   * has already taken, as the table takes Escape to back out of picking targets.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const command = firstPersonKeyDown(event.code, {
      typing: isTypingTarget(event.target),
      composing: event.isComposing,
      chord: event.ctrlKey || event.metaKey || event.altKey,
      busy: this.modal.isShow || this.visualNovel.active() || this.movePlan.isPlanning(),
      shift: event.shiftKey,
      picking: this.effectTargeting.isPicking(),
      forced: this.firstPerson.forced(),
      lattice: this.firstPerson.lattice(),
      looking: this.looking.away(),
    });
    if (!command) return;
    event.preventDefault();
    this.run(command);
  }

  protected move(move: FirstPersonMove): void {
    void this.firstPerson.walk(move);
  }

  protected turn(turn: 1 | -1): void {
    void this.firstPerson.turn(turn);
  }

  protected door(): void {
    this.firstPerson.toggleDoorAhead();
  }

  protected torch(): void {
    this.firstPerson.toggleTorch();
  }

  protected exit(): void {
    this.firstPerson.exitSeat();
  }

  private run(command: FirstPersonCommand): void {
    switch (command.kind) {
      case 'move':
        this.move(command.move);
        return;
      case 'turn':
        this.turn(command.turn);
        return;
      case 'door':
        this.door();
        return;
      case 'torch':
        this.torch();
        return;
      case 'exit':
        this.exit();
        return;
      case 'target':
        this.targetAhead();
        return;
      case 'clearTargets':
        this.clearTargets();
        return;
      case 'endLook':
        this.looking.lookAhead();
        return;
      case 'castPicks':
        this.castPicks();
        return;
      case 'cancelPicks':
        this.cancelPicks();
        return;
    }
  }

  private targetAhead(): void {
    const ahead = this.pieceViews()
      .filter((view) => view.inLine && view.bearing <= TARGET_CONE_DEG)
      .sort((a, b) => a.bearing - b.bearing)[0];
    if (ahead) this.aim(ahead.id);
  }

  private glideTo(target: FirstPersonPose | null): void {
    this.stopGlide();
    const from = this.shown();
    const before = this.seenBefore();
    if (!target || !from || !this.motion.enabled() || this.tooFar(from, target)) {
      this.carried.set(null);
      this.shown.set(target);
      return;
    }
    this.carried.set(unionOf(before, this.carried()));
    const turn = signedTurnDeg(target.yaw - from.yaw);
    const started = performance.now();
    const step = (now: number): void => {
      const along = Math.min(1, (now - started) / GLIDE_MS);
      const eased = along * (2 - along);
      if (along >= 1) {
        this.frame = null;
        this.carried.set(null);
        this.shown.set(target);
        return;
      }
      this.shown.set({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        z: from.z + (target.z - from.z) * eased,
        yaw: from.yaw + turn * eased,
      });
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private tooFar(from: FirstPersonPose, to: FirstPersonPose): boolean {
    const turn = Math.abs(signedTurnDeg(to.yaw - from.yaw));
    return Math.hypot(to.x - from.x, to.y - from.y) > SNAP_CELLS * this.gridSize() || turn > SNAP_TURN_DEG;
  }

  private stopGlide(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private watchSize(): void {
    const element = this.host.nativeElement;
    const read = (): void => {
      this.width.set(element.clientWidth || window.innerWidth);
      this.height.set(element.clientHeight || window.innerHeight);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}

/**
 * The cells either set holds. With nothing in the first, which leaves the scene unlimited, or a
 * second of another board's size, the first is left as it is.
 */
function unionOf(seen: CellBits | null, more: CellBits | null): CellBits | null {
  if (!seen || !more || seen.count !== more.count) return seen;
  const both = seen.copy();
  both.or(more);
  return both;
}

/**
 * A piece seen through water, faded into it as far off as it stands, the way the walls and the
 * floor darken into the depths: in murky water a piece a few cells away is a shape and no more.
 */
function inTheMurk(style: QuadStyle, shade: number): QuadStyle {
  return shade > 0 ? { ...style, opacity: `${Math.round((1 - shade) * 1000) / 1000}` } : style;
}
