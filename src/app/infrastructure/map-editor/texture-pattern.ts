const MIN_TILE = 128;

/**
 * Makes a repeating fill from a texture picture.
 *
 * One tile of the picture spans two cells before the fill's own scale, and the rotation is in
 * degrees. Null where the canvas cannot make a pattern from the picture.
 */
export function createImageTexturePattern(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  cellPx: number,
  scale = 1,
  rotation = 0
): CanvasPattern | null {
  if (!ctx || typeof ctx.createPattern !== 'function' || !image) return null;
  let pattern: CanvasPattern | null;
  try {
    pattern = ctx.createPattern(image, 'repeat');
  } catch {
    return null;
  }
  if (!pattern) return null;
  const source = image as { width?: number; height?: number };
  const imageWidth = typeof source.width === 'number' && source.width > 0 ? source.width : 0;
  if (imageWidth > 0 && typeof DOMMatrix !== 'undefined' && typeof pattern.setTransform === 'function') {
    const span = 2 * (cellPx > 0 ? cellPx : MIN_TILE);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const safeRotation = Number.isFinite(rotation) ? rotation : 0;
    pattern.setTransform(new DOMMatrix().rotate(safeRotation).scale((safeScale * span) / imageWidth));
  }
  return pattern;
}
