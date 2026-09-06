export type RadialMenuSeat = 'north' | 'east' | 'south' | 'west';

export interface RadialPoint {
  x: number;
  y: number;
}

export interface RadialViewport {
  width: number;
  height: number;
}

export const RADIAL_MENU_PAGE_SIZE = 8;

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

export function seatAngle(seat: RadialMenuSeat): number {
  return SEAT_ANGLE[seat];
}

export function seatTextRotation(seat: RadialMenuSeat): number {
  return SEAT_TEXT_ROTATION[seat];
}

export function pointAtAngle(angleDegrees: number, radius: number): RadialPoint {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius,
  };
}

export function angleOnRing(index: number, count: number, startAngleDegrees = -90): number {
  if (count < 1) return startAngleDegrees;
  return startAngleDegrees + (360 / count) * index;
}

export function pointOnRing(index: number, count: number, radius: number, startAngleDegrees = -90): RadialPoint {
  if (count < 1) return { x: 0, y: 0 };
  return pointAtAngle(angleOnRing(index, count, startAngleDegrees), radius);
}

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

export function annularSectorLabelPoint(
  index: number,
  count: number,
  radius: number,
  startAngleDegrees = -90
): RadialPoint {
  return pointOnRing(index, count, radius, startAngleDegrees);
}

export function annularSectorLabelWidth(radius: number, count: number, gapPx = 3): number {
  const safeRadius = Math.max(1, radius);
  const safeCount = Math.max(1, count);
  if (safeCount === 1) return Math.max(36, Math.min(160, safeRadius * 1.2));
  const itemAngleRadians = (Math.PI * 2) / safeCount;
  const gapAngleRadians = Math.max(0, gapPx) / safeRadius;
  const usableHalfAngle = Math.max(0.01, (itemAngleRadians - gapAngleRadians) / 2);
  return Math.max(36, 2 * safeRadius * Math.sin(usableHalfAngle) - 12);
}

export function outwardRotationOnRing(index: number, count: number, startAngleDegrees = -90): number {
  if (count < 1) return 0;
  const pointAngle = angleOnRing(index, count, startAngleDegrees);
  return (((pointAngle + 270) % 360) + 360) % 360;
}

export function nearestCardinalRotation(degrees: number): 0 | 90 | 180 | 270 {
  const normalized = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

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

export function radialPageCount(itemCount: number, pageSize = RADIAL_MENU_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function radialPage<T>(items: T[], page: number, pageSize = RADIAL_MENU_PAGE_SIZE): T[] {
  const pageCount = radialPageCount(items.length, pageSize);
  const safePage = Math.max(0, Math.min(page, pageCount - 1));
  return items.slice(safePage * pageSize, (safePage + 1) * pageSize);
}
