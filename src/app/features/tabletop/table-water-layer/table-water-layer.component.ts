import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WaterService } from '@axe/application/tabletop/water.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { waterFloorLookOf, waterSurfaceLookOf } from '@axe/domain/tabletop/water/water-cells';
import { waterDepthShadeOf } from '@axe/domain/tabletop/water/water-depth';
import { flowCellsPerSecond, flowLayerOf } from '@axe/domain/tabletop/water/water-flow';
import { waterLightMaskOf } from '@axe/domain/tabletop/water/water-light-mask';
import {
  causticOpacity,
  deepWaterColor,
  dirtyWaterColor,
  glintOpacity,
  rgbTripletOf,
  scumColorOf,
  scumOpacity,
  scumRimColorOf,
  shadedWaterColor,
  siltColorOf,
  siltOpacity,
  waterFloorWash,
  waterMurkLayer,
  waterSideWash,
  waterSurfaceWash,
} from '@axe/domain/tabletop/water/water-look';
import { type WaterSheet, waterSheetsOf } from '@axe/domain/tabletop/water/water-sheets';
import { waterShoreOf } from '@axe/domain/tabletop/water/water-shore';
import { waterSidesOf } from '@axe/domain/tabletop/water/water-sides';
import {
  causticTileUrl,
  cloudTileUrl,
  depthShadeUrl,
  lightMaskUrl,
  scumRimTileUrl,
  scumTileUrl,
  streakTileUrl,
} from '@axe/features/tabletop/table-water-layer/caustic-texture';
import { lotusTileUrl } from '@axe/features/tabletop/table-water-layer/lotus-texture';
import { WaterPhaseDirective } from '@axe/features/tabletop/table-water-layer/water-phase.directive';
import { Z_OFFSET_AMBIENCE_PX } from '@axe/ui/tabletop/z-offset';

/** How far over its floor the floor of the water is drawn, so it lies on the ground rather than in it. */
const FLOOR_LIFT_PX = Z_OFFSET_AMBIENCE_PX + 0.01;
/**
 * How far over the floor a surface standing no higher than the floor is drawn: over the net of
 * light, and still under the dark painted on the floor.
 */
const FLAT_SURFACE_LIFT_PX = Z_OFFSET_AMBIENCE_PX + 0.05;
/** How far over the surface the waves breaking on the shore are drawn, so the surface does not swallow them. */
const SHORE_LIFT_PX = 0.4;
/** How far out from the shore the waves run in from, in cells. */
const SHORE_REACH_CELLS = 0.7;
/** How many cells one repeat of the net of light spans on the floor. */
const CAUSTIC_CELLS = 2.6;
/** The second net is drawn larger, so the two never line up as they cross. */
const SECOND_NET_SCALE = 1.45;
/** The glints on the surface are the same net, larger still. */
const GLINT_SCALE = 2.2;
/** How many cells one repeat of the clouds of silt spans. */
const SILT_CELLS = 4.2;
/** How many cells one repeat of the scum spans. */
const SCUM_CELLS = 2.1;
/** How many cells one repeat of the floating leaves spans: a leaf comes to about half a cell across. */
const LEAF_CELLS = 3.6;
/** How many cells one repeat of the streaks of a current spans. */
const STREAK_CELLS = 3;

