export type RadialMenuSeat = 'north' | 'east' | 'south' | 'west';

export interface RadialPoint {
  x: number;
  y: number;
}

export interface RadialViewport {
  width: number;
  height: number;
}

const SEAT_ANGLE: Record<RadialMenuSeat, number> = {
  north: -90,
  east: 0,
  south: 90,
  west: 180,
};

const SEAT_TEXT_ROTATION: Record<RadialMenuSeat, number> = {
  north: 180,
  east: 270,
  south: 0,
  west: 90,
};

/** The screen direction of a seat round the table, in degrees clockwise from pointing right. */
export function seatAngle(seat: RadialMenuSeat): number {
  return SEAT_ANGLE[seat];
}

/**
 * How far to turn text, a panel or a cut-in so it reads upright for someone sitting on that
 * side of the screen; north reads upside down from below.
 */
export function seatTextRotation(seat: RadialMenuSeat): number {
  return SEAT_TEXT_ROTATION[seat];
}

/** The offset from the centre at `radius` pixels in the given screen direction, y pointing down. */
export function pointAtAngle(angleDegrees: number, radius: number): RadialPoint {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius,
  };
}

/**
 * The direction of item `index` of `count` spaced evenly round a ring, starting from straight up
 * unless another start is given; the start itself when there are no items.
 */
export function angleOnRing(index: number, count: number, startAngleDegrees = -90): number {
  if (count < 1) return startAngleDegrees;
  return startAngleDegrees + (360 / count) * index;
}

/** The offset from the centre of item `index` of `count` round a ring; the centre with no items. */
export function pointOnRing(index: number, count: number, radius: number, startAngleDegrees = -90): RadialPoint {
  if (count < 1) return { x: 0, y: 0 };
  return pointAtAngle(angleOnRing(index, count, startAngleDegrees), radius);
}

/**
 * A CSS `clip-path` polygon for item `index`'s slice of a ring between the inner and outer radius.
 *
 * Neighbouring slices are kept `gapPx` apart. The points are laid out in a box twice the outer
 * radius square with the ring's centre in its middle, and the arcs are sampled finely enough
 * to look round.
 */
export function annularSectorPolygon(
  index: number,
  count: number,
  innerRadius: number,
  outerRadius: number,
  gapPx = 3,
  startAngleDegrees = -90
): string {
  const safeCount = Math.max(1, count);
  const safeOuterRadius = Math.max(1, outerRadius);
  const safeInnerRadius = Math.max(0, Math.min(innerRadius, safeOuterRadius - 1));
  const middleRadius = Math.max(1, (safeInnerRadius + safeOuterRadius) / 2);
  const itemAngle = 360 / safeCount;
  const gapAngle = (Math.max(0, gapPx) / middleRadius) * (180 / Math.PI);
  const halfSpan = Math.max(0.5, Math.min(179.5, (itemAngle - gapAngle) / 2));
  const centerAngle = angleOnRing(index, safeCount, startAngleDegrees);
  const startAngle = centerAngle - halfSpan;
  const endAngle = centerAngle + halfSpan;
  const sampleCount = Math.max(2, Math.ceil((halfSpan * 2) / 12));
  const point = (angle: number, radius: number): RadialPoint => {
    const offset = pointAtAngle(angle, radius);
    return { x: safeOuterRadius + offset.x, y: safeOuterRadius + offset.y };
  };
  const points: RadialPoint[] = [];

  for (let sample = 0; sample <= sampleCount; sample++) {
    points.push(point(startAngle + ((endAngle - startAngle) * sample) / sampleCount, safeOuterRadius));
  }
  for (let sample = sampleCount; sample >= 0; sample--) {
    points.push(point(startAngle + ((endAngle - startAngle) * sample) / sampleCount, safeInnerRadius));
  }

  return `polygon(${points.map(({ x, y }) => `${x.toFixed(3)}px ${y.toFixed(3)}px`).join(', ')})`;
}

/** Where item `index`'s label sits, as an offset from the ring's centre at `radius`. */
export function annularSectorLabelPoint(
  index: number,
  count: number,
  radius: number,
  startAngleDegrees = -90
): RadialPoint {
  return pointOnRing(index, count, radius, startAngleDegrees);
}

/**
 * How wide a label may be inside one slice of a ring of `count` items at `radius`, never under 36px.
 *
 * A ring of one item has no neighbours to stay clear of, so its label is sized from the radius.
 */
export function annularSectorLabelWidth(radius: number, count: number, gapPx = 3): number {
  const safeRadius = Math.max(1, radius);
  const safeCount = Math.max(1, count);
  if (safeCount === 1) return Math.max(36, Math.min(160, safeRadius * 1.2));
  const itemAngleRadians = (Math.PI * 2) / safeCount;
  const gapAngleRadians = Math.max(0, gapPx) / safeRadius;
  const usableHalfAngle = Math.max(0.01, (itemAngleRadians - gapAngleRadians) / 2);
  return Math.max(36, 2 * safeRadius * Math.sin(usableHalfAngle) - 12);
}

/**
 * How far to turn item `index` of a ring so it reads upright for someone looking in from outside
 * the ring at that point, from 0 to under 360; 0 with no items.
 */
export function outwardRotationOnRing(index: number, count: number, startAngleDegrees = -90): number {
  if (count < 1) return 0;
  const pointAngle = angleOnRing(index, count, startAngleDegrees);
  return (((pointAngle + 270) % 360) + 360) % 360;
}

/** Rounds an angle to the nearest quarter turn, as 0, 90, 180 or 270. */
export function nearestCardinalRotation(degrees: number): 0 | 90 | 180 | 270 {
  const normalized = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

/**
 * Moves the centre of a radial menu so that `extent` pixels round it stay inside the window.
 *
 * Along an axis too short to hold it, the menu is centred on that axis instead.
 */
export function clampRadialCenter(anchor: RadialPoint, viewport: RadialViewport, extent: number): RadialPoint {
  const clampAxis = (value: number, length: number): number => {
    if (length <= extent * 2) return length / 2;
    return Math.max(extent, Math.min(value, length - extent));
  };

  return {
    x: clampAxis(anchor.x, viewport.width),
    y: clampAxis(anchor.y, viewport.height),
  };
}
