import type { ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
/**
 * The corners of a regular polygon as a flat x,y list, going round from the start angle; never
 * fewer than three sides.
 */
export function regularPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startAngleRad: number
): number[] {
  const count = Math.max(3, Math.floor(sides));
  const points: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = startAngleRad + (i * 2 * Math.PI) / count;
    points.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  return points;
}

/**
 * The outline of a star as a flat x,y list, alternating outer tips and inner corners from the start
 * angle; never fewer than two tips.
 */
export function starPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
  startAngleRad: number
): number[] {
  const count = Math.max(2, Math.floor(points));
  const result: number[] = [];
  const step = Math.PI / count;
  for (let i = 0; i < count * 2; i += 1) {
    const radius = i % 2 === 0 ? outerR : innerR;
    const angle = startAngleRad + i * step;
    result.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  return result;
}

/** How much of a balloon's height is body, the rest being the tail hanging under it. */
const BALLOON_BODY = 0.76;
/** How round the body's corners are, against its shorter side. */
const BALLOON_ROUND = 0.22;
/** Where along the body's underside the tail leaves and comes back, and where it points. */
const TAIL_LEAVES = 0.42;
const TAIL_RETURNS = 0.26;
const TAIL_TIP = 0.14;
/** How many points each rounded corner is drawn with. */
const CORNER_STEPS = 5;

/**
 * A balloon: a rounded box with a tail, drawn as one closed outline.
 *
 * Words on a board that somebody said want to look said, and a plain box does not say who is
 * speaking. The tail hangs off the underside towards the lower left, which is where a speaker
 * usually stands relative to what they are being quoted about.
 */
export function balloonPoints(x: number, y: number, w: number, h: number): number[] {
  const bottom = y + h * BALLOON_BODY;
  const round = Math.min(w, h * BALLOON_BODY) * BALLOON_ROUND;
  const right = x + w;
  const points: number[] = [];

  const corner = (cx: number, cy: number, from: number) => {
    for (let step = 0; step <= CORNER_STEPS; step += 1) {
      const angle = from + (step / CORNER_STEPS) * (Math.PI / 2);
      points.push(cx + round * Math.cos(angle), cy + round * Math.sin(angle));
    }
  };

  corner(x + round, y + round, Math.PI);
  corner(right - round, y + round, -Math.PI / 2);
  corner(right - round, bottom - round, 0);
  points.push(x + w * TAIL_LEAVES, bottom);
  points.push(x + w * TAIL_TIP, y + h);
  points.push(x + w * TAIL_RETURNS, bottom);
  corner(x + round, bottom - round, Math.PI / 2);
  return points;
}

/** Builds the outline for a shape. Rectangles and ellipses are drawn by the canvas, so they come back empty. */
export function generateShapePoints(kind: ShapeGeneratorKind, x: number, y: number, w: number, h: number): number[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  let unit: number[];
  if (kind === 'triangle') unit = regularPolygonPoints(0, 0, 1, 3, -Math.PI / 2);
  else if (kind === 'pentagon') unit = regularPolygonPoints(0, 0, 1, 5, -Math.PI / 2);
  else if (kind === 'hexagon') unit = regularPolygonPoints(0, 0, 1, 6, 0);
  else if (kind === 'star5') unit = starPoints(0, 0, 1, 0.382, 5, -Math.PI / 2);
  else if (kind === 'star6') unit = starPoints(0, 0, 1, 0.577, 6, -Math.PI / 2);
  else if (kind === 'balloon') return balloonPoints(x, y, w, h);
  else return [];
  const scaled: number[] = [];
  for (let i = 0; i + 1 < unit.length; i += 2) {
    scaled.push(cx + unit[i] * rx, cy + unit[i + 1] * ry);
  }
  return scaled;
}
