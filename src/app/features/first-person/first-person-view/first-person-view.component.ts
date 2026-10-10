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
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { FirstPersonProp, FirstPersonPropsService } from '@axe/application/tabletop/first-person-props.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BUFF_BADGES_PER_ROW, BuffBadge, toBuffBadges } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeNumbersOf, selectPieceGauges } from '@axe/domain/character/piece-gauge';
import { DataElement } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { depthOf, eyeFrameOf, lateralOf } from '@axe/domain/tabletop/first-person/first-person-clip';
import {
  FirstPersonMove,
  FirstPersonPose,
  headingVector,
} from '@axe/domain/tabletop/first-person/first-person-lattice';
import {
  FIRST_PERSON_FOV_DEG,
  FirstPersonQuad,
  firstPersonScene,
} from '@axe/domain/tabletop/first-person/first-person-scene';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt, CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { boardSurfaceOf, surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { EffectTargetOverlayComponent } from '@axe/features/effect/effect-target-overlay/effect-target-overlay.component';
import {
  EffectEye,
  TableEffectOverlayComponent,
} from '@axe/features/effect/table-effect-overlay/table-effect-overlay.component';
import { FirstPersonFogAirComponent } from '@axe/features/first-person/first-person-fog-air/first-person-fog-air.component';
import { facingNameOf, isHexLattice, padRows } from '@axe/features/first-person/first-person-hud';
import { FirstPersonCommand, firstPersonKeyDown } from '@axe/features/first-person/first-person-keys';
import {
  glowStyle,
  lyingSamples,
  propClip,
  PropShape,
  propStyle,
} from '@axe/features/first-person/first-person-prop-style';
import { FirstPersonRangeComponent } from '@axe/features/first-person/first-person-range/first-person-range.component';
import {
  billboardHudTransform,
  billboardLiftPx,
  billboardStyle,
  billboardTextScale,
  blurFilter,
  cameraTransform,
  farBlurPx,
  litShade,
  perspectivePx,
  pictureTopPercent,
  pieceChromeBottomPercent,
  pieceChromeHeightPx,
  pieceImageFilter,
  planeQuadStyle,
  projectedScaleOf,
  QuadStyle,
  scaleOf,
  shadeFor,
  wallQuadStyle,
} from '@axe/features/first-person/first-person-style';
import { FogAirLayer, fogAirLayers } from '@axe/features/tabletop/fog-of-war/fog-air-layers';
import { FOG_AIR_SHEET_MARGIN } from '@axe/features/tabletop/fog-of-war/fog-air-sheet';
import { rangeQuadrantCells } from '@axe/features/tabletop/range/range-paint';
import { TableWeatherOverlayComponent } from '@axe/features/tabletop/table-weather-overlay/table-weather-overlay.component';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { paintMinimap } from '@axe/infrastructure/first-person/minimap-painter';
import { MAX_MULTI_ANGLE_RESOURCE_GAUGES } from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { TranslocoModule } from '@jsverse/transloco';

const NEAR_CELLS = 0.05;
const GLIDE_MS = 160;
const SNAP_CELLS = 3;
const SNAP_TURN_DEG = 135;
const COMPASS_TICKS: readonly number[] = Array.from({ length: 24 }, (_, index) => index * 15);
const TARGET_CONE_DEG = 20;
const BOARD_STEP_CELLS = 0.25;
const EFFECT_LIFT_CELLS = 0.15;
const EFFECT_RISE_CELLS = 0.3;
const PIECE_WIDE_RATIO = 0.9;
const PIECE_TALL_RATIO = 1.5;
/** The sky over a table that has no picture to show, darkest overhead and palest at the horizon. */
const NIGHT_SKY =
  'linear-gradient(to bottom, #04060b 0%, #0b1220 32%, #1c2840 49%, #222f47 50%, #10161f 56%, #06080c 100%)';
/** How far below the top of the view what is told about a near piece keeps, clear of the toolbars. */
const CHROME_TOP_MARGIN_PX = 64;
/** How far over the floor a range area is laid, clear of the floor and of anything lying on it. */
const RANGE_LIFT_PX = 0.75;
/** The width the view is laid out for before it has been measured. */
const DEFAULT_VIEW_WIDTH_PX = 1280;

interface QuadView {
  id: string;
  cell: number;
  kind: FirstPersonQuad['kind'];
  tone: string;
  remembered: boolean;
  style: QuadStyle;
}

interface GaugeView {
  id: string;
  name: string;
  initial: string;
  percent: number;
  color: string;
  numbers: string;
}

interface PieceView {
  id: string;
  name: string;
  label: string;
  url: string;
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
  imageFilter: string | null;
}

interface PropView extends FirstPersonProp {
  fill: boolean;
  style: QuadStyle;
}

interface GlowView {
  id: string;
  style: QuadStyle;
}

interface RangeView {
  id: string;
  range: RangeArea;
  style: QuadStyle;
}

interface BeamView {
  id: string;
  width: number;
  height: number;
  clip: string;
  background: string;
  fins: string[];
}

interface FogAirView {
  id: number;
  layer: FogAirLayer;
  style: QuadStyle;
}

interface SkyView {
  background: string;
  backdrops: { id: string; url: string; opacity: number }[];
  /** A night sky shading to a haze at the horizon, for a table with no picture of its own to show. */
  gradient: string | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'first-person-view',
  templateUrl: './first-person-view.component.html',
  host: {
    class: 'absolute inset-0 block select-none overflow-hidden bg-black',
    '(document:keydown)': 'onKeydown($event)',
  },
  imports: [
    TranslocoModule,
    EffectTargetOverlayComponent,
    FirstPersonFogAirComponent,
    FirstPersonRangeComponent,
    TableEffectOverlayComponent,
    TableWeatherOverlayComponent,
  ],
})
export class FirstPersonViewComponent {
  protected readonly firstPerson = inject(FirstPersonService);
  private readonly propsService = inject(FirstPersonPropsService);
  private readonly playback = inject(EffectPlaybackService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly effectTargeting = inject(EffectTargetingService);
  private readonly selection = inject(SelectionSignalService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly motion = inject(MotionService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly modal = inject(ModalService);
  private readonly movePlan = inject(MovePlanService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly minimapCanvas = viewChild<ElementRef<HTMLCanvasElement>>('minimap');

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
    this.watchSize();
    this.destroyRef.onDestroy(() => this.stopGlide());
  }

  protected readonly gridSize = computed(() => this.firstPerson.table()?.gridSize ?? 0);

  protected readonly scale = computed(() => scaleOf(this.gridSize()));

  protected readonly perspective = computed(() =>
    perspectivePx(this.width() || DEFAULT_VIEW_WIDTH_PX, FIRST_PERSON_FOV_DEG)
  );

  protected readonly camera = computed(() => {
    const pose = this.shown();
    return pose ? cameraTransform(pose, this.scale(), this.perspective()) : 'none';
  });

  protected readonly effectEye = computed<EffectEye | null>(() => {
    const pose = this.shown();
    const gridSize = this.gridSize();
    if (!pose || gridSize <= 0) return null;
    return {
      rotation: { x: 90, y: 0, z: -pose.yaw },
      liftPx: gridSize * EFFECT_LIFT_CELLS,
      risePx: gridSize * EFFECT_RISE_CELLS,
    };
  });

  protected readonly effectScale = computed(() => {
    const scale = this.scale();
    return `scale3d(${scale}, ${scale}, ${scale})`;
  });

  protected readonly shake = this.playback.shake;

  protected readonly flash = this.playback.flash;

  private readonly quads = computed<FirstPersonQuad[]>(() => {
    const pose = this.shown();
    const world = this.firstPerson.world();
    const grid = this.firstPerson.grid();
    if (!pose || !world || !grid) return [];
    return firstPersonScene({
      world,
      grid,
      pose,
      seen: this.drawnSeen(),
      depthPx: this.firstPerson.depthPx(),
      nearPx: NEAR_CELLS * this.gridSize(),
    });
  });

  protected readonly quadViews = computed<QuadView[]>(() => {
    this.objectChange.fileVersion();
    const scale = this.scale();
    const depth = this.firstPerson.depthPx();
    const clear = this.firstPerson.clearPx();
    const grid = this.firstPerson.grid();
    return this.quads().map((quad) => {
      const url = this.urlOf(quad.image);
      const remembered = this.firstPerson.tierOfCell(quad.cell) === 'dim';
      const away = shadeFor(quad.depth, depth);
      const shade = remembered || !grid || quad.cell < 0 ? away : litShade(away, this.lightOn(grid, quad));
      const drawn =
        quad.kind === 'wall'
          ? wallQuadStyle(quad, scale, url, shade, remembered)
          : planeQuadStyle(quad, scale, url, shade, remembered);
      const blur = url ? blurFilter(farBlurPx(quad.depth, clear, depth)) : null;
      const style = blur ? { ...drawn, filter: blur } : drawn;
      return { id: quad.id, cell: quad.cell, kind: quad.kind, tone: toneOf(quad), remembered, style };
    });
  });

  /** Width over height of each piece's picture, learned as it loads, so its top can be found in the box. */
  private readonly pictureAspects = signal<ReadonlyMap<string, number>>(new Map());

  /** Learns the proportions of a piece's picture once it has loaded. */
  protected notePictureAspect(url: string, event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) return;
    const aspect = image.naturalWidth / image.naturalHeight;
    if (this.pictureAspects().get(url) === aspect) return;
    this.pictureAspects.update((aspects) => new Map(aspects).set(url, aspect));
  }

  protected readonly pieceViews = computed<PieceView[]>(() => {
    const pose = this.shown();
    const viewer = this.firstPerson.piece();
    const gridSize = this.gridSize();
    if (!pose || !viewer || gridSize <= 0) return [];
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.fileVersion();
    this.uiSignal.targetChange();
    this.objectChange.trackMyCursor();
    this.objectChange.collectionOf('data')();
    const master = this.rolePermission.canSeeHidden;
    const picks = this.effectTargeting.picks();
    const eye = eyeFrameOf(pose);
    const scale = this.scale();
    const perspective = this.perspective();
    const viewHeight = this.height();
    const aspects = this.pictureAspects();
    const clear = this.firstPerson.clearPx();
    const reach = this.firstPerson.depthPx();
    const sight = this.firstPerson.sight();
    const grid = this.firstPerson.grid();
    const views: PieceView[] = [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (piece.identifier === viewer.identifier) continue;
      this.objectChange.versionOf(piece.identifier)();
      if (!piece.isVisibleOnTable || surfaceOf(piece) !== 'floor' || boardSurfaceOf(piece) !== '') continue;
      if (!this.vision.isTokenVisible(piece)) continue;
      const size = Math.max(1, piece.size) * gridSize;
      const centre = { x: piece.location.x + size / 2, y: piece.location.y + size / 2 };
      if (!this.inSight(pose, centre)) continue;
      const badges = this.badgesOf(piece);
      const depth = depthOf(eye, centre);
      const tall = size * PIECE_TALL_RATIO;
      const base = piece.posZ + piece.altitude * gridSize;
      const lifted = base + billboardLiftPx(base, pose.z, depth, perspective, viewHeight);
      const textScale = billboardTextScale(depth, scale, perspective);
      const gauges = this.gaugesOf(piece);
      const label = piece.hideName && !master ? '' : piece.name;
      const pick = picks.indexOf(piece.identifier) + 1;
      const chromeRows = { badges: badges.length > 0, gauges: gauges.length, label: label !== '' || pick > 0 };
      views.push({
        id: piece.identifier,
        name: piece.name,
        label,
        url: piece.imageFile.url,
        targeted: piece.targeted,
        pick,
        bearing: Math.abs((Math.atan2(lateralOf(eye, centre), depth) * 180) / Math.PI),
        inLine: !sight || !grid || sight.get(cellIndexAt(grid, centre.x, centre.y)),
        gauges,
        badges: badges.slice(0, BUFF_BADGES_PER_ROW),
        moreBadges: Math.max(0, badges.length - BUFF_BADGES_PER_ROW),
        style: billboardStyle({ ...centre, z: lifted }, size * PIECE_WIDE_RATIO, tall, pose.yaw, scale),
        hud: billboardHudTransform(textScale),
        chromeBottom: pieceChromeBottomPercent({
          pictureTop: pictureTopPercent(PIECE_WIDE_RATIO / PIECE_TALL_RATIO, aspects.get(piece.imageFile.url)),
          heightPx: tall,
          baseZ: lifted,
          eyeZ: pose.z,
          depthPx: depth,
          perspective,
          viewHeightPx: viewHeight,
          chromeScreenPx: pieceChromeHeightPx(chromeRows) * textScale * projectedScaleOf(depth, scale, perspective),
          marginPx: CHROME_TOP_MARGIN_PX,
        }),
        imageFilter: pieceImageFilter(
          this.vision.objectBrightness(centre.x, centre.y, size / 2, false, base),
          piece.targeted,
          farBlurPx(depth, clear, reach)
        ),
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

  private readonly props = computed(() => this.propsService.props());

  private readonly glows = computed(() => this.propsService.glows());

  protected readonly propViews = computed<PropView[]>(() => {
    const pose = this.shown();
    const gridSize = this.gridSize();
    if (!pose || gridSize <= 0) return [];
    const eye = eyeFrameOf(pose);
    const scale = this.scale();
    const clear = this.firstPerson.clearPx();
    const reach = this.firstPerson.depthPx();
    const views: PropView[] = [];
    for (const prop of this.props()) {
      const clip = propClip(prop, eye, gridSize * NEAR_CELLS, scale);
      if (clip === null || !this.propInSight(pose, prop)) continue;
      const placed = propStyle(prop, pose.yaw, scale);
      const blur = blurFilter(farBlurPx(depthOf(eye, prop), clear, reach));
      const style = blur ? { ...placed, filter: blur } : placed;
      views.push({
        ...prop,
        fill: prop.what === 'mask' || prop.what === 'board' || prop.what === 'trigger',
        style: clip ? { ...style, clipPath: clip } : style,
      });
    }
    return views;
  });

  protected readonly gridType = computed(() => this.firstPerson.table()?.gridType ?? GridType.SQUARE);

  /**
   * The range areas on the table that reach ground in sight, each laid on the floor in a square
   * as wide as its canvases, cut at the eye where it runs under it.
   */
  protected readonly rangeViews = computed<RangeView[]>(() => {
    const pose = this.shown();
    const gridSize = this.gridSize();
    if (!pose || gridSize <= 0) return [];
    this.objectChange.collectionOf(RangeArea.aliasName)();
    const eye = eyeFrameOf(pose);
    const scale = this.scale();
    const views: RangeView[] = [];
    for (const range of this.objectStore.getObjects<RangeArea>(RangeArea)) {
      this.objectChange.versionOf(range.identifier)();
      if (!range.isVisibleOnTable) continue;
      const side = rangeQuadrantCells(range) * gridSize * 2;
      const footprint: PropShape = {
        kind: 'lie',
        x: range.location.x,
        y: range.location.y,
        z: range.posZ + range.altitude * gridSize + RANGE_LIFT_PX,
        width: side,
        height: side,
        rotate: 0,
      };
      const clip = propClip(footprint, eye, gridSize * NEAR_CELLS, scale);
      if (clip === null || !this.propInSight(pose, footprint)) continue;
      const style = propStyle(footprint, pose.yaw, scale);
      views.push({ id: range.identifier, range, style: clip ? { ...style, clipPath: clip } : style });
    }
    return views;
  });

  /**
   * The beams the table's cone lights throw, as the table stands them, for the lights hanging in
   * front of the eye and no further off than the view reaches. One hung over the eye itself would
   * stand through it, which a flat sheet cannot be drawn doing, so it is left out.
   */
  protected readonly beamViews = computed<BeamView[]>(() => {
    const pose = this.shown();
    const gridSize = this.gridSize();
    if (!pose || gridSize <= 0) return [];
    const eye = eyeFrameOf(pose);
    const reach = this.firstPerson.depthPx();
    return this.vision.lightBeams().flatMap((beam, index) => {
      const depth = depthOf(eye, beam.origin);
      if (depth < gridSize || depth > reach + beam.height) return [];
      return [
        {
          id: `${index}:${beam.origin.x}:${beam.origin.y}`,
          width: beam.width,
          height: beam.height,
          clip: beam.clip,
          background: `linear-gradient(to bottom, ${beam.color} 0%, transparent 88%)`,
          fins: beam.fins,
        },
      ];
    });
  });

  /**
   * The sheets of fog hanging over ground nobody has walked to, each laid across the board at its
   * height as the table hangs it, cut at the eye where it runs over the viewer. None without fog.
   */
  protected readonly fogAirViews = computed<FogAirView[]>(() => {
    const pose = this.shown();
    const table = this.firstPerson.table();
    const gridSize = this.gridSize();
    if (!pose || !table || gridSize <= 0 || !this.vision.overlayVision()?.fogEnabled) return [];
    const width = table.width * gridSize;
    const height = table.height * gridSize;
    const eye = eyeFrameOf(pose);
    const scale = this.scale();
    return fogAirLayers(gridSize).flatMap((layer, index) => {
      const footprint: PropShape = {
        kind: 'lie',
        x: width / 2,
        y: height / 2,
        z: layer.heightPx,
        width: width * (1 + FOG_AIR_SHEET_MARGIN * 2),
        height: height * (1 + FOG_AIR_SHEET_MARGIN * 2),
        rotate: 0,
      };
      const clip = propClip(footprint, eye, gridSize * NEAR_CELLS, scale);
      if (clip === null) return [];
      const style = propStyle(footprint, pose.yaw, scale);
      return [{ id: index, layer, style: clip ? { ...style, clipPath: clip } : style }];
    });
  });

  /**
   * What is seen above the walls and past the end of the view: the picture the table is laid
   * on, and over it the backdrops the table stands against, back to front. A table with neither
   * is given a night sky that lightens to a haze at the horizon, so the far end of the view fades
   * rather than stops; a table in the dark keeps the dark.
   */
  protected readonly sky = computed<SkyView | null>(() => {
    const table = this.firstPerson.table();
    if (!table) return null;
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
    () => -((this.shown()?.yaw ?? 0) / FIRST_PERSON_FOV_DEG) * (this.width() || DEFAULT_VIEW_WIDTH_PX)
  );

  protected readonly glowViews = computed<GlowView[]>(() => {
    const pose = this.shown();
    if (!pose) return [];
    const scale = this.scale();
    return this.glows()
      .filter((glow) => this.inSight(pose, glow))
      .map((glow) => ({ id: glow.id, style: glowStyle(glow, pose.yaw, scale) }));
  });

  protected readonly pieceName = computed(() => this.firstPerson.piece()?.name ?? '');

  protected readonly facing = computed(() => facingNameOf(this.firstPerson.pose()?.yaw ?? 0));

  protected readonly compassTurn = computed(() => -(this.shown()?.yaw ?? 0));

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

  protected aim(identifier: string): void {
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

  private inSight(pose: FirstPersonPose, centre: CellPoint): boolean {
    const grid = this.firstPerson.grid();
    const seen = this.drawnSeen();
    if (!grid) return false;
    const cell = cellIndexAt(grid, centre.x, centre.y);
    if (seen && (cell < 0 || !seen.get(cell))) return false;
    const depth = depthOf(eyeFrameOf(pose), centre);
    return depth > this.gridSize() * NEAR_CELLS * 4 && depth <= this.firstPerson.depthPx();
  }

  /** How brightly the table's lights fall on a face, read at the middle of the cell it is drawn for. */
  private lightOn(grid: CellGrid, quad: FirstPersonQuad): number {
    const centre = cellCenterOf(grid, quad.cell);
    const standing = quad.kind === 'wall' ? quad.basePx : quad.zPx;
    return this.vision.objectBrightness(centre.x, centre.y, 0, false, standing);
  }

  private propInSight(pose: FirstPersonPose, prop: PropShape): boolean {
    if (prop.kind === 'lie') return lyingSamples(prop, this.gridSize()).some((point) => this.inSight(pose, point));
    if (prop.kind === 'board') {
      const heading = headingVector(prop.rotate);
      const step = this.gridSize() * BOARD_STEP_CELLS;
      return this.inSight(pose, { x: prop.x - heading.x * step, y: prop.y - heading.y * step });
    }
    return this.inSight(pose, prop);
  }

  private urlOf(identifier: string): string {
    if (!identifier || identifier === 'imageIdentifier') return '';
    const image = this.imageService.getEmptyOr(identifier);
    return image.isEmpty ? '' : image.url;
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
    const turn = ((((target.yaw - from.yaw) % 360) + 540) % 360) - 180;
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
    const turn = Math.abs(((((to.yaw - from.yaw) % 360) + 540) % 360) - 180);
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

function toneOf(quad: FirstPersonQuad): string {
  if (quad.kind === 'wall') {
    if (quad.glass) return 'bg-sky-200/25';
    return quad.door ? 'bg-amber-900' : 'bg-stone-600';
  }
  if (quad.kind === 'floor') return 'bg-stone-800';
  if (quad.kind === 'ceiling') return 'bg-stone-950';
  return quad.glass ? 'bg-sky-200/20' : 'bg-stone-500';
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
