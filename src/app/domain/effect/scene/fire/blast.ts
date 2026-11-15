import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import {
  type Billow,
  type FireDepth,
  type Flame,
  layBillows,
  layFlames,
} from '@axe/domain/effect/scene/fire/fire-body';
import { floorMark, glow, hueOf, type Point, starBurst, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * A blast of fire, as every look that goes off draws it. It strikes in a short white beat with rays
 * shooting from it; a fireball swells out of the beat in an instant, white at its heart, with licks
 * of flame torn off it every way; the fireball rolls up as it burns, cooling from its edge in through
 * yellow and orange to a deep red, lobe by lobe, the outermost first; and each lobe as it goes out
 * is left as a billow of smoke, still red within, that swells, rises on and thins away.
 *
 * Every length is in cells of the effect and every moment in seconds from the moment it goes off.
 */

/** How large and how long a blast is. */
export interface BlastSize {
  /** How far the fireball reaches from its heart. */
  readonly reach: number;
  /** How many lobes the fireball rolls in, and how many licks are torn off it. */
  readonly lobes: number;
  readonly licks: number;
  /** How long the fireball takes to swell, how long its last lobe burns, and how long its smoke hangs after. */
  readonly swellS: number;
  readonly burnsS: number;
  readonly smokeS: number;
  /** How far the fireball has risen by the time its smoke clears. */
  readonly rises: number;
  /** How flat the fireball is: 1 for a ball, less for a dome spread wide over the floor. */
  readonly domed?: number;
}

/** One lobe of a fireball. */
interface Lobe {
  readonly way: Point;
  /** How far out from the heart it sits, as a share of the reach, and how wide it is, in cells. */
  readonly out: number;
  readonly size: number;
  /** When it goes out, in seconds. */
  readonly burns: number;
  readonly flows: number;
  readonly variant: number;
}

/** One lick of flame torn off a fireball as it swells. */
interface TornLick {
  readonly way: Point;
  readonly long: number;
  readonly wide: number;
  readonly lasts: number;
  readonly variant: number;
}

/** A blast as it was thrown. */
export interface Blast {
  readonly size: BlastSize;
  readonly lobes: readonly Lobe[];
  readonly licks: readonly TornLick[];
}

/** How long the white beat of a blast is, in seconds, and how long its rays last. */
export const BLAST_WHITE_S = 0.07;
const RAYS_S = 0.22;

/** A blast as long as it is given, or shorter by as much as it must be to have cleared within `clearsIn` seconds. */
export function blastWithin(size: BlastSize, clearsIn: number): BlastSize {
  const whole = size.burnsS + size.smokeS;
  const share = Math.min(1, Math.max(0.2, (clearsIn - 0.05) / whole));
  if (share >= 1) return size;
  return { ...size, burnsS: size.burnsS * share, smokeS: size.smokeS * share, swellS: size.swellS * share };
}

/** Throws a blast: its heart, a lobe that burns longest, the lobes round and over it, and the licks torn off it. */
export function throwBlast(th: Thrower, size: BlastSize): Blast {
  const domed = size.domed ?? 1;
  const heartLobe: Lobe = {
    way: { x: 0, y: 0, z: 1 },
    out: 0.12,
    size: size.reach * 1.35,
    burns: size.burnsS * 0.92,
    flows: th.range(2.4, 3.2),
    variant: th.range(0, 6),
  };
  const lobes = Array.from({ length: Math.max(3, size.lobes) }, (_unused, index): Lobe => {
    const round = ((index + th.range(-0.3, 0.3)) / Math.max(3, size.lobes)) * Math.PI * 2;
    const up = th.range(0.05, 1.15);
    const flat = Math.cos(up);
    const out = th.range(0.5, 0.95);
    return {
      way: { x: Math.cos(round) * flat, y: Math.sin(round) * flat, z: Math.sin(up) * domed },
      out,
      size: size.reach * th.range(0.75, 1.1),
      burns: size.burnsS * (1 - 0.25 * out) * th.range(0.85, 1.1),
      flows: th.range(2, 3.4),
      variant: th.range(0, 6),
    };
  });
  const licks = Array.from({ length: size.licks }, (_unused, index): TornLick => {
    const round = ((index + th.range(-0.35, 0.35)) / Math.max(1, size.licks)) * Math.PI * 2;
    const up = th.range(-0.05, 1.3);
    const flat = Math.cos(up);
    return {
      way: { x: Math.cos(round) * flat, y: Math.sin(round) * flat, z: Math.sin(up) * domed },
      long: size.reach * th.range(1.15, 1.9),
      wide: size.reach * th.range(0.34, 0.58),
      lasts: size.swellS * th.range(1.3, 2.1),
      variant: th.range(0, 6),
    };
  });
  return { size, lobes: [heartLobe, ...lobes], licks };
}

/**
 * The flames and the smoke of a blast at a moment after it went off, about a heart, in cells of
 * `cell` table pixels; nothing below `floorZ`.
 */
export function blastAt(
  blast: Blast,
  heart: Point,
  cell: number,
  t: number,
  floorZ: number
): { readonly flames: Flame[]; readonly billows: Billow[] } {
  const flames: Flame[] = [];
  const billows: Billow[] = [];
  if (t < 0) return { flames, billows };
  const { size } = blast;
  const swollen = outCubic(within(t, 0, size.swellS));
  const grown = swollen * (1 + 0.22 * within(t, size.swellS, size.burnsS + size.smokeS));
  const lifted = cell * size.rises * Math.pow(within(t, 0, size.burnsS + size.smokeS), 1.4);
  const reach = cell * size.reach;
  for (const lick of blast.licks) {
    if (t >= lick.lasts) continue;
    const aged = t / lick.lasts;
    const root = {
      x: heart.x + lick.way.x * reach * 0.15,
      y: heart.y + lick.way.y * reach * 0.15,
      z: Math.max(floorZ, heart.z + lick.way.z * reach * 0.15),
    };
    flames.push({
      shape: 'lick',
      at: root,
      heading: { x: lick.way.x, y: lick.way.y, z: lick.way.z + 0.5 * aged },
      wide: cell * lick.wide * (1 - 0.45 * aged),
      long: cell * lick.long * outCubic(within(aged, 0, 0.45)),
      heat: 1 - 0.75 * within(aged, 0.25, 1),
      flowed: t * 7 + lick.variant * 5,
      variant: lick.variant,
      alpha: 1 - within(aged, 0.75, 1),
    });
  }
  for (const lobe of blast.lobes) {
    const wide = cell * lobe.size * (0.35 + 0.65 * swollen);
    const middle = {
      x: heart.x + lobe.way.x * lobe.out * reach * grown,
      y: heart.y + lobe.way.y * lobe.out * reach * grown,
      z: Math.max(floorZ + wide * 0.3, heart.z + lobe.way.z * lobe.out * reach * grown + lifted),
    };
    const heat = Math.pow(1 - within(t, BLAST_WHITE_S * 0.5, lobe.burns), 0.85);
    const cooled = 1 - heat;
    const heading = { x: lobe.way.x * (1 - cooled), y: lobe.way.y * (1 - cooled), z: lobe.way.z + 0.4 + cooled };
    if (heat > 0) {
      const across = wide * (1 + 0.15 * cooled) * (1 - 0.4 * within(cooled, 0.55, 1));
      flames.push({
        shape: 'blaze',
        at: middle,
        heading,
        wide: across,
        long: across * (1.12 + 0.9 * within(cooled, 0.4, 1)),
        heat,
        flowed: t * lobe.flows + lobe.variant * 7,
        variant: lobe.variant,
      });
    }
    const smokeFrom = lobe.burns * 0.55;
    const smokeEnds = lobe.burns + size.smokeS;
    if (t <= smokeFrom || t >= smokeEnds) continue;
    const smoked = within(t, smokeFrom, smokeEnds);
    const across = wide * (0.95 + 0.7 * smoked);
    billows.push({
      at: { x: middle.x, y: middle.y, z: middle.z + across * 0.12 },
      heading: { x: 0, y: 0, z: 1 },
      wide: across,
      long: across * 1.1,
      alpha: Math.min(within(smoked, 0, 0.14), within(1 - smoked, 0, 0.5)) * 0.84,
      flowed: t * 0.9 + lobe.variant * 3,
      variant: lobe.variant + 2.1,
      warm: 1 - within(smoked, 0, 0.45),
    });
  }
  return { flames, billows };
}

/** Draws a blast at a moment after it went off: its smoke behind and its fire before it. */
export function drawBlast(
  drawn: Staged,
  blast: Blast,
  heart: Point,
  cell: number,
  ramp: readonly string[],
  t: number,
  floorZ: number,
  fiery: boolean,
  depth: FireDepth
): void {
  const { flames, billows } = blastAt(blast, heart, cell, t, floorZ);
  layBillows(
    drawn,
    fiery ? billows : billows.map((billow) => ({ ...billow, alpha: billow.alpha * 0.45 })),
    ramp,
    fiery,
    depth
  );
  layFlames(drawn, flames, ramp, depth);
}

/**
 * The beat a blast strikes in: for its first instant, which the blow's stop holds, a point of white
 * in a wide soft glare, the floor lit under it; and rays shooting from it for a moment after. Light
 * and no body: what is seen through it is washed out, not covered.
 */
export function drawBlastBeat(
  drawn: Staged,
  heart: Point,
  floor: Point,
  cell: number,
  ramp: readonly string[],
  t: number,
  power: number,
  seed: number,
  forward: number
): void {
  if (t < 0) return;
  const spikes = power >= 1.4 ? 12 : power >= 0.9 ? 8 : 6;
  if (t < RAYS_S) {
    drawn.motes.push(...starBurst(heart, cell * 3.2 * power, hueOf(ramp), t / RAYS_S, forward, spikes, seed));
  }
  if (t >= BLAST_WHITE_S) return;
  const left = 1 - t / BLAST_WHITE_S;
  drawn.floor.push(floorMark('disc', floor, cell * 1.7 * power, 1, ramp[5], 0.55, 'light', 0));
  drawn.motes.push(glow(heart, cell * 2.6 * power, ramp[4], 0.75, forward));
  drawn.motes.push(glow(heart, cell * 1.5 * power, '#ffffff', 0.9, forward + 1));
  drawn.motes.push({
    ...glow(heart, cell * 0.5 * power * (0.8 + 0.2 * left), '#ffffff', 1, forward + 2),
    blend: 'color',
  });
}
