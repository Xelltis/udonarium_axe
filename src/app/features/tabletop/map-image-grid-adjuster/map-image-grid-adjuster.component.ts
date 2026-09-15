import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { clamp } from '@axe/core/util/clamp';
import { GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import {
  colsForWidth,
  coversFrame,
  cropImageRegion,
  footprintSize,
  rowsForHeight,
  snapAnchor,
} from '@axe/features/tabletop/map-image-grid-adjuster/map-image-grid-region';
import { TranslocoModule } from '@jsverse/transloco';

export interface MapImageGridAdjusterOption {
  imageIdentifier: string;
  gridSize: number;
  gridColor?: string;
  fitWidth?: boolean;
  gridType?: GridType;
}

export interface MapImageGridAdjusterResult {
  imageIdentifier: string;
  width: number;
  height: number;
  gridType: GridType;
}

const VIEW_CELL_BASE = 48;
const VIEW_CELL_MIN = 12;
const VIEW_CELL_MAX = 96;
const STAGE_FALLBACK_W = 720;
const STAGE_FALLBACK_H = 520;
const MIN_SCALE = 0.02;
const MAX_SCALE = 16;
const MAX_CELLS = 100;
const MIN_IMAGE_PX = 8;

type ImageHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
type FrameHandle = 'fr' | 'fb';
type DragMode = { kind: 'move' } | { kind: 'image'; handle: ImageHandle } | { kind: 'frame'; handle: FrameHandle };

@Component({
  selector: 'app-map-image-grid-adjuster',
  templateUrl: './map-image-grid-adjuster.component.html',
  host: { class: 'block text-ui-text' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class MapImageGridAdjusterComponent implements OnDestroy {
  private readonly modalService = inject(ModalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);

  private readonly option = this.readOption();

  readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');
  readonly hexCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('hexGrid');

  readonly imageUrl = signal('');
  readonly imageWidth = signal(0);
  readonly imageHeight = signal(0);
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly processing = signal(false);

  readonly gridColor = this.option.gridColor || '#000000e6';

  readonly stageW = signal(STAGE_FALLBACK_W);
  readonly stageH = signal(STAGE_FALLBACK_H);

  readonly tx = signal(0);
  readonly ty = signal(0);
  readonly scaleX = signal(1);
  readonly scaleY = signal(1);
  readonly linked = signal(true);
  readonly cols = signal(1);
  readonly rows = signal(1);
  readonly gridType = signal<GridType>(this.option.gridType ?? GridType.SQUARE);
  readonly viewCell = signal(VIEW_CELL_BASE);

  private loadedImage: HTMLImageElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cropFn = cropImageRegion;

  private dragMode: DragMode | null = null;
  private dragStart: {
    clientX: number;
    clientY: number;
    tx: number;
    ty: number;
    scaleX: number;
    scaleY: number;
    cols: number;
    rows: number;
  } | null = null;
  private prevFrame: { fx: number; fy: number } | null = null;

  readonly imageScreenWidth = computed(() => this.imageWidth() * this.scaleX());
  readonly imageScreenHeight = computed(() => this.imageHeight() * this.scaleY());

  readonly frame = computed(() => {
    const cell = this.viewCell();
    const { w, h } = footprintSize(this.gridType(), this.cols(), this.rows(), cell);
    const centeredX = (this.stageW() - w) / 2;
    const centeredY = (this.stageH() - h) / 2;
    const a = snapAnchor(this.gridType(), centeredX, centeredY, cell);
    return { fx: a.tx, fy: a.ty, fw: w, fh: h };
  });

  readonly outputWidth = computed(() => {
    const sx = this.scaleX();
    return sx > 0 ? Math.round(this.frame().fw / sx) : 0;
  });
  readonly outputHeight = computed(() => {
    const sy = this.scaleY();
    return sy > 0 ? Math.round(this.frame().fh / sy) : 0;
  });

  readonly gridBackgroundSize = computed(() => {
    const c = this.viewCell();
    const tile = `${c}px ${c}px`;
    return `${tile}, ${tile}, ${tile}, ${tile}`;
  });
  readonly gridBackgroundPosition = computed(() => {
    const f = this.frame();
    const a = `${f.fx}px ${f.fy}px`;
    const b = `${f.fx + 1}px ${f.fy + 1}px`;
    return `${a}, ${a}, ${b}, ${b}`;
  });

  readonly viewPercent = computed(() => Math.round((this.viewCell() / VIEW_CELL_BASE) * 100));

  readonly gridBackgroundImage = computed(() => {
    const c = this.gridColor;
    const w = 'rgba(255,255,255,0.55)';
    return (
      `repeating-linear-gradient(to right, ${c} 0, ${c} 1px, transparent 1px, transparent 100%),` +
      `repeating-linear-gradient(to bottom, ${c} 0, ${c} 1px, transparent 1px, transparent 100%),` +
      `repeating-linear-gradient(to right, ${w} 0, ${w} 1px, transparent 1px, transparent 100%),` +
      `repeating-linear-gradient(to bottom, ${w} 0, ${w} 1px, transparent 1px, transparent 100%)`
    );
  });

  readonly canApply = computed(() => {
    if (this.loadState() !== 'ready' || this.processing()) return false;
    const f = this.frame();
    return coversFrame(this.tx(), this.ty(), this.imageScreenWidth(), this.imageScreenHeight(), f.fx, f.fy, f.fw, f.fh);
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.t('feature.tabletop.tableSetting.gridAdjuster.title')));
    this.loadImage();
    effect((onCleanup) => {
      if (this.loadState() !== 'ready') return;
      const stage = this.stageRef()?.nativeElement;
      if (!stage) return;
      this.measureStage(stage);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measureStage(stage));
      observer.observe(stage);
      this.resizeObserver = observer;
      onCleanup(() => {
        observer.disconnect();
        this.resizeObserver = null;
      });
    });
    effect(() => {
      const f = this.frame();
      const prev = untracked(this.prevFrameOf);
      if (prev) {
        untracked(() => {
          this.tx.set(this.tx() + (f.fx - prev.fx));
          this.ty.set(this.ty() + (f.fy - prev.fy));
        });
      }
      this.prevFrame = { fx: f.fx, fy: f.fy };
    });
    effect(() => this.renderHexOverlay());
    effect(() => {
      const ready = this.loadState() === 'ready';
      const u = footprintSize(this.gridType(), this.cols(), this.rows(), 1);
      const sw = this.stageW();
      const sh = this.stageH();
      if (!ready || !(u.w > 0) || !(u.h > 0)) return;
      const dcFit = clamp(Math.min((sw - 24) / u.w, (sh - 24) / u.h), VIEW_CELL_MIN, VIEW_CELL_BASE);
      untracked(() => {
        if (this.viewCell() > dcFit) this.setViewCell(dcFit);
      });
    });
  }

  private readonly prevFrameOf = () => this.prevFrame;

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private renderHexOverlay() {
    const type = this.gridType();
    const w = this.stageW();
    const h = this.stageH();
    const cell = this.viewCell();
    if (this.loadState() !== 'ready' || !isHexGrid(type)) return;
    const canvas = this.hexCanvasRef()?.nativeElement;
    if (!canvas || typeof canvas.getContext !== 'function') return;
    if (!canvas.getContext('2d')) return;
    new GridLineRender(canvas).renderViewport(w, h, cell, type, this.gridColor, 'transparent', 0, 0, false);
  }

  private measureStage(stage: HTMLElement) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w > 0) this.stageW.set(w);
    if (h > 0) this.stageH.set(h);
  }

  private readOption(): MapImageGridAdjusterOption {
    const option = this.modalService.option as Partial<MapImageGridAdjusterOption> | undefined;
    const rawType = option?.gridType;
    const gridType =
      rawType === GridType.HEX_VERTICAL || rawType === GridType.HEX_HORIZONTAL ? rawType : GridType.SQUARE;
    return {
      imageIdentifier: option?.imageIdentifier ?? '',
      gridSize: Number(option?.gridSize) > 0 ? Number(option?.gridSize) : 50,
      gridColor: option?.gridColor,
      fitWidth: option?.fitWidth,
      gridType,
    };
  }

  private loadImage() {
    const file = this.imageStorage.get(this.option.imageIdentifier);
    const url = file?.url ?? '';
    if (!url) {
      this.loadState.set('error');
      return;
    }
    this.imageUrl.set(url);

    if (typeof Image === 'undefined') {
      this.loadState.set('error');
      return;
    }
    const image = new Image();
    image.onload = () => {
      const w = image.naturalWidth || image.width;
      const h = image.naturalHeight || image.height;
      if (w <= 0 || h <= 0) {
        this.loadState.set('error');
        return;
      }
      this.loadedImage = image;
      this.imageWidth.set(w);
      this.imageHeight.set(h);
      this.initTransform();
      this.loadState.set('ready');
    };
    image.onabort = image.onerror = () => this.loadState.set('error');
    image.src = url;
  }

  private initTransform() {
    const gridSize = this.option.gridSize;
    this.cols.set(clamp(Math.round(this.imageWidth() / gridSize), 1, MAX_CELLS));
    this.rows.set(clamp(Math.round(this.imageHeight() / gridSize), 1, MAX_CELLS));
    this.stretchFit();
  }

  private stretchFit() {
    const f = this.frame();
    const imgW = this.imageWidth();
    const imgH = this.imageHeight();
    if (imgW <= 0 || imgH <= 0) return;
    this.scaleX.set(clamp(f.fw / imgW, MIN_SCALE, MAX_SCALE));
    this.scaleY.set(clamp(f.fh / imgH, MIN_SCALE, MAX_SCALE));
    this.tx.set(f.fx);
    this.ty.set(f.fy);
    this.prevFrame = { fx: f.fx, fy: f.fy };
  }

  protected zoomAt(px: number, py: number, factor: number) {
    const nextX = clamp(this.scaleX() * factor, MIN_SCALE, MAX_SCALE);
    const nextY = clamp(this.scaleY() * factor, MIN_SCALE, MAX_SCALE);
    const rx = nextX / this.scaleX();
    const ry = nextY / this.scaleY();
    this.tx.set(px - (px - this.tx()) * rx);
    this.ty.set(py - (py - this.ty()) * ry);
    this.scaleX.set(nextX);
    this.scaleY.set(nextY);
  }

  /**
   * Zooms the adjuster's view by changing how large a grid cell is drawn, held between the view
   * limits.
   *
   * The image is scaled and moved along with the frame, so the part of it the grid covers stays the
   * same.
   */
  setViewCell(next: number) {
    const clamped = clamp(next, VIEW_CELL_MIN, VIEW_CELL_MAX);
    const cur = this.viewCell();
    const ratio = clamped / cur;
    if (ratio === 1) return;
    const before = this.frame();
    this.viewCell.set(clamped);
    const after = this.frame();
    this.scaleX.set(clamp(this.scaleX() * ratio, MIN_SCALE, MAX_SCALE));
    this.scaleY.set(clamp(this.scaleY() * ratio, MIN_SCALE, MAX_SCALE));
    this.tx.set(after.fx + (this.tx() - before.fx) * ratio);
    this.ty.set(after.fy + (this.ty() - before.fy) * ratio);
    this.prevFrame = { fx: after.fx, fy: after.fy };
  }

  private fitViewCell(): number {
    const u = footprintSize(this.gridType(), this.cols(), this.rows(), 1);
    if (!(u.w > 0) || !(u.h > 0)) return VIEW_CELL_BASE;
    const dc = Math.min((this.stageW() - 24) / u.w, (this.stageH() - 24) / u.h);
    return clamp(dc, VIEW_CELL_MIN, VIEW_CELL_BASE);
  }

  /** Zooms the view back to fit the whole grid block in the stage, no larger than the base cell size. */
  resetView() {
    this.setViewCell(this.fitViewCell());
  }

  /** Switches the grid laid over the image between square and the hex layouts. */
  setGridType(type: GridType) {
    if (type === this.gridType()) return;
    this.gridType.set(type);
  }

  /**
   * Sets how many columns the grid block has, from its number field; a value below one or not a
   * number is ignored, and the rest are held to the cell limit.
   */
  setCols(value: number | string) {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num) || num < 1) return;
    this.cols.set(clamp(num, 1, MAX_CELLS));
  }

  /**
   * Sets how many rows the grid block has, from its number field; a value below one or not a number
   * is ignored, and the rest are held to the cell limit.
   */
  setRows(value: number | string) {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num) || num < 1) return;
    this.rows.set(clamp(num, 1, MAX_CELLS));
  }

  /** Switches whether the image's width and height scale together. */
  toggleLinked() {
    this.linked.set(!this.linked());
  }

  /**
   * Scales the image to cover the grid block.
   *
   * With the sides linked it keeps its proportions and is centred on the block, overflowing it one
   * way; unlinked it is stretched to match the block exactly.
   */
  fit() {
    const f = this.frame();
    const imgW = this.imageWidth();
    const imgH = this.imageHeight();
    if (imgW <= 0 || imgH <= 0) return;
    if (this.linked()) {
      const s = clamp(Math.max(f.fw / imgW, f.fh / imgH), MIN_SCALE, MAX_SCALE);
      this.scaleX.set(s);
      this.scaleY.set(s);
      this.tx.set(f.fx + (f.fw - imgW * s) / 2);
      this.ty.set(f.fy + (f.fh - imgH * s) / 2);
      this.prevFrame = { fx: f.fx, fy: f.fy };
      return;
    }
    this.stretchFit();
  }

  /**
   * Puts the grid block back to the cell counts the table's grid size suggests for the image, and
   * stretches the image over it.
   */
  reset() {
    this.cols.set(clamp(Math.round(this.imageWidth() / this.option.gridSize), 1, MAX_CELLS));
    this.rows.set(clamp(Math.round(this.imageHeight() / this.option.gridSize), 1, MAX_CELLS));
    this.stretchFit();
  }

  protected stagePoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.stageRef()?.nativeElement.getBoundingClientRect();
    return {
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
    };
  }

  protected hitTest(x: number, y: number): DragMode {
    const imageHandle = this.hitImageHandle(x, y);
    if (imageHandle) return { kind: 'image', handle: imageHandle };
    const frameHandle = this.hitFrameHandle(x, y);
    if (frameHandle) return { kind: 'frame', handle: frameHandle };
    return { kind: 'move' };
  }

  private hitImageHandle(x: number, y: number): ImageHandle | null {
    const r = 7;
    const left = this.tx();
    const top = this.ty();
    const right = left + this.imageScreenWidth();
    const bottom = top + this.imageScreenHeight();
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const near = (hx: number, hy: number) => Math.abs(x - hx) <= r && Math.abs(y - hy) <= r;
    if (near(left, top)) return 'nw';
    if (near(right, top)) return 'ne';
    if (near(left, bottom)) return 'sw';
    if (near(right, bottom)) return 'se';
    if (!this.linked()) {
      if (near(cx, top)) return 'n';
      if (near(cx, bottom)) return 's';
      if (near(right, cy)) return 'e';
      if (near(left, cy)) return 'w';
    }
    return null;
  }

  private hitFrameHandle(x: number, y: number): FrameHandle | null {
    const r = 7;
    const f = this.frame();
    const near = (hx: number, hy: number) => Math.abs(x - hx) <= r && Math.abs(y - hy) <= r;
    if (near(f.fx + f.fw, f.fy + f.fh / 2)) return 'fr';
    if (near(f.fx + f.fw / 2, f.fy + f.fh)) return 'fb';
    return null;
  }

  /**
   * Starts a drag on the stage: a corner or side handle resizes the image, a frame handle resizes
   * the grid block, and anywhere else moves the image. The stage captures the pointer and takes
   * focus for the arrow keys.
   */
  onPointerDown(event: PointerEvent) {
    if (this.loadState() !== 'ready') return;
    const p = this.stagePoint(event);
    this.dragMode = this.hitTest(p.x, p.y);
    this.dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      tx: this.tx(),
      ty: this.ty(),
      scaleX: this.scaleX(),
      scaleY: this.scaleY(),
      cols: this.cols(),
      rows: this.rows(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    (event.currentTarget as HTMLElement).focus();
  }

  /** Moves or resizes the image, or resizes the grid block, as the drag the press started calls for. */
  onPointerMove(event: PointerEvent) {
    if (!this.dragMode || !this.dragStart) return;
    const dx = event.clientX - this.dragStart.clientX;
    const dy = event.clientY - this.dragStart.clientY;
    switch (this.dragMode.kind) {
      case 'move':
        this.tx.set(this.dragStart.tx + dx);
        this.ty.set(this.dragStart.ty + dy);
        break;
      case 'image':
        this.resizeImage(this.dragMode.handle, dx, dy);
        break;
      case 'frame':
        this.resizeFrame(this.dragMode.handle, dx, dy);
        break;
    }
  }

  /** Ends the drag and releases the pointer, when the press is released or cancelled. */
  onPointerUp(event: PointerEvent) {
    this.dragMode = null;
    this.dragStart = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  private resizeImage(handle: ImageHandle, dx: number, dy: number) {
    const start = this.dragStart;
    if (!start) return;
    const imgW = this.imageWidth();
    const imgH = this.imageHeight();
    if (imgW <= 0 || imgH <= 0) return;
    const startW = imgW * start.scaleX;
    const startH = imgH * start.scaleY;
    const startRight = start.tx + startW;
    const startBottom = start.ty + startH;

    if (handle === 'n' || handle === 's') {
      let newH: number;
      let newTop: number;
      if (handle === 's') {
        newH = Math.max(MIN_IMAGE_PX, startH + dy);
        newTop = start.ty;
      } else {
        newH = Math.max(MIN_IMAGE_PX, startH - dy);
        newTop = startBottom - newH;
      }
      this.scaleY.set(clamp(newH / imgH, MIN_SCALE, MAX_SCALE));
      this.ty.set(newTop);
      return;
    }
    if (handle === 'e' || handle === 'w') {
      let newW: number;
      let newLeft: number;
      if (handle === 'e') {
        newW = Math.max(MIN_IMAGE_PX, startW + dx);
        newLeft = start.tx;
      } else {
        newW = Math.max(MIN_IMAGE_PX, startW - dx);
        newLeft = startRight - newW;
      }
      this.scaleX.set(clamp(newW / imgW, MIN_SCALE, MAX_SCALE));
      this.tx.set(newLeft);
      return;
    }

    const signX = handle === 'ne' || handle === 'se' ? 1 : -1;
    const signY = handle === 'sw' || handle === 'se' ? 1 : -1;
    const anchorX = signX > 0 ? start.tx : startRight;
    const anchorY = signY > 0 ? start.ty : startBottom;
    let newW = Math.max(MIN_IMAGE_PX, startW + signX * dx);
    let newH = Math.max(MIN_IMAGE_PX, startH + signY * dy);

    if (this.linked()) {
      const factor = Math.abs(newW / startW - 1) >= Math.abs(newH / startH - 1) ? newW / startW : newH / startH;
      newW = Math.max(MIN_IMAGE_PX, startW * factor);
      newH = Math.max(MIN_IMAGE_PX, startH * factor);
    }

    const sx = clamp(newW / imgW, MIN_SCALE, MAX_SCALE);
    const sy = clamp(newH / imgH, MIN_SCALE, MAX_SCALE);
    this.scaleX.set(sx);
    this.scaleY.set(sy);
    this.tx.set(signX > 0 ? anchorX : anchorX - imgW * sx);
    this.ty.set(signY > 0 ? anchorY : anchorY - imgH * sy);
  }

  private resizeFrame(handle: FrameHandle, dx: number, dy: number) {
    const start = this.dragStart;
    if (!start) return;
    const cell = this.viewCell();
    const f = footprintSize(this.gridType(), start.cols, start.rows, cell);
    if (handle === 'fr') {
      const next = clamp(colsForWidth(this.gridType(), Math.max(1, f.w + dx), cell), 1, MAX_CELLS);
      if (next !== this.cols()) this.cols.set(next);
    } else {
      const next = clamp(rowsForHeight(this.gridType(), Math.max(1, f.h + dy), cell), 1, MAX_CELLS);
      if (next !== this.rows()) this.rows.set(next);
    }
  }

  /**
   * Zooms with the wheel: with Ctrl or Cmd held it zooms the whole view, otherwise it scales the
   * image about the pointer. Shift makes the steps finer.
   */
  onWheel(event: WheelEvent) {
    if (this.loadState() !== 'ready') return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const step = event.shiftKey ? 1.02 : 1.1;
      const factor = event.deltaY < 0 ? step : 1 / step;
      this.setViewCell(this.viewCell() * factor);
      return;
    }
    const p = this.stagePoint(event as unknown as PointerEvent);
    const base = event.shiftKey ? 1.01 : 1.05;
    const factor = event.deltaY < 0 ? base : 1 / base;
    this.zoomAt(p.x, p.y, factor);
  }

  /** Nudges the image with the arrow keys, one pixel at a time, or ten with Shift. */
  onKeyDown(event: KeyboardEvent) {
    if (this.loadState() !== 'ready') return;
    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case 'ArrowLeft':
        this.tx.set(this.tx() - step);
        break;
      case 'ArrowRight':
        this.tx.set(this.tx() + step);
        break;
      case 'ArrowUp':
        this.ty.set(this.ty() - step);
        break;
      case 'ArrowDown':
        this.ty.set(this.ty() + step);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Closes the adjuster with null, leaving the table as it was. */
  cancel() {
    this.modalService.resolve(null);
  }

  /**
   * Crops the image to the grid block, stores the crop as a new image and closes the adjuster with
   * it, the size in cells and the grid type.
   *
   * Does nothing unless the image covers the block. A failed crop shows the error state instead of
   * closing.
   */
  async apply() {
    if (!this.canApply() || !this.loadedImage) return;
    this.processing.set(true);
    try {
      const f = this.frame();
      const sx = this.scaleX();
      const sy = this.scaleY();
      const imgW = this.imageWidth();
      const imgH = this.imageHeight();
      const cropX = clamp((f.fx - this.tx()) / sx, 0, imgW);
      const cropY = clamp((f.fy - this.ty()) / sy, 0, imgH);
      const cropW = Math.min(f.fw / sx, imgW - cropX);
      const cropH = Math.min(f.fh / sy, imgH - cropY);
      const blob = await this.cropFn(this.loadedImage, cropX, cropY, cropW, cropH);
      const image = await this.imageStorage.addAsync(blob);
      const result: MapImageGridAdjusterResult = {
        imageIdentifier: image.identifier,
        width: this.cols(),
        height: this.rows(),
        gridType: this.gridType(),
      };
      this.modalService.resolve(result);
    } catch {
      this.processing.set(false);
      this.loadState.set('error');
    }
  }
}
