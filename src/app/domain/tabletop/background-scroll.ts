/** How fast a layer may be asked to drift, in pixels a second. */
export const MAX_BACKGROUND_SCROLL_SPEED = 2000;
/** How far a layer may be blown up or shrunk from the size the picture was drawn at. */
export const MIN_BACKGROUND_LAYER_SCALE = 0.1;
export const MAX_BACKGROUND_LAYER_SCALE = 10;

export interface BackgroundScrollAnimation {
  /** How long one tile takes to pass. Zero stands still. */
  readonly durationSeconds: number;
  /** Whether the drift runs the other way, which is how a negative speed is drawn. */
  readonly reversed: boolean;
}

const STILL: BackgroundScrollAnimation = { durationSeconds: 0, reversed: false };

/**
 * The drift of one axis of a background layer.
 *
 * The picture is laid edge to edge and slid by exactly the width of one tile, so what leaves
 * one side has already arrived at the other and the seam never shows. How long that takes is
 * the whole of the animation: everything else is the same tile drawn again.
 *
 * A layer whose picture has not been measured yet stands still rather than guessing at a size,
 * since a wrong distance is a seam the reader can see.
 */
export function backgroundScrollAnimation(speedPx: number, tilePx: number): BackgroundScrollAnimation {
  if (!Number.isFinite(speedPx) || !Number.isFinite(tilePx)) return STILL;
  if (tilePx <= 0) return STILL;

  const speed = Math.min(MAX_BACKGROUND_SCROLL_SPEED, Math.abs(speedPx));
  if (speed <= 0) return STILL;

  return { durationSeconds: +(tilePx / speed).toFixed(4), reversed: speedPx < 0 };
}

/**
 * The size one tile is drawn at, which is what the drift is measured against.
 *
 * Whole pixels, always. A tile of 665.6px is placed by the browser at a rounded position each
 * time it repeats, and the rounding leaves a hairline of nothing between one tile and the next.
 */
export function backgroundTileSize(
  natural: { width: number; height: number } | null,
  scale: number
): { width: number; height: number } | null {
  if (!natural || natural.width <= 0 || natural.height <= 0) return null;
  const clamped = Number.isFinite(scale)
    ? Math.min(MAX_BACKGROUND_LAYER_SCALE, Math.max(MIN_BACKGROUND_LAYER_SCALE, scale))
    : 1;
  return {
    width: Math.max(1, Math.round(natural.width * clamped)),
    height: Math.max(1, Math.round(natural.height * clamped)),
  };
}

/**
 * How far the tiled sheet reaches past the board, in pixels on the side it is heading for.
 *
 * The sheet slides by one tile and springs back, so its offset never leaves `[-tile, 0]`. Cover
 * `[0, board + tile]` and the board stays covered at every point of that: at rest the sheet
 * reaches a tile beyond the far edge, and at the end of a run it has pulled that spare into
 * view. The near side needs nothing, which halves what the machine has to keep in memory.
 *
 * A still axis needs no spare at all: tiles already reach both edges.
 */
export function backgroundScrollMargin(
  tile: { width: number; height: number } | null,
  scrollsX: boolean,
  scrollsY: boolean
): { x: number; y: number } {
  if (!tile) return { x: 0, y: 0 };
  return {
    x: scrollsX ? tile.width : 0,
    y: scrollsY ? tile.height : 0,
  };
}
