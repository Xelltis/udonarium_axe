/** A 2D canvas a replay picture is drawn on, on screen or off it. */
export type ReplayFrameCanvas = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A picture ready to draw, with its size. */
export type ReplayFrameImage = CanvasImageSource & { width: number; height: number };

/** Where the pictures a replay draws are found, by their identifiers. */
export interface ReplayFrameAssets {
  imageOf(identifier: string): ReplayFrameImage | null;
}

export const REPLAY_FRAME_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Verdana, Meiryo, 'M+ 1p', sans-serif";

/**
 * Traces a rounded rectangle. True when it could.
 *
 * A context without `roundRect` cannot; the caller falls back to square corners.
 */
export function roundedRectPath(
  ctx: ReplayFrameCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): boolean {
  if (typeof ctx.roundRect !== 'function') return false;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  return true;
}
