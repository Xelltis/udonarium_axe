import { clampOr } from '@axe/core/util/clamp';

/** The least and most height a piece's picture can be given, in pixels. */
export const PIECE_IMAGE_HEIGHT_MIN_PX = 50;
export const PIECE_IMAGE_HEIGHT_MAX_PX = 750;

/** The least and most width a piece's picture can be given apart from its height, in pixels. */
export const PIECE_IMAGE_WIDTH_MIN_PX = 10;
export const PIECE_IMAGE_WIDTH_MAX_PX = 2000;

/**
 * The width a piece's picture was given apart from its height, or null where it keeps its own
 * proportions. Anything but a positive number, as an empty field from a room saved before widths
 * could be given, keeps them.
 */
export function pieceImageWidthApart(value: unknown): number | null {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? width : null;
}

/** A height for a piece's picture held within its bounds, or the fallback where it is not a number. */
export function clampPieceImageHeight(value: number, fallback: number): number {
  return clampOr(value, PIECE_IMAGE_HEIGHT_MIN_PX, PIECE_IMAGE_HEIGHT_MAX_PX, fallback);
}

/** A width for a piece's picture held within its bounds, or the fallback where it is not a number. */
export function clampPieceImageWidth(value: number, fallback: number): number {
  return clampOr(value, PIECE_IMAGE_WIDTH_MIN_PX, PIECE_IMAGE_WIDTH_MAX_PX, fallback);
}

/**
 * How wide a picture of the given width over height stands at a height, to the whole pixel; null
 * where its proportions are not known yet.
 */
export function widthInProportion(heightPx: number, aspect: number | null): number | null {
  return aspect !== null && aspect > 0 ? Math.round(heightPx * aspect) : null;
}

/**
 * The height that keeps a picture in its proportions at a width typed for it, held within the
 * height's bounds; the fallback where its proportions are not known yet or the width is not a number.
 */
export function heightInProportion(widthPx: number, aspect: number | null, fallback: number): number {
  if (aspect === null || !(aspect > 0) || !Number.isFinite(widthPx)) return fallback;
  return clampPieceImageHeight(Math.round(widthPx / aspect), fallback);
}
