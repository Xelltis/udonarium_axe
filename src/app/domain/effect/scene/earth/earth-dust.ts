import type { Cloud } from '@axe/domain/effect/scene/fire/fire-parts';
import type { Point, Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The dust the looks of earth raise: kicked out low over the floor, round or drawn out in jets,
 * blown up in a column, and rising thin off broken ground long after.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** Dust kicked out low over the floor from about a foot, most of it to either side of one way. */
export function kickedDust(
  th: Thrower,
  foot: Point,
  count: number,
  color: string,
  how: {
    readonly speed: readonly [number, number];
    readonly size: readonly [number, number];
    readonly bornAt: readonly [number, number];
    readonly fan?: { readonly toward: number; readonly spread: number };
    readonly rise?: readonly [number, number];
    readonly from?: number;
    readonly alpha?: number;
    /** How long each lasts, in seconds; a second or two without. */
    readonly life?: readonly [number, number];
    /** How long each is drawn out the way it is thrown, in cells, as a jet of dust; round without. */
    readonly jet?: number;
  }
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const turn = how.fan ? how.fan.toward + th.range(-how.fan.spread, how.fan.spread) : th.range(0, Math.PI * 2);
    const from = th.range(0, how.from ?? 0.4) * U;
    const fast = th.range(how.speed[0], how.speed[1]) * U;
    const bornAt = th.range(how.bornAt[0], how.bornAt[1]);
    return {
      mote: th.mote({
        x: foot.x + Math.cos(turn) * from,
        y: foot.y + Math.sin(turn) * from,
        z: th.floorZ + th.range(0.05, 0.22) * U,
        vx: Math.cos(turn) * fast,
        vy: Math.sin(turn) * fast,
        vz: th.range(how.rise?.[0] ?? 0.05, how.rise?.[1] ?? 0.7) * U,
        bornAt,
        life: th.lifeOf(bornAt, how.life?.[0] ?? 1, how.life?.[1] ?? 1.9),
        gravity: -0.15 * U,
        drag: 2.8,
        bounce: 0,
      }),
      size: th.range(how.size[0], how.size[1]),
      color,
      alpha: how.alpha ?? 0.42,
      plume: how.jet,
    };
  });
}

/** Earth blown up from about a foot in a column of plumes, thinning as it rises and spreads. */
export function earthPlumes(
  th: Thrower,
  foot: Point,
  count: number,
  color: string,
  how: {
    readonly rise: readonly [number, number];
    readonly bornAt: readonly [number, number];
    readonly long?: number;
    /** How long each lasts, in seconds; a second or two without. */
    readonly life?: readonly [number, number];
  }
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const bornAt = th.range(how.bornAt[0], how.bornAt[1]);
    return {
      mote: th.mote({
        x: foot.x + th.range(-0.2, 0.2) * U,
        y: foot.y + th.range(-0.2, 0.2) * U,
        z: th.floorZ + th.range(0.1, 0.3) * U,
        vx: th.range(-0.6, 0.6) * U,
        vy: th.range(-0.6, 0.6) * U,
        vz: th.range(how.rise[0], how.rise[1]) * U,
        bornAt,
        life: th.lifeOf(bornAt, how.life?.[0] ?? 1.2, how.life?.[1] ?? 2.1),
        gravity: -0.1 * U,
        drag: 2.2,
        bounce: 0,
      }),
      size: th.range(0.75, 1.2),
      color,
      alpha: 0.7,
      plume: how.long ?? 2.2,
    };
  });
}

/** Thin dust rising slowly off broken ground, long after it broke. */
export function driftingDust(
  th: Thrower,
  foot: Point,
  count: number,
  color: string,
  reach: number,
  bornAt: readonly [number, number]
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const from = th.range(0, reach) * U;
    const born = th.range(bornAt[0], bornAt[1]);
    return {
      mote: th.mote({
        x: foot.x + way.cos * from,
        y: foot.y + way.sin * from,
        z: th.floorZ + th.range(0.05, 0.2) * U,
        vx: th.range(-0.15, 0.15) * U,
        vy: th.range(-0.15, 0.15) * U,
        vz: th.range(0.35, 0.8) * U,
        bornAt: born,
        life: th.lifeOf(born, 1.3, 2.2),
        gravity: -0.05 * U,
        drag: 0.6,
        bounce: 0,
      }),
      size: th.range(0.35, 0.6),
      color,
      alpha: 0.28,
      plume: 1.1,
    };
  });
}
