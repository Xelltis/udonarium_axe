import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { entryAlong, exitAlong, pointAlong } from '@axe/domain/tabletop/move/free-path';
import { zoneCovers, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';

/** A stretch of a way, as distances along it from where it begins, in pixels. */
export interface PathSpan {
  readonly from: number;
  readonly to: number;
}

/** How far along a way a point has to be before anybody may step into it: not on the spot it sets out from. */
const SET_OUT_PX = 1;

/** The point a distance along a way, its end where the distance runs past it. */
export function pointAtLength(path: readonly MovePoint[], along: number): MovePoint {
  if (path.length < 1) return { x: 0, y: 0 };
  let walked = 0;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const leg = Math.hypot(to.x - from.x, to.y - from.y);
    if (leg > 0 && walked + leg >= along) return pointAlong(from, to, Math.max(0, along - walked) / leg);
    walked += leg;
  }
  return { ...path[path.length - 1] };
}

/**
 * The first point of a way at or past a distance along it, by its place in the way: where a way of
 * cell middles is cut, since a piece stops on a cell rather than between two.
 */
export function indexAtLength(path: readonly MovePoint[], along: number, slackPx = 0.5): number {
  let walked = 0;
  for (let index = 1; index < path.length; index++) {
    walked += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    if (walked >= along - slackPx) return index;
  }
  return Math.max(0, path.length - 1);
}

/**
 * The stretches of a way a piece standing at `centre` reaches within `reachPx`, leaving out every
 * stretch inside a zone and the spot the way sets out from: where it could step in front of the
 * piece walking it.
 */
export function litSpans(
  path: readonly MovePoint[],
  centre: MovePoint,
  reachPx: number,
  zones: readonly ZoneShape[]
): PathSpan[] {
  const spans: PathSpan[] = [];
  let walked = 0;
  const reach: ZoneShape = { centre, square: false, reach: reachPx };
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const leg = Math.hypot(to.x - from.x, to.y - from.y);
    if (leg <= 0) continue;
    const inReach = insideRange(from, to, reach);
    if (inReach) {
      let pieces: [number, number][] = [inReach];
      for (const zone of zones) {
        const covered = insideRange(from, to, zone);
        if (covered) pieces = pieces.flatMap((piece) => cut(piece, covered));
      }
      for (const [start, end] of pieces) spans.push({ from: walked + start * leg, to: walked + end * leg });
    }
    walked += leg;
  }
  return mergeSpans(spans)
    .map((span) => ({ from: Math.max(span.from, SET_OUT_PX), to: span.to }))
    .filter((span) => span.to >= span.from);
}

/**
 * The stretches of a way inside any of the shapes, leaving out the spot the way sets out from: where
 * a piece in a zone, or standing in one, could stop the piece walking it.
 */
export function spansWithin(path: readonly MovePoint[], shapes: readonly ZoneShape[]): PathSpan[] {
  const spans: PathSpan[] = [];
  let walked = 0;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const leg = Math.hypot(to.x - from.x, to.y - from.y);
    if (leg <= 0) continue;
    for (const shape of shapes) {
      const inside = insideRange(from, to, shape);
      if (inside) spans.push({ from: walked + inside[0] * leg, to: walked + inside[1] * leg });
    }
    walked += leg;
  }
  return mergeSpans(spans)
    .map((span) => ({ from: Math.max(span.from, SET_OUT_PX), to: span.to }))
    .filter((span) => span.to >= span.from);
}

/** The fractions of a straight leg inside a shape, or null where none of it is. */
function insideRange(from: MovePoint, to: MovePoint, shape: ZoneShape): [number, number] | null {
  const startsIn = zoneCovers(shape, from);
  const start = startsIn ? 0 : entryAlong(from, to, shape);
  if (start === null) return null;
  const probe = pointAlong(from, to, Math.min(1, start + 1e-9));
  const leave = exitAlong(probe, to, shape);
  const end = leave === null ? 1 : start + (1 - start) * leave;
  return end > start || startsIn ? [start, end] : null;
}

