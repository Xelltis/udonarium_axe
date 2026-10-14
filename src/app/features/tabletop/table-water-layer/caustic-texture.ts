import { CAUSTIC_TILE_PX, causticAlpha, causticFieldOf } from '@axe/domain/effect/ambience/caustics';
import {
  cloudAlpha,
  scumAlpha,
  scumRimAlpha,
  smoothFieldOf,
  streakAlpha,
  WATER_PATTERN_TILE_PX,
} from '@axe/domain/effect/ambience/water-patterns';
import type { WaterLightMask } from '@axe/domain/tabletop/water/water-light-mask';

const SEED = 20261013;
/** How many waves the silt is drawn from, and how fine the finest of them runs. */
const CLOUD_WAVES = 16;
const CLOUD_FINEST = 3;
/** How many waves the scum is drawn from, and how fine the finest of them runs. */
const SCUM_WAVES = 34;
const SCUM_FINEST = 8;
/** How much of the surface the scum covers at its thickest. */
const SCUM_COVERAGE = 0.3;

let tileUrl: string | null = null;
let cloudUrl: string | null = null;
let scumUrl: string | null = null;
let scumRimUrl: string | null = null;
let streakUrl: string | null = null;

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

/**
 * The clouds of silt in murky water, as a picture to repeat, or empty where none can be drawn.
 * Drawn in white once, to be worn as a mask by a layer in the colour of the silt.
 */
export function cloudTileUrl(): string {
  if (cloudUrl !== null) return cloudUrl;
  const url = alphaImageUrl(
    WATER_PATTERN_TILE_PX,
    WATER_PATTERN_TILE_PX,
    cloudAlpha(smoothFieldOf(SEED + 1, WATER_PATTERN_TILE_PX, CLOUD_WAVES, CLOUD_FINEST))
  );
  if (url) cloudUrl = url;
  return url ?? '';
}

/**
 * The scum floating on dirty water, as a picture to repeat, or empty where none can be drawn.
 * Drawn in white once, to be worn as a mask by a layer in the colour of the scum.
 */
export function scumTileUrl(): string {
  if (scumUrl !== null) return scumUrl;
  const url = alphaImageUrl(WATER_PATTERN_TILE_PX, WATER_PATTERN_TILE_PX, scumAlpha(scumField(), SCUM_COVERAGE));
  if (url) scumUrl = url;
  return url ?? '';
}

/**
 * The rim along the edge of every patch of scum, as a picture to repeat in step with the scum, or
 * empty where none can be drawn.
 */
export function scumRimTileUrl(): string {
  if (scumRimUrl !== null) return scumRimUrl;
  const url = alphaImageUrl(WATER_PATTERN_TILE_PX, WATER_PATTERN_TILE_PX, scumRimAlpha(scumField(), SCUM_COVERAGE));
  if (url) scumRimUrl = url;
  return url ?? '';
}

/**
 * The streaks a current draws on flowing water, as a picture to repeat, lying along its x; or
 * empty where none can be drawn. Drawn in white once.
 */
export function streakTileUrl(): string {
  if (streakUrl !== null) return streakUrl;
  const url = alphaImageUrl(WATER_PATTERN_TILE_PX, WATER_PATTERN_TILE_PX, streakAlpha(SEED + 3));
  if (url) streakUrl = url;
  return url ?? '';
}

function scumField() {
  return smoothFieldOf(SEED + 2, WATER_PATTERN_TILE_PX, SCUM_WAVES, SCUM_FINEST);
}

/** How much of a sheet of water shows in the dark, as a picture to mask it with, or null where none can be drawn. */
export function lightMaskUrl(mask: WaterLightMask): string | null {
  return sheetPictureUrl(mask.cols, mask.rows, mask.alpha);
}

/**
 * The colour of the depths over a sheet of water as a picture to lay on it, cell by cell, or null
 * where none can be drawn. `rgb` is the colour of the depths and the samples how strongly it shows.
 */
export function depthShadeUrl(shade: WaterLightMask, rgb: readonly [number, number, number]): string | null {
  return sheetPictureUrl(shade.cols, shade.rows, shade.alpha, rgb);
}

/** The pictures of sheets drawn lately, by what they show, the most recently asked for last. */
const sheetPictures = new Map<string, string>();
/** How many pictures of sheets are kept, enough for every sheet of a large lake and its shades. */
const SHEET_PICTURES_KEPT = 256;

/**
 * A picture laid over a sheet of water, drawn once for as long as what it shows stays the same:
 * the light on the water and the shade of its depths are worked out again as anything on the table
 * moves, and mostly come out as they were.
 */
function sheetPictureUrl(
  width: number,
  height: number,
  alpha: Uint8ClampedArray,
  rgb?: readonly [number, number, number]
): string | null {
  const key = `${width}x${height}:${rgb?.join(',') ?? ''}:${bytesAsText(alpha)}`;
  const kept = sheetPictures.get(key);
  if (kept !== undefined) {
    sheetPictures.delete(key);
    sheetPictures.set(key, kept);
    return kept;
  }
  const url = alphaImageUrl(width, height, alpha, rgb);
  if (!url) return null;
  sheetPictures.set(key, url);
  if (sheetPictures.size > SHEET_PICTURES_KEPT) sheetPictures.delete(sheetPictures.keys().next().value!);
  return url;
}

function bytesAsText(bytes: Uint8ClampedArray): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 4096) {
    text += String.fromCharCode(...bytes.subarray(start, start + 4096));
  }
  return text;
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
