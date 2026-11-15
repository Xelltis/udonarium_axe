import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { acrossOf, floorMark, glow, hueOf, lightBall, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { aboutWay, levelWay, offsetBy, tossedAt } from '@axe/domain/effect/scene/shot/shot-flight';

/*
 * What the shots of arrows, guns and missiles share. A streak, the body of a thing too fast to be
 * seen as itself: white at its heart, in a sheath of its colour and a dark rim that keeps it on a
 * bright floor. A line hung in the air where a shot flew. Sparks sprayed from where something strikes,
 * chips of what it struck thrown off and falling, dust kicked up off the floor and a jet of dirt stood
 * up out of it, and the pock a shot leaves in the ground.
 */

/** The dark laid under what is bright, so that it reads on a bright floor. */
const SHADOW = '#190608';
const SOOT = '#0e0b10';
/** The dust a shot kicks up, and the dirt it throws. */
export const KICKED = '#b9a58c';
export const DIRT = '#6b5440';
const DARK_DIRT = '#33261b';
const GUNSMOKE_PALE = '#b3ada7';
const GUNSMOKE_DARK = '#6f6963';

/** The tones a streak is drawn in. */
export interface StreakTones {
  readonly dark: string;
  readonly hue: string;
  readonly core: string;
  readonly heart: string;
}

/** The tones of a shot of a colour: its dark rim, its colour, the pale of its middle and its white heart. */
export function streakTonesOf(ramp: readonly string[]): StreakTones {
  return { dark: mixColor(ramp[0], SHADOW, 0.6), hue: hueOf(ramp), core: ramp[4], heart: '#ffffff' };
}

/**
 * A streak from a tail to a head: drawn to a point behind, widest near its head and rounded off before
 * it, a dark rim under a sheath of its colour under a white heart.
 */
export function layStreak(drawn: Staged, tail: Point, head: Point, wide: number, tones: StreakTones, alpha = 1): void {
  const points = [0, 0.45, 0.82, 1].map((share) => ({
    x: tail.x + (head.x - tail.x) * share,
    y: tail.y + (head.y - tail.y) * share,
    z: tail.z + (head.z - tail.z) * share,
  }));
  drawn.ribbons.push(
    {
      points,
      widths: [0, wide * 1.2, wide * 1.6, wide * 0.9],
      color: tones.dark,
      alpha: 0.85 * alpha,
      blend: 'color',
      soft: 0.35,
    },
    {
      points,
      widths: [0, wide * 0.8, wide, wide * 0.55],
      color: tones.hue,
      core: tones.core,
      alpha,
      blend: 'color',
    },
    { points, widths: [0, wide * 0.3, wide * 0.46, wide * 0.3], color: tones.heart, alpha, blend: 'color' }
  );
}

/** A line hung in the air through points, as much of it left as `left` says: a soft band of its colour about a thin pale thread. */
export function layHungLine(
  drawn: Staged,
  points: readonly Point[],
  wide: number,
  left: number,
  tones: StreakTones
): void {
  if (left <= 0.01) return;
  drawn.ribbons.push({
    points,
    widths: wide * (0.45 + 0.55 * left),
    color: tones.hue,
    alpha: 0.7 * left,
    blend: 'color',
    soft: 0.7,
  });
  drawn.ribbons.push({ points, widths: wide * 0.3 * left, color: tones.core, alpha: left, blend: 'color' });
}

/** Sparks sprayed from a point. */
export interface Spray {
  readonly at: Point;
  /** The way the spray is thrown, and how wide about it: nothing for a jet, 1 for every way across it as well. */
  readonly way: Point;
  readonly spread: number;
  readonly cell: number;
  readonly floorZ: number;
  /** How long ago it began, and how long it lasts, in seconds. */
  readonly since: number;
  readonly lastsS: number;
  readonly seed: number;
  readonly count: number;
  /** How fast the sparks fly, the slowest and the fastest, in cells a second, and how wide each is, in cells. */
  readonly fast: readonly [number, number];
  readonly size?: number;
}

/** Lays a spray of sparks at a moment: white as they leave, cooling to `cool`, slowed and falling. */
export function laySpray(drawn: Staged, spray: Spray, cool: string, forward: number): void {
  const { cell, since } = spray;
  if (since < 0 || since >= spray.lastsS) return;
  const share = since / spray.lastsS;
  const next = seededRun(spray.seed * 41 + 5);
  for (let index = 0; index < spray.count; index++) {
    const across = aboutWay(spray.way, next() * Math.PI * 2);
    const wide = spray.spread * (0.25 + next());
    const fast = cell * (spray.fast[0] + next() * (spray.fast[1] - spray.fast[0]));
    const out = {
      x: spray.way.x + across.x * wide,
      y: spray.way.y + across.y * wide,
      z: spray.way.z + across.z * wide + 0.25,
    };
    const far = fast * since * (1 - share * 0.5);
    const drop = 6 * cell * since * since;
    const at = {
      x: spray.at.x + out.x * far,
      y: spray.at.y + out.y * far,
      z: Math.max(spray.floorZ + 1, spray.at.z + out.z * far - drop),
    };
    drawn.motes.push({
      ...glow(at, cell * (spray.size ?? 0.08), share < 0.35 ? '#ffffff' : cool, 1 - share, forward),
      shape: 'spark',
      velocity: { x: out.x * fast, y: out.y * fast, z: out.z * fast - 12 * cell * since },
      trail: 0.045,
    });
  }
}

/** Chips of what a shot struck, thrown off it. */
export interface Chips {
  readonly at: Point;
  readonly way: Point;
  readonly spread: number;
  readonly cell: number;
  readonly floorZ: number;
  readonly since: number;
  /** How long they are there, lying where they fell for the last of it, in seconds. */
  readonly lastsS: number;
  readonly seed: number;
  readonly count: number;
  /** How fast they are thrown, in cells a second, how hard up, and how wide each is, in cells. */
  readonly fast: readonly [number, number];
  readonly up: readonly [number, number];
  readonly size: readonly [number, number];
  readonly colors: readonly string[];
  /** The shape they are drawn as: chunks of stone, or flakes that glint. */
  readonly shape?: 'chunk' | 'flake';
}

/** Lays chips at a moment: thrown out and up, tumbling, falling, hopping once and lying until they fade. */
export function layChips(drawn: Staged, chips: Chips, forward: number): void {
  const { cell, since } = chips;
  if (since < 0 || since >= chips.lastsS) return;
  const next = seededRun(chips.seed * 59 + 11);
  const fade = 1 - within(since, chips.lastsS - 0.3, chips.lastsS);
  for (let index = 0; index < chips.count; index++) {
    const across = aboutWay(chips.way, next() * Math.PI * 2);
    const wide = chips.spread * (0.3 + next());
    const fast = cell * (chips.fast[0] + next() * (chips.fast[1] - chips.fast[0]));
    const up = cell * (chips.up[0] + next() * (chips.up[1] - chips.up[0]));
    const velocity = {
      x: (chips.way.x + across.x * wide) * fast,
      y: (chips.way.y + across.y * wide) * fast,
      z: Math.max(0, chips.way.z + across.z * wide) * fast + up,
    };
    const size = cell * (chips.size[0] + next() * (chips.size[1] - chips.size[0]));
    const turns = (next() - 0.5) * 30;
    const variant = next() * 6;
    const tossed = tossedAt(chips.at, velocity, since, chips.floorZ, 13 * cell, 0.3);
    drawn.motes.push({
      x: tossed.at.x,
      y: tossed.at.y,
      z: tossed.at.z + size * 0.4,
      size,
      color: chips.colors[index % chips.colors.length],
      alpha: fade,
      blend: 'color',
      shape: chips.shape ?? 'chunk',
      spin: tossed.lies ? variant : since * turns + variant,
      variant,
      forward,
    });
  }
}

/** Dust kicked up off the floor at a point: a few soft clouds rolling out and rising as they thin, `size` cells across at the last. */
export function layDustKick(
  drawn: Staged,
  at: Point,
  cell: number,
  since: number,
  seed: number,
  size: number,
  forward: number,
  options: { readonly color?: string; readonly count?: number; readonly lastsS?: number } = {}
): void {
  const lasts = options.lastsS ?? 0.55;
  if (since < 0 || since >= lasts) return;
  const age = since / lasts;
  const eased = 1 - (1 - age) * (1 - age);
  const next = seededRun(seed * 67 + 3);
  const count = options.count ?? 3;
  for (let puff = 0; puff < count; puff++) {
    const turn = (puff / count) * Math.PI * 2 + next() * 2;
    const out = cell * size * (0.12 + 0.42 * eased) * (0.6 + 0.8 * next());
    drawn.motes.push(
      smokePuff(
        {
          x: at.x + Math.cos(turn) * out,
          y: at.y + Math.sin(turn) * out,
          z: at.z + cell * size * (0.12 + 0.3 * eased * next()),
        },
        cell * size * (0.3 + 0.5 * eased),
        options.color ?? KICKED,
        0.7 * (1 - age) ** 1.3,
        forward
      )
    );
  }
}

/**
 * A jet of dirt stood up out of the floor where a shot goes into it: a plume thrown up, `tall` cells
 * high at its most, falling back as dust, with a dark root.
 */
export function layDirtJet(
  drawn: Staged,
  at: Point,
  cell: number,
  since: number,
  seed: number,
  tall: number,
  forward: number,
  lean: Point = { x: 0, y: 0, z: 0 }
): void {
  const lasts = 0.5;
  if (since < 0 || since >= lasts) return;
  const age = since / lasts;
  const up = 1 - (1 - age) ** 3;
  const high = cell * tall * up;
  const heading = { x: lean.x * 0.35, y: lean.y * 0.35, z: 1 };
  const wavers = (seed % 7) * 0.9;
  const shown = (1 - age) ** 0.8;
  drawn.motes.push(
    smokePuff(offsetBy(at, heading, high * 0.6), cell * tall * (0.45 + 0.6 * age), KICKED, 0.6 * shown, forward - 1),
    flowingMote(
      'jet',
      { ...at, z: at.z + cell * 0.02 },
      heading,
      cell * tall * (0.15 + 0.13 * age),
      Math.max(cell * 0.2, high),
      since * 9 + wavers,
      {
        color: DIRT,
        core: DARK_DIRT,
        alpha: Math.min(1, shown * 1.4),
        forward,
        variant: wavers,
      }
    ),
    smokePuff({ ...at, z: at.z + cell * 0.08 }, cell * tall * (0.3 + 0.3 * age), DIRT, 0.7 * shown, forward)
  );
}

/**
 * A curl of smoke rising off where a shot struck, `size` cells across at its widest: a thread of
 * puffs that climbs, sways, swells and thins away over `lastsS` seconds.
 */
export function layCurl(
  drawn: Staged,
  at: Point,
  cell: number,
  since: number,
  lastsS: number,
  seed: number,
  size: number,
  forward: number
): void {
  if (since < 0.04 || since >= lastsS) return;
  const age = since / lastsS;
  for (let puff = 0; puff < 6; puff++) {
    const up = puff / 5;
    const rise = cell * (0.1 + 1.9 * up) * (0.35 + 0.65 * Math.min(1, age * 2.2));
    const sway = Math.sin(up * 4.2 + since * 3 + seed) * cell * 0.3 * up;
    drawn.motes.push(
      smokePuff(
        { x: at.x + sway + cell * 0.35 * age * up, y: at.y + sway * 0.4, z: at.z + rise },
        cell * size * (0.45 + 0.75 * up) * (0.7 + 0.6 * age),
        puff < 2 ? GUNSMOKE_DARK : GUNSMOKE_PALE,
        0.85 * (1 - age) ** 1.2 * (1 - 0.35 * up),
        forward
      )
    );
  }
}

/** The pock a shot leaves in the ground: a black hole, cracks run out of it, and for a moment the glow of what made it. */
export function layPock(
  drawn: Staged,
  at: Point,
  cell: number,
  since: number,
  left: number,
  seed: number,
  size: number,
  hot: string
): void {
  if (since < 0 || left <= 0.01) return;
  const open = Math.min(1, since / 0.05);
  drawn.floor.push(floorMark('cracks', at, cell * size * open, 0.3, SOOT, 0.75 * left, 'color', seed % 89, seed));
  drawn.floor.push(floorMark('disc', at, cell * size * 0.42, 1, SOOT, 0.85 * left, 'color', 0));
  const heat = Math.max(0, 1 - since / 0.45);
  if (heat > 0)
    drawn.floor.push(floorMark('disc', at, cell * size * (0.3 + 0.5 * heat), 1, hot, 0.8 * heat, 'light', 0));
}

/**
 * A star of light thrown out of a point, `size` across, `share` of the way through its moment:
 * spikes of its colour, laid in colour so that they hold on a bright floor, white along their
 * middles, over a little light of its colour.
 */
export function layFlashStar(
  drawn: Staged,
  at: Point,
  size: number,
  hue: string,
  share: number,
  forward: number,
  spikes = 6,
  turn = 0
): void {
  if (share < 0 || share >= 1) return;
  const left = 1 - share;
  const round = Math.PI * 2;
  const from = ((turn % round) + round) % round;
  for (let spike = 0; spike < spikes; spike++) {
    const spin = from + (spike * Math.PI) / spikes;
    const long = spike % 2 === 0 ? 1 : 0.55;
    drawn.motes.push(
      {
        ...glow(at, size * 0.3 * left, hue, Math.sqrt(left), forward),
        blend: 'color',
        shape: 'flare',
        trail: 4.5 * long,
        spin,
      },
      { ...glow(at, size * 0.15 * left, '#ffffff', left, forward + 1), shape: 'flare', trail: 6 * long, spin }
    );
  }
  drawn.motes.push(glow(at, size * (0.55 + 0.25 * share), hue, 0.55 * left, forward - 1));
}

/**
 * The frame something strikes in: a star of light with a white heart, and its light thrown over the
 * floor under it, `size` cells across, over `lastsS` seconds.
 */
export function layHitFlash(
  drawn: Staged,
  at: Point,
  floorZ: number,
  cell: number,
  since: number,
  lastsS: number,
  size: number,
  ramp: readonly string[],
  seed: number,
  forward: number,
  spikes = 6
): void {
  if (since < 0 || since >= lastsS) return;
  const share = since / lastsS;
  layFlashStar(drawn, at, cell * size, hueOf(ramp), share, forward + 1, spikes, seed);
  drawn.motes.push(lightBall(at, cell * size * 0.16 * (1 - share * 0.6), '#ffffff', 1 - share, forward + 3));
  drawn.floor.push(
    floorMark('disc', { x: at.x, y: at.y, z: floorZ }, cell * size * 0.55, 1, ramp[4], 0.3 * (1 - share), 'light', 0)
  );
  drawn.lights.push({
    ...at,
    color: ramp[4],
    strength: Math.min(1.3, 0.7 + 0.2 * size) * (1 - share),
    reachPx: cell * Math.min(3.6, 1.5 + size * 0.6),
  });
}

/** A ring standing about a point across a way, as its two halves: the one behind what it rings and the one before it. */
export function vapourRingOf(
  at: Point,
  way: Point,
  radius: number,
  thick: number,
  color: string,
  alpha: number,
  floorZ: number
): { readonly far: EffectRibbon; readonly near: EffectRibbon } {
  const { side, lift } = acrossOf(way);
  const centre = { ...at, z: Math.max(at.z, floorZ + radius * Math.abs(lift.z) + 1) };
  const points: Point[] = [];
  for (let index = 0; index <= 18; index++) {
    const turn = (index / 18) * Math.PI * 2;
    points.push({
      x: centre.x + (side.x * Math.cos(turn) + lift.x * Math.sin(turn)) * radius,
      y: centre.y + (side.y * Math.cos(turn) + lift.y * Math.sin(turn)) * radius,
      z: centre.z + (side.z * Math.cos(turn) + lift.z * Math.sin(turn)) * radius,
    });
  }
  const about = points.map(() => centre);
  const band = (half: 'far' | 'near'): EffectRibbon => ({
    points,
    widths: thick,
    color,
    alpha: Math.max(0, alpha),
    blend: 'color',
    soft: 0.4,
    about,
    half,
  });
  return { far: band('far'), near: band('near') };
}

/** A ring of pale vapour opening about a line of flight at a point of it, across the way it runs. */
export function layVapourRing(
  drawn: Staged,
  at: Point,
  way: Point,
  radius: number,
  thick: number,
  color: string,
  alpha: number,
  floorZ: number
): void {
  if (alpha <= 0.01) return;
  const ring = vapourRingOf(at, way, radius, thick, color, alpha, floorZ);
  drawn.ribbons.push(ring.far, ring.near);
}

/** The floor under a point. */
export function floorUnder(at: Point, floorZ: number): Point {
  return { x: at.x, y: at.y, z: floorZ };
}

/** A point of the floor a way on from another over it, as far as given. */
export function alongFloor(at: Point, way: Point, by: number, floorZ: number): Point {
  const level = levelWay(way);
  return { x: at.x + level.x * by, y: at.y + level.y * by, z: floorZ };
}
