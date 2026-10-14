/** How a piece stands in water. */
export interface Submersion {
  /** How much of its picture, up from its feet, is under the surface, from just over 0 to 1. */
  readonly share: number;
  /** How far the surface stands over its feet, in pixels. */
  readonly depthPx: number;
}

/** How much of the picture under the surface still shows through the water. */
export const SUBMERGED_ALPHA = 0.6;

/**
 * Water shallower than this over a piece's feet, in pixels, is not drawn on the piece: a
 * surface level with the ground under it is the floor of the water, not water over the feet.
 */
const WET_FEET_PX = 0.5;

/** The softening either side of the waterline, in percent of the picture. */
const WATERLINE_SOFTNESS = 1.5;

/** The hue the sepia step of a CSS filter turns grey to, in degrees, which the turn to the water's hue starts from. */
const SEPIA_HUE = 38.6;

/**
 * How a piece stands in water, or null where it does not.
 *
 * A piece stands in the water when its feet are below the surface of the water under it. A
 * piece on a rock standing out of the water, or flying over it, is dry.
 */
export function submersionOf(basePx: number, pictureHeightPx: number, surfacePx: number): Submersion | null {
  if (![basePx, pictureHeightPx, surfacePx].every(Number.isFinite)) return null;
  const depthPx = surfacePx - basePx;
  if (depthPx < WET_FEET_PX || pictureHeightPx <= 0) return null;
  return { share: Math.min(depthPx / pictureHeightPx, 1), depthPx };
}

/**
 * How much of a piece's feet still shows through the water standing over them, from 1 down to
 * nearly nothing.
 *
 * Clear water hides little even a few cells down; murky water swallows a piece's feet in a cell.
 */
export function feetShowingOf(depthPx: number, gridSize: number, turbidity: number): number {
  const cells = gridSize > 0 && Number.isFinite(depthPx) ? Math.max(depthPx, 0) / gridSize : 0;
  const murk = Math.min(Math.max(Number.isFinite(turbidity) ? turbidity : 0, 0), 1);
  return round(Math.exp(-(0.15 + 2.2 * murk) * cells));
}

/**
 * The mask that lets the part of the picture under the surface show through, as a CSS image.
 *
 * Above the waterline the picture is whole; below it the water takes some of it away, and more
 * the further down it reaches when the water is murky, down to `feet` of it at the feet. The line
 * is softened a little, as a surface seen side on is never a hard edge.
 */
export function waterlineMask(share: number, feet = 1, turbidity = 0): string {
  const line = percent(share);
  const below = round(Math.max(line - WATERLINE_SOFTNESS, 0));
  const above = round(Math.min(line + WATERLINE_SOFTNESS, 100));
  const atLine = round(SUBMERGED_ALPHA * (1 - Math.pow(clamp01(turbidity), 1.5)));
  if (feet >= 0.999 && atLine === SUBMERGED_ALPHA) {
    return `linear-gradient(to top, rgba(0, 0, 0, ${SUBMERGED_ALPHA}) ${below}%, #000 ${above}%)`;
  }
  const atFeet = round(atLine * clamp01(feet));
  return `linear-gradient(to top, rgba(0, 0, 0, ${atFeet}) 0%, rgba(0, 0, 0, ${atLine}) ${below}%, #000 ${above}%)`;
}

/** The cut that keeps only the part of the picture under the surface, as a CSS clip path. */
export function submergedClip(share: number): string {
  return `inset(${round(100 - percent(share))}% 0 0 0)`;
}

/**
 * The mask that fades the tinted copy of the part under the surface towards the feet, as a CSS
 * image, or null where the feet still show whole and nothing need fade. Under opaque water
 * nothing of it shows even at the waterline.
 */
export function submergedFade(share: number, feet: number, turbidity = 0): string | null {
  const atLine = round(1 - Math.pow(clamp01(turbidity), 1.5));
  if (feet >= 0.999 && atLine >= 0.999) return null;
  const atFeet = round(atLine * clamp01(feet));
  return `linear-gradient(to top, rgba(0, 0, 0, ${atFeet}) 0%, rgba(0, 0, 0, ${atLine}) ${round(percent(share))}%, #000 ${round(Math.min(percent(share) + WATERLINE_SOFTNESS, 100))}%)`;
}

/** How strongly the tinted copy is laid over: the murkier the water, the more of its colour. */
export function submergedTintOpacity(turbidity: number): number {
  return round(0.7 + 0.25 * clamp01(turbidity));
}

/**
 * The CSS filter that turns a picture to the colour of the water it is seen through.
 *
 * Every colour is first turned to the brown of old photographs, then round to the water's
 * own hue, so a picture of any colour comes out in the one colour of the water. A colour
 * that cannot be read gives the hue of clear water.
 */
export function waterTintFilter(color: string): string {
  const hue = hueOf(color) ?? 195;
  const turn = round((((hue - SEPIA_HUE) % 360) + 360) % 360);
  return `sepia(1) hue-rotate(${turn}deg) saturate(1.6) brightness(0.82)`;
}

function hueOf(color: string): number | null {
  const digits = color.trim().replace(/^#/, '');
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(expanded.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return null;
  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return (hue * 60 + 360) % 360;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function percent(share: number): number {
  return Math.min(Math.max(share, 0), 1) * 100;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
