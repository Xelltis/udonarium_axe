import { AlphaMask } from '@axe/domain/ui/see-through';

/** The longest side a picture is read at: enough to tell a figure from the clear ground round it. */
export const ALPHA_MASK_MAX_SIDE = 256;

/**
 * Reads how opaque a picture already drawn on the page is at each point, scaled down so its
 * longest side is at most `maxSide`.
 *
 * Null for a picture with no size, or one the page may not read back, as one from another site
 * that did not allow it.
 */
export function readAlphaMask(
  picture: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number = ALPHA_MASK_MAX_SIDE
): AlphaMask | null {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const maskWidth = Math.max(1, Math.round(width * scale));
  const maskHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = maskWidth;
  canvas.height = maskHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(picture, 0, 0, maskWidth, maskHeight);
    const pixels = context.getImageData(0, 0, maskWidth, maskHeight).data;
    const alpha = new Uint8Array(maskWidth * maskHeight);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    return { width: maskWidth, height: maskHeight, alpha };
  } catch {
    return null;
  }
}
