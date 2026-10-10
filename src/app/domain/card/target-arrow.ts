export interface TargetArrowPoint {
  x: number;
  y: number;
  z: number;
}

export interface TargetArrowGeometry {
  x: number;
  y: number;
  z: number;
  length: number;
  angle: number;
}

const MIN_ARROW_LENGTH = 16;

/**
 * Where to draw a targeting arrow from one point on the table to another: its origin, length and angle in
 * degrees.
 *
 * Returns null when the two points are too close for an arrow to read, so the caller draws nothing. The
 * arrow is lifted to the higher of the two points so it is not hidden under either end.
 */
export function targetArrowGeometry(from: TargetArrowPoint, to: TargetArrowPoint): TargetArrowGeometry | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(length) || length < MIN_ARROW_LENGTH) return null;

  return {
    x: from.x,
    y: from.y,
    z: Math.max(from.z, to.z),
    length,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
