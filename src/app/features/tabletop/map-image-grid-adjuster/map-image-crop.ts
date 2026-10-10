import { canvasToBlobPreferWebP } from '@axe/core/storage/canvas-blob';
import { clamp } from '@axe/core/util/clamp';
export interface GridCounts {
  cols: number;
  rows: number;
}

export interface CropAlignedRegionOptions {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  cols: number;
  rows: number;
  maxOutputPx?: number;
}

export const DEFAULT_MAX_OUTPUT_PX = 4096;

const COUNT_EPSILON = 1e-7;

export interface CoveredCells {
  cols: number;
  rows: number;
  screenX: number;
  screenY: number;
  imageX: number;
  imageY: number;
  cellImagePx: number;
}

/**
 * Works out the whole square grid cells a scaled, shifted image covers on screen, and where the
 * first of them starts in the image.
 *
 * A cell the image misses by less than `tolerancePx` still counts as covered. A non-positive scale
 * or cell size, or an image covering no whole cell, gives zero cells.
 */
export function computeCoveredCells(
  tx: number,
  ty: number,
  scale: number,
  imgW: number,
  imgH: number,
  displayCell: number,
  tolerancePx = 0.75
): CoveredCells {
  if (!(scale > 0) || !(displayCell > 0)) {
    return { cols: 0, rows: 0, screenX: 0, screenY: 0, imageX: 0, imageY: 0, cellImagePx: 0 };
  }
  const cellImagePx = displayCell / scale;
  const iMin = Math.ceil((tx - tolerancePx) / displayCell);
  const iMax = Math.floor((tx + imgW * scale + tolerancePx) / displayCell) - 1;
  const jMin = Math.ceil((ty - tolerancePx) / displayCell);
  const jMax = Math.floor((ty + imgH * scale + tolerancePx) / displayCell) - 1;
  const cols = Math.max(0, iMax - iMin + 1);
  const rows = Math.max(0, jMax - jMin + 1);
  if (cols <= 0 || rows <= 0) {
    return { cols: 0, rows: 0, screenX: 0, screenY: 0, imageX: 0, imageY: 0, cellImagePx };
  }
  const screenX = iMin * displayCell + 0;
  const screenY = jMin * displayCell + 0;
  const imageX = clamp((screenX - tx) / scale, 0, imgW) + 0;
  const imageY = clamp((screenY - ty) / scale, 0, imgH) + 0;
  return { cols, rows, screenX, screenY, imageX, imageY, cellImagePx };
}

/**
 * Where the first whole cell starts in the image for a grid offset: the offset itself when it is
 * not negative, else the offset wrapped into one cell.
 */
export function effectiveOrigin(offset: number, cellPx: number): number {
  if (!(cellPx > 0)) return 0;
  if (offset >= 0) return offset;
  return ((offset % cellPx) + cellPx) % cellPx;
}

/**
 * How many whole cells fit in the image across and down once the grid is offset; zero for a
 * non-positive cell size.
 */
export function computeGridCounts(
  imageW: number,
  imageH: number,
  cellPx: number,
  offsetX: number,
  offsetY: number
): GridCounts {
  if (!(cellPx > 0)) return { cols: 0, rows: 0 };
  const startX = effectiveOrigin(offsetX, cellPx);
  const startY = effectiveOrigin(offsetY, cellPx);
  const cols = Math.max(0, Math.floor((imageW - startX) / cellPx + COUNT_EPSILON));
  const rows = Math.max(0, Math.floor((imageH - startY) / cellPx + COUNT_EPSILON));
  return { cols, rows };
}

/**
 * Holds a grid offset between just under one cell before the image and its last pixel; 0 for a
 * non-positive cell size.
 */
export function clampOffset(offset: number, cellPx: number, imageSize: number): number {
  if (!(cellPx > 0)) return 0;
  const min = -(cellPx - 1);
  const max = Math.max(0, imageSize - 1);
  return Math.min(max, Math.max(min, offset));
}

/**
 * Crops a grid-aligned block of cells out of an image into an image blob, preferring WebP.
 *
 * The output is scaled down so its longest side fits `maxOutputPx`. Throws for an empty block or
 * where no canvas is available.
 */
export async function cropAlignedRegion(
  image: CanvasImageSource,
  imageW: number,
  imageH: number,
  opts: CropAlignedRegionOptions
): Promise<Blob> {
  const { cellPx, offsetX, offsetY, cols, rows } = opts;
  const maxOutputPx = opts.maxOutputPx ?? DEFAULT_MAX_OUTPUT_PX;

  if (!(cellPx > 0) || cols < 1 || rows < 1) {
    throw new Error('invalid crop region');
  }

  const regionW = cols * cellPx;
  const regionH = rows * cellPx;

  const longest = Math.max(regionW, regionH);
  const scale = longest > maxOutputPx ? maxOutputPx / longest : 1;
  const outputW = Math.max(1, Math.round(regionW * scale));
  const outputH = Math.max(1, Math.round(regionH * scale));

  if (typeof document === 'undefined') throw new Error('canvas unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  ctx.drawImage(image, offsetX, offsetY, regionW, regionH, 0, 0, outputW, outputH);

  const blob = await canvasToBlobPreferWebP(canvas, 0.92);
  if (!blob) throw new Error('canvas toBlob unavailable');
  return blob;
}
