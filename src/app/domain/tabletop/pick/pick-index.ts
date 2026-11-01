import { TablePoint, TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { hitShape, PickShape } from '@axe/domain/tabletop/pick/pick-geometry';

/** Something on the table that a press can land on, made of one or more shapes. */
export interface PickTarget {
  /** The identifier of the object it stands for. */
  readonly id: string;
  /** What kind of thing it is, so a caller can look past some kinds. */
  readonly layer: string;
  /** Which of two things the same distance off is in front: the greater. */
  readonly order: number;
  /** The face it stands on, as a location names it, where that matters to the caller. */
  readonly surface?: string;
  readonly shapes: readonly PickShape[];
  /**
   * Whether the picture on one of the quads is solid at a point of it, read across and down from
   * 0 to 1. A press on a see-through part lands on whatever is behind.
   */
  readonly opaqueAt?: (shapeIndex: number, u: number, v: number) => boolean;
}

/** A target a line of sight meets, and where. */
export interface PickHit {
  readonly target: PickTarget;
  /** How far along the line; nearer the eye is less. */
  readonly t: number;
  readonly point: TablePoint;
  readonly shapeIndex: number;
  readonly u?: number;
  readonly v?: number;
}

/**
 * How close two hits may be along the line and still count as the same distance off, in table
 * pixels: a card lying on the board and the board under it.
 */
const SAME_DISTANCE_PX = 0.5;

/** Where a line of sight meets one target, its nearest solid point, or null where it misses. */
export function pickTarget(target: PickTarget, ray: TableRay): PickHit | null {
  let best: PickHit | null = null;
  target.shapes.forEach((shape, shapeIndex) => {
    const hit = hitShape(ray, shape);
    if (!hit || (best !== null && best.t <= hit.t)) return;
    if (hit.u !== undefined && hit.v !== undefined && target.opaqueAt && !target.opaqueAt(shapeIndex, hit.u, hit.v)) {
      return;
    }
    best = { target, t: hit.t, point: hit.point, shapeIndex, u: hit.u, v: hit.v };
  });
  return best;
}

/**
 * Every target a line of sight meets, nearest the eye first. Of two the same distance off, the one
 * drawn in front comes first. `accepts` leaves out targets a caller looks past.
 */
export function pickAll(
  targets: Iterable<PickTarget>,
  ray: TableRay,
  accepts: (target: PickTarget) => boolean = () => true
): PickHit[] {
  const hits: PickHit[] = [];
  for (const target of targets) {
    if (!accepts(target)) continue;
    const hit = pickTarget(target, ray);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => (Math.abs(a.t - b.t) <= SAME_DISTANCE_PX ? b.target.order - a.target.order : a.t - b.t));
}

/** The target nearest the eye along a line of sight, or null where the line meets none. */
export function pickFirst(
  targets: Iterable<PickTarget>,
  ray: TableRay,
  accepts?: (target: PickTarget) => boolean
): PickHit | null {
  return pickAll(targets, ray, accepts)[0] ?? null;
}
