/** How fast a layer may be asked to drift, in pixels a second. */
export const MAX_BACKGROUND_SCROLL_SPEED = 2000;
/** How far a layer may be blown up or shrunk from the size the picture was drawn at. */
export const MIN_BACKGROUND_LAYER_SCALE = 0.1;
export const MAX_BACKGROUND_LAYER_SCALE = 10;
/**
 * The quickest a tile may be asked to pass, which is about three frames of a sixty hertz screen.
 *
 * A one pixel tile at full speed works out at half a millisecond a lap, two thousand laps a
 * second. Nothing is read from that but flicker, and the browser keeps the animation ticking to
 * produce it.
 */
export const MIN_BACKGROUND_SCROLL_SECONDS = 0.05;

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
 *
 * A lap is never asked to run quicker than the eye can follow it. A small enough picture at a
 * high enough speed works out at thousands of laps a second, which is a cost with nothing to
 * show for it.
 */
export function backgroundScrollAnimation(speedPx: number, tilePx: number): BackgroundScrollAnimation {
  if (!Number.isFinite(speedPx) || !Number.isFinite(tilePx)) return STILL;
  if (tilePx <= 0) return STILL;

  const speed = Math.min(MAX_BACKGROUND_SCROLL_SPEED, Math.abs(speedPx));
  if (speed <= 0) return STILL;

  const seconds = Math.max(MIN_BACKGROUND_SCROLL_SECONDS, tilePx / speed);
  return { durationSeconds: +seconds.toFixed(4), reversed: speedPx < 0 };
}

/**
 * The size one tile is drawn at, which is what the drift is measured against.
 *
 * Whole pixels, always. A tile of 665.6px is placed by the browser at a rounded position each
 * time it repeats, and the rounding leaves a hairline of nothing between one tile and the next.
 *
 * Given the board it is laid on, a tile is never drawn larger than the board. The spare cloth a
 * drift needs is one tile wide, so a tile past the board makes the sheet grow without bound: a
 * four thousand pixel picture at ten times is forty thousand pixels of it, and none of that is
 * a repeat anyone can see. Held to the board, the sheet is at worst twice the board.
 */
export function backgroundTileSize(
  natural: { width: number; height: number } | null,
  scale: number,
  board?: { width: number; height: number } | null
): { width: number; height: number } | null {
  if (!natural || natural.width <= 0 || natural.height <= 0) return null;
  const clamped = Number.isFinite(scale)
    ? Math.min(MAX_BACKGROUND_LAYER_SCALE, Math.max(MIN_BACKGROUND_LAYER_SCALE, scale))
    : 1;
  return {
    width: heldToBoard(natural.width * clamped, board?.width),
    height: heldToBoard(natural.height * clamped, board?.height),
  };
}

function heldToBoard(size: number, board: number | undefined): number {
  const held = Number.isFinite(board) && (board as number) >= 1 ? Math.min(size, board as number) : size;
  return Math.max(1, Math.round(held));
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
