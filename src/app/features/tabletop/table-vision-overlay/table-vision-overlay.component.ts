import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, viewChild } from '@angular/core';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { perfCounters, perfTimed } from '@axe/core/util/perf-counters';
import { GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { HEX_SURFACE_INFLATE_PX, hexSurfaceCells, SurfacePoint } from '@axe/domain/tabletop/surface-cells';
import { computeOverlayPlan, OverlayPlan, sameOverlayPlan } from '@axe/domain/tabletop/vision-scene';
import {
  animatedGlowPatches,
  type BakeCanvas,
  bakeOverlayPlan,
  type DirtyRect,
  drawOverlayPlan,
  LIGHT_MIN_OVERLAY_SCALE,
  LIGHT_OVERLAY_PIXEL_BUDGET,
  type OverlayBake,
  overlayScale,
  overlayScratch,
} from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { translateZCss, Z_OFFSET_DARKNESS_PX } from '@axe/ui/tabletop/z-offset';

const SPILL_MARGIN_CAP_PX = 800;
/** How often the flicker is redrawn, about twenty times a second. */
export const VISION_ANIMATION_INTERVAL_MS = 50;

@Component({
  selector: 'table-vision-overlay',
  templateUrl: './table-vision-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableVisionOverlayComponent {
  protected readonly visionService = inject(VisionService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly zTransform = translateZCss(Z_OFFSET_DARKNESS_PX);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('overlayCanvas');

  private plan: OverlayPlan | null = null;
  /** The size and placement the plan was last drawn at, so a scene that draws the same picture is let pass. */
  private drawnLayout = '';
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  private surfaceOriginX = 0;
  private surfaceOriginY = 0;
  private surfaceCells: SurfacePoint[][] | undefined = undefined;
  /**
   * The board size and shape the surface cells were built for. A scene is rebuilt whenever anything
   * on the table moves, and the cells depend on none of that.
   */
  private surfaceKey = '';
  private margin = 0;
  private scale = 1;
  private animated = false;
  private bake: OverlayBake | null = null;
  private scratch: BakeCanvas | null = null;
  private scratchSize = '';
  private dirty: DirtyRect[] = [];
  private rafId: number | null = null;
  private readonly images = new Map<string, HTMLImageElement>();

  constructor() {
    effect(() => {
      const scene = this.visionService.scene();
      if (!scene) {
        this.forgetScene();
        return;
      }
      // The canvas is only on the table while there is a scene, so it arrives with the next render.
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas) return;
      const viewer = this.visionService.viewer();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const maxDim = scene.lights.reduce((m, l) => Math.max(m, l.dimPx), 0);
      this.margin = Math.min(SPILL_MARGIN_CAP_PX, Math.ceil(maxDim));

      const gridType = scene.gridType ?? GridType.SQUARE;
      const cols = scene.gridSize > 0 ? Math.round(scene.widthPx / scene.gridSize) : 0;
      const rows = scene.gridSize > 0 ? Math.round(scene.heightPx / scene.gridSize) : 0;
      const hex = computeHexMaskGeometry(cols, rows, scene.gridSize, gridType);
      this.surfaceOriginX = hex ? -hex.offsetX : 0;
      this.surfaceOriginY = hex ? -hex.offsetY : 0;
      this.surfaceWidth = hex ? hex.pixelW : scene.widthPx;
      this.surfaceHeight = hex ? hex.pixelH : scene.heightPx;
      const surfaceKey = hex ? `${cols}:${rows}:${scene.gridSize}:${gridType}` : '';
      if (surfaceKey !== this.surfaceKey) {
        this.surfaceCells = hex
          ? hexSurfaceCells(cols, rows, scene.gridSize, gridType, HEX_SURFACE_INFLATE_PX)
          : undefined;
        this.surfaceKey = surfaceKey;
      }

      const cw = this.surfaceWidth + 2 * this.margin;
      const ch = this.surfaceHeight + 2 * this.margin;
      // A board too big to hold a canvas of its own size is drawn smaller and let up to
      // size by the browser, which soft gradients take without complaint.
      this.scale = this.renderLite.active()
        ? overlayScale(cw, ch, LIGHT_OVERLAY_PIXEL_BUDGET, LIGHT_MIN_OVERLAY_SCALE)
        : overlayScale(cw, ch);
      const pw = Math.ceil(cw * this.scale);
      const ph = Math.ceil(ch * this.scale);
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      canvas.style.left = this.surfaceOriginX - this.margin + 'px';
      canvas.style.top = this.surfaceOriginY - this.margin + 'px';
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      const plan = computeOverlayPlan(scene, viewer, this.visionService.overlayVision());
      const layout = `${pw}x${ph}@${this.scale}:${this.margin}:${this.surfaceOriginX}:${this.surfaceOriginY}`;
      if (this.plan && layout === this.drawnLayout && sameOverlayPlan(this.plan, plan)) return;
      this.plan = plan;
      this.drawnLayout = layout;
      this.refreshScratch(cw, ch);
      this.animated = scene.lights.some((light) => light.animation && light.animation !== 'none');
      this.ensureImages();
      this.refreshBake();
      this.draw(this.now(), null);
      this.syncLoop();
    });
    this.destroyRef.onDestroy(() => this.stopLoop());
  }

  /**
   * Lets go of everything drawn for a scene, for the table that has none now.
   *
   * The canvas goes with the scene, so there is nothing left to clear; what is dropped here is what
   * a scene coming back would otherwise be drawn against.
   */
  private forgetScene(): void {
    this.plan = null;
    this.drawnLayout = '';
    this.animated = false;
    this.bake = null;
    this.scratch = null;
    this.scratchSize = '';
    this.dirty = [];
    this.margin = 0;
    this.scale = 1;
    this.surfaceCells = undefined;
    this.surfaceKey = '';
    this.stopLoop();
  }

  /**
   * The surface a pass is gathered on before it is cut back to what can be seen.
   *
   * Only a table that hides something behind a wall needs one, so a plain lit board never
   * makes a second surface the size of itself.
   */
  private refreshScratch(width: number, height: number): void {
    if (!this.plan?.vision?.clipReveals) {
      this.scratch = null;
      this.scratchSize = '';
      return;
    }
    const key = `${width}x${height}@${this.scale}`;
    this.scratch = overlayScratch(width, height, this.scale, this.scratchSize === key ? this.scratch : null);
    this.scratchSize = this.scratch ? key : '';
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : 0;
  }

  private ensureImages(): void {
    if (!this.plan) return;
    const live = new Set<string>();
    for (const shadow of this.plan.shadows) {
      if (!shadow.imageUrl) continue;
      live.add(shadow.imageUrl);
      if (this.images.has(shadow.imageUrl)) continue;
      const image = new Image();
      image.onload = () => {
        this.refreshBake();
        this.draw(this.now(), null);
      };
      image.src = shadow.imageUrl;
      this.images.set(shadow.imageUrl, image);
    }
    // What is no longer used is let go; held onto, the baked shadows stay with it.
    for (const url of this.images.keys()) {
      if (!live.has(url)) this.images.delete(url);
    }
  }

  /**
   * Only a table with a flickering light bakes the part that does not change.
   *
   * A baked surface holds as many pixels as the board. A table without a flicker never
   * redraws at all, so holding one would be waste.
   */
  private refreshBake(): void {
    if (!this.plan || !this.animated) {
      this.bake = null;
      this.dirty = [];
      return;
    }
    this.bake = bakeOverlayPlan(
      this.plan,
      this.surfaceWidth,
      this.surfaceHeight,
      this.images,
      this.margin,
      this.surfaceOf(),
      this.bake,
      this.scale,
      this.scratch
    );
    this.dirty = animatedGlowPatches(this.plan, this.surfaceWidth, this.surfaceHeight, this.margin, this.surfaceOf());
  }

  private surfaceOf() {
    return { originX: this.surfaceOriginX, originY: this.surfaceOriginY, cells: this.surfaceCells };
  }

  private draw(timeMs: number, dirty: DirtyRect | null): void {
    perfCounters.bump('overlayDraw');
    perfTimed('overlay', () => this.drawNow(timeMs, dirty));
  }

  private drawNow(timeMs: number, dirty: DirtyRect | null): void {
    const ctx = this.canvasRef()?.nativeElement.getContext('2d');
    if (!ctx || !this.plan) return;
    drawOverlayPlan(
      ctx,
      this.plan,
      this.surfaceWidth,
      this.surfaceHeight,
      timeMs,
      this.images,
      this.margin,
      this.surfaceOf(),
      this.bake,
      dirty,
      this.scale,
      this.scratch
    );
  }

  /**
   * The flicker does not need redrawing every frame.
   *
   * Each pass repaints the whole board while only the light changes,
   * so following the display would run all that work sixty times a second.
   */
  private lastFrameAt = 0;

  private readonly loop = (): void => {
    const now = this.now();
    if (now - this.lastFrameAt >= VISION_ANIMATION_INTERVAL_MS) {
      this.lastFrameAt = now;
      // Only the ground the flickering lights cover; the rest was laid down once. With nothing
      // laid down, the whole board is drawn.
      if (!this.bake) this.draw(now, null);
      else for (const patch of this.dirty) this.draw(now, patch);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private syncLoop(): void {
    if (this.animated) {
      if (this.rafId === null) this.rafId = requestAnimationFrame(this.loop);
    } else {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
