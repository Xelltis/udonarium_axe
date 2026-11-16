import { outCubic } from '@axe/domain/effect/scene/choreography';
import { type Flame } from '@axe/domain/effect/scene/fire/fire-body';
import { type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The fire a great blast throws out over the floor: a front of flame racing out from it with its
 * shock, low licks leaning the way they run and sinking as they go; and the fires the front leaves
 * burning behind it, each lit as the front passes over it, flickering, and burning down to nothing.
 *
 * Every moment is in seconds from the moment the blast goes off.
 */

/** A fire left burning on the floor: where it is about the blast, how large it is, in cells, and how long it burns. */
export interface GroundFire {
  readonly angle: number;
  /** How far out it is, as a share of the way to the edge of the area. */
  readonly out: number;
  readonly size: number;
  readonly burns: number;
  readonly variant: number;
}

/** How far out a front has run at a moment, as a share of its whole run: fast at first and slowing to its end. */
export function frontShareAt(t: number, lifeS: number): number {
  return t <= 0 ? 0 : outCubic(t / lifeS);
}

/** When a front reaches a share of its whole run, in seconds. */
export function frontReachesAt(share: number, lifeS: number): number {
  return lifeS * (1 - Math.cbrt(1 - Math.min(1, Math.max(0, share))));
}

/** Throws the fires a blast leaves burning over its area, the further out the smaller and the shorter-lived. */
export function throwGroundFires(th: Thrower, count: number, burns: readonly [number, number]): GroundFire[] {
  return Array.from({ length: count }, (_unused, index) => {
    const out = Math.sqrt(th.range(0.04, 1));
    return {
      angle: ((index + th.range(-0.4, 0.4)) / count) * Math.PI * 2 * 2.6,
      out,
      size: th.range(0.5, 1) * (1 - 0.4 * out),
      burns: th.range(burns[0], burns[1]) * (1 - 0.3 * out),
      variant: th.range(0, 6),
    };
  });
}

/**
 * The front of flame at a moment: `count` licks on a ring about the blast that runs from `from` out to
 * `to`, in table pixels, over `lifeS` seconds.
 */
export function flameFrontAt(
  floor: Point,
  from: number,
  to: number,
  cell: number,
  t: number,
  lifeS: number,
  count: number,
  seed: number
): Flame[] {
  if (t <= 0 || t >= lifeS) return [];
  const left = 1 - t / lifeS;
  const radius = from + (to - from) * frontShareAt(t, lifeS);
  return Array.from({ length: count }, (_unused, index): Flame => {
    const jitter = Math.sin(seed * 1.3 + index * 12.9898);
    const angle = ((index + 0.35 * jitter) / count) * Math.PI * 2;
    const out = radius * (1 + 0.05 * Math.sin(seed + index * 4.1));
    const flicker = 0.8 + 0.2 * Math.sin(t * 31 + index * 2.7);
    return {
      shape: 'lick',
      at: { x: floor.x + Math.cos(angle) * out, y: floor.y + Math.sin(angle) * out, z: floor.z + cell * 0.02 },
      heading: { x: Math.cos(angle) * 0.9, y: Math.sin(angle) * 0.9, z: 0.8 },
      wide: cell * 0.36 * (0.5 + 0.5 * left),
      long: cell * (0.45 + 0.75 * left) * flicker,
      heat: 0.3 + 0.65 * left,
      flowed: t * 6 + index * 3.3,
      variant: (index * 1.7 + seed) % 6,
      alpha: Math.min(1, left * 3),
    };
  });
}

/**
 * The fires left burning at a moment over an area reaching `area` table pixels from the blast, each
 * lit as a front that takes `lifeS` seconds to cross the area passes it.
 */
export function groundFiresAt(
  fires: readonly GroundFire[],
  floor: Point,
  area: number,
  cell: number,
  t: number,
  lifeS: number
): Flame[] {
  const flames: Flame[] = [];
  for (const fire of fires) {
    const age = (t - frontReachesAt(fire.out, lifeS)) / fire.burns;
    if (age <= 0 || age >= 1) continue;
    const standing = Math.min(1, age / 0.06) * (1 - age * age);
    const flicker = 0.75 + 0.17 * Math.sin(t * 19 + fire.variant * 5) + 0.08 * Math.sin(t * 43 + fire.variant * 3);
    const wide = cell * 0.46 * fire.size * (0.6 + 0.4 * standing);
    flames.push({
      shape: 'lick',
      at: {
        x: floor.x + Math.cos(fire.angle) * fire.out * area,
        y: floor.y + Math.sin(fire.angle) * fire.out * area,
        z: floor.z + cell * 0.02,
      },
      heading: { x: 0.16 * Math.sin(t * 5 + fire.variant * 4), y: 0.1 * Math.cos(t * 4 + fire.variant), z: 1 },
      wide,
      long: Math.max(wide, cell * 1.3 * fire.size * standing * flicker),
      heat: 0.85 - 0.6 * age,
      flowed: t * 4.5 + fire.variant * 7,
      variant: fire.variant,
    });
  }
  return flames;
}
