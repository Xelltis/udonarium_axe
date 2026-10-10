export const SUPERSAMPLE_MAX_FACTOR = 4;
export const SUPERSAMPLE_MAX_BOX_PX = 512;

/**
 * How many times larger to draw a picture before scaling it down, so a detailed image stays
 * sharp when the table is zoomed in.
 *
 * Only whole factors of two or more are used, limited by how much detail the image really
 * has, by `maxBoxPx` for the enlarged box and by `maxFactor`; otherwise 1, meaning no
 * supersampling.
 */
export function supersampleFactor(
  naturalPx: number,
  layoutPx: number,
  maxFactor = SUPERSAMPLE_MAX_FACTOR,
  maxBoxPx = SUPERSAMPLE_MAX_BOX_PX
): number {
  if (!Number.isFinite(naturalPx) || !Number.isFinite(layoutPx)) return 1;
  if (naturalPx <= 0 || layoutPx <= 0) return 1;

  const byNatural = Math.floor(naturalPx / layoutPx);
  const byBox = Math.floor(maxBoxPx / layoutPx);
  const factor = Math.min(byNatural, byBox, Math.floor(maxFactor));

  return 2 <= factor ? factor : 1;
}

/**
 * How far up, in percent of the enlarged box, a bottom-anchored picture must be moved so that
 * after scaling down it still stands on the same line; 0 without supersampling.
 */
export function supersampleOffsetPercent(factor: number): number {
  if (!(1 < factor)) return 0;
  return (50 * (factor - 1)) / factor;
}

/**
 * The negative CSS inset, in percent, that grows a box to the supersampled size around its
 * centre; 0 without supersampling.
 */
export function supersampleInsetPercent(factor: number): number {
  if (!(1 < factor)) return 0;
  return -(factor - 1) * 50;
}

export type SupersampleAnchor = 'top' | 'bottom' | 'center';

export interface SupersampleTransformOptions {
  readonly factor: number;
  readonly anchor: SupersampleAnchor;
  readonly outer?: string;
  readonly inner?: string;
}

/**
 * The CSS transform that shrinks a supersampled picture back to its layout size.
 *
 * `outer` goes first and `inner` just before the scale; a picture anchored to the top or
 * bottom is shifted so it keeps that edge in place, while a centred one needs no shift.
 */
export function supersampleTransform(opts: SupersampleTransformOptions): string {
  const parts: string[] = [];
  if (opts.outer) parts.push(opts.outer);

  if (1 < opts.factor && opts.anchor !== 'center') {
    parts.push(`translateY(${trim(-supersampleOffsetPercent(opts.factor), 4)}%)`);
  }

  if (opts.inner) parts.push(opts.inner);
  if (1 < opts.factor) parts.push(`scale(${trim(1 / opts.factor, 6)})`);

  return parts.join(' ');
}

function trim(value: number, digits: number): string {
  return Number(value.toFixed(digits)).toString();
}
