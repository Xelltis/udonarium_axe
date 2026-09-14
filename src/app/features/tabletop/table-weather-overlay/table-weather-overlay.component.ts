import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { AmbienceService } from '@axe/application/tabletop/ambience.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { skyAmbienceFlash, skyAmbienceLayer, skyAmbienceWash } from '@axe/domain/effect/ambience/ambience-sky';
import { EffectParticleLayer } from '@axe/domain/effect/effect-particles';
import { withAlpha } from '@axe/domain/effect/particles/shared';
import { EffectCanvasComponent } from '@axe/features/effect/effect-canvas/effect-canvas.component';
import {
  type ScreenPoint,
  weatherDepthDirection,
  weatherMaskImage,
} from '@axe/features/tabletop/table-weather-overlay/weather-projection';

/** How high the weather reaches, in cells, so a table without walls still has a sky. */
const MIN_SKY_CELLS = 10;
/**
 * How often a moved view is projected again, in milliseconds.
 *
 * It walks the transforms of every ancestor, forcing a layout each time. Following the
 * camera does not need every frame, and the soft edge hides a slight lag.
 */
const REPROJECT_INTERVAL_MS = 100;
/** The same while the table is drawn the lighter way, where the mask is the costly part. */
const LIGHT_REPROJECT_INTERVAL_MS = 400;
/**
 * How often a view that has not moved is projected again anyway, in milliseconds.
 *
 * The page can move under a table whose camera stands still, when a bar opens or the layout
 * shifts, and nothing tells the overlay so.
 */
const STILL_REPROJECT_INTERVAL_MS = 1000;
/** The pixels the mask lands on while the table is drawn the lighter way. */
const LIGHT_MASK_STEP_PX = 8;

/**
 * The weather over the whole map.
 *
 * Rain and snow laid flat on the board crawl along the ground as the camera tips.
 * They are drawn as one sheet across the screen, outside the 3D transform of the board.
 */
@Component({
  selector: 'table-weather-overlay',
  templateUrl: './table-weather-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // It takes no stacking order; with one it would come out in front of the panels,
    // which set none themselves, so whichever is placed later comes to the front.
    class: 'pointer-events-none absolute inset-0',
    '[style.mask-image]': 'maskImage()',
    '[style.-webkit-mask-image]': 'maskImage()',
  },
  imports: [EffectCanvasComponent],
})
export class TableWeatherOverlayComponent {
  private readonly ambienceService = inject(AmbienceService);
  private readonly tabletopService = inject(TabletopService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly size = signal<{ width: number; height: number }>({ width: 0, height: 0 });

  private readonly reprojectTick = computed(() => {
    const interval = this.renderLite.active() ? LIGHT_REPROJECT_INTERVAL_MS : REPROJECT_INTERVAL_MS;
    return Math.floor(this.ambienceService.now() / interval);
  });

  /**
   * Which view the projection is of, looked at once a tick.
   *
   * It changes when the view has been written out since the last tick, or when a still view has
   * gone unchecked for a while; a tick with neither leaves the projection as it was.
   */
  private readonly viewEpoch = computed<string>(() => {
    this.reprojectTick();
    return untracked(
      () =>
        `${this.coordinateService.tabletopTransformVersion()}:` +
        `${Math.floor(this.ambienceService.now() / STILL_REPROJECT_INTERVAL_MS)}`
    );
  });

  /**
   * The board and the space above it, projected onto the screen as eight points.
   *
   * Above the table means the volume, not the floor.
   */
  private readonly projected = computed<ScreenPoint[]>(() => {
    if (!this.ambienceService.weather()) return [];

    const origin = this.coordinateService.tabletopOriginElement;
    if (!origin || origin === document.body) return [];

    const table = this.tabletopService.currentTableVersion();
    const width = table.width * table.gridSize;
    const depth = table.height * table.gridSize;
    if (width <= 0 || depth <= 0) return [];

    this.viewEpoch();
    this.size();

    const ceiling = Math.max(table.wallHeight, MIN_SKY_CELLS) * table.gridSize;
    const box = [0, ceiling].flatMap((z) => [
      { x: 0, y: 0, z },
      { x: width, y: 0, z },
      { x: width, y: depth, z },
      { x: 0, y: depth, z },
    ]);

    const host = this.elementRef.nativeElement.getBoundingClientRect();
    return this.coordinateService
      .convertManyToGlobal(box, origin)
      .map((corner) => ({ x: corner.x - host.left, y: corner.y - host.top }));
  });

  /** It does not reach past the board. Cut by a polygon it would show an edge in mid-air, so it fades out instead. */
  readonly maskImage = computed<string>(() =>
    weatherMaskImage(this.projected(), this.renderLite.active() ? LIGHT_MASK_STEP_PX : 1)
  );

  readonly wash = computed<string>(() => {
    const weather = this.ambienceService.weather();
    if (!weather) return '';
    const direction = weatherDepthDirection(this.projected().slice(0, 4));
    return skyAmbienceWash(weather.kind, weather.color, weather.density, direction);
  });

  /** Lightning. It lights only what is over the board, so it is struck inside the mask. */
  readonly flash = computed<string>(() => {
    const weather = this.ambienceService.weather();
    if (!weather || !this.ambienceService.motionEnabled()) return '';

    const power = skyAmbienceFlash(weather.kind, this.ambienceService.now(), weather.density);
    return power > 0.01 ? withAlpha(weather.color, Math.round(power * 850) / 1000) : '';
  });

  readonly layer = computed<EffectParticleLayer | null>(() => {
    const weather = this.ambienceService.weather();
    if (!weather || !this.ambienceService.motionEnabled()) return null;

    const { width, height } = this.size();
    if (width < 1 || height < 1) return null;

    const layer = skyAmbienceLayer({
      kind: weather.kind,
      color: weather.color,
      density: weather.density,
      elapsed: this.ambienceService.now(),
      width,
      height,
    });
    return layer.particles.length > 0 ? layer : null;
  });

  constructor() {
    if (typeof ResizeObserver !== 'function') return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      this.size.set({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(this.elementRef.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
