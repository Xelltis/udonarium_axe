import { CAUSTIC_TILE_PX, causticAlpha, causticFieldOf } from '@axe/domain/effect/ambience/caustics';
import type { WaterLightMask } from '@axe/domain/tabletop/water/water-light-mask';

const SEED = 20261013;

let tileUrl: string | null = null;

/**
 * The net of light water throws on the floor, as a picture to repeat, or empty where none can be drawn.
 *
 * Drawn in white once for the life of the page, so one tile serves water of every colour and the
 * floor under every pond moves by the page's own animation rather than by redrawing.
 */
export function causticTileUrl(): string {
  if (tileUrl !== null) return tileUrl;
  const url = alphaImageUrl(CAUSTIC_TILE_PX, CAUSTIC_TILE_PX, causticAlpha(causticFieldOf(SEED)));
  // Kept only once drawn: a page that could not draw it yet, such as one still starting, tries again.
  if (url) tileUrl = url;
  return url ?? '';
}

/** How much of a sheet of water shows in the dark, as a picture to mask it with, or null where none can be drawn. */
export function lightMaskUrl(mask: WaterLightMask): string | null {
  return alphaImageUrl(mask.cols, mask.rows, mask.alpha);
}

/**
 * The colour of the depths over a sheet of water as a picture to lay on it, cell by cell, or null
 * where none can be drawn. `rgb` is the colour of the depths and the samples how strongly it shows.
 */
export function depthShadeUrl(shade: WaterLightMask, rgb: readonly [number, number, number]): string | null {
  return alphaImageUrl(shade.cols, shade.rows, shade.alpha, rgb);
}

function alphaImageUrl(
  width: number,
  height: number,
  alpha: Uint8ClampedArray,
  rgb: readonly [number, number, number] = [255, 255, 255]
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function') return null;
  const image = ctx.createImageData(width, height);
  for (let index = 0; index < alpha.length; index++) {
    image.data[index * 4] = rgb[0];
    image.data[index * 4 + 1] = rgb[1];
    image.data[index * 4 + 2] = rgb[2];
    image.data[index * 4 + 3] = alpha[index];
  }
  ctx.putImageData(image, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
