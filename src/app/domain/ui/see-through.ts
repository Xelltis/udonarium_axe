/**
 * How opaque a pixel of a piece's picture has to be, out of 255, for a press on it to land on the
 * piece rather than pass through to whatever is beneath: a tenth of the way, so the soft edge of a
 * cut-out and the faint shadow under it are not something to grab by.
 */
export const SEE_THROUGH_ALPHA = 26;

/** How opaque a picture is at each point, read off it at a size small enough to keep. */
export interface AlphaMask {
  readonly width: number;
  readonly height: number;
  /** One opacity from 0 to 255 for each pixel, row after row. */
  readonly alpha: Uint8Array;
}

/** A point on a picture, from 0 to 1 across and down it; outside it below 0 or from 1 on. */
export interface PicturePoint {
  readonly u: number;
  readonly v: number;
}

/**
 * Where a point of an image element's box falls on the picture drawn in it.
 *
 * `fit` is the element's `object-fit`: a picture contained in its box leaves bands of nothing beside
 * it, and a point in those falls outside the picture. The picture stands in the middle of its box.
 * Null for a box or a picture with no size, where nothing can be told.
 */
export function picturePointOf(
  box: { readonly width: number; readonly height: number },
  picture: { readonly width: number; readonly height: number },
  fit: string,
  x: number,
  y: number
): PicturePoint | null {
  if (!(box.width > 0 && box.height > 0 && picture.width > 0 && picture.height > 0)) return null;
  const scale = fittedScale(box, picture, fit);
  if (scale === null) return { u: x / box.width, v: y / box.height };
  const width = picture.width * scale;
  const height = picture.height * scale;
  return {
    u: (x - (box.width - width) / 2) / width,
    v: (y - (box.height - height) / 2) / height,
  };
}

/** How much a picture is scaled to sit in its box, or null where it is stretched to fill it. */
function fittedScale(
  box: { readonly width: number; readonly height: number },
  picture: { readonly width: number; readonly height: number },
  fit: string
): number | null {
  const contain = Math.min(box.width / picture.width, box.height / picture.height);
  switch (fit) {
    case 'contain':
      return contain;
    case 'scale-down':
      return Math.min(1, contain);
    case 'cover':
      return Math.max(box.width / picture.width, box.height / picture.height);
    case 'none':
      return 1;
    default:
      return null;
  }
}

/** Whether a press at a point of a picture passes through it: off the picture, or where it is all but clear. */
export function seesThroughAt(mask: AlphaMask, point: PicturePoint): boolean {
  if (!(point.u >= 0 && point.u < 1 && point.v >= 0 && point.v < 1)) return true;
  const column = Math.min(mask.width - 1, Math.floor(point.u * mask.width));
  const row = Math.min(mask.height - 1, Math.floor(point.v * mask.height));
  return mask.alpha[row * mask.width + column] < SEE_THROUGH_ALPHA;
}
