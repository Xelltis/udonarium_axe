import { type LaserTiming } from '@axe/domain/effect/beam-looks';
import { type Stage, within } from '@axe/domain/effect/scene/choreography';
import { lerpPoint, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { chestOf, originOf } from '@axe/domain/effect/scene/shot/stream-ends';

/*
 * The way a laser takes: from its caster's hands to the floor short of its target, along the floor
 * to its target's foot, up to its chest, and wandering over it there.
 */

/** How far short of the target the beam first touches the floor, in cells, and at the most as a share of the way to it. */
const CUTS_FROM = 3.2;
const CUTS_AT_MOST = 0.6;
/** The share of its cutting the beam spends on the floor before it climbs the target. */
export const ON_FLOOR = 0.82;
/** How the beam gathers pace as it cuts: the power its cutting is eased by. */
export const CUT_EASE = 1.15;

/** Where a laser runs: from the caster's hands, along the floor from where it first touches it to the target's foot, and up to its chest. */
export interface LaserCourse {
  readonly from: Point;
  readonly touches: Point;
  readonly foot: Point;
  readonly chest: Point;
}

/** Where a laser on a target runs: see {@link LaserCourse}. */
export function courseOf(stage: Stage): LaserCourse {
  const from = originOf(stage);
  const chest = chestOf(stage);
  const dx = stage.x - from.x;
  const dy = stage.y - from.y;
  const far = Math.hypot(dx, dy) || 1;
  const short = Math.min(stage.cell * CUTS_FROM, far * CUTS_AT_MOST);
  const near = Math.min(stage.cell * 0.3, far * 0.2);
  const lies = stage.groundZ + stage.cell * 0.04;
  return {
    from,
    touches: { x: stage.x - (dx / far) * short, y: stage.y - (dy / far) * short, z: lies },
    foot: { x: stage.x - (dx / far) * near, y: stage.y - (dy / far) * near, z: lies },
    chest,
  };
}

/**
 * Where the beam touches at a moment: along the floor towards the target while it cuts, up the
 * target as it takes hold, and wandering a little over its chest while it burns there.
 */
export function touchAt(course: LaserCourse, timing: LaserTiming, cell: number, t: number): Point {
  if (t >= timing.holdsAt) {
    const { way } = wayBetween(course.from, course.chest);
    const wander = Math.min(1, (t - timing.holdsAt) / 0.15);
    const aside = Math.sin(t * 7.3) * cell * 0.22 * wander;
    return {
      x: course.chest.x - way.y * aside,
      y: course.chest.y + way.x * aside,
      z: course.chest.z + Math.sin(t * 11.1) * cell * 0.16 * wander,
    };
  }
  const cut = Math.pow(within(t, timing.lightsAt, timing.holdsAt), CUT_EASE);
  if (cut < ON_FLOOR) return lerpPoint(course.touches, course.foot, cut / ON_FLOOR);
  return lerpPoint(course.foot, course.chest, (cut - ON_FLOOR) / (1 - ON_FLOOR));
}
