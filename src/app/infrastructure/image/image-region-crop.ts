import { canvasToBlobPreferWebP } from '@axe/core/storage/canvas-blob';

/** The longest side, in pixels, a cropped picture is written at unless told otherwise. */
const DEFAULT_MAX_OUTPUT_PX = 4096;

/**
 * Crops a rectangle out of an image into an image blob, preferring WebP, scaled down so its longest
 * side fits `maxOutputPx`.
 *
 * Throws for an empty rectangle or where no canvas is available.
 */
export async function cropImageRegion(
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxOutputPx = DEFAULT_MAX_OUTPUT_PX
): Promise<Blob> {
  if (!(sw > 0) || !(sh > 0)) throw new Error('invalid crop region');
  const longest = Math.max(sw, sh);
  const outScale = longest > maxOutputPx ? maxOutputPx / longest : 1;
  const outputW = Math.max(1, Math.round(sw * outScale));
  const outputH = Math.max(1, Math.round(sh * outScale));
  if (typeof document === 'undefined') throw new Error('canvas unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputW, outputH);
  const blob = await canvasToBlobPreferWebP(canvas, 0.92);
  if (!blob) throw new Error('canvas toBlob unavailable');
  return blob;
}
