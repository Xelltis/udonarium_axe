import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { roundDisc } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, haze, lightBall, type Point } from '@axe/domain/effect/scene/parts';
import {
  layScreenLine,
  layWound,
  scatterOf,
  screenArc,
  type SpaceTones,
  tippedCircle,
} from '@axe/domain/effect/scene/space/space-parts';

/*
 * The parts of a crush: the lens of black that hangs over the piece, a pale rim about it and a bright
 * ring wound round it; the dish the floor sinks into under it, cracked and burning; and the pebbles it
 * draws up off the floor and holds circling it until it lets go.
 */

/** One pebble a crush draws up: where it lies on the floor, where it circles the lens, how large it is and how it tumbles. */
export interface Pebble {
  readonly turn: number;
  readonly out: number;
  readonly orbit: number;
  readonly high: number;
  readonly rate: number;
  readonly from: number;
  readonly size: number;
  readonly spin: number;
  readonly variant: number;
}

/** The pebbles a crush draws up, picked by its seed. */
export function pebblesOf(seed: number, count: number, cell: number): Pebble[] {
  return Array.from({ length: count }, (_unused, index) => ({
    turn: scatterOf(index, seed % 97) * Math.PI * 2,
    out: cell * (0.5 + 1.1 * scatterOf(index, 3)),
    orbit: cell * (0.45 + 0.35 * scatterOf(index, 5)),
    high: cell * (scatterOf(index, 7) - 0.5) * 0.4,
    rate: 2.5 + 2.5 * scatterOf(index, 11),
    from: 0.05 + 0.25 * scatterOf(index, 13),
    size: 0.1 + 0.07 * scatterOf(index, 17),
    spin: 6 + 10 * scatterOf(index, 19),
    variant: index,
  }));
}

/** Where a pebble is at a moment before the lens lets go: drawn up off the floor in a spiral, then circling the lens. */
export function pebbleAt(pebble: Pebble, floor: Point, lens: Point, t: number, strikes: number, cell: number): Point {
  const turn = pebble.turn + t * pebble.rate;
  const risen = outCubic(within(t, pebble.from * strikes, strikes * 0.95));
  const out = pebble.out + (pebble.orbit - pebble.out) * risen;
  const bob = Math.sin(t * 7 + pebble.variant) * cell * 0.05 * risen;
  return {
    x: floor.x + Math.cos(turn) * out,
    y: floor.y + Math.sin(turn) * out,
    z: floor.z + cell * 0.05 + (lens.z + pebble.high - floor.z - cell * 0.05) * risen * risen + bob,
  };
}

/**
 * The lens: light glowing about it, a pale rim, a deep edge and black within, since colour is laid
 * over light; and a bright ring wound round it, turning, wide enough to pass clear of it.
 */
export function drawLens(
  drawn: Staged,
  at: Point,
  radius: number,
  tones: SpaceTones,
  hot: number,
  t: number,
  seed: number,
  forward: number
): void {
  if (radius < 0.5) return;
  const wide = radius * 2;
  drawn.motes.push(glow(at, wide * (3.2 + 1.2 * hot), tones.glow, 0.55 + 0.4 * hot, forward));
  drawn.motes.push(lightBall(at, wide * 1.26, hot > 0.5 ? '#ffffff' : tones.pale, 1, forward + 1));
  drawn.motes.push(haze(at, wide * 2.1, tones.edge, 0.55, forward));
  drawn.motes.push(...roundDisc(at, wide * 1.16, tones.deep, 1, forward + 2));
  drawn.motes.push(...roundDisc(at, wide * 1.04, '#000000', 1, forward + 3));
  for (const [out, thick, speed] of [
    [2.2, 0.42, 5],
    [3, 0.26, -3.4],
  ] as const) {
    const ring = tippedCircle(at, radius * out, 40, 0.28, (seed % 6) * 0.5, t * speed, t * speed + Math.PI * 2);
    layWound(drawn, ring, at, {
      sheath: tones.edge,
      light: tones.glow,
      heart: hot > 0.5 ? '#ffffff' : tones.glow,
      wide: radius * (thick + 0.2 * hot),
      alpha: 0.95,
      lit: 0.7 + 0.5 * hot,
      nearShare: 1,
      alphas: ring.map((_point, step) => 0.5 + 0.5 * Math.abs(Math.sin(step * 0.31 + out))),
    });
  }
  for (let arc = 0; arc < 3; arc++) {
    const from = scatterOf(arc, seed % 31) * Math.PI * 2 + t * (1.5 + arc) * (arc % 2 === 0 ? 1 : -1);
    layScreenLine(drawn, at, screenArc(radius * (1.75 + 0.45 * arc), from, from + 1.1, 5), {
      sheath: tones.deep,
      light: tones.glow,
      heart: tones.pale,
      alpha: 0.6 + 0.4 * Math.sin(t * 19 + arc),
      wide: radius * 0.07,
      forward: forward + 4,
    });
  }
}

/**
 * The dish the floor sinks into under a crush: dark at its middle and lipped at its rim, cracked out
 * from the middle and split in fissures, the cracks burning while the lens holds it and cooling after;
 * gone over `lasts` seconds from the moment it comes down.
 */
export function layDish(
  drawn: Staged,
  floor: Point,
  cell: number,
  tones: SpaceTones,
  since: number,
  lasts: number,
  held: number,
  seed: number
): void {
  if (since < 0 || since >= lasts) return;
  const sunk = outCubic(within(since, 0, 0.1));
  const fading = 1 - within(since, lasts * 0.55, lasts);
  const burning = Math.max(held, 1 - within(since, 0, lasts * 0.5)) * (0.75 + 0.25 * Math.sin(since * 21));
  const ragged = (seed % 89) + 1;
  drawn.floor.push(floorMark('disc', floor, cell * 2.1, 1, tones.glow, 0.25 * burning * held, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 1.6 * sunk, 1, tones.ink, 0.5 * fading, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 0.95 * sunk, 1, '#000000', 0.45 * fading, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 0.5 * sunk, 1, '#000000', 0.5 * fading, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, cell * 1.28 * sunk, 0.16, tones.ink, 0.75 * fading, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, cell * 1.4 * sunk, 0.03, '#d8cbb4', 0.5 * fading, 'color', 0));
  drawn.floor.push(floorMark('cracks', floor, cell * 1.9 * sunk, 0.6, tones.ink, 0.95 * fading, 'color', ragged));
  drawn.floor.push(floorMark('cracks', floor, cell * 1.9 * sunk, 0.14, tones.glow, burning * fading, 'color', ragged));
  for (let split = 0; split < 5; split++) {
    const turn = (seed % 13) * 0.4 + (split / 5) * Math.PI * 2;
    const at = { x: floor.x + Math.cos(turn) * cell * 1.15, y: floor.y + Math.sin(turn) * cell * 1.15, z: floor.z };
    const markTurn = -turn;
    drawn.floor.push(
      floorMark('fissure', at, cell * 0.85 * sunk, 0.16, tones.ink, 0.9 * fading, 'color', split + ragged, markTurn)
    );
    drawn.floor.push(
      floorMark(
        'fissure',
        at,
        cell * 0.85 * sunk,
        0.045,
        mixColor(tones.glow, '#ffffff', 0.35),
        0.8 * burning * fading,
        'color',
        split + ragged,
        markTurn
      )
    );
  }
}
