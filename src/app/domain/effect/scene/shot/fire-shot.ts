import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type Flame, layBillows, layFlames } from '@axe/domain/effect/scene/fire/fire-body';
import { WARM } from '@axe/domain/effect/scene/fire/fire-parts';
import { acrossOf, glow, type Point } from '@axe/domain/effect/scene/parts';

/*
 * A shot of fire in flight: a head of fire, white at its heart, its pattern streaming back over it,
 * and a tail of flame torn out behind it, one long lick along the way it has come and shorter ones
 * splayed to either side that flicker; sparks shed along its way, falling as they cool, and its light
 * on the ground under it. The least of them is a dart, narrow and quick; a greater one is a ball of
 * fire, wider, with a longer tail, that leaves a thread of smoke where it has passed.
 */

/** A shot of fire of each grade: how wide its head is and how long its tail, in cells, how many sparks it sheds, and whether it leaves smoke. */
const SHOTS = {
  1: { head: 0.3, tail: 1.5, sparks: 4, smokes: false },
  2: { head: 0.5, tail: 2.1, sparks: 6, smokes: true },
  3: { head: 0.64, tail: 2.6, sparks: 8, smokes: true },
} as const;

/** A shot of fire as it flies: where it is, which way it flies, and the way it has come. */
export interface FireFlight {
  readonly at: Point;
  readonly way: Point;
  /** How wide a cell is drawn for it, in table pixels. */
  readonly cell: number;
  /** How far along its flight it is, from 0 to 1, and where it is at any share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  readonly seconds: number;
  readonly seed: number;
  readonly grade: 1 | 2 | 3;
  readonly forward: number;
}

/** Draws a shot of fire in flight. */
export function drawFireShot(drawn: Staged, flight: FireFlight, ramp: readonly string[]): void {
  const { at, way, cell, share, seconds, seed, forward } = flight;
  const shot = SHOTS[flight.grade];
  const back = { x: -way.x, y: -way.y, z: -way.z };
  const { side, lift } = acrossOf(way);
  const head = cell * shot.head;
  const grown = Math.min(1, share / 0.12);
  const flames: Flame[] = [];
  const tails = [
    { aside: 0, up: 0.12, long: 1, wide: 0.95, heat: 0.9 },
    { aside: 0.42, up: 0.3, long: 0.55, wide: 0.6, heat: 0.7 },
    { aside: -0.42, up: 0.2, long: 0.62, wide: 0.6, heat: 0.7 },
  ];
  tails.forEach((tail, index) => {
    const flicker = 0.82 + 0.18 * Math.sin(seconds * (29 + index * 7) + seed + index * 2.1);
    const sway = Math.sin(seconds * 13 + seed + index * 1.7) * 0.08;
    flames.push({
      shape: 'lick',
      at: { x: at.x + way.x * head * 0.2, y: at.y + way.y * head * 0.2, z: at.z + way.z * head * 0.2 },
      heading: {
        x: back.x + side.x * (tail.aside + sway) + lift.x * tail.up,
        y: back.y + side.y * (tail.aside + sway) + lift.y * tail.up,
        z: back.z + side.z * (tail.aside + sway) + lift.z * tail.up,
      },
      wide: head * tail.wide,
      long: cell * shot.tail * tail.long * flicker * grown,
      heat: tail.heat,
      flowed: seconds * 9 + index * 2.3 + (seed % 7),
      variant: (seed + index * 1.9) % 6,
    });
  });
  flames.push({
    shape: 'blaze',
    at,
    heading: back,
    wide: head,
    long: head * 1.3,
    heat: 1,
    flowed: seconds * 7 + (seed % 5),
    variant: seed % 6,
  });
  if (shot.smokes) {
    const billows = [];
    for (let puff = 2; puff <= 7; puff++) {
      const was = share - puff * 0.045;
      if (was < 0) continue;
      const age = puff / 8;
      const where = flight.pathAt(was);
      billows.push({
        at: { x: where.x, y: where.y, z: where.z + cell * 0.25 * age },
        heading: { x: 0, y: 0, z: 1 },
        wide: head * (0.7 + 0.9 * age),
        long: head * (0.8 + 1 * age),
        alpha: 0.5 * (1 - age),
        flowed: seconds * 0.8 + puff * 1.7,
        variant: (seed + puff * 1.3) % 6,
        warm: 1 - age,
      });
    }
    layBillows(drawn, billows, ramp, true, { forward });
  }
  layFlames(drawn, flames, ramp, { forward });
  for (let shed = 1; shed <= shot.sparks; shed++) {
    const was = share - shed * 0.05 - 0.02;
    if (was < 0) continue;
    const age = shed / (shot.sparks + 1);
    const where = flight.pathAt(was);
    const off = Math.sin(seed * 3 + shed * 2.1) * cell * 0.22;
    const rise = Math.cos(seed + shed * 1.7) * cell * 0.14 - age * age * cell * 0.5;
    drawn.motes.push({
      ...glow(
        { x: where.x + side.x * off, y: where.y + side.y * off, z: where.z + rise },
        cell * 0.07 * (1 - 0.4 * age),
        ramp[age < 0.4 ? 5 : age < 0.7 ? 4 : 3],
        1 - age,
        forward
      ),
      shape: 'spark',
      velocity: { x: back.x * cell, y: back.y * cell, z: back.z * cell - age * cell * 2 },
      trail: 0.12,
    });
  }
  drawn.motes.push(glow(at, head * 3.2, ramp[3], 0.45, forward));
  drawn.lights.push({
    ...at,
    color: mixColor(ramp[4], WARM, 0.5),
    strength: 0.5 + 0.2 * flight.grade,
    reachPx: cell * 2.2,
  });
}
