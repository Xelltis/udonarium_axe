import { canvasToBlobPreferWebP } from '@axe/core/storage/canvas-blob';
export interface DownscaleOptions {
  /**
   * Crops to a square before resampling.
   * For thumbnails and anything else that wants a uniform size.
   */
  square?: boolean;
  /**
   * How long to wait for an image to load, in ms.
   * Where the events never arrive the wait always runs to the limit, so the tests pass a short one.
   */
  loadTimeoutMs?: number;
}

/**
 * Where to take a square out of an image, against its shorter side.
 *
 * A portrait is taller than it is wide and carries the face at the top, so the square is taken
 * from the top edge rather than the middle - the same part the chat window shows. Sideways, and
 * with nothing to say which end matters, it is taken from the middle.
 */
export function squareCropOf(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: 0, side };
}

/**
 * Resamples an image down to a maximum side through a canvas and writes it back out.
 *
 * - Even within the maximum, a webp re-encode is tried and kept when it comes out smaller.
 * - Outside a browser, or with no canvas, the bytes come back unchanged.
 * - A result larger than the original, as a low-resolution source can give, is discarded.
 * - Asked for a square, it crops one out first and always outputs one.
 */
export async function downscaleImageBlob(
  blob: Blob | null | undefined,
  maxDimension: number,
  options: DownscaleOptions = {}
): Promise<Blob | null> {
  if (!blob) return blob ?? null;
  if (maxDimension <= 0) return blob;
  // Pushing something that is not an image through a canvas leaves the load and error events
  // unfired under happy-dom and the promise hanging.
  // The type is checked first. Bytes with no type are let through; outside a test they always have one.
  if (blob.type && !blob.type.startsWith('image/')) return blob;
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') return blob;
  if (typeof URL.createObjectURL !== 'function') return blob;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(blob);
    const img = await loadImage(objectUrl, options.loadTimeoutMs);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (naturalW <= 0 || naturalH <= 0) return blob;

    const square = options.square === true;
    let sx = 0;
    let sy = 0;
    let sw = naturalW;
    let sh = naturalH;
    let targetW: number;
    let targetH: number;

    if (square) {
      const crop = squareCropOf(naturalW, naturalH);
      sx = crop.sx;
      sy = crop.sy;
      sw = crop.side;
      sh = crop.side;
      targetW = targetH = Math.min(crop.side, maxDimension);
    } else {
      const longSide = Math.max(naturalW, naturalH);
      if (longSide <= maxDimension) {
        targetW = naturalW;
        targetH = naturalH;
      } else {
        const scale = maxDimension / longSide;
        targetW = Math.max(1, Math.round(naturalW * scale));
        targetH = Math.max(1, Math.round(naturalH * scale));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

    const downscaled = await canvasToBlobPreferWebP(canvas, 0.8);
    if (!downscaled) return blob;
    return downscaled.size < blob.size ? downscaled : blob;
  } catch {
    return blob;
  } finally {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  }
}

// In case the bytes are broken, or the events never fire under test, this times out.
// Nothing within three seconds leaves it to the caller to fall back.
const LOAD_TIMEOUT_MS = 3000;

function loadImage(src: string, timeoutMs: number = LOAD_TIMEOUT_MS): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      reject(new Error('image load timeout'));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = (event) => {
      clearTimeout(timer);
      reject(event);
    };
    img.src = src;
  });
}

const SKIP_WEBP_CONVERT = new Set(['image/gif', 'image/apng', 'image/webp', 'image/svg+xml']);

/**
 * Re-encodes an added image as WebP, or PNG where the browser cannot write WebP, when that comes
 * out smaller, and otherwise hands the original back.
 *
 * GIF, APNG, animated PNG, WebP and SVG are left alone so animation and vectors survive, as is
 * anything that is not an image or does not decode in time.
 */
export async function convertBlobToWebP(blob: Blob, loadTimeoutMs?: number): Promise<Blob> {
  if (!blob || blob.size === 0) return blob;

  const type = blob.type;
  if (SKIP_WEBP_CONVERT.has(type)) return blob;
  if (type && !type.startsWith('image/')) return blob;

  if (type === 'image/png') {
    const header = await blob.slice(0, 1024).arrayBuffer();
    if (isAnimatedPng(header)) return blob;
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') return blob;
  if (typeof URL.createObjectURL !== 'function') return blob;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(blob);
    const img = await loadImage(objectUrl, loadTimeoutMs);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) return blob;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);

    const webp = await canvasToBlobPreferWebP(canvas, 0.9);
    if (!webp) return blob;
    return webp.size < blob.size ? webp : blob;
  } catch {
    return blob;
  } finally {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Whether PNG bytes carry an animation, told by an acTL chunk before the first image data.
 *
 * Only the chunks inside the bytes given are read, so the start of the file is enough.
 */
export function isAnimatedPng(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  let offset = 8;
  const end = buffer.byteLength;
  while (offset + 8 <= end) {
    const chunkLength = view.getUint32(offset);
    const chunkType =
      String.fromCharCode(view.getUint8(offset + 4)) +
      String.fromCharCode(view.getUint8(offset + 5)) +
      String.fromCharCode(view.getUint8(offset + 6)) +
      String.fromCharCode(view.getUint8(offset + 7));
    if (chunkType === 'acTL') return true;
    if (chunkType === 'IDAT') return false;
    offset += 12 + chunkLength;
  }
  return false;
}
