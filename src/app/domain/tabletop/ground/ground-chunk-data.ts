import { decodeBytes, encodeBytes } from '@axe/core/util/base64-bytes';

/** How many samples of the ground stand along a cell: one every half cell, from the board's top left. */
export const GROUND_SAMPLES_PER_CELL = 2;

/** How many samples a chunk of the ground holds along each side: sixteen cells' worth. */
export const GROUND_CHUNK_SAMPLES = 32;

/** How many samples a chunk holds in all. */
export const GROUND_CHUNK_SAMPLE_COUNT = GROUND_CHUNK_SAMPLES * GROUND_CHUNK_SAMPLES;

/** The finest step a height is kept to, in cells. */
export const GROUND_HEIGHT_STEP = 1 / 64;

/** The kinds of ground a sample is painted with, each in a share of its own. */
export const GROUND_PAINT_LAYERS = ['grass', 'dirt', 'rock', 'sand'] as const;
export type GroundPaintLayer = (typeof GROUND_PAINT_LAYERS)[number];

/** The most a share of paint may be, in its four bits. */
export const GROUND_PAINT_FULL = 15;

/**
 * A chunk of the ground as it is kept: which chunk it is, counted in chunks from the board's top left,
 * the height of each of its samples, in steps of {@link GROUND_HEIGHT_STEP} cells and below the board
 * where less than nothing, row by row, and the shares of paint each sample wears, four to a sample
 * in the order of {@link GROUND_PAINT_LAYERS}, or null where nothing is painted.
 */
export interface GroundChunkData {
  readonly cx: number;
  readonly cy: number;
  readonly heights: Int16Array;
  readonly paint: Uint8Array | null;
}

/** The heights of a chunk as text, two bytes to a sample, the low byte first. */
export function encodeGroundHeights(heights: Int16Array): string {
  const bytes = new Uint8Array(heights.length * 2);
  for (let i = 0; i < heights.length; i++) {
    bytes[i * 2] = heights[i] & 0xff;
    bytes[i * 2 + 1] = (heights[i] >> 8) & 0xff;
  }
  return encodeBytes(bytes);
}

/**
 * The heights of a chunk read back from text, or null where the text holds no chunk's worth: an
 * empty or a cut short text is no data, rather than a flat or a half flat chunk.
 */
export function decodeGroundHeights(text: string): Int16Array | null {
  const bytes = decodeBytes(text ?? '', GROUND_CHUNK_SAMPLE_COUNT * 2);
  if (bytes.length !== GROUND_CHUNK_SAMPLE_COUNT * 2) return null;
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = ((bytes[i * 2] | (bytes[i * 2 + 1] << 8)) << 16) >> 16;
  }
  return heights;
}

/**
 * The paint of a chunk as text, two bytes to a sample: grass and dirt in the first, rock and sand in
 * the second, the earlier of each pair in the high four bits.
 */
export function encodeGroundPaint(paint: Uint8Array): string {
  const bytes = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 2);
  for (let i = 0; i < GROUND_CHUNK_SAMPLE_COUNT; i++) {
    const at = i * GROUND_PAINT_LAYERS.length;
    bytes[i * 2] = (Math.min(paint[at], GROUND_PAINT_FULL) << 4) | Math.min(paint[at + 1], GROUND_PAINT_FULL);
    bytes[i * 2 + 1] = (Math.min(paint[at + 2], GROUND_PAINT_FULL) << 4) | Math.min(paint[at + 3], GROUND_PAINT_FULL);
  }
  return encodeBytes(bytes);
}

/** The paint of a chunk read back from text, or null where the text holds no chunk's worth. */
export function decodeGroundPaint(text: string): Uint8Array | null {
  const bytes = decodeBytes(text ?? '', GROUND_CHUNK_SAMPLE_COUNT * 2);
  if (bytes.length !== GROUND_CHUNK_SAMPLE_COUNT * 2) return null;
  const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * GROUND_PAINT_LAYERS.length);
  for (let i = 0; i < GROUND_CHUNK_SAMPLE_COUNT; i++) {
    const at = i * GROUND_PAINT_LAYERS.length;
    paint[at] = bytes[i * 2] >> 4;
    paint[at + 1] = bytes[i * 2] & 15;
    paint[at + 2] = bytes[i * 2 + 1] >> 4;
    paint[at + 3] = bytes[i * 2 + 1] & 15;
  }
  return paint;
}

/**
 * Which chunk a chunk is, read from the text it is kept as: a whole number of chunks, none of them
 * below nothing. An empty or unreadable text names no chunk, rather than the one at the board's corner.
 */
export function readGroundChunkIndex(text: string): number | null {
  const trimmed = (text ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const index = Number(trimmed);
  return Number.isSafeInteger(index) ? index : null;
}
