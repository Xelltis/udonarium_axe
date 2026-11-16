import { clamp } from '@axe/core/util/clamp';
import { outCubic, type Staged } from '@axe/domain/effect/scene/choreography';
import type { EarthTones } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Point, smokePuff, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The rocks the looks of earth throw, from boulders as large as a piece down to gravel: each flies,
 * tumbling, strikes the floor, a boulder in a puff of dust, bounces, rolls half over and lies where
 * it stops until the look clears.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** A rock thrown: how it flies, how wide it is, and where and when it first strikes the floor and comes to rest. */
export interface Rock {
  readonly mote: ThrownMote;
  /** How wide it is, in cells. */
  readonly size: number;
  /** Which of the colours of rock it is, from the palest. */
  readonly tone: number;
  /** How fast it tumbles as it flies, in radians a second, and how far over it rolls once it has struck. */
  readonly turnRate: number;
  readonly rolls: number;
  readonly variant: number;
  /** When it first strikes the floor, in seconds on the clock it was thrown on, and where; never, for one that does not. */
  readonly strikesAt: number;
  readonly struck: { readonly x: number; readonly y: number };
}

/** How a rock is thrown. */
export interface RockThrow {
  /** How wide, in cells. */
  readonly size: readonly [number, number];
  /** How fast up and how fast out over the floor. */
  readonly up: readonly [number, number];
  readonly out: readonly [number, number];
  /** When, in seconds. */
  readonly bornAt: readonly [number, number];
  /** How far from the foot it starts at the most, and how high over the floor. */
  readonly from?: number;
  readonly high?: readonly [number, number];
  /** The way most of them are thrown, in radians over the floor, how far to either side of it, and the share thrown that way. */
  readonly fan?: { readonly toward: number; readonly spread: number; readonly share: number };
  /** How much of its speed it keeps off the floor. */
  readonly bounce?: number;
}

/** When and where a thrown particle first comes down on the floor, stepped through its flight. */
function firstStrikeOf(mote: ThrownMote): { at: number; x: number; y: number } {
  let risen = mote.z > mote.floorZ + 1 || mote.vz > 0;
  for (let since = 1 / 60; since < Math.min(mote.life, 8); since += 1 / 60) {
    const now = moteAt(mote, mote.bornAt + since);
    if (!now) break;
    if (now.z > mote.floorZ + 1) risen = true;
    else if (risen || now.landed) return { at: mote.bornAt + since, x: now.x, y: now.y };
  }
  return { at: Number.POSITIVE_INFINITY, x: mote.x, y: mote.y };
}

/** Rocks thrown from about a foot, to fly, strike the floor, bounce and lie until the look clears. */
export function throwRocks(th: Thrower, foot: Point, count: number, how: RockThrow): Rock[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const fanned = how.fan && th.chance(how.fan.share);
    const angle = fanned ? how.fan!.toward + th.range(-how.fan!.spread, how.fan!.spread) : th.range(0, Math.PI * 2);
    const way = { cos: Math.cos(angle), sin: Math.sin(angle) };
    const from = th.range(0, how.from ?? 0.25) * U;
    const speed = th.range(how.out[0], how.out[1]) * U;
    const bornAt = th.range(how.bornAt[0], how.bornAt[1]);
    const mote = th.mote({
      x: foot.x + way.cos * from,
      y: foot.y + way.sin * from,
      z: foot.z + th.range(how.high?.[0] ?? 0.05, how.high?.[1] ?? 0.05) * U,
      vx: way.cos * speed,
      vy: way.sin * speed,
      vz: th.range(how.up[0], how.up[1]) * U,
      bornAt,
      life: th.lifeOf(bornAt, 60, 60),
      gravity: th.fall,
      drag: 0.35,
      bounce: how.bounce ?? 0.34,
    });
    const strike = firstStrikeOf(mote);
    const turnRate = th.range(5, 13) * (th.chance(0.5) ? 1 : -1);
    return {
      mote,
      size: th.range(how.size[0], how.size[1]),
      tone: Math.floor(th.range(0, 2.99)),
      turnRate,
      rolls: Math.sign(turnRate) * th.range(1.2, 3.2),
      variant: th.range(0, 6),
      strikesAt: strike.at,
      struck: { x: strike.x, y: strike.y },
    };
  });
}

/** How wide a rock is, in cells, from which it is a boulder: lumped, and raising dust where it strikes. */
const BOULDER_FROM = 0.24;
/** How long the dust a boulder raises where it strikes takes to clear, and how long a rock takes to fade as the look clears, in seconds. */
const STRIKE_DUST_S = 0.7;
const ROCK_FADES_S = 0.45;

/**
 * A rock at a moment: tumbling while it flies, rolling over and slowing once it has struck, lit by
 * `glow` for an instant as it is thrown; a boulder has lumps standing out of it, and raises a puff
 * of dust where it first strikes the floor.
 */
export function drawRock(drawn: Staged, rock: Rock, t: number, cell: number, tones: EarthTones): void {
  const at = moteAt(rock.mote, t);
  if (!at) return;
  const size = cell * rock.size;
  const flown = Math.min(t, rock.strikesAt) - rock.mote.bornAt;
  const rolled = t > rock.strikesAt ? rock.rolls * (1 - Math.exp(-(t - rock.strikesAt) * 2.6)) : 0;
  const spin = rock.variant + rock.turnRate * flown + rolled;
  const left = rock.mote.bornAt + rock.mote.life - t;
  const alpha = clamp(left / ROCK_FADES_S, 0, 1);
  const lit = Math.max(0, 1 - (t - rock.mote.bornAt) / 0.3) * 0.5;
  const stone = tones.rock[rock.tone] ?? tones.rock[1];
  const color = lit > 0 ? mixColor(stone, tones.glow, lit) : stone;
  const middle = { x: at.x, y: at.y, z: at.z + size * 0.38 };
  const chunk = (where: Point, wide: number, variant: number): EffectMote => ({
    x: where.x,
    y: where.y,
    z: where.z,
    size: wide,
    color,
    alpha,
    blend: 'color',
    shape: 'chunk',
    spin: spin + variant,
    variant,
    forward: 0,
  });
  if (rock.size >= BOULDER_FROM) {
    const since = t - rock.strikesAt;
    if (since >= 0 && since < STRIKE_DUST_S) {
      const share = since / STRIKE_DUST_S;
      const spread = size * (0.9 + 1.6 * outCubic(share));
      for (const aside of [-0.45, 0.4]) {
        drawn.motes.push(
          smokePuff(
            { x: rock.struck.x + aside * size, y: rock.struck.y, z: rock.mote.floorZ + spread * 0.3 },
            spread,
            tones.dust,
            0.55 * (1 - share),
            0
          )
        );
      }
    }
    for (const [lump, round] of [
      [0, 0.7],
      [1, 3.5],
    ] as const) {
      const about = spin + round;
      const where = {
        x: middle.x + Math.cos(about) * size * 0.2,
        y: middle.y,
        z: middle.z + Math.sin(about) * size * 0.18,
      };
      drawn.motes.push(chunk(where, size * 0.66, (rock.variant + lump * 2.7) % 6));
    }
  }
  drawn.motes.push(chunk(middle, size, rock.variant));
}
