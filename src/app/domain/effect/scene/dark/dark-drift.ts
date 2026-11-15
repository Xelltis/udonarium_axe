import { outCubic, type Staged } from '@axe/domain/effect/scene/choreography';
import { type DarkTones, flowMote } from '@axe/domain/effect/scene/dark/dark-parts';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { glow, haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * What darkness leaves drifting once it has struck: motes of black rising off it, each with a glow of
 * violet about it, and shreds of black smoke edged in violet.
 */

/** Where and when motes of darkness drift: about a point, as far out as `out`, born over a span of time. */
export interface InkMotes {
  readonly count: number;
  /** How far out from the point they are born, in table pixels, at the least and at the most. */
  readonly out: readonly [number, number];
  /** When they are born, in seconds, from the first to the last. */
  readonly born: readonly [number, number];
  /** How fast they rise, in table pixels a second; below nothing they sink from `high`. */
  readonly rise: number;
  /** How high over the point they are born, in table pixels; on the floor without. */
  readonly high?: number;
}

/**
 * Motes of darkness drifting up about a point, or down onto it: each a speck of black with a glow of
 * violet about it, swaying as it goes, one in three an ember of violet light.
 */
export function drawInkMotes(
  drawn: Staged,
  seed: number,
  heart: Point,
  cell: number,
  t: number,
  tones: DarkTones,
  motes: InkMotes,
  forward: number
): void {
  const next = seededRun(seed * 59 + 13);
  for (let index = 0; index < motes.count; index++) {
    const turn = next() * Math.PI * 2;
    const out = motes.out[0] + (motes.out[1] - motes.out[0]) * Math.sqrt(next());
    const born = motes.born[0] + (motes.born[1] - motes.born[0]) * next();
    const life = 0.8 + next() * 0.9;
    const pace = 0.6 + next() * 0.8;
    const size = cell * (0.07 + next() * 0.07);
    const since = t - born;
    if (since < 0 || since >= life) continue;
    const age = since / life;
    const sway = Math.sin(since * 3.3 + index * 1.9) * cell * 0.09;
    const at = {
      x: heart.x + Math.cos(turn) * out + sway,
      y: heart.y + Math.sin(turn) * out + sway * 0.6,
      z: Math.max(heart.z, heart.z + (motes.high ?? cell * 0.06) + motes.rise * pace * since),
    };
    const fade = Math.min(1, age * 7, (1 - age) * 2.4);
    drawn.motes.push(glow(at, size * 2.6, tones.glow, 0.55 * fade, forward));
    if (index % 3 === 0) {
      drawn.motes.push(haze(at, size * 1.3, tones.edge, fade, forward));
      drawn.motes.push(glow(at, size * 1.1, tones.pale, fade, forward + 1));
      continue;
    }
    drawn.motes.push(haze(at, size * 1.9, tones.edge, 0.8 * fade, forward));
    drawn.motes.push({
      ...at,
      size,
      color: '#000000',
      alpha: fade,
      blend: 'color',
      shape: 'puff',
      variant: index,
      forward,
    });
  }
}

/** Where and when smoke of darkness rises: about a point, as far out as `out`, born over a span of time. */
export interface BlackSmoke {
  readonly count: number;
  readonly out: readonly [number, number];
  readonly born: readonly [number, number];
  /** How tall a shred of it stands, in table pixels. */
  readonly tall: number;
}

/** Shreds of black smoke rising about a point, each edged in violet, leaning as it goes and thinning away. */
export function drawBlackSmoke(
  drawn: Staged,
  seed: number,
  heart: Point,
  cell: number,
  t: number,
  tones: DarkTones,
  smoke: BlackSmoke,
  forward: number
): void {
  const next = seededRun(seed * 67 + 29);
  const shreds: {
    root: Point;
    heading: Point;
    wide: number;
    long: number;
    flowed: number;
    fade: number;
    id: number;
  }[] = [];
  for (let index = 0; index < smoke.count; index++) {
    const turn = next() * Math.PI * 2;
    const out = smoke.out[0] + (smoke.out[1] - smoke.out[0]) * Math.sqrt(next());
    const born = smoke.born[0] + (smoke.born[1] - smoke.born[0]) * next();
    const life = 0.9 + next() * 0.8;
    const lean = (next() - 0.5) * 0.7;
    const wide = cell * (0.26 + next() * 0.2);
    const since = t - born;
    if (since < 0 || since >= life) continue;
    const age = since / life;
    shreds.push({
      root: {
        x: heart.x + Math.cos(turn) * out,
        y: heart.y + Math.sin(turn) * out,
        z: heart.z + cell * 0.05 + smoke.tall * 0.5 * age,
      },
      heading: { x: lean + Math.sin(since * 2 + index) * 0.2, y: lean * 0.4, z: 1 },
      wide: wide * (0.7 + 0.6 * age),
      long: smoke.tall * (0.4 + 0.6 * outCubic(age)),
      flowed: since * 1.4 + index,
      fade: Math.min(1, age * 6, (1 - age) * 1.8),
      id: index,
    });
  }
  for (const shred of shreds) {
    drawn.motes.push(
      flowMote('wisp', shred.root, shred.heading, shred.wide * 1.3, shred.long * 1.05, shred.flowed, {
        color: tones.edge,
        alpha: 0.55 * shred.fade,
        variant: shred.id,
        forward,
      })
    );
  }
  for (const shred of shreds) {
    drawn.motes.push(
      flowMote('wisp', shred.root, shred.heading, shred.wide, shred.long, shred.flowed, {
        color: tones.ink,
        core: '#000000',
        alpha: 0.85 * shred.fade,
        variant: shred.id,
        forward,
      })
    );
  }
}
