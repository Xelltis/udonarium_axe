import { outCubic, within } from '@axe/domain/effect/scene/choreography';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import { type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The fire a piece is set ablaze with, as it is thrown: its tongues, the flames that break off them,
 * its smoke, its sparks, its embers and its coals, and how fiercely and how hot it burns from its
 * catching to its dying.
 */

/** How long the fire takes to catch, and the longest it takes to die down, in seconds. */
const CATCHES_S = 0.3;
const DIES_S = 0.8;
/** How long the flare lasts as it catches, in seconds, and how far past their height the tongues leap in it. */
const FLARE_S = 0.6;
const FLARE_LEAPS = 0.4;

/**
 * The fire of each grade: how many tongues stand round the feet and lick up the body, how tall the
 * tongues at the feet are and how far out they stand, in cells, how many of them roar up far past the
 * rest, how many flames break off a second, how many clouds of smoke roll off it a second, how much
 * wider than their height has them its tongues are, how much further they leap as it catches, and how
 * much hotter they burn.
 */
export const FIRES = {
  1: {
    feet: 6,
    body: 3,
    tall: 0.76,
    ring: 0.42,
    roaring: 0,
    flamelets: 9,
    smoke: 4,
    wide: 1.7,
    flares: 2.6,
    hot: 1.2,
  },
  2: { feet: 6, body: 4, tall: 1.05, ring: 0.42, roaring: 0, flamelets: 12, smoke: 4, wide: 1, flares: 1, hot: 1 },
  3: { feet: 8, body: 5, tall: 1.3, ring: 0.5, roaring: 3, flamelets: 18, smoke: 6, wide: 1, flares: 1, hot: 1 },
} as const;

/** A tongue of flame standing about the piece: where it stands, how wide and tall, how hot, and how it flickers. */
export interface Tongue {
  readonly angle: number;
  readonly out: number;
  /** How high up the piece it is rooted, in cells: nothing for one standing on the floor. */
  readonly rise: number;
  readonly width: number;
  readonly height: number;
  readonly heat: number;
  readonly phases: readonly [number, number, number];
  readonly rates: readonly [number, number, number];
  readonly variant: number;
}

/** A flame broken off the tip of a tongue: which tongue, when, how long it lasts, how wide it is and how fast it rises, in cells. */
export interface Flamelet {
  readonly tongue: number;
  readonly bornAt: number;
  readonly lasts: number;
  readonly size: number;
  readonly rises: number;
  readonly drift: number;
  readonly variant: number;
}

export interface FlameThrow {
  readonly tongues: readonly Tongue[];
  readonly flamelets: readonly Flamelet[];
  readonly clouds: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  /** Where coals lie on the floor as the fire dies. */
  readonly coals: readonly Point[];
}

/** When a fire that plays so long begins to die down, in seconds. */
export function diesFrom(duration: number): number {
  return duration - Math.min(DIES_S, duration * 0.25);
}

/** How fiercely it burns at a moment, from nothing as it catches to whole, and back to nothing as it dies down. */
export function fierceness(t: number, duration: number): number {
  const dies = Math.min(DIES_S, duration * 0.25);
  return Math.min(outCubic(within(t, 0, CATCHES_S)), 1 - within(t, duration - dies, duration));
}

/** How far past their height the tongues leap as the fire catches: a flare, gone once it has caught. */
export function flareAt(t: number): number {
  return t <= 0 || t >= FLARE_S ? 0 : FLARE_LEAPS * Math.sin(Math.PI * Math.pow(t / FLARE_S, 0.6));
}

/** How hot the fire is at a moment, as a share of its hottest: whole while it burns, and falling as it dies down. */
export function heatAt(t: number, duration: number): number {
  const dies = Math.min(DIES_S, duration * 0.25);
  return 1 - 0.6 * within(t, duration - dies * 1.6, duration);
}

/** Where a tongue is rooted, which way it leans and how far it reaches at a moment, in table pixels. */
export function tongueAt(
  tongue: Tongue,
  foot: Point,
  floor: Point,
  t: number,
  fierce: number,
  cell: number,
  flares = 1
) {
  const [p1, p2, p3] = tongue.phases;
  const [w1, w2, w3] = tongue.rates;
  const leaps = 1 + flareAt(t) * flares;
  const tall =
    cell * tongue.height * fierce * leaps * (0.74 + 0.18 * Math.sin(w1 * t + p1) + 0.1 * Math.sin(w2 * t + p2));
  const leanX = -Math.cos(tongue.angle) * 0.2 + 0.14 * Math.sin(w3 * t + p3);
  const leanY = -Math.sin(tongue.angle) * 0.2 + 0.14 * Math.cos(w3 * 0.7 * t + p1);
  const root = {
    x: foot.x + Math.cos(tongue.angle) * tongue.out * cell,
    y: foot.y + Math.sin(tongue.angle) * tongue.out * cell,
    z: tongue.rise > 0 ? foot.z + cell * tongue.rise : floor.z + cell * 0.05,
  };
  return { root, tall, leanX, leanY, tip: { x: root.x + leanX * tall, y: root.y + leanY * tall, z: root.z + tall } };
}

/** Throws the whole fire from its catching to its dying. */
export function throwFire(th: Thrower, foot: Point, grade: 1 | 2 | 3, duration: number): FlameThrow {
  const U = th.cell;
  const fire = FIRES[grade];
  const tongueOf = (angle: number, out: number, rise: number, width: number, height: number, heat: number): Tongue => ({
    angle,
    out,
    rise,
    width,
    height,
    heat,
    phases: [th.range(0, 6.3), th.range(0, 6.3), th.range(0, 6.3)],
    rates: [th.range(9, 14), th.range(17, 25), th.range(4, 7)],
    variant: th.range(0, 6),
  });
  const atFeet = Array.from({ length: fire.feet }, (_unused, index) =>
    tongueOf(
      ((index + th.range(-0.3, 0.3)) / fire.feet) * Math.PI * 2,
      fire.ring * th.range(0.75, 1.1),
      0,
      th.range(0.26, 0.36) * (0.7 + 0.3 * fire.tall) * fire.wide,
      fire.tall * th.range(0.8, 1.2),
      th.range(0.4, 0.66) * fire.hot
    )
  );
  const upBody = Array.from({ length: fire.body }, (_unused, index) =>
    tongueOf(
      ((index + 0.5 + th.range(-0.3, 0.3)) / fire.body) * Math.PI * 2,
      fire.ring * th.range(0.45, 0.7),
      th.range(0.25, 0.75) * Math.min(1, fire.tall),
      th.range(0.18, 0.26) * fire.wide,
      fire.tall * th.range(0.55, 0.85),
      th.range(0.3, 0.48) * fire.hot
    )
  );
  const roaring = Array.from({ length: fire.roaring }, (_unused, index) =>
    tongueOf(
      ((index + th.range(-0.2, 0.2)) / Math.max(1, fire.roaring)) * Math.PI * 2,
      fire.ring * th.range(0.3, 0.5),
      0,
      th.range(0.5, 0.62),
      fire.tall * th.range(1.35, 1.6),
      th.range(0.55, 0.72) * fire.hot
    )
  );
  const tongues = [...roaring, ...atFeet, ...upBody];

  const flamelets: Flamelet[] = [];
  for (let born = 0.12; born < duration; born += 1 / fire.flamelets) {
    const bornAt = born + th.range(0, 0.05);
    if (fierceness(bornAt, duration) < 0.2) continue;
    flamelets.push({
      tongue: Math.floor(th.range(0, tongues.length - 0.001)),
      bornAt,
      lasts: th.lifeOf(bornAt, 0.3, 0.55),
      size: th.range(0.12, 0.2) * (0.7 + 0.3 * fire.tall),
      rises: th.range(1.2, 2.2),
      drift: th.range(0, 6.3),
      variant: th.range(0, 6),
    });
  }
  const clouds: Cloud[] = [];
  for (let born = 0.25; born < duration; born += 1 / fire.smoke) {
    const bornAt = born + th.range(0, 0.2);
    const fierce = fierceness(bornAt, duration);
    if (fierce < 0.15) continue;
    const drift = th.outward();
    clouds.push({
      mote: th.mote({
        x: foot.x + drift.cos * 0.15 * U,
        y: foot.y + drift.sin * 0.15 * U,
        z: foot.z + (fire.tall + th.range(0, 0.3)) * U,
        vx: drift.cos * th.range(0.3, 0.7) * U,
        vy: drift.sin * th.range(0.3, 0.7) * U,
        vz: th.range(0.7, 1.2) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.2, 1.9),
        gravity: -0.15 * U,
        drag: 0.6,
        bounce: 0,
      }),
      size: th.range(0.4, 0.62) * (0.6 + 0.4 * fierce) * (0.6 + 0.4 * fire.tall),
      color: SMOKE,
      alpha: 0.7,
    });
  }
  const embers: ThrownMote[] = [];
  for (let born = 0.1; born < duration; born += 1 / th.count(10)) {
    const bornAt = born + th.range(0, 0.1);
    if (fierceness(bornAt, duration) < 0.2) continue;
    const way = th.outward();
    embers.push(
      th.mote({
        x: foot.x + way.cos * th.range(0, fire.ring) * U,
        y: foot.y + way.sin * th.range(0, fire.ring) * U,
        z: foot.z + th.range(0.3, 0.9) * fire.tall * U,
        vx: way.cos * th.range(0.2, 0.8) * U,
        vy: way.sin * th.range(0.2, 0.8) * U,
        vz: th.range(1.8, 3.4) * U,
        bornAt,
        life: th.lifeOf(bornAt, 0.8, 1.6),
        gravity: -th.range(0.3, 0.9) * U,
        drag: 1.4,
        bounce: 0,
      })
    );
  }
  const sparks: ThrownMote[] = [];
  const spit = (at: Point, bornAt: number, count: number, speed: readonly [number, number]): void => {
    for (let index = 0; index < count; index++) {
      const way = th.outward();
      const fast = th.range(speed[0], speed[1]) * U;
      sparks.push(
        th.mote({
          ...at,
          vx: way.cos * fast * 0.6,
          vy: way.sin * fast * 0.6,
          vz: th.range(0.6, 1.2) * fast,
          bornAt,
          life: th.lifeOf(bornAt, 0.25, 0.55),
          gravity: th.fall,
          drag: 1.6,
          bounce: 0.35,
        })
      );
    }
  };
  spit({ x: foot.x, y: foot.y, z: foot.z + 0.4 * U }, 0, 6 * grade, [3, 6 + grade]);
  for (let born = 0.3; born < duration - 0.3; born += th.range(0.18, 0.4)) {
    const at = {
      x: foot.x + th.range(-0.25, 0.25) * U,
      y: foot.y + th.range(-0.25, 0.25) * U,
      z: foot.z + th.range(0.2, 0.7) * U,
    };
    spit(at, born, 3, [2, 4.5]);
  }
  const coals = Array.from({ length: 3 + 2 * grade }, () => {
    const way = th.outward();
    const out = th.range(0.05, fire.ring + 0.1) * U;
    return { x: foot.x + way.cos * out, y: foot.y + way.sin * out, z: th.floorZ + 0.03 * U };
  });
  return { tongues, flamelets, clouds, sparks, embers, coals };
}
