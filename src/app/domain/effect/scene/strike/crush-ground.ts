import { clamp } from '@axe/core/util/clamp';
import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { type EarthTones, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, type Point, smokePuff, type Thrower } from '@axe/domain/effect/scene/parts';
import { along } from '@axe/domain/effect/scene/strike/strike-parts';

/*
 * What a crushing blow does to the ground. The floor shatters in a web: cracks race out from under the
 * target every way, the longest the way the blow drove, and rings of cracks join them as they spread,
 * white-hot as they open and cooling through the glow of the blow to cold. Rocks are torn up out of the
 * web and hang in the air for a long beat, turning, before they fall, strike the floor in a puff of
 * dust and lie.
 *
 * Every length is in cells unless it says otherwise.
 */

/** One crack running out from under the target: which way, how far, and the look of its jags. */
export interface Crack {
  readonly turn: number;
  readonly long: number;
  readonly seed: number;
}

/** How long the web takes to spread, in seconds, and how far out along each crack its rings are joined, as shares of its length. */
const SPREADS_S = 0.36;
const RINGS_AT: readonly number[] = [0.38, 0.72];

/** The cracks of a web from under a target, as many as `count`, the longest on the way the blow drove at `toward`, in radians. */
export function webCracks(th: Thrower, count: number, toward: number, seed: number): Crack[] {
  return Array.from({ length: count }, (_unused, index) => {
    const turn = toward + ((index + th.range(-0.25, 0.25)) / count) * Math.PI * 2;
    const ahead = Math.max(0, Math.cos(turn - toward));
    return { turn, long: th.range(1.2, 1.7) + 1.1 * ahead * ahead, seed: seed + index * 31 };
  });
}

/**
 * The web at a moment `t` seconds after the blow: each crack run out as far as it has spread, and the
 * rings joining them once it has passed them; `rings` of them, fewer where many are struck at once.
 */
export function layWeb(
  drawn: Staged,
  floor: Point,
  cracks: readonly Crack[],
  cell: number,
  tones: EarthTones,
  t: number,
  heat: number,
  clearing: number,
  rings: number
): void {
  const spread = outCubic(within(t, 0, SPREADS_S));
  const reachOf = (crack: Crack, share: number): Point => ({
    x: floor.x + Math.cos(crack.turn) * crack.long * share * cell,
    y: floor.y + Math.sin(crack.turn) * crack.long * share * cell,
    z: floor.z,
  });
  for (const crack of cracks) {
    layFissure(drawn, floor, reachOf(crack, spread), cell * 0.11, tones, heat, clearing, crack.seed);
  }
  for (const [ring, share] of RINGS_AT.slice(0, rings).entries()) {
    if (spread < share + 0.08) continue;
    const joined = within(spread, share + 0.08, share + 0.3);
    cracks.forEach((crack, index) => {
      const next = cracks[(index + 1) % cracks.length];
      const from = reachOf(crack, share);
      const to = reachOf(next, share * (0.85 + 0.3 * ((crack.seed + ring) % 3) * 0.33));
      const end = { x: from.x + (to.x - from.x) * joined, y: from.y + (to.y - from.y) * joined, z: floor.z };
      layFissure(drawn, from, end, cell * 0.065, tones, heat * 0.8, clearing, crack.seed + 7 + ring);
    });
  }
}

/** A rock torn up out of the web, to hang and fall. */
export interface HangingRock {
  /** Where it is torn up from, and how high and how far out it rises, in table pixels. */
  readonly from: Point;
  readonly high: number;
  readonly out: { readonly x: number; readonly y: number };
  /** When it is torn up, and when it starts to fall, in seconds after the blow. */
  readonly tornAt: number;
  readonly fallsAt: number;
  /** How wide it is, in cells, which of the colours of rock it is, how fast it turns and its look. */
  readonly size: number;
  readonly tone: number;
  readonly turnRate: number;
  readonly variant: number;
}

/** How long a rock takes to rise to where it hangs, in seconds, and how hard it falls, in cells a second squared. */
const RISES_S = 0.28;
const FALLS_HARD = 13;

/** Rocks torn up out of the floor about a foot, from between two distances, to hang and fall. */
export function hangingRocks(th: Thrower, foot: Point, count: number, ring: readonly [number, number]): HangingRock[] {
  const U = th.cell;
  return Array.from({ length: count }, (_unused, index) => {
    const turn = ((index + th.range(0.1, 0.9)) / count) * Math.PI * 2;
    const far = th.range(ring[0], ring[1]) * U;
    const out = { x: Math.cos(turn), y: Math.sin(turn) };
    return {
      from: { x: foot.x + out.x * far, y: foot.y + out.y * far, z: foot.z },
      high: th.range(0.8, 2.1) * U,
      out: { x: out.x * th.range(0.15, 0.45) * U, y: out.y * th.range(0.15, 0.45) * U },
      tornAt: far / U / 5.5 + th.range(0, 0.04),
      fallsAt: th.range(0.72, 1.08),
      size: th.range(0.1, 0.26),
      tone: Math.floor(th.range(0, 2.99)),
      turnRate: th.range(-3, 3),
      variant: th.range(0, 6),
    };
  });
}

