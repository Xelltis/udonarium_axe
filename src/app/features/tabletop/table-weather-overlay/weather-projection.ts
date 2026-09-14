export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * How far past the board it reaches.
 *
 * A fade that starts inside the board floats over it as a visible ring.
 * It holds its density to the edge and does all of its fading beyond it.
 */
const BLEED = 1.55;

function isDrawable(points: readonly ScreenPoint[]): boolean {
  return points.length > 0 && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

/**
 * The mask that keeps the weather about the board.
 *
 * Cut out by a polygon it would show a straight edge in mid-air, like a glass case.
 * Weather has no outline, so an ellipse over the board and the sky above fades it out.
 *
 * A `step` above one lands the ellipse on that many pixels, so a camera that moves a little
 * leaves the mask as it was and the whole screen is not masked again.
 */
export function weatherMaskImage(corners: readonly ScreenPoint[], step = 1): string {
  if (!isDrawable(corners)) return 'none';

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const snap = (value: number) => (step > 1 ? Math.round(value / step) * step : value);
  const centerX = snap((Math.min(...xs) + Math.max(...xs)) / 2);
  const centerY = snap((Math.min(...ys) + Math.max(...ys)) / 2);
  const spanX = ((Math.max(...xs) - Math.min(...xs)) / 2) * BLEED;
  const spanY = ((Math.max(...ys) - Math.min(...ys)) / 2) * BLEED;
  if (spanX < 1 || spanY < 1) return 'none';
  const radiusX = Math.max(step, snap(spanX));
  const radiusY = Math.max(step, snap(spanY));

  // Where the edge of the board falls. It holds to there and fades over what is left.
  const edge = 100 / BLEED;
  const stops = [
    `#000 ${edge.toFixed(0)}%`,
    // Falling off in one step shows the edge as a ring; a stop in between eases the slope.
    `rgba(0, 0, 0, 0.62) ${(edge + (100 - edge) * 0.4).toFixed(0)}%`,
    `rgba(0, 0, 0, 0.22) ${(edge + (100 - edge) * 0.72).toFixed(0)}%`,
    'transparent 100%',
  ];

  return (
    `radial-gradient(${radiusX.toFixed(0)}px ${radiusY.toFixed(0)}px` +
    ` at ${centerX.toFixed(0)}px ${centerY.toFixed(0)}px, ${stops.join(', ')})`
  );
}

/**
 * Which way the haze is painted: the angle from the back of the board to the front, in css degrees.
 *
 * Painted evenly from the top of the screen down, a dense haze is just a white sheet.
 * Denser at the back and thinner at the front, the distance hazes over instead.
 */
export function weatherDepthDirection(floorCorners: readonly ScreenPoint[]): string {
  if (!isDrawable(floorCorners) || floorCorners.length < 4) return 'to bottom';

  const sorted = [...floorCorners].sort((a, b) => a.y - b.y);
  const far = midpoint(sorted[0], sorted[1]);
  const near = midpoint(sorted[sorted.length - 2], sorted[sorted.length - 1]);

  const dx = near.x - far.x;
  const dy = near.y - far.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return 'to bottom';

  // Css angles start pointing up and run clockwise, while screen coordinates run down.
  const degree = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return `${degree.toFixed(1)}deg`;
}

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