/** The floor under a stretch of water, ready to draw. */
export interface WaterFloorView {
  readonly key: string;
  /** Where the sheet's box stands, which the nets on it are laid from so they meet across sheets. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clipPath: string;
  readonly transform: string;
  readonly wash: string;
  readonly causticOpacity: number;
}

/** The surface over a stretch of water, ready to draw. */
export interface WaterSurfaceView {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clipPath: string;
  readonly transform: string;
  /** The colour of the surface itself, over the colour of the depths under it. */
  readonly background: string;
  /** The picture the surface is masked with in the dark, or null where all of it shows. */
  readonly mask: string | null;
  readonly glintOpacity: number;
  /**
   * What lies on the surface or drifts in the water, bottom to top: clouds of silt, scum and its
   * rim, the streaks of a current, floating leaves.
   */
  readonly layers: readonly WaterSurfaceLayer[];
}

/** One pattern on a sheet of water, ready to draw: still, drifting of its own, or carried by the flow. */
export interface WaterSurfaceLayer {
  readonly key: 'silt' | 'scum' | 'scum-rim' | 'flow' | 'leaves';
  readonly classes: string;
  readonly style: Readonly<Record<string, string>>;
}

/** A pattern laid on a sheet: its picture, worn as a mask by a colour or shown as it is, and how strongly. */
interface PatternSpec {
  readonly key: WaterSurfaceLayer['key'];
  readonly url: string;
  readonly tilePx: number;
  readonly opacity: number;
  /** The colour a mask is worn by; empty to show the picture in its own colours. */
  readonly color: string;
  /** How it moves on still water: drifting of its own, or not at all. */
  readonly drift: string;
  readonly filter?: string | null;
}

/** One side of the water, ready to draw. */
export interface WaterSideView {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly transform: string;
  /** The cut along a bottom that slants with the ground, or null for a level one. */
  readonly clipPath: string | null;
  /**
   * How tall its colour is laid, down from the surface to the water's own floor, so that sides of
   * different heights are the same colour at the same depth.
   */
  readonly washHeight: number;
  readonly wash: string;
  readonly opacity: number;
}

/** One stretch of shore the waves break on, ready to draw. */
export interface WaterShoreView {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly transform: string;
  readonly opacity: number;
}

/** One repeating net of light, sized and moved as one layer. */
export interface WaterNetView {
  readonly tilePx: number;
  readonly url: string;
}

/**
 * The water on the table, drawn whole.
 *
 * Under every body of water lying on its own level floor, the floor is darkened and crossed by
 * a moving net of light. At its surface a clear sheet stands, taking the colour of the depths
 * cell by cell as the ground under it falls away, so a beach shelves out into deep water. Along
 * its banks the sides go down to whatever stands beside them, and where land rises to the
 * surface the waves come in. Cells of water that look alike are drawn together, so a pond laid
 * as many areas shows no seam between them.
 *
 * Nothing in it takes the pointer. The areas the water was laid as stay where they are and are
 * what is picked up, moved and right-clicked.
 */
@Component({
  selector: 'table-water-layer',
  templateUrl: './table-water-layer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WaterPhaseDirective],
  host: { class: 'pointer-events-none absolute top-0 left-0 transform-3d' },
})
export class TableWaterLayerComponent {
  private readonly water = inject(WaterService);
  private readonly renderLite = inject(RenderLiteService);

  /** Whether the second net of light and the glints are left out, for a table drawn the lighter way. */
  protected readonly lite = this.renderLite.active;

  protected readonly netPosition = netPosition;

  protected readonly nets = computed<{ first: WaterNetView; second: WaterNetView; glint: WaterNetView } | null>(() => {
    const grid = this.water.grid();
    const url = causticTileUrl();
    if (!grid || url.length < 1) return null;
    const tilePx = Math.round(grid.sizePx * CAUSTIC_CELLS);
    return {
      first: { tilePx, url },
      second: { tilePx: Math.round(tilePx * SECOND_NET_SCALE), url },
      glint: { tilePx: Math.round(tilePx * GLINT_SCALE), url },
    };
  });

  /** The floors of water lying on its own level floor. Over ground risen under the water, the ground is the floor. */
  protected readonly floorViews = computed<WaterFloorView[]>(() => {
    const grid = this.water.grid();
    const cells = this.water.cells();
    if (!grid || cells.size < 1) return [];
    const flat = [...cells.values()].filter((cell) => cell.flat);
    return waterSheetsOf(grid, flat, waterFloorLookOf).map((sheet) => ({
      key: sheet.key,
      left: sheet.left,
      top: sheet.top,
      width: sheet.width,
      height: sheet.height,
      clipPath: clipOf(sheet),
      transform: `translate3d(${sheet.left}px, ${sheet.top}px, ${sheet.floorPx + FLOOR_LIFT_PX}px)`,
      wash: waterFloorWash(dirtyWaterColor(sheet.color, sheet.dirt), sheet.density),
      causticOpacity: causticOpacity(
        sheet.density,
        sheet.turbidity,
        (sheet.surfacePx - sheet.floorPx) / Math.max(grid.sizePx, 1)
      ),
    }));
  });

