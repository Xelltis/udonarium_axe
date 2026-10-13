import { terrainBlocksMovement } from '@axe/domain/tabletop/move/blocked-cells';
import { clearRunAlong, MoveBlock, MovePoint, turnedMoveBlock } from '@axe/domain/tabletop/move/blocked-path';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { zoneCovers, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';

/**
 * How far past an edge a leg is taken where an edge ends it, in pixels, so the point it ends on
 * reads as across the edge rather than a rounding short of it.
 */
const ACROSS_EDGE_PX = 0.5;

/** How long a way of straight legs is, in pixels. */
export function pathLength(points: readonly MovePoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

/** The point a fraction of the way from one point to another. */
export function pointAlong(from: MovePoint, to: MovePoint, along: number): MovePoint {
  return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
}

/** The first `length` pixels of a way of straight legs, ending exactly that far along it. */
export function clipToLength(points: readonly MovePoint[], length: number): MovePoint[] {
  if (points.length < 1) return [];
  const clipped: MovePoint[] = [{ ...points[0] }];
  let walked = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const leg = Math.hypot(to.x - from.x, to.y - from.y);
    if (walked + leg >= length) {
      if (leg > 0 && length > walked) clipped.push(pointAlong(from, to, (length - walked) / leg));
      return clipped;
    }
    clipped.push({ ...to });
    walked += leg;
  }
  return clipped;
}

/**
 * The points a way of straight legs passes, every `stepPx` along it, ending on its last point.
 *
 * Where a piece is walked along the way a step at a time, each step lands on one of these; the
 * corners are not landed on unless a step happens to fall there.
 */
export function stepsAlong(points: readonly MovePoint[], stepPx: number): MovePoint[] {
  const total = pathLength(points);
  if (points.length < 2 || total <= 0 || stepPx <= 0) return [];
  const count = Math.max(1, Math.ceil(total / stepPx - 1e-9));
  const steps: MovePoint[] = [];
  let leg = 1;
  let legStart = 0;
  for (let index = 1; index <= count; index++) {
    const wanted = index === count ? total : index * stepPx;
    while (leg < points.length - 1) {
      const legLength = Math.hypot(points[leg].x - points[leg - 1].x, points[leg].y - points[leg - 1].y);
      if (legStart + legLength >= wanted) break;
      legStart += legLength;
      leg++;
    }
    const from = points[leg - 1];
    const to = points[leg];
    const legLength = Math.hypot(to.x - from.x, to.y - from.y);
    steps.push(legLength > 0 ? pointAlong(from, to, Math.min(1, (wanted - legStart) / legLength)) : { ...to });
  }
  return steps;
}

/**
 * How far along a straight leg it first crosses into a zone from outside, as a fraction of the
 * leg; null where it never does, and where it sets out inside.
 */
export function entryAlong(from: MovePoint, to: MovePoint, shape: ZoneShape): number | null {
  if (zoneCovers(shape, from)) return null;
  const range = crossingRange(from, to, shape);
  if (!range) return null;
  const [enter] = range;
  return enter >= 0 && enter <= 1 ? enter : null;
}

/**
 * How far along a straight leg it first leaves a zone it sets out inside, as a fraction of the leg;
 * null where it sets out outside, and where it is still inside at the end.
 */
export function exitAlong(from: MovePoint, to: MovePoint, shape: ZoneShape): number | null {
  if (!zoneCovers(shape, from)) return null;
  const range = crossingRange(from, to, shape);
  if (!range) return 0;
  const [, leave] = range;
  return leave >= 0 && leave < 1 ? leave : null;
}

/**
 * Where the line through a leg is inside a zone, as the fractions of the leg it goes in and comes
 * out at; null where the line misses the zone.
 */
function crossingRange(from: MovePoint, to: MovePoint, shape: ZoneShape): [number, number] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ox = from.x - shape.centre.x;
  const oy = from.y - shape.centre.y;
  if (shape.square) return slabRange(ox, oy, dx, dy, shape.reach);
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - shape.reach * shape.reach;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function slabRange(ox: number, oy: number, dx: number, dy: number, half: number): [number, number] | null {
  let enter = -Infinity;
  let leave = Infinity;
  for (const [origin, delta] of [
    [ox, dx],
    [oy, dy],
  ]) {
    if (delta === 0) {
      if (Math.abs(origin) > half) return null;
      continue;
    }
    const first = (-half - origin) / delta;
    const second = (half - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
  }
  return enter <= leave ? [enter, leave] : null;
}

/** What may stop a straight leg of a move with no grid. */
export interface LegLimits {
  /** How far the leg may go, in pixels. */
  readonly budgetPx: number;
  /** The ground the piece may not walk onto. */
  readonly blocks: readonly MoveBlock[];
  /** How far short of a block's face, or of a zone shut to the piece, the leg stops, in pixels. */
  readonly gapPx: number;
  /** Zones the piece may not enter at all. */
  readonly shut: readonly ZoneShape[];
  /** Zones that end the move as the piece walks into them. */
  readonly stops: readonly ZoneShape[];
  /** Zones that end the move as the piece walks out of them. */
  readonly escapes: readonly ZoneShape[];
}

/** Where a leg ends, and whether it ended the move there. */
export interface WalkedLeg {
  readonly end: MovePoint;
  readonly length: number;
  /** Whether the leg was ended by a zone, which ends the move as well. */
  readonly stopped: boolean;
}

/**
 * Walks a straight leg from one point towards another, as far as the move lets it.
 *
 * It goes no further than what the move has left, stops short of a block or a zone shut to it,
 * and ends the move on walking into a zone that stops it or out of one that holds it, a hair across
 * the edge so the point reads as across it.
 */
export function walkLeg(from: MovePoint, to: MovePoint, limits: LegLimits): WalkedLeg {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length <= 0 || limits.budgetPx <= 0) return { end: { ...from }, length: 0, stopped: false };
  const gap = limits.gapPx / length;
  let along = Math.min(1, limits.budgetPx / length);
  along = Math.min(along, clearRunAlong(from, to, limits.blocks, limits.gapPx));
  for (const shape of limits.shut) {
    const enter = entryAlong(from, to, shape);
    if (enter !== null) along = Math.min(along, Math.max(0, enter - gap));
  }
  let stopped = false;
  const across = ACROSS_EDGE_PX / length;
  const ending = (crossing: number | null) => {
    if (crossing === null) return;
    const past = Math.min(1, crossing + across);
    if (past > along && crossing >= along) return;
    along = Math.min(along, past);
    stopped = true;
  };
  for (const shape of limits.stops) ending(entryAlong(from, to, shape));
  for (const shape of limits.escapes) ending(exitAlong(from, to, shape));
  const end = pointAlong(from, to, along);
  return { end, length: length * along, stopped };
}

/**
 * The ground a piece walking with no grid may not walk onto: terrain too sheer to climb, and terrain
 * with walls rising more than a step above the floor. Each is grown by how far a piece wider than a
 * cell hangs over its own middle, since the way is the path of that middle.
 */
export function terrainMoveBlocks(terrains: readonly Terrain[], gridSize: number, pieceCells: number): MoveBlock[] {
  const spread = Math.max(0, ((Math.max(1, pieceCells) - 1) * gridSize) / 2);
  const blocks: MoveBlock[] = [];
  for (const terrain of terrains) {
    if (!terrainBlocksMovement(terrain)) continue;
    const top = (terrain.altitude + terrain.height) * gridSize;
    if (!terrain.blocksClimb && top <= gridSize) continue;
    const left = terrain.location.x;
    const front = terrain.location.y;
    const box = {
      minX: left,
      minY: front,
      maxX: left + terrain.width * gridSize,
      maxY: front + terrain.depth * gridSize,
    };
    blocks.push(turnedMoveBlock(box, terrain.rotate, spread, spread));
  }
  return blocks;
}
