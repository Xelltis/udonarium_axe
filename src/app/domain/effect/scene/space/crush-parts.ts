import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { flowMote, roundDisc } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { type BoldTones, layBoldBand, layBoldScreenLine } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf, screenArc, tippedCircle } from '@axe/domain/effect/scene/space/space-parts';

/*
 * The parts of a crush: the lens of black that hangs over the piece, its rim burning and heavy rings
 * wound round it; the crater the floor is driven down into under it, cracked and burning; and the
 * pebbles it draws up off the floor and holds circling it until it lets go.
 */

/** The torn earth at the lip of a crater. */
const LIP = '#a08a6a';

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
    size: 0.14 + 0.09 * scatterOf(index, 17),
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
 * The lens: a solid body of black with a burning rim, tongues of its colour licking out round it, light
 * glowing about it, and two heavy rings orbiting it steeply tipped, their far halves faint behind it, and
 * arcs of bent light flickering about it; hotter as `hot` rises, its rings laid in as many `steps`.
 */
export function drawLens(
  drawn: Staged,
  at: Point,
  radius: number,
  tones: BoldTones,
  hot: number,
  t: number,
  seed: number,
  forward: number,
  steps = 36
): void {
  if (radius < 0.5) return;
  const wide = radius * 2;
  drawn.motes.push(glow(at, wide * (2.6 + 1.2 * hot), tones.hot, 0.35 + 0.4 * hot, forward));
  drawn.motes.push(haze(at, wide * 2.4, tones.rim, 0.5, forward));
  for (const [sheet, color, core] of [
    [1.3, tones.rim, tones.body],
    [1, tones.body, tones.hot],
  ] as const) {
    for (let index = 0; index < 12; index++) {
      const turn = (index / 12) * Math.PI * 2 + scatterOf(index, seed % 17) * 0.4 + t * 0.8;
      const rise = (scatterOf(index, 5) - 0.5) * 1.6;
      drawn.motes.push(
        flowMote(
          'lick',
          at,
          { x: Math.cos(turn), y: Math.sin(turn), z: rise },
          radius * (0.75 + 0.3 * Math.sin(t * 11 + index * 1.9) ** 2) * sheet,
          radius * (1.55 + 0.45 * hot + 0.25 * Math.sin(t * 7 + index)) * (0.93 + 0.07 * sheet),
          t * 4 + index,
          { color, core, alpha: 1, variant: index, forward: forward + 1 }
        )
      );
    }
  }
  drawn.motes.push(...roundDisc(at, wide * 1.44, tones.hot, 1, forward + 2));
  drawn.motes.push(...roundDisc(at, wide * 1.2, hot > 0.5 ? '#ffffff' : tones.core, 1, forward + 2.5));
  drawn.motes.push(...roundDisc(at, wide * 1.1, '#000000', 1, forward + 3));
  for (const [out, thick, speed, turn] of [
    [2.15, 0.34, 4.2, 0],
    [2.6, 0.2, -3, Math.PI / 2],
  ] as const) {
    const ring = tippedCircle(
      at,
      radius * out,
      steps,
      0.85,
      (seed % 6) * 0.5 + turn,
      t * speed,
      t * speed + Math.PI * 2
    );
    layBoldBand(
      drawn,
      ring,
      {
        rim: tones.rim,
        body: out < 2.5 ? tones.hot : tones.body,
        core: hot > 0.5 ? '#ffffff' : tones.core,
        glow: tones.hot,
        lit: 0.5 + 0.5 * hot,
        wide: radius * (thick + 0.1 * hot),
        alpha: 1,
        alphas: ring.map((_point, step) => 0.7 + 0.3 * Math.abs(Math.sin(step * 0.31 + out))),
      },
      at,
      1,
      0.3
    );
  }
  for (let arc = 0; arc < 3; arc++) {
    const from = scatterOf(arc, seed % 31) * Math.PI * 2 + t * (1.5 + arc) * (arc % 2 === 0 ? 1 : -1);
    layBoldScreenLine(drawn, at, screenArc(radius * (3.2 + 0.4 * arc), from, from + 1.1, 5), {
      rim: tones.rim,
      body: tones.body,
      core: tones.core,
      glow: tones.hot,
      alpha: 0.6 + 0.4 * Math.sin(t * 19 + arc),
      lit: 0.4,
      wide: radius * 0.24,
      forward: forward + 4,
    });
  }
}

/**
 * The crater the floor is driven down into under a crush: black at its depths and darkening all the
 * way out to a lip of torn earth, cracked out from the middle and split in fissures, the cracks burning
 * in its colour while the lens holds it and cooling after; gone over `lasts` seconds from the moment
 * it comes down.
 */
export function layDish(
  drawn: Staged,
  floor: Point,
  cell: number,
  tones: BoldTones,
  since: number,
  lasts: number,
  held: number,
  seed: number
): void {
  if (since < 0 || since >= lasts) return;
  const sunk = outCubic(within(since, 0, 0.1));
  const fading = 1 - within(since, lasts * 0.6, lasts);
  const burning = Math.max(held, 1 - within(since, 0, lasts * 0.55)) * (0.75 + 0.25 * Math.sin(since * 21));
  const ragged = (seed % 89) + 1;
  drawn.floor.push(floorMark('disc', floor, cell * 2.1, 1, tones.hot, 0.2 * burning * held, 'light', 0));
  drawn.floor.push(floorMark('scorch', floor, cell * 2 * sunk, 1, tones.rim, 0.6 * fading, 'color', ragged));
  drawn.floor.push(floorMark('disc', floor, cell * 1.45 * sunk, 1, tones.ink, 0.7 * fading, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 0.95 * sunk, 1, '#000000', 0.6 * fading, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 0.5 * sunk, 1, '#000000', 0.7 * fading, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, cell * 1.42 * sunk, 0.2, tones.rim, 0.85 * fading, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, cell * 1.52 * sunk, 0.07, LIP, 0.8 * fading, 'color', 0));
  drawn.floor.push(floorMark('cracks', floor, cell * 2.1 * sunk, 0.8, tones.ink, 0.95 * fading, 'color', ragged));
  drawn.floor.push(floorMark('cracks', floor, cell * 2.1 * sunk, 0.3, tones.body, burning * fading, 'color', ragged));
  drawn.floor.push(
    floorMark('cracks', floor, cell * 2.1 * sunk, 0.12, tones.core, 0.9 * burning * held * fading, 'color', ragged)
  );
  for (let split = 0; split < 5; split++) {
    const turn = (seed % 13) * 0.4 + (split / 5) * Math.PI * 2;
    const at = { x: floor.x + Math.cos(turn) * cell * 1.25, y: floor.y + Math.sin(turn) * cell * 1.25, z: floor.z };
    const markTurn = -turn;
    drawn.floor.push(
      floorMark('fissure', at, cell * 1 * sunk, 0.24, tones.ink, 0.95 * fading, 'color', split + ragged, markTurn)
    );
    drawn.floor.push(
      floorMark(
        'fissure',
        at,
        cell * 1 * sunk,
        0.09,
        mixColor(tones.body, tones.hot, burning),
        burning * fading,
        'color',
        split + ragged,
        markTurn
      )
    );
  }
}
