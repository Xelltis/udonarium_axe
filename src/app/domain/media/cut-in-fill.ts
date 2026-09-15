/**
 * How a band layer is painted.
 *
 * One place decides the CSS, so the editor's preview, the playing window and the video
 * export cannot drift apart on what a band is supposed to look like.
 */

export const CUT_IN_FILL_SHAPES = ['linear', 'radial', 'conic', 'stripes', 'speedlines', 'halftone'] as const;
export type CutInFillShape = (typeof CUT_IN_FILL_SHAPES)[number];

/** How wide one band, one dot pitch or one gap is, where the fill repeats. */
export const DEFAULT_FILL_SCALE_PX = 24;
export const MIN_FILL_SCALE_PX = 2;
export const MAX_FILL_SCALE_PX = 200;

export interface CutInFill {
  shape: CutInFillShape;
  from: string;
  /** A colour passed through on the way. Empty for a straight run from one to the other. */
  mid: string;
  /** Empty for one flat colour, whatever the shape says. For lines, the colour of the clear middle. */
  to: string;
  angleDeg: number;
  /** How far apart the bands, the dots or the rays are, in the cut-in's own coordinates. */
  scalePx: number;
}

/** How far apart a repeating fill repeats, held to what can still be seen. */
export function fillScaleOf(fill: CutInFill): number {
  const asked = Number(fill.scalePx);
  const scale = Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_FILL_SCALE_PX;
  return Math.min(MAX_FILL_SCALE_PX, Math.max(MIN_FILL_SCALE_PX, scale));
}

/** How wide a ray of a converging fill is, in degrees. */
export function rayDegOf(fill: CutInFill): number {
  return Math.min(20, Math.max(0.3, fillScaleOf(fill) / 12));
}

/** Whether a stored value names one of the ways a band layer can be painted. */
export function isCutInFillShape(value: unknown): value is CutInFillShape {
  return typeof value === 'string' && (CUT_IN_FILL_SHAPES as readonly string[]).includes(value);
}

/** The colours a fill runs through, in order. */
export function fillStops(fill: CutInFill): string[] {
  return [fill.from, fill.mid, fill.to].filter((colour) => colour.length > 0);
}

/**
 * The CSS background that paints a band layer.
 *
 * Speed lines and halftone draw a pattern in the first colour, with the last as the clear
 * middle or the ground. Any other shape with fewer than two colours is one flat colour, or
 * transparent with none; an angle that is not a number reads as 90 degrees.
 */
export function fillCss(fill: CutInFill): string {
  const stops = fillStops(fill);
  const angle = Number.isFinite(fill.angleDeg) ? fill.angleDeg : 90;

  // These two draw a pattern rather than a run of colour, so one colour is enough.
  if (fill.shape === 'speedlines') return speedlinesCss(fill, stops[0] ?? '#000000');
  if (fill.shape === 'halftone') return halftoneCss(fill, stops[0] ?? '#000000');

  if (stops.length < 2) return stops[0] ?? 'transparent';
  const list = stops.join(', ');

  switch (fill.shape) {
    case 'radial':
      return `radial-gradient(circle at 50% 50%, ${list})`;
    case 'conic':
      return `conic-gradient(from ${angle}deg at 50% 50%, ${list}, ${stops[0]})`;
    case 'stripes':
      return `repeating-linear-gradient(${angle}deg, ${stripeStops(stops, fillScaleOf(fill))})`;
    default:
      return `linear-gradient(${angle}deg, ${list})`;
  }
}

/**
 * Lines converging on the middle.
 *
 * The clear middle is what makes them read as speed rather than as a fan, and it is
 * painted in whichever colour the fill was told to end on.
 */
function speedlinesCss(fill: CutInFill, colour: string): string {
  const ray = rayDegOf(fill);
  const rays = `repeating-conic-gradient(from ${fill.angleDeg}deg at 50% 50%, ${colour} 0deg ${round(ray)}deg, transparent ${round(ray)}deg ${round(ray * 3)}deg)`;
  if (fill.to.length < 1) return rays;

  const clear = `radial-gradient(circle at 50% 50%, ${fill.to} 0%, ${fill.to} 34%, transparent 62%)`;
  return `${clear}, ${rays}`;
}

/** Dots on a grid, the way a printed screen is made. */
function halftoneCss(fill: CutInFill, colour: string): string {
  const pitch = fillScaleOf(fill);
  const dots = `radial-gradient(circle at 50% 50%, ${colour} 0%, ${colour} 30%, transparent 32%) 0 0 / ${pitch}px ${pitch}px`;
  if (fill.to.length < 1) return dots;

  return `${dots}, ${fill.to}`;
}

/** Hard-edged bands rather than a run of colour, which is what makes stripes stripes. */
function stripeStops(stops: readonly string[], width: number): string {
  const written: string[] = [];
  for (const [at, colour] of stops.entries()) {
    written.push(`${colour} ${at * width}px`, `${colour} ${(at + 1) * width}px`);
  }
  return written.join(', ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
