import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';

/**
 * Writes a way of straight legs as a peer tells the room it, `x,y` points in whole pixels joined by
 * spaces.
 */
export function writeMovingPoints(points: readonly MovePoint[]): string {
  return points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
}

/** Reads a way another peer told the room, as {@link writeMovingPoints} writes it, leaving out what cannot be read. */
export function readMovingPoints(text: string): MovePoint[] {
  const points: MovePoint[] = [];
  for (const pair of text.trim().split(/\s+/)) {
    const [x, y] = pair.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}

/**
 * A way as the room reads it once it is told: in whole pixels. Whoever measures along the way, the
 * peer walking it and those stepping into it, measures the same way.
 */
export function movingPointsAsRead(points: readonly MovePoint[]): MovePoint[] {
  return readMovingPoints(writeMovingPoints(points));
}
