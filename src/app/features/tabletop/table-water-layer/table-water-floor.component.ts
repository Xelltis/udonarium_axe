import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AmbienceService } from '@axe/application/tabletop/ambience.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { causticOpacity, depthsWash, underwaterDeepColor } from '@axe/domain/tabletop/water/water-look';
import { causticTileUrl } from '@axe/features/tabletop/table-water-layer/caustic-texture';
import { translateZCss, Z_OFFSET_FOREGROUND_LAYERS_PX } from '@axe/ui/tabletop/z-offset';

/**
 * How many cells one repeat of the net of light spans on the floor. Larger than under a pond: the
 * surface is far overhead, and over a whole board a fine net reads as a pattern printed on it.
 */
const CAUSTIC_CELLS = 3.4;
const SECOND_NET_SCALE = 1.45;
/** How much fainter the net is than under a pond, laid over every cell of the board at once. */
const WHOLE_FLOOR_SHARE = 0.7;

/** The floor of a table under water, ready to draw. */
interface WaterFloorView {
  readonly wash: string;
  readonly opacity: number;
  readonly url: string;
  readonly tilePx: number;
  readonly secondTilePx: number;
}

/**
 * The floor of a table whose whole map is under water: darkened, and crossed by the moving net
 * of light the surface far overhead throws down.
 *
 * It wears the shape of the board, so a hex table keeps its outline, and lies over the board's
 * own picture and under everything standing on it.
 */
@Component({
  selector: 'table-water-floor',
  templateUrl: './table-water-floor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  host: { class: 'pointer-events-none absolute top-0 left-0 size-full transform-3d' },
})
export class TableWaterFloorComponent {
  private readonly ambience = inject(AmbienceService);
  private readonly tabletopService = inject(TabletopService);
  private readonly renderLite = inject(RenderLiteService);

  /** The size and outline of the board, as the board itself is drawn. */
  readonly surfaceStyle = input.required<Record<string, string>>();

  protected readonly lite = this.renderLite.active;
  protected readonly transform = translateZCss(Z_OFFSET_FOREGROUND_LAYERS_PX + 0.01);

  protected readonly view = computed<WaterFloorView | null>(() => {
    const weather = this.ambience.weather();
    if (weather?.kind !== 'underwater') return null;
    const url = causticTileUrl();
    if (url.length < 1) return null;
    const deep = underwaterDeepColor(weather.color);
    const tilePx = Math.round(this.tabletopService.gridSize() * CAUSTIC_CELLS);
    return {
      wash: depthsWash(deep, weather.density),
      opacity: Math.round(causticOpacity(weather.density) * WHOLE_FLOOR_SHARE * 1000) / 1000,
      url,
      tilePx,
      secondTilePx: Math.round(tilePx * SECOND_NET_SCALE),
    };
  });
}
