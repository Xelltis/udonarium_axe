import { type Staged } from '@axe/domain/effect/scene/choreography';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import type { Cloud } from '@axe/domain/effect/scene/fire/fire-parts';
import { crystal, type IceTones } from '@axe/domain/effect/scene/ice/ice-parts';
import { glow, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * What ice breaks into: shards thrown, tumbling end over end, which skid and lie where they stop;
 * grains small enough to bounce far and lie in a scatter; and the powder thrown off as it breaks.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** A shard of ice thrown: how it flies, how long and wide it is, in cells, and how it tumbles. */
export interface Shard {
  readonly mote: ThrownMote;
  readonly long: number;
  readonly wide: number;
  /** How fast it tumbles end over end as it flies, in radians a second, and the way over the floor it lies once it has landed. */
  readonly turnRate: number;
  readonly bearing: number;
  readonly variant: number;
}

/** How shards are thrown. */
export interface ShardThrow {
  /** How long, in cells, and how wide against its length. */
  readonly long: readonly [number, number];
  readonly slim?: readonly [number, number];
  /** How fast up and how fast out over the floor. */
  readonly up: readonly [number, number];
  readonly out: readonly [number, number];
  /** When, in seconds. */
  readonly bornAt: readonly [number, number];
  /** How far from the foot it starts at the most, and how high over the floor. */
  readonly from?: number;
  readonly high?: readonly [number, number];
  /** The way most are thrown, in radians over the floor, and how far to either side of it. */
  readonly fan?: { readonly toward: number; readonly spread: number };
  /** How long each lasts at the least and the most, in seconds; until the look clears without. */
  readonly life?: readonly [number, number];
}

/** Shards of ice thrown from about a foot, to fly tumbling, strike the floor, skid and lie. */
export function throwShards(th: Thrower, foot: Point, count: number, how: ShardThrow): Shard[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const turn = how.fan ? how.fan.toward + th.range(-how.fan.spread, how.fan.spread) : th.range(0, Math.PI * 2);
    const from = th.range(0, how.from ?? 0.25) * U;
    const speed = th.range(how.out[0], how.out[1]) * U;
    const bornAt = th.range(how.bornAt[0], how.bornAt[1]);
    const long = th.range(how.long[0], how.long[1]);
    return {
      mote: th.mote({
        x: foot.x + Math.cos(turn) * from,
        y: foot.y + Math.sin(turn) * from,
        z: foot.z + th.range(how.high?.[0] ?? 0.1, how.high?.[1] ?? 0.4) * U,
        vx: Math.cos(turn) * speed,
        vy: Math.sin(turn) * speed,
        vz: th.range(how.up[0], how.up[1]) * U,
        bornAt,
        life: th.lifeOf(bornAt, how.life?.[0] ?? 30, how.life?.[1] ?? 30),
        gravity: th.fall,
        drag: 0.5,
        bounce: 0.32,
      }),
      long,
      wide: long * th.range(how.slim?.[0] ?? 0.3, how.slim?.[1] ?? 0.5),
      turnRate: th.range(7, 16) * (th.chance(0.5) ? 1 : -1),
      bearing: th.range(0, Math.PI * 2),
      variant: th.range(0, 6),
    };
  });
}

/** A shard at a moment: tumbling end over end while it flies, and lying flat where it stopped; it fades with `alpha`. */
export function drawShard(drawn: Staged, shard: Shard, t: number, cell: number, tones: IceTones, alpha: number): void {
  const at = moteAt(shard.mote, t);
  if (!at) return;
  const long = cell * shard.long;
  const tilt = at.landed ? 0.1 : shard.variant + (t - shard.mote.bornAt) * shard.turnRate;
  const way = {
    x: Math.cos(shard.bearing) * Math.cos(tilt),
    y: Math.sin(shard.bearing) * Math.cos(tilt),
    z: Math.sin(tilt),
  };
  const lift = at.landed ? cell * shard.wide * 0.3 : long * 0.5;
  const root = { x: at.x - way.x * long * 0.5, y: at.y - way.y * long * 0.5, z: at.z + lift - way.z * long * 0.5 };
  drawn.motes.push(
    crystal(root, way, long, cell * shard.wide, tones, alpha * Math.min(1, (1 - at.age) * 5), {
      variant: shard.variant,
    })
  );
}

