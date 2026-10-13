import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WaterService } from '@axe/application/tabletop/water.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { waterLightMaskOf } from '@axe/domain/tabletop/water/water-light-mask';
import {
  causticOpacity,
  glintOpacity,
  shadedWaterColor,
  waterFloorWash,
  waterSideWash,
  waterSurfaceWash,
} from '@axe/domain/tabletop/water/water-look';
import { type WaterSheet, waterSheetsOf } from '@axe/domain/tabletop/water/water-sheets';
import { waterSidesOf } from '@axe/domain/tabletop/water/water-sides';
import { causticTileUrl, lightMaskUrl } from '@axe/features/tabletop/table-water-layer/caustic-texture';
import { Z_OFFSET_AMBIENCE_PX } from '@axe/ui/tabletop/z-offset';

/** How far over its floor the floor of the water is drawn, so it lies on the ground rather than in it. */
const FLOOR_LIFT_PX = Z_OFFSET_AMBIENCE_PX + 0.01;
/**
 * How far over the floor a surface standing no higher than the floor is drawn: over the net of
 * light, and still under the dark painted on the floor.
 */
const FLAT_SURFACE_LIFT_PX = Z_OFFSET_AMBIENCE_PX + 0.05;
/** How many cells one repeat of the net of light spans on the floor. */
const CAUSTIC_CELLS = 2.6;
/** The second net is drawn larger, so the two never line up as they cross. */
const SECOND_NET_SCALE = 1.45;
/** The glints on the surface are the same net, larger still. */
const GLINT_SCALE = 2.2;

/** One body of water's sheet, ready to draw on the floor and at the surface. */
export interface WaterSheetView {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly clipPath: string;
  readonly floorTransform: string;
  readonly floorWash: string;
  readonly surfaceTransform: string;
  readonly surfaceWash: string;
  /** The picture the surface is masked with in the dark, or null where all of it shows. */
  readonly surfaceMask: string | null;
  readonly causticOpacity: number;
  readonly glintOpacity: number;
}

/** One side of the water, ready to draw. */
export interface WaterSideView {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly transform: string;
  readonly wash: string;
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
 * Under every body of water the floor is darkened and crossed by a moving net of light; at its
 * surface a clear sheet stands, and along its banks the sides go down to the floor. Cells of
 * water that look alike are drawn together, so a pond laid as many areas shows no seam between them.
 *
 * Nothing in it takes the pointer. The areas the water was laid as stay where they are and are
 * what is picked up, moved and right-clicked.
 */
@Component({
  selector: 'table-water-layer',
  templateUrl: './table-water-layer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute top-0 left-0 transform-3d' },
})
export class TableWaterLayerComponent {
  private readonly water = inject(WaterService);
  private readonly renderLite = inject(RenderLiteService);

  private readonly sheets = computed<WaterSheet[]>(() => {
    const grid = this.water.grid();
    const cells = this.water.cells();
    return grid && cells.size > 0 ? waterSheetsOf(grid, cells) : [];
  });

  /** Whether the second net of light and the glints are left out, for a table drawn the lighter way. */
  protected readonly lite = this.renderLite.active;

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

  protected readonly sheetViews = computed<WaterSheetView[]>(() => {
    const grid = this.water.grid();
    const light = this.water.light();
    if (!grid) return [];
    return this.sheets().map((sheet) => {
      const raised = sheet.surfacePx > sheet.floorPx;
      const lightOf = (index: number) => light?.get(index) ?? 1;
      const mask = raised && light ? waterLightMaskOf(grid, sheet, lightOf) : null;
      const maskUrl = mask ? lightMaskUrl(mask) : null;
      const surfaceColor =
        raised && light ? shadedWaterColor(sheet.color, brightestOf(sheet.cells, lightOf)) : sheet.color;
      const surfaceZ = raised ? sheet.surfacePx : sheet.floorPx + FLAT_SURFACE_LIFT_PX;
      return {
        key: sheet.key,
        width: sheet.width,
        height: sheet.height,
        clipPath: `path('${sheet.path}')`,
        floorTransform: `translate3d(${sheet.left}px, ${sheet.top}px, ${sheet.floorPx + FLOOR_LIFT_PX}px)`,
        floorWash: waterFloorWash(sheet.color, sheet.density),
        surfaceTransform: `translate3d(${sheet.left}px, ${sheet.top}px, ${surfaceZ}px)`,
        surfaceWash: waterSurfaceWash(surfaceColor, sheet.density),
        surfaceMask: maskUrl ? `url(${maskUrl})` : null,
        causticOpacity: causticOpacity(sheet.density),
        glintOpacity: glintOpacity(sheet.density),
      };
    });
  });

  protected readonly sideViews = computed<WaterSideView[]>(() => {
    const grid = this.water.grid();
    const cells = this.water.cells();
    if (!grid || cells.size < 1) return [];
    const light = this.water.light();
    return waterSidesOf(grid, cells).map((side) => {
      const length = Math.hypot(side.x1 - side.x0, side.y1 - side.y0);
      const angle = Math.atan2(side.y1 - side.y0, side.x1 - side.x0);
      const lit = light ? Math.round((light.get(side.index) ?? 1) * 1000) / 1000 : 1;
      return {
        key: side.key,
        width: length,
        height: side.topPx - side.bottomPx,
        transform:
          `translate3d(${side.x0}px, ${side.y0}px, ${side.bottomPx}px)` +
          ` rotateZ(${angle}rad) rotateX(-90deg) translateY(-100%)`,
        wash: waterSideWash(shadedWaterColor(side.color, lit), side.density),
        opacity: lit,
      };
    });
  });
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