  protected readonly surfaceViews = computed<WaterSurfaceView[]>(() => {
    const grid = this.water.grid();
    const cells = this.water.cells();
    const light = this.water.light();
    if (!grid || cells.size < 1) return [];
    return waterSheetsOf(grid, cells.values(), waterSurfaceLookOf).map((sheet) => {
      const lightOf = (index: number) => light?.get(index) ?? 1;
      const raised = sheet.cells.some((index) => (cells.get(index)?.floorPx ?? sheet.surfacePx) < sheet.surfacePx);
      const mask = raised && light ? waterLightMaskOf(grid, sheet, lightOf) : null;
      const maskUrl = mask ? lightMaskUrl(mask) : null;
      const lit = raised && light ? brightestOf(sheet.cells, lightOf) : 1;
      const surfaceZ = raised ? sheet.surfacePx : sheet.floorPx + FLAT_SURFACE_LIFT_PX;
      const depths = waterDepthShadeOf(
        grid,
        sheet,
        (index) => (sheet.surfacePx - (cells.get(index)?.floorPx ?? sheet.surfacePx)) / Math.max(grid.sizePx, 1),
        sheet.turbidity
      );
      const tone = shadedWaterColor(dirtyWaterColor(sheet.color, sheet.dirt), lit);
      const deep = deepWaterColor(tone);
      const silt = siltOpacity(sheet.turbidity);
      const scum = scumOpacity(sheet.dirt);
      const g = grid.sizePx;
      const patterns: PatternSpec[] = [
        {
          key: 'silt',
          url: cloudTileUrl(),
          tilePx: Math.round(g * SILT_CELLS),
          opacity: silt,
          color: siltColorOf(tone),
          drift: 'water-net water-silt',
        },
        {
          key: 'scum',
          url: scumTileUrl(),
          tilePx: Math.round(g * SCUM_CELLS),
          opacity: scum,
          color: shadedWaterColor(scumColorOf(sheet.color), lit),
          drift: 'water-net water-scum',
        },
        {
          key: 'scum-rim',
          url: scumRimTileUrl(),
          tilePx: Math.round(g * SCUM_CELLS),
          opacity: Math.round(scum * 0.8 * 1000) / 1000,
          color: shadedWaterColor(scumRimColorOf(sheet.color), lit),
          drift: 'water-net water-scum',
        },
        {
          key: 'flow',
          url: sheet.flowSpeed > 0 ? streakTileUrl() : '',
          tilePx: Math.round(g * STREAK_CELLS),
          opacity: Math.round((0.16 + 0.34 * sheet.flowSpeed) * (1 - 0.5 * sheet.turbidity) * lit * 1000) / 1000,
          color: '#ffffff',
          drift: '',
        },
        {
          key: 'leaves',
          url: lotusTileUrl(sheet.leaves),
          tilePx: Math.round(g * LEAF_CELLS),
          opacity: 1,
          color: '',
          drift: '',
          filter: lit < 0.999 ? `brightness(${Math.round(lit * 1000) / 1000})` : null,
        },
      ];
      return {
        key: sheet.key,
        left: sheet.left,
        top: sheet.top,
        width: sheet.width,
        height: sheet.height,
        clipPath: clipOf(sheet),
        transform: `translate3d(${sheet.left}px, ${sheet.top}px, ${surfaceZ}px)`,
        background: [
          waterSurfaceWash(tone, sheet.density),
          waterMurkLayer(tone, sheet.turbidity),
          depthLayerOf(depths, deep),
        ]
          .filter((layer) => layer.length > 0)
          .join(', '),
        mask: maskUrl ? `url(${maskUrl})` : null,
        glintOpacity: glintOpacity(sheet.density, sheet.turbidity, sheet.dirt),
        layers: patterns
          .filter((pattern) => pattern.url.length > 0 && pattern.opacity > 0.01)
          .map((pattern) => surfaceLayerOf(pattern, sheet, g)),
      };
    });
  });

  protected readonly sideViews = computed<WaterSideView[]>(() => {
    const grid = this.water.grid();
    const cells = this.water.cells();
    if (!grid || cells.size < 1) return [];
    const light = this.water.light();
    return waterSidesOf(grid, cells, this.water.groundAt).map((side) => {
      const length = Math.hypot(side.x1 - side.x0, side.y1 - side.y0);
      const angle = Math.atan2(side.y1 - side.y0, side.x1 - side.x0);
      const lit = light ? Math.round((light.get(side.index) ?? 1) * 1000) / 1000 : 1;
      const height = side.topPx - side.bottomPx;
      return {
        key: side.key,
        width: length,
        height,
        clipPath: slantOf(length, height, side.bottomStartPx - side.bottomPx, side.bottomEndPx - side.bottomPx),
        washHeight: Math.max(side.topPx - side.floorPx, height),
        transform:
          `translate3d(${side.x0}px, ${side.y0}px, ${side.bottomPx}px)` +
          ` rotateZ(${angle}rad) rotateX(-90deg) translateY(-100%)`,
        wash: waterSideWash(
          shadedWaterColor(dirtyWaterColor(side.color, cells.get(side.index)?.dirt ?? 0), lit),
          side.density,
          cells.get(side.index)?.turbidity ?? 0
        ),
        opacity: lit,
      };
    });
  });

