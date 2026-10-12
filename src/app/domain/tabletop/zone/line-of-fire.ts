import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { entryAlong } from '@axe/domain/tabletop/move/free-path';
import { zoneCovers, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';

/** A piece as the line of fire sees it: where it stands, whose side it is on, and the zone it is in. */
export interface FirePiece {
  readonly id: string;
  /** Its point: the centre of its zone where it is in one. */
  readonly point: MovePoint;
  readonly side: string | null;
  /** The zone it is in, empty where it is in none. */
  readonly zone: string;
  /** The zones it stands in without being in them. */
  readonly inside: readonly string[];
  readonly offField: boolean;
}

/** A zone as the line of fire sees it. */
export interface FireZone {
  readonly id: string;
  readonly shape: ZoneShape;
  readonly members: readonly string[];
}

export interface FireInput {
  readonly shooter: FirePiece;
  readonly target: FirePiece;
  readonly pieces: readonly FirePiece[];
  readonly zones: readonly FireZone[];
  /** How close to the line a piece out of every zone stands to stand in it, in pixels. */
  readonly blockRadiusPx: number;
  readonly pxPerMetre: number;
  /** Whether the shooter fires past whatever stands in the way. */
  readonly clear: boolean;
}

/** What stands between a shooter and a target, and who the shot may land on. */
export interface FireReport {
  readonly distanceM: number;
  /** The zones the line crosses on the way, the shooter's and the target's left out. */
  readonly zones: readonly string[];
  /** The pieces out of every zone, in it or only standing in it, standing in the line, each an enemy of the shooter. */
  readonly pieces: readonly string[];
  /**
   * Who the shot may land on: the target alone, or everybody in the target's zone where the shooter
   * fires into it from outside.
   */
  readonly candidates: readonly string[];
}

/** How far a point stands from a straight line between two others, measured to the nearest point on it. */
function distanceToSegment(point: MovePoint, from: MovePoint, to: MovePoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const along = length > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (from.x + dx * along), point.y - (from.y + dy * along));
}

/** Whether a straight line crosses a zone it neither starts nor ends in. */
function crosses(from: MovePoint, to: MovePoint, shape: ZoneShape): boolean {
  if (zoneCovers(shape, from) || zoneCovers(shape, to)) return false;
  return entryAlong(from, to, shape) !== null;
}

/**
 * What stands between a shooter and a target.
 *
 * The line runs between their points. A zone it crosses is in the way, but not the shooter's own or
 * the target's. A piece neither in a zone nor standing in one, not out of the fight and an enemy of
 * the shooter, standing within the radius of the line, is in the way as well. A shooter that fires
 * past things has nothing in its way. Firing into a zone from outside it, neither in it nor standing
 * in it, the shot may land on anybody in that zone.
 */
export function lineOfFire(input: FireInput): FireReport {
  const { shooter, target } = input;
  const from = shooter.point;
  const to = target.point;
  const distanceM = input.pxPerMetre > 0 ? Math.hypot(to.x - from.x, to.y - from.y) / input.pxPerMetre : 0;
  const zones = input.clear
    ? []
    : input.zones
        .filter((zone) => zone.id !== shooter.zone && zone.id !== target.zone && crosses(from, to, zone.shape))
        .map((zone) => zone.id);
  const pieces = input.clear
    ? []
    : input.pieces
        .filter(
          (piece) =>
            piece.id !== shooter.id &&
            piece.id !== target.id &&
            piece.zone === '' &&
            piece.inside.length < 1 &&
            !piece.offField &&
            piece.side !== null &&
            shooter.side !== null &&
            piece.side !== shooter.side &&
            distanceToSegment(piece.point, from, to) <= input.blockRadiusPx
        )
        .map((piece) => piece.id);
  const into = target.zone !== '' && target.zone !== shooter.zone && !shooter.inside.includes(target.zone);
  const candidates = into ? (input.zones.find((zone) => zone.id === target.zone)?.members ?? [target.id]) : [target.id];
  return { distanceM, zones, pieces, candidates };
}
