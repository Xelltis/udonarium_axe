/**
 * The curves a cut-in keyframe eases along.
 *
 * Each curve is one set of cubic-bezier control points, and both the CSS the browser is
 * handed and the function a spec measures come out of that one set. What the animation
 * does and what the scrubber shows can therefore never drift apart.
 */

export const CUT_IN_EASINGS = {
  linear: [0, 0, 1, 1],
  inQuad: [0.55, 0.085, 0.68, 0.53],
  outQuad: [0.25, 0.46, 0.45, 0.94],
  inOutQuad: [0.455, 0.03, 0.515, 0.955],
  inCubic: [0.55, 0.055, 0.675, 0.19],
  outCubic: [0.215, 0.61, 0.355, 1],
  inOutCubic: [0.645, 0.045, 0.355, 1],
  outBack: [0.175, 0.885, 0.32, 1.275],
  step: null,
} as const satisfies Record<string, readonly [number, number, number, number] | null>;

export type CutInEasingName = keyof typeof CUT_IN_EASINGS;

export const CUT_IN_EASING_NAMES = Object.keys(CUT_IN_EASINGS) as CutInEasingName[];

export const DEFAULT_CUT_IN_EASING: CutInEasingName = 'outCubic';

/** Whether a stored value names one of the easing curves a keyframe can use. */
export function isCutInEasing(value: unknown): value is CutInEasingName {
  return typeof value === 'string' && value in CUT_IN_EASINGS;
}

/** The name, or the default for anything that is not one. */
export function readCutInEasing(value: unknown): CutInEasingName {
  return isCutInEasing(value) ? value : DEFAULT_CUT_IN_EASING;
}

/** What the browser is told, for a Web Animations keyframe. */
export function easingCss(name: CutInEasingName): string {
  const points = CUT_IN_EASINGS[name];
  if (!points) return 'steps(1, end)';
  return `cubic-bezier(${points.join(', ')})`;
}

/** How far along the change is, at a fraction of the way through. */
export function easingAt(name: CutInEasingName, progress: number): number {
  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  const points = CUT_IN_EASINGS[name];
  if (!points) return t < 1 ? 0 : 1;
  return cubicBezierAt(points[0], points[1], points[2], points[3], t);
}

const a = (a1: number, a2: number): number => 1 - 3 * a2 + 3 * a1;
const b = (a1: number, a2: number): number => 3 * a2 - 6 * a1;
const c = (a1: number): number => 3 * a1;

const alongAxis = (t: number, a1: number, a2: number): number => ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
const slopeAlongAxis = (t: number, a1: number, a2: number): number => 3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1);

/**
 * The height of the curve where it crosses the given fraction of the way across.
 *
 * The x of a bezier is not the fraction itself, so the parameter that lands on it is
 * hunted down with Newton-Raphson, falling back to bisection where the slope goes flat.
 */
export function cubicBezierAt(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x1 === y1 && x2 === y2) return x;
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  let t = x;
  for (let attempt = 0; attempt < 8; attempt++) {
    const slope = slopeAlongAxis(t, x1, x2);
    if (slope === 0) break;
    const error = alongAxis(t, x1, x2) - x;
    if (Math.abs(error) < 1e-6) return alongAxis(t, y1, y2);
    t -= error / slope;
  }

  let low = 0;
  let high = 1;
  t = x;
  for (let attempt = 0; attempt < 24; attempt++) {
    const at = alongAxis(t, x1, x2);
    if (Math.abs(at - x) < 1e-6) break;
    if (at > x) high = t;
    else low = t;
    t = (low + high) / 2;
  }
  return alongAxis(t, y1, y2);
}