  /**
   * The waves breaking where land rises to the surface. Each lies on the surface along one side of
   * a cell, reaching out into the water, which lies to its right as it runs: the strip's own
   * downward side is the sea, and the waves run up it to the shore at its top.
   */
  protected readonly shoreViews = computed<WaterShoreView[]>(() => {
    const grid = this.water.grid();
    const cells = this.water.cells();
    if (!grid || cells.size < 1) return [];
    const light = this.water.light();
    return waterShoreOf(grid, cells, this.water.groundOf).map((shore) => {
      const angle = Math.atan2(shore.y1 - shore.y0, shore.x1 - shore.x0);
      return {
        key: shore.key,
        width: Math.hypot(shore.x1 - shore.x0, shore.y1 - shore.y0),
        height: grid.sizePx * SHORE_REACH_CELLS,
        transform: `translate3d(${shore.x0}px, ${shore.y0}px, ${shore.surfacePx + SHORE_LIFT_PX}px) rotateZ(${angle}rad)`,
        opacity: light ? Math.round((light.get(shore.index) ?? 1) * 1000) / 1000 : 1,
      };
    });
  });
}

/**
 * Where a net of light is laid on a sheet so that its repeats fall where they fall on every other
 * sheet: measured from the corner of the table rather than from the corner of the sheet. The net
 * stands a whole tile out past the sheet on every side, which is a whole repeat and changes nothing.
 */
export function netPosition(net: WaterNetView, sheet: { left: number; top: number }): string {
  const along = (offset: number) => ((-offset % net.tilePx) + net.tilePx) % net.tilePx;
  return `${Math.round(along(sheet.left) * 100) / 100}px ${Math.round(along(sheet.top) * 100) / 100}px`;
}

/**
 * The cut that slants the bottom of a side with the ground under it, or null where the bottom is
 * level. The face stands from its lower end; `startRise` and `endRise` are how far above that its
 * bottom stands at either end.
 */
function slantOf(length: number, height: number, startRise: number, endRise: number): string | null {
  if (startRise < 0.5 && endRise < 0.5) return null;
  const at = (value: number) => `${Math.round(value * 100) / 100}px`;
  return `polygon(0 0, ${at(length)} 0, ${at(length)} ${at(height - endRise)}, 0 ${at(height - startRise)})`;
}

function clipOf(sheet: WaterSheet): string {
  return `path('${sheet.path}')`;
}

/**
 * One pattern on a sheet, ready to draw. On still water it stands a tile out past the sheet on
 * every side and drifts of its own, or lies still; on flowing water it is turned to run the way the
 * water flows and carried along that way. Either way it is laid from the corner of the table, so
 * it meets itself across the join with the sheet beside.
 */
function surfaceLayerOf(pattern: PatternSpec, sheet: WaterSheet, gridSize: number): WaterSurfaceLayer {
  const tile = pattern.tilePx;
  const picture: Record<string, string> = pattern.color
    ? {
        'background-color': pattern.color,
        'mask-image': `url(${pattern.url})`,
        'mask-size': `${tile}px ${tile}px`,
      }
    : { 'background-image': `url(${pattern.url})`, 'background-size': `${tile}px ${tile}px` };
  const common: Record<string, string> = {
    ...picture,
    '--water-tile': `${tile}px`,
    opacity: `${pattern.opacity}`,
    ...(pattern.filter ? { filter: pattern.filter } : {}),
  };
  const place = (position: string): Record<string, string> =>
    pattern.color ? { 'mask-position': position } : { 'background-position': position };

  if (sheet.flowSpeed > 0) {
    const layer = flowLayerOf(sheet, tile, sheet.flowDirection, flowCellsPerSecond(sheet.flowSpeed), gridSize);
    return {
      key: pattern.key,
      classes: 'water-flow',
      style: {
        ...common,
        ...place(layer.position),
        left: `${layer.left}px`,
        top: `${layer.top}px`,
        width: `${layer.size}px`,
        height: `${layer.size}px`,
        '--flow-angle': `${sheet.flowDirection - 90}deg`,
        '--flow-seconds': `${layer.seconds}s`,
      },
    };
  }
  return {
    key: pattern.key,
    classes: pattern.drift,
    style: { ...common, ...place(netPosition({ tilePx: tile, url: pattern.url }, sheet)), inset: `${-tile}px` },
  };
}

/** The colour of the depths as a layer of the surface: one colour for one depth, or a picture of it. */
function depthLayerOf(depths: ReturnType<typeof waterDepthShadeOf>, deepColor: string): string {
  const rgb = rgbTripletOf(deepColor);
  if (!rgb) return '';
  if ('alpha' in depths && typeof depths.alpha === 'number') {
    if (depths.alpha <= 0) return '';
    const paint = `rgba(${rgb}, ${depths.alpha})`;
    return `linear-gradient(${paint}, ${paint})`;
  }
  if (!('cols' in depths)) return '';
  const url = depthShadeUrl(depths, rgb.split(', ').map(Number) as [number, number, number]);
  return url ? `url(${url})` : '';
}

/**
 * The light of the brightest cell of a sheet. The mask fades the rest out from there, so the
 * colour is darkened only as far as the best-lit part of the sheet is dark.
 */
function brightestOf(cells: readonly number[], lightOf: (index: number) => number): number {
  let best = 0;
  for (const index of cells) best = Math.max(best, lightOf(index));
  return best;
}
