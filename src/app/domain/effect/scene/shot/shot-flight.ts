import type { Staged } from '@axe/domain/effect/scene/choreography';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { acrossOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * One shot of a cast on its own clock, as the looks that draw a whole shot are told of it: from the
 * moment it is fired, through its flight and the instant it strikes, to what it leaves where it
 * struck, which is gone by the time the look clears. And the small sums those looks share: a point
 * set off from another, a way turned about another, and where a thing tossed into the air is.
 */

/** One shot of a cast, from its firing to what it leaves. */
export interface FiredShot {
  /** Where it is fired from, where this shot strikes, and where the cast is aimed: the middle of its target. */
  readonly from: Point;
  readonly to: Point;
  readonly aim: Point;
  /** How wide a cell is drawn for it, in table pixels, and how high the floor under its target is. */
  readonly cell: number;
  readonly floorZ: number;
  /** The moment now, the moments it is fired and it strikes, and the moment all it leaves must be gone by, in seconds. */
  readonly seconds: number;
  readonly launch: number;
  readonly lands: number;
  readonly ends: number;
  /** Which shot of its volley it is, and of how many. */
  readonly index: number;
  readonly shots: number;
  readonly seed: number;
  /** The grade of its cast, from 1 to 3. */
  readonly grade: 1 | 2 | 3;
  /** The look it lands with, as its preset names it. */
  readonly landsIn: string;
  /** Where it is at a share of its flight, as its course has it. */
  readonly pathAt: (along: number) => Point;
}

/** A look that draws a whole shot at a moment. */
export type ShotLook = (drawn: Staged, shot: FiredShot, ramp: readonly string[]) => void;

/** A point set off from another along a way, as far as given. */
export function offsetBy(point: Point, way: Point, by: number): Point {
  return { x: point.x + way.x * by, y: point.y + way.y * by, z: point.z + way.z * by };
}

/** A way of length one, turned about a line across it: `turn` round from level towards up. */
export function aboutWay(way: Point, turn: number): Point {
  const { side, lift } = acrossOf(way);
  return {
    x: side.x * Math.cos(turn) + lift.x * Math.sin(turn),
    y: side.y * Math.cos(turn) + lift.y * Math.sin(turn),
    z: side.z * Math.cos(turn) + lift.z * Math.sin(turn),
  };
}

/** How far something may reach from a point along a way, up to `long`, without going under the floor. */
export function reachOver(root: Point, way: Point, long: number, floorZ: number): number {
  if (way.z >= 0) return long;
  return Math.max(0, Math.min(long, (root.z - floorZ) / -way.z));
}

/** A way levelled: the same way over the floor, of length one, or east where it runs straight up. */
export function levelWay(way: Point): Point {
  const flat = Math.hypot(way.x, way.y);
  return flat > 0.001 ? { x: way.x / flat, y: way.y / flat, z: 0 } : { x: 1, y: 0, z: 0 };
}

/** How much of the detail of one shot is drawn where it is one of a volley: all of one alone, less of each as they are more. */
export function detailOf(shots: number): number {
  return 1 / Math.sqrt(Math.max(1, shots));
}

/** How much larger a shot is drawn for its grade. */
export function powerOf(grade: 1 | 2 | 3): number {
  return grade === 1 ? 1 : grade === 2 ? 1.2 : 1.5;
}

/** How long before the look clears what a shot leaves begins to fade, and how much of it is left at a moment. */
export function leftAt(shot: FiredShot, fadesS = 0.45): number {
  return Math.max(0, Math.min(1, (shot.ends - shot.seconds) / fadesS));
}

/** A run of numbers for one shot of a volley, the same on every seat. */
export function runOf(shot: FiredShot, salt: number): () => number {
  return seededRun(shot.seed * 31 + shot.index * 17 + salt);
}

/**
 * Where a thing tossed from a point is after a while: it flies as it was thrown, falls, hops once off
 * the floor at a share of the speed it met it with, and lies where it comes down again.
 */
export function tossedAt(
  from: Point,
  velocity: Point,
  since: number,
  floorZ: number,
  fall: number,
  bounce = 0.35
): { readonly at: Point; readonly lies: boolean } {
  const high = Math.max(0, from.z - floorZ);
  const meets = (velocity.z + Math.sqrt(velocity.z * velocity.z + 2 * fall * high)) / fall;
  if (since <= meets) {
    return {
      at: {
        x: from.x + velocity.x * since,
        y: from.y + velocity.y * since,
        z: from.z + velocity.z * since - 0.5 * fall * since * since,
      },
      lies: false,
    };
  }
  const up = bounce * Math.sqrt(velocity.z * velocity.z + 2 * fall * high);
  const hop = (2 * up) / fall;
  const after = Math.min(since - meets, hop);
  return {
    at: {
      x: from.x + velocity.x * (meets + after * 0.5),
      y: from.y + velocity.y * (meets + after * 0.5),
      z: floorZ + up * after - 0.5 * fall * after * after,
    },
    lies: since - meets >= hop,
  };
}