/** What is left of a stretch with another taken out of it. */
function cut([start, end]: [number, number], [from, to]: [number, number]): [number, number][] {
  const left: [number, number][] = [];
  if (from > start) left.push([start, Math.min(end, from)]);
  if (to < end) left.push([Math.max(start, to), end]);
  return left.filter(([a, b]) => b > a);
}

function mergeSpans(spans: readonly PathSpan[]): PathSpan[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const merged: PathSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to + 1e-6)
      merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, span.to) };
    else merged.push(span);
  }
  return merged;
}

/** The stretches every one of several pieces reaches, which is where they may step in together. */
export function commonSpans(each: readonly (readonly PathSpan[])[]): PathSpan[] {
  if (each.length < 1) return [];
  let common: PathSpan[] = [...each[0]];
  for (const spans of each.slice(1)) {
    const next: PathSpan[] = [];
    for (const a of common) {
      for (const b of spans) {
        const from = Math.max(a.from, b.from);
        const to = Math.min(a.to, b.to);
        if (to >= from) next.push({ from, to });
      }
    }
    common = next;
  }
  return common;
}

/** Whether a distance along the way lies in one of the stretches. */
export function inSpans(spans: readonly PathSpan[], along: number, slackPx = 0.5): boolean {
  return spans.some((span) => along >= span.from - slackPx && along <= span.to + slackPx);
}

/**
 * Whether the pieces that might step in could stop the mover at all: not where the mover's side
 * outnumbers all of them together by the ratio.
 */
export function mayBeStopped(moverCount: number, interruptersCount: number, ratio: number): boolean {
  return interruptersCount > 0 && !(moverCount > ratio * interruptersCount);
}

/** One answer to a move: the pieces stepping in together, and how far along the way. */
export interface InterruptClaim {
  readonly along: number;
  readonly pieces: readonly string[];
}

/**
 * Which claim stops the mover, or none.
 *
 * Claims the check turns down are left out. Claims within `samePointPx` of one another along the
 * way are one claim, the pieces of both stepping in at the nearer point. A claim whose pieces the
 * mover's side outnumbers by the ratio does not stop it. Of what is left, the one nearest the start
 * of the way stops it.
 */
export function resolveClaims(
  claims: readonly InterruptClaim[],
  holds: (claim: InterruptClaim) => boolean,
  countOf: (piece: string) => number,
  moverCount: number,
  ratio: number,
  samePointPx: number
): InterruptClaim | null {
  const valid = claims.filter((claim) => claim.pieces.length > 0 && holds(claim)).sort((a, b) => a.along - b.along);
  const groups: InterruptClaim[] = [];
  for (const claim of valid) {
    const last = groups[groups.length - 1];
    if (last && claim.along - last.along <= samePointPx) {
      groups[groups.length - 1] = { along: last.along, pieces: [...new Set([...last.pieces, ...claim.pieces])] };
    } else {
      groups.push({ along: claim.along, pieces: [...new Set(claim.pieces)] });
    }
  }
  return (
    groups.find((group) =>
      mayBeStopped(
        moverCount,
        group.pieces.reduce((sum, piece) => sum + countOf(piece), 0),
        ratio
      )
    ) ?? null
  );
}

/** The part of a way a stretch covers, as points: where it begins, the corners within it, and where it ends. */
export function spanPath(path: readonly MovePoint[], span: PathSpan): MovePoint[] {
  const points: MovePoint[] = [pointAtLength(path, span.from)];
  let walked = 0;
  for (let index = 1; index < path.length; index++) {
    walked += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    if (walked > span.from && walked < span.to) points.push({ ...path[index] });
  }
  points.push(pointAtLength(path, span.to));
  return points;
}

/** The distance in the stretches nearest the one asked for, or null where there are no stretches. */
export function nearestInSpans(spans: readonly PathSpan[], along: number): number | null {
  let best: number | null = null;
  for (const span of spans) {
    const inside = Math.min(span.to, Math.max(span.from, along));
    if (best === null || Math.abs(inside - along) < Math.abs(best - along)) best = inside;
  }
  return best;
}
