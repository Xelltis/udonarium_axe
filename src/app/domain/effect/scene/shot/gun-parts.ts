import type { Staged } from '@axe/domain/effect/scene/choreography';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, lightBall, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { aboutWay, levelWay, offsetBy, tossedAt } from '@axe/domain/effect/scene/shot/shot-flight';
import { layFlashStar, type StreakTones } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * What a gun does where it is fired. The flash at its muzzle has a shape: a tongue of flame thrown
 * forward, drawn to a point, two shorter ones out to its sides and one up, a star of light over them
 * and their light on the floor, all gone in a tenth of a second. A puff of smoke rolls on from it and
 * thins. The spent casing is thrown out to one side, turning, hops once where it falls and lies.
 */

/** How long the flash at a muzzle lasts, and how long its smoke hangs, in seconds. */
export const MUZZLE_FLASH_S = 0.13;
const MUZZLE_SMOKE_S = 0.75;
/** The brass of a casing, and its shade. */
const BRASS = ['#e2b24a', '#b98228', '#f3d27a'] as const;
const GUNSMOKE = '#c9c3bd';

/** A muzzle as it fires. */
export interface Muzzle {
  readonly at: Point;
  /** The way it fires. */
  readonly way: Point;
  readonly cell: number;
  readonly floorZ: number;
  /** How long ago it fired, in seconds. */
  readonly since: number;
  readonly seed: number;
  /** How large its flash is, against that of a handgun. */
  readonly power: number;
  /** Whether a puff of smoke rolls on from it. */
  readonly smokes: boolean;
}

/** Lays the flash at a muzzle and the smoke off it at a moment: see the header. */
export function layMuzzleFlash(drawn: Staged, muzzle: Muzzle, tones: StreakTones, forward: number): void {
  const { at, way, cell, since, power } = muzzle;
  if (since < 0) return;
  if (since < MUZZLE_FLASH_S) {
    const share = since / MUZZLE_FLASH_S;
    const left = 1 - share;
    const long = cell * 2.4 * power * (0.55 + 0.45 * left);
    const wide = cell * power * (0.6 + 0.4 * left);
    const tongue = (heading: Point, reach: number, across: number): void => {
      const points = [0, 0.22, 0.55, 1].map((along) => offsetBy(at, heading, reach * along));
      const widths = [0.2, 1, 0.7, 0].map((part) => part * across);
      drawn.ribbons.push(
        {
          points,
          widths: widths.map((width) => width * 1.35),
          color: tones.dark,
          alpha: 0.8 * left,
          blend: 'color',
          soft: 0.3,
        },
        { points, widths, color: tones.hue, core: tones.core, alpha: 1, blend: 'color' },
        { points, widths: widths.map((width) => width * 0.45), color: tones.heart, alpha: 1, blend: 'color' }
      );
    };
    tongue(way, long, wide);
    for (const turn of [0, Math.PI, Math.PI / 2]) {
      const across = aboutWay(way, turn);
      const heading = {
        x: way.x * 0.45 + across.x,
        y: way.y * 0.45 + across.y,
        z: way.z * 0.45 + across.z,
      };
      const length = Math.hypot(heading.x, heading.y, heading.z);
      tongue({ x: heading.x / length, y: heading.y / length, z: heading.z / length }, long * 0.5, wide * 0.5);
    }
    layFlashStar(drawn, at, cell * 2.4 * power, tones.hue, share, forward, 4, 0.4 + muzzle.seed);
    drawn.motes.push(lightBall(at, cell * 0.9 * power * (1 - share * 0.5), '#ffffff', left, forward + 1));
    drawn.floor.push(
      floorMark(
        'disc',
        { x: at.x, y: at.y, z: muzzle.floorZ },
        cell * 2 * power,
        1,
        tones.core,
        0.35 * left,
        'light',
        0
      )
    );
    drawn.lights.push({
      ...at,
      color: tones.core,
      strength: Math.min(1.4, 0.9 + 0.3 * power) * left,
      reachPx: cell * Math.min(3.6, 2 + 0.6 * power),
    });
  }
  if (!muzzle.smokes || since < 0.03 || since >= MUZZLE_SMOKE_S) return;
  const age = (since - 0.03) / (MUZZLE_SMOKE_S - 0.03);
  const eased = 1 - (1 - age) * (1 - age);
  const next = seededRun(muzzle.seed * 23 + 7);
  for (let puff = 0; puff < 3; puff++) {
    const on = cell * power * (0.5 + 0.5 * puff + (0.7 + 0.5 * puff) * eased);
    const rise = cell * (0.1 + 0.5 * eased * (0.5 + next()));
    const where = offsetBy(at, way, on);
    drawn.motes.push(
      smokePuff(
        { x: where.x, y: where.y, z: where.z + rise },
        cell * power * (0.45 + 0.75 * eased) * (1 - 0.15 * puff),
        GUNSMOKE,
        0.6 * (1 - age) ** 1.4,
        forward
      )
    );
  }
}

/** Lays a spent casing at a moment: thrown out to one side of the way the gun fires, turning, hopping once and lying until `left` falls to nothing. */
export function layCasing(
  drawn: Staged,
  at: Point,
  way: Point,
  cell: number,
  floorZ: number,
  since: number,
  left: number,
  seed: number,
  forward: number
): void {
  if (since < 0 || left <= 0.01) return;
  const next = seededRun(seed * 13 + 3);
  const level = levelWay(way);
  const out = (1.6 + next() * 1.6) * cell;
  const back = (0.2 + next() * 0.8) * cell;
  const velocity = {
    x: level.y * out - level.x * back,
    y: -level.x * out - level.y * back,
    z: (3.4 + next() * 1.6) * cell,
  };
  const variant = next() * 6;
  const tossed = tossedAt(at, velocity, since, floorZ, 13 * cell, 0.4);
  const size = cell * 0.22;
  const where = { x: tossed.at.x, y: tossed.at.y, z: tossed.at.z + size * 0.4 };
  drawn.motes.push({
    ...where,
    size,
    color: BRASS[Math.floor(variant) % BRASS.length],
    alpha: left,
    blend: 'color',
    shape: 'chunk',
    spin: tossed.lies ? variant : since * 26 + variant,
    variant,
    forward,
  });
  if (!tossed.lies && Math.sin(since * 60 + variant) > 0.2) {
    drawn.motes.push({ ...glow(where, cell * 0.2, BRASS[2], 0.9, forward + 1), shape: 'star', spin: since * 9 });
  }
}