/** A grain of ice or a flake of snow thrown: how it flies and how wide it is, in cells. */
export interface Grain {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly turnRate: number;
  readonly variant: number;
}

/** Grains of ice thrown from about a foot, small enough to bounce far and lie in a scatter. */
export function throwGrains(
  th: Thrower,
  foot: Point,
  count: number,
  how: Pick<ShardThrow, 'up' | 'out' | 'bornAt' | 'from' | 'high' | 'fan' | 'life'> & {
    readonly size: readonly [number, number];
  }
): Grain[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const turn = how.fan ? how.fan.toward + th.range(-how.fan.spread, how.fan.spread) : th.range(0, Math.PI * 2);
    const from = th.range(0, how.from ?? 0.25) * U;
    const speed = th.range(how.out[0], how.out[1]) * U;
    const bornAt = th.range(how.bornAt[0], how.bornAt[1]);
    return {
      mote: th.mote({
        x: foot.x + Math.cos(turn) * from,
        y: foot.y + Math.sin(turn) * from,
        z: foot.z + th.range(how.high?.[0] ?? 0.1, how.high?.[1] ?? 0.4) * U,
        vx: Math.cos(turn) * speed,
        vy: Math.sin(turn) * speed,
        vz: th.range(how.up[0], how.up[1]) * U,
        bornAt,
        life: th.lifeOf(bornAt, how.life?.[0] ?? 30, how.life?.[1] ?? 30),
        gravity: th.fall,
        drag: 0.7,
        bounce: 0.45,
      }),
      size: th.range(how.size[0], how.size[1]),
      turnRate: th.range(-14, 14),
      variant: th.range(0, 6),
    };
  });
}

/** A grain of ice at a moment: a hard chip of its colour that tumbles, glinting as it turns, and lies where it stops. */
export function drawGrain(
  drawn: Staged,
  grain: Grain,
  t: number,
  cell: number,
  tones: IceTones,
  alpha: number,
  forward: number
): void {
  const at = moteAt(grain.mote, t);
  if (!at) return;
  const size = cell * grain.size;
  const shown = alpha * Math.min(1, (1 - at.age) * 5);
  const turned = at.landed ? grain.variant : (t - grain.mote.bornAt) * grain.turnRate + grain.variant;
  drawn.motes.push({
    x: at.x,
    y: at.y,
    z: at.z + size * 0.4,
    size,
    color: grain.variant > 3 ? tones.pale : tones.body,
    alpha: shown,
    blend: 'color',
    shape: 'chunk',
    spin: turned,
    variant: grain.variant,
    forward,
  });
  const glints = Math.max(0, Math.sin(turned * 1.7 + grain.variant * 3));
  if (glints > 0.82)
    drawn.motes.push({
      ...glow({ ...at, z: at.z + size * 0.5 }, size * 2.6, '#ffffff', shown * (glints - 0.82) * 5, forward + 1),
      shape: 'star',
      spin: grain.variant,
    });
}

/** Powder thrown off ice as it breaks at a point: small pale clouds bursting out from it, sinking and soon gone. */
export function icePowder(
  th: Thrower,
  at: Point,
  count: number,
  color: string,
  bornAt: readonly [number, number],
  size: readonly [number, number] = [0.3, 0.5]
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const fast = th.range(0.6, 2.4) * U;
    const born = th.range(bornAt[0], bornAt[1]);
    return {
      mote: th.mote({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: way.cos * fast,
        vy: way.sin * fast,
        vz: th.range(-0.4, 1.6) * U,
        bornAt: born,
        life: th.lifeOf(born, 0.4, 0.8),
        gravity: 1.2 * U,
        drag: 3.2,
        bounce: 0,
      }),
      size: th.range(size[0], size[1]),
      color,
      alpha: 0.62,
    };
  });
}
