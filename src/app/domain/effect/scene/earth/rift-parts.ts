import type { Staged } from '@axe/domain/effect/scene/choreography';
import type { EarthTones } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * A crack torn through the ground, shared by a rift and a quake: a gash of dark depths laid along the
 * floor in long overlapping lengths, broken ground about its lips, the glow of its depths down its
 * middle with a white-hot seam while it is hottest, glow welling up off it; and the embers that rise
 * out of it while it cools. What glows in the gash is laid as colour, as light laid on the floor is
 * drawn under the colour laid over it and the depths would put it out.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** The dark of a crack's depths. */
const DEPTHS = '#1d130c';
/** How far each length of a gash runs on past the bends it is laid between, as a share of its length, so the lengths overlap. */
const OVERLAP = 0.3;

/** One point of a crack as it is at a moment: where it is, and how hot, from 1 white-hot to 0 gone cold. */
export interface HotPoint {
  readonly at: Point;
  readonly heat: number;
}

/**
 * A gash torn along points, `wide` across at its widest, in table pixels: each length of it laid
 * between every other point and overlapping the next, its dark depths over broken ground, and within
 * them the glow of its heat, white down its middle while it is hottest, with glow welling up off it.
 */
export function layGash(
  drawn: Staged,
  points: readonly HotPoint[],
  wide: number,
  tones: EarthTones,
  alpha: number,
  seed: number
): void {
  if (points.length < 2 || alpha <= 0) return;
  for (let index = 0; index < points.length - 1; index += 2) {
    const from = points[index].at;
    const to = points[Math.min(index + 2, points.length - 1)].at;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1) continue;
    const reach = length * (0.5 + OVERLAP);
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    const turn = Math.atan2(from.y - to.y, to.x - from.x);
    const look = (Math.abs(seed + index * 7) % 97) / 9.7;
    const widthOf = (share: number) => Math.min(0.8, (wide * share) / reach);
    if (index % 4 === 0)
      drawn.floor.push(floorMark('scorch', middle, length * 0.62, 1, tones.earth, 0.6 * alpha, 'color', look));
    drawn.floor.push(floorMark('fissure', middle, reach, widthOf(0.5), DEPTHS, 0.95 * alpha, 'color', look, turn));
    const heat = points[index].heat;
    if (heat <= 0.02) continue;
    const color = heat > 0.75 ? tones.hot : heat > 0.35 ? tones.glow : mixColor(tones.glow, '#7a1c0c', 0.6);
    drawn.floor.push(
      floorMark('fissure', middle, reach, widthOf(0.34), color, alpha * Math.min(1, heat * 1.5), 'color', look, turn)
    );
    if (heat > 0.6)
      drawn.floor.push(
        floorMark('fissure', middle, reach, widthOf(0.13), '#fff6e0', alpha * (heat - 0.6) * 2.5, 'color', look, turn)
      );
    drawn.motes.push(
      glow({ ...middle, z: middle.z + wide * 0.3 }, wide * (1.6 + 1.4 * heat), tones.glow, 0.4 * heat * alpha, wide)
    );
  }
}

/** Embers rising slowly out of a crack through points, between two moments. */
export function throwEmbers(
  th: Thrower,
  points: readonly Point[],
  count: number,
  bornAt: readonly [number, number]
): ThrownMote[] {
  const U = th.cell;
  if (points.length < 2) return [];
  return Array.from({ length: count }, () => {
    const from = Math.floor(th.range(0, points.length - 1.001));
    const share = th.range(0, 1);
    const a = points[from];
    const b = points[from + 1];
    const born = th.range(bornAt[0], bornAt[1]);
    return th.mote({
      x: a.x + (b.x - a.x) * share,
      y: a.y + (b.y - a.y) * share,
      z: a.z + U * 0.05,
      vx: th.range(-0.4, 0.4) * U,
      vy: th.range(-0.4, 0.4) * U,
      vz: th.range(0.9, 2.2) * U,
      bornAt: born,
      life: th.lifeOf(born, 0.9, 1.7),
      gravity: -th.range(0.2, 0.6) * U,
      drag: 1.2,
      bounce: 0,
    });
  });
}

/** Embers at a moment: sparks of the crack's heat, white as they leave it and dulling as they rise and die. */
export function drawEmbers(
  drawn: Staged,
  embers: readonly ThrownMote[],
  t: number,
  U: number,
  tones: EarthTones,
  alpha: number
): void {
  for (const [index, ember] of embers.entries()) {
    const at = moteAt(ember, t);
    if (!at) continue;
    const flicker = 0.6 + 0.4 * Math.sin(t * 23 + index * 2.3);
    drawn.motes.push({
      ...glow(
        at,
        U * (0.07 + 0.04 * (index % 3)),
        at.age < 0.3 ? tones.hot : tones.glow,
        (1 - at.age) * flicker * alpha,
        U * 0.3
      ),
      shape: 'spark',
      velocity: { x: at.vx, y: at.vy, z: at.vz },
      trail: 0.05,
    });
  }
}
