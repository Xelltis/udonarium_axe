import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { LightFlickerClockService } from '@axe/application/tabletop/light-flicker-clock.service';
import { LightSlotsService } from '@axe/application/tabletop/light-slots.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { perfCounters, perfTimed } from '@axe/core/util/perf-counters';
import { GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { HEX_SURFACE_INFLATE_PX, hexSurfaceCells, SurfacePoint } from '@axe/domain/tabletop/surface-cells';
import { computeOverlayPlan, OverlayPlan, sameOverlayPlan, VisionScene } from '@axe/domain/tabletop/vision-scene';
import {
  type BakeCanvas,
  drawOverlayPlan,
  LIGHT_MIN_OVERLAY_SCALE,
  LIGHT_OVERLAY_PIXEL_BUDGET,
  overlayScale,
  overlayScratch,
} from '@axe/infrastructure/tabletop/vision/vision-overlay-render';
import { translateZCss, Z_OFFSET_DARKNESS_PX } from '@axe/ui/tabletop/z-offset';

const SPILL_MARGIN_CAP_PX = 800;

/** The scene with some of its lights left out. */
function withoutLights(scene: VisionScene, left: ReadonlySet<string>): VisionScene {
  return { ...scene, lights: scene.lights.filter((light) => !left.has(light.sourceId)) };
}

/** Whether a plan lays fog, or what is only remembered, over the table: without it the veil holds nothing. */
function holdsFog(plan: OverlayPlan): boolean {
  return plan.vision?.fogEnabled === true;
}
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
  protected readonly table3d = inject(Table3dService);
  private readonly lightSlots = inject(LightSlotsService);
  private readonly flickerClock = inject(LightFlickerClockService);
  private readonly tableVeil = inject(TableVeilService);
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
  /** How many pixels across and down the canvases of the surface are drawn at, as the scene was last laid out. */
  private pixelWidth = 0;
  private pixelHeight = 0;
  /** Where the canvases of the surface lie on the board, as the scene was last laid out, as their style places them. */
  private box = { left: '0px', top: '0px', width: '0px', height: '0px' };
  private animated = false;
  private scratch: BakeCanvas | null = null;
  private scratchSize = '';
  private rafId: number | null = null;
  private readonly images = new Map<string, HTMLImageElement>();
  private darkness: HTMLCanvasElement | null = null;
  private glowing: HTMLCanvasElement | null = null;
  /** The plan the glow of the lamps a table drawn on a canvas adds is drawn from, or none. */
  private glowPlan: OverlayPlan | null = null;
  /** The plan the darkness a table drawn on a canvas lights itself by is drawn from. */
  private darkPlan: OverlayPlan | null = null;

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
      this.pixelWidth = pw;
      this.pixelHeight = ph;
      this.box = {
        left: this.surfaceOriginX - this.margin + 'px',
        top: this.surfaceOriginY - this.margin + 'px',
        width: cw + 'px',
        height: ch + 'px',
      };
      const vision = this.visionService.overlayVision();
      const plan = computeOverlayPlan(scene, viewer, vision);
      this.sizeToSurface(canvas, holdsFog(plan));
      const lit = this.lightSlots.ids();
      const darkPlan = lit.size > 0 ? computeOverlayPlan(withoutLights(scene, lit), viewer, vision) : plan;
      const layout = `${pw}x${ph}@${this.scale}:${this.margin}:${this.surfaceOriginX}:${this.surfaceOriginY}:${[...lit]}`;
      if (this.plan && layout === this.drawnLayout && sameOverlayPlan(this.plan, plan)) return;
      this.plan = plan;
      this.darkPlan = darkPlan;
      this.drawnLayout = layout;
      this.refreshScratch(cw, ch);
      this.ensureImages();
      untracked(() => this.drawForCanvas());
    });
    effect(() => {
      this.flickerClock.held();
      untracked(() => this.drawFlicker());
    });
    this.destroyRef.onDestroy(() => {
      this.stopLoop();
      this.tableVeil.forget();
    });
  }

  /**
   * Lets go of everything drawn for a scene, for the table that has none now.
   *
   * The canvas goes with the scene, so there is nothing left to clear; what is dropped here is what
   * a scene coming back would otherwise be drawn against.
   */
  private forgetScene(): void {
    this.tableVeil.forget();
    this.plan = null;
    this.drawnLayout = '';
    this.animated = false;
    this.scratch = null;
    this.scratchSize = '';
    this.margin = 0;
    this.scale = 1;
    this.surfaceCells = undefined;
    this.surfaceKey = '';
    this.darkness = null;
    this.glowing = null;
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

  /**
   * Draws what a table drawn on a canvas lays over its own scene, out of sight: on this canvas the fog
   * and what is only remembered, and on another the darkness with the light carved out of it, black,
   * which the scene takes as light. The glow of the lamps is left to the scene. A table with no fog
   * lays no veil, and one that is not dark no darkness, nor holds a canvas of the board's size for it.
   */
  private drawForCanvas(): void {
    this.stopLoop();
    this.glowPlan = null;
    this.animated = false;
    const plan = this.plan;
    const canvas = this.canvasRef()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!plan || !canvas || !ctx) return;
    if (holdsFog(plan)) {
      const fog = { ...plan, darknessAlpha: 0, reveals: [], revealCells: [], glows: [], shadows: [] };
      this.paint(ctx, fog);
      this.tableVeil.show(canvas);
    } else {
      this.tableVeil.forgetVeil();
    }
    if (!(plan.darknessAlpha > 0)) {
      this.tableVeil.forgetDarkness();
      this.darkness = null;
      this.glowing = null;
      return;
    }
    const dark = this.darkCanvas();
    const darkCtx = dark.getContext('2d');
    if (!darkCtx) return;
    const darkPlan = this.darkPlan ?? plan;
    const vision = darkPlan.vision ? { ...darkPlan.vision, fogEnabled: false } : darkPlan.vision;
    this.paint(darkCtx, { ...darkPlan, darknessColor: '#000000', glows: [], vision });
    this.tableVeil.showDarkness(dark, plan.darknessAlpha * (1 - plan.baseRevealAlpha));
    this.glowPlan =
      darkPlan.glows.length > 0
        ? { ...darkPlan, darknessAlpha: 0, reveals: [], revealCells: [], shadows: [], vision }
        : null;
    this.drawGlow();
    this.animated = !!this.glowPlan?.glows.some((shape) => shape.animation && shape.animation !== 'none');
    this.syncLoop();
  }

  /** Draws the glow of the lamps the scene does not light itself, out of sight, for the scene to add. */
  private drawGlow(): void {
    if (!this.glowPlan || !this.canvasRef()) {
      this.tableVeil.forgetGlow();
      this.glowing = null;
      return;
    }
    const glow = (this.glowing ??= document.createElement('canvas'));
    this.sizeToSurface(glow);
    const ctx = glow.getContext('2d');
    if (!ctx) return;
    this.paint(ctx, this.glowPlan);
    this.tableVeil.showGlow(glow);
  }

  /** A canvas of the surface, kept off the page, for the darkness to be drawn on. */
  private darkCanvas(): HTMLCanvasElement {
    const dark = (this.darkness ??= document.createElement('canvas'));
    this.sizeToSurface(dark);
    return dark;
  }

  /**
   * Sizes a canvas to the surface as the scene was last laid out, and places it as the surface lies on
   * the board; one that is to hold nothing is kept a pixel across, which the table can still be sent.
   */
  private sizeToSurface(canvas: HTMLCanvasElement, holds = true): void {
    const width = holds ? this.pixelWidth : 1;
    const height = holds ? this.pixelHeight : 1;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    Object.assign(canvas.style, this.box);
  }

  private paint(ctx: CanvasRenderingContext2D, plan: OverlayPlan): void {
    perfCounters.bump('overlayDraw');
    perfTimed('overlay', () =>
      drawOverlayPlan(
        ctx,
        plan,
        this.surfaceWidth,
        this.surfaceHeight,
        this.flickerClock.now(),
        this.images,
        this.margin,
        this.surfaceOf(),
        this.scale,
        this.scratch
      )
    );
  }

  private ensureImages(): void {
    if (!this.plan) return;
    const live = new Set<string>();
    for (const shadow of this.plan.shadows) {
      if (!shadow.imageUrl) continue;
      live.add(shadow.imageUrl);
      if (this.images.has(shadow.imageUrl)) continue;
      const image = new Image();
      const loaded = this.tableVeil.pictureLoading();
      image.onload = () => {
        this.drawForCanvas();
        loaded();
      };
      image.onerror = loaded;
      image.src = shadow.imageUrl;
      this.images.set(shadow.imageUrl, image);
    }
    // What is no longer used is let go; held onto, the baked shadows stay with it.
    for (const url of this.images.keys()) {
      if (!live.has(url)) this.images.delete(url);
    }
  }

  private surfaceOf() {
    return { originX: this.surfaceOriginX, originY: this.surfaceOriginY, cells: this.surfaceCells };
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
      this.drawFlicker();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Draws again what the flickering lights light, as they are at the moment they are drawn at. */
  private drawFlicker(): void {
    if (this.animated) this.drawGlow();
  }

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