/** Where a hanging rock is some time after the blow, and whether it has come down: null before it is torn up. */
function rockAt(rock: HangingRock, t: number, cell: number): { at: Point; spin: number; down: number } | null {
  const since = t - rock.tornAt;
  if (since < 0) return null;
  const risen = outCubic(within(since, 0, RISES_S));
  const hangs = rock.fallsAt - rock.tornAt;
  const bob = Math.sin(since * 4 + rock.variant) * cell * 0.04 * within(since, RISES_S * 0.6, RISES_S);
  const peak = rock.from.z + rock.high * risen + bob;
  const falling = Math.max(0, since - hangs);
  const dropped = 0.5 * FALLS_HARD * cell * falling * falling;
  const z = Math.max(rock.from.z, peak - dropped);
  const drift = risen + 0.6 * Math.min(1, falling * 2);
  const spin = rock.variant + rock.turnRate * Math.min(since, hangs) + rock.turnRate * 3 * Math.min(falling, 0.4);
  const down =
    falling > 0 && z <= rock.from.z ? falling - Math.sqrt((2 * (peak - rock.from.z)) / (FALLS_HARD * cell)) : -1;
  return { at: { x: rock.from.x + rock.out.x * drift, y: rock.from.y + rock.out.y * drift, z }, spin, down };
}

/** A hanging rock at a moment: rising, hanging and turning lit by the blow, falling, and lying where it struck with a puff of dust. */
export function drawHangingRock(
  drawn: Staged,
  rock: HangingRock,
  t: number,
  cell: number,
  tones: EarthTones,
  clearing: number
): void {
  const now = rockAt(rock, t, cell);
  if (!now) return;
  const size = cell * rock.size;
  const lit = clamp(1 - (t - rock.tornAt) / 0.6, 0, 1) * 0.55;
  const stone = tones.rock[rock.tone] ?? tones.rock[1];
  drawn.motes.push({
    x: now.at.x,
    y: now.at.y,
    z: now.at.z + size * 0.4,
    size,
    color: lit > 0 ? mixColor(stone, tones.glow, lit) : stone,
    alpha: clearing,
    blend: 'color',
    shape: 'chunk',
    spin: now.spin,
    variant: rock.variant,
    forward: 0,
  });
  if (now.down >= 0 && now.down < 0.5) {
    const share = now.down / 0.5;
    drawn.motes.push(
      smokePuff(
        { ...now.at, z: now.at.z + size * 0.5 },
        size * (1.6 + 2.4 * outCubic(share)),
        tones.dust,
        0.6 * (1 - share),
        0
      )
    );
  }
}

/** A dark ground of the blow's shadow on the floor about a point, as force is gathered over it; and the floor lit white as it lands. */
export function layGatherShadow(drawn: Staged, floor: Point, reach: number, alpha: number): void {
  if (alpha <= 0.01) return;
  drawn.floor.push(floorMark('disc', floor, reach, 1, '#0b0705', alpha, 'color', 0));
}

/** Motes of the blow's force rising off the web long after, flickering out. */
export function drawRisingForce(
  drawn: Staged,
  floor: Point,
  cracks: readonly Crack[],
  cell: number,
  colors: readonly [string, string],
  t: number,
  lasts: number,
  forward: number
): void {
  if (t <= 0.25) return;
  cracks.forEach((crack, index) => {
    for (let mote = 0; mote < 2; mote++) {
      const life = 0.9 + ((crack.seed + mote * 13) % 7) * 0.08;
      const age = ((t - 0.25 + (mote * 0.5 + index * 0.37) * life) % life) / life;
      const fading = 1 - within(t, lasts * 0.7, lasts);
      if (fading <= 0) return;
      const share = 0.25 + ((crack.seed * 7 + mote * 29) % 11) / 16;
      const from = along(floor, { x: Math.cos(crack.turn), y: Math.sin(crack.turn), z: 0 }, crack.long * share * cell);
      const point = { x: from.x, y: from.y, z: from.z + cell * (0.05 + 0.9 * age) };
      const seen = Math.min(1, age * 5, (1 - age) * 2) * fading * (0.6 + 0.4 * Math.sin(t * 19 + index));
      drawn.motes.push({
        x: point.x,
        y: point.y,
        z: point.z,
        size: cell * 0.16,
        color: colors[mote % 2],
        alpha: seen,
        blend: 'light',
        shape: 'glow',
        forward,
      });
      drawn.motes.push({
        x: point.x,
        y: point.y,
        z: point.z,
        size: cell * 0.035,
        color: '#ffffff',
        alpha: seen,
        blend: 'light',
        shape: 'spark',
        velocity: { x: 0, y: 0, z: cell * 1.2 },
        trail: 0.12,
        forward: forward + 1,
      });
    }
  });
}
