import { withoutExtension } from '@axe/core/util/file-name';

/** A point on a picture, in its pixels. */
export interface EditPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle on a picture, in whole pixels, never empty. */
export interface EditRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The size of a picture, in whole pixels. */
export interface EditSize {
  readonly width: number;
  readonly height: number;
}

/** How far a picture is turned, clockwise, in quarters. */
export type EditQuarterTurns = 0 | 1 | 2 | 3;

/** How a picture is turned and mirrored before anything else is done to it. */
export interface EditOrientation {
  readonly quarterTurns: EditQuarterTurns;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export const UPRIGHT: EditOrientation = { quarterTurns: 0, flipX: false, flipY: false };

/** The size a picture comes out at once it is turned: a quarter turn swaps its sides. */
export function orientedSize(size: EditSize, orientation: EditOrientation): EditSize {
  return orientation.quarterTurns % 2 === 1 ? { width: size.height, height: size.width } : size;
}

/** The orientation after one more quarter turn, clockwise or back. */
export function turned(orientation: EditOrientation, clockwise: boolean): EditOrientation {
  const quarterTurns = (((orientation.quarterTurns + (clockwise ? 1 : 3)) % 4) + 4) % 4;
  return { ...orientation, quarterTurns: quarterTurns as EditQuarterTurns };
}

/**
 * Where a point of a picture lands once the picture is turned a quarter, clockwise or back.
 * `size` is the picture before the turn. The point is a pixel, so it stays on a pixel.
 */
export function turnPoint(point: EditPoint, size: EditSize, clockwise: boolean): EditPoint {
  return clockwise ? { x: size.height - 1 - point.y, y: point.x } : { x: point.y, y: size.width - 1 - point.x };
}

/** Where a rectangle lands once the picture is turned a quarter; `size` is the picture before the turn. */
export function turnRect(rect: EditRect, size: EditSize, clockwise: boolean): EditRect {
  const x = clockwise ? size.height - rect.y - rect.height : rect.y;
  const y = clockwise ? rect.x : size.width - rect.x - rect.width;
  return { x, y, width: rect.height, height: rect.width };
}

/** Where a point lands once the picture is mirrored across, or up and down. */
export function flipPoint(point: EditPoint, size: EditSize, across: boolean): EditPoint {
  return across ? { x: size.width - 1 - point.x, y: point.y } : { x: point.x, y: size.height - 1 - point.y };
}

/** Where a rectangle lands once the picture is mirrored across, or up and down. */
export function flipRect(rect: EditRect, size: EditSize, across: boolean): EditRect {
  return across ? { ...rect, x: size.width - rect.x - rect.width } : { ...rect, y: size.height - rect.y - rect.height };
}

/** The whole of a picture, as a rectangle. */
export function wholeRect(size: EditSize): EditRect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

/** A rectangle brought onto whole pixels and inside the picture, at least a pixel each way. */
export function clampRect(rect: EditRect, size: EditSize): EditRect {
  const width = Math.min(Math.max(1, Math.round(rect.width)), size.width);
  const height = Math.min(Math.max(1, Math.round(rect.height)), size.height);
  const x = Math.min(Math.max(0, Math.round(rect.x)), size.width - width);
  const y = Math.min(Math.max(0, Math.round(rect.y)), size.height - height);
  return { x, y, width, height };
}

/**
 * The rectangle dragged out from one corner to the other, held to a width-to-height ratio when
 * one is given, and kept inside the picture. The corner it starts from stays where it is; the
 * other comes as near to the pointer as the ratio and the picture allow.
 */
export function rectFromCorners(from: EditPoint, to: EditPoint, ratio: number | null, size: EditSize): EditRect {
  const anchorX = Math.min(Math.max(0, from.x), size.width);
  const anchorY = Math.min(Math.max(0, from.y), size.height);
  const towardX = Math.min(Math.max(0, to.x), size.width);
  const towardY = Math.min(Math.max(0, to.y), size.height);
  const signX = towardX >= anchorX ? 1 : -1;
  const signY = towardY >= anchorY ? 1 : -1;
  let width = Math.abs(towardX - anchorX);
  let height = Math.abs(towardY - anchorY);
  if (ratio !== null && ratio > 0) {
    const roomX = signX > 0 ? size.width - anchorX : anchorX;
    const roomY = signY > 0 ? size.height - anchorY : anchorY;
    width = Math.max(width, height * ratio);
    width = Math.min(width, roomX, roomY * ratio);
    height = width / ratio;
  }
  const x = signX > 0 ? anchorX : anchorX - width;
  const y = signY > 0 ? anchorY : anchorY - height;
  return clampRect({ x, y, width, height }, size);
}

/** The largest rectangle of a width-to-height ratio that fits the picture, in its middle. */
export function centeredRect(ratio: number, size: EditSize): EditRect {
  if (!(ratio > 0)) return wholeRect(size);
  const width = Math.min(size.width, size.height * ratio);
  const height = width / ratio;
  return clampRect({ x: (size.width - width) / 2, y: (size.height - height) / 2, width, height }, size);
}

/** A rectangle moved by a distance, kept inside the picture. */
export function movedRect(rect: EditRect, dx: number, dy: number, size: EditSize): EditRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, size);
}

/**
 * The size a picture is drawn out at, from a width or a height asked for, the other following
 * the picture's own proportions when they are held. At least a pixel each way.
 */
export function resizedSize(
  source: EditSize,
  asked: { readonly width?: number; readonly height?: number },
  keepRatio: boolean
): EditSize {
  const whole = (value: number) => Math.max(1, Math.round(value));
  const width = asked.width !== undefined && asked.width > 0 ? asked.width : undefined;
  const height = asked.height !== undefined && asked.height > 0 ? asked.height : undefined;
  if (keepRatio) {
    if (width !== undefined) return { width: whole(width), height: whole((width * source.height) / source.width) };
    if (height !== undefined) return { width: whole((height * source.width) / source.height), height: whole(height) };
    return source;
  }
  return { width: whole(width ?? source.width), height: whole(height ?? source.height) };
}

/** The size a picture comes out at a share of its own, a hundred being as it is. */
export function scaledSize(source: EditSize, percent: number): EditSize {
  const share = Math.max(percent, 0) / 100;
  return {
    width: Math.max(1, Math.round(source.width * share)),
    height: Math.max(1, Math.round(source.height * share)),
  };
}

/**
 * The name a picture worked on is stored under: its own, with the extension of the type it was
 * written out as. A name that is a picture's hash, as a room's archive names them, is marked, or
 * the edit would be stored under the hash of the picture it came from.
 */
export function editedName(name: string, type = 'image/png'): string {
  const extension = type === 'image/webp' ? 'webp' : 'png';
  const base = withoutExtension(name);
  if (base.length === 0) return `image.${extension}`;
  return /^[0-9a-f]{64}$/.test(base) ? `${base}-edited.${extension}` : `${base}.${extension}`;
}
