import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { type HolyTones } from '@axe/domain/effect/scene/holy/holy-parts';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The parts of the looks that heal: a ring of life laid on the floor, blades sprouting from it, bands
 * of light wound up about a body and drawn by halves, a flower of petals that opens, petals and leaves
 * drifting down, and drops of light. Every part is a body of deep, full colour with a darker rim, and
 * light only at its heart: on a bright table of grass a healing drawn in light alone is not seen.
 *
 * Every length here is in table pixels.
 */

/** The colours of a healing: its shadow, its deep and full greens, its bright and pale ones, a gold and a rose beside them. */
export interface MendTones {
  readonly shade: string;
  readonly deep: string;
  readonly body: string;
  readonly bright: string;
  readonly pale: string;
  readonly gold: string;
  readonly rose: string;
  readonly blush: string;
}

/** The gold and the rose a healing of any colour is set off with. */
const GOLD = '#ffd24a';
const ROSE = '#ff6fa8';

/** The colours of a healing, from an effect's ramp. */
export function mendTonesOf(ramp: readonly string[]): MendTones {
  return {
    shade: mixColor(ramp[0], '#04261c', 0.45),
    deep: mixColor(ramp[0], ramp[1], 0.55),
    body: ramp[1],
    bright: ramp[3],
    pale: ramp[5],
    gold: mixColor(GOLD, ramp[4], 0.2),
    rose: ROSE,
    blush: mixColor(ROSE, '#ffffff', 0.55),
  };
}

/** The colours of a healing as those of a light, for the parts of light drawn in them: a pillar, a hoop, motes rising. */
export function lightOf(tones: MendTones): HolyTones {
  return { shade: tones.shade, amber: tones.body, gold: tones.bright, pale: tones.pale, hot: tones.pale };
}

/** The unit way a thing at a turn about an axis leans, opened from straight up by an angle. */
export function leaning(turn: number, opened: number): Point {
  return { x: Math.cos(turn) * Math.sin(opened), y: Math.sin(turn) * Math.sin(opened), z: Math.cos(opened) };
}

/** A hard-edged blade of colour from its root, round there and drawn to a point: a petal, a leaf, a sprout. */
export function blade(
  root: Point,
  way: Point,
  long: number,
  wide: number,
  color: string,
  alpha: number,
  forward: number,
  variant = 0,
  blend: 'color' | 'light' = 'color'
): EffectMote {
  const reach = Math.max(long - wide, 1);
  return {
    x: root.x + way.x * long,
    y: root.y + way.y * long,
    z: root.z + way.z * long,
    size: wide,
    color,
    alpha: Math.max(0, alpha),
    blend,
    shape: 'tongue',
    velocity: { x: way.x * reach, y: way.y * reach, z: way.z * reach },
    trail: 1,
    variant,
    forward,
  };
}

/**
 * A ring of life on the floor: a pool of deep colour, a dark rim, a ring of full colour within it and
 * a line of light on that, a seal turning in it.
 */
export function layLifeRing(
  drawn: Staged,
  floor: Point,
  radius: number,
  tones: MendTones,
  alpha: number,
  turn: number,
  seed: number
): void {
  if (alpha <= 0.01 || radius < 1) return;
  drawn.floor.push(floorMark('disc', floor, radius * 1.25, 1, tones.deep, 0.5 * alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius * 1.04, 0.2, tones.shade, 0.75 * alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, 0.13, tones.body, alpha, 'color', 0));
  drawn.floor.push(floorMark('sigil', floor, radius * 0.86, 0.09, tones.shade, 0.7 * alpha, 'color', seed % 13, turn));
  drawn.floor.push(floorMark('sigil', floor, radius * 0.86, 0.05, tones.gold, 0.9 * alpha, 'color', seed % 13, turn));
  drawn.floor.push(floorMark('ring', floor, radius * 0.98, 0.05, tones.pale, 0.9 * alpha, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, radius * 1.1, 1, tones.bright, 0.3 * alpha, 'light', 0));
}

/** A ripple running out over the floor from a point: a dark line under a line of colour, thinning as it goes. */
export function layRipple(
  drawn: Staged,
  floor: Point,
  from: number,
  to: number,
  tones: MendTones,
  share: number,
  alpha = 1
): void {
  if (share <= 0 || share >= 1) return;
  const radius = from + (to - from) * (1 - (1 - share) * (1 - share));
  const left = (1 - share) * alpha;
  drawn.floor.push(floorMark('ring', floor, radius * 1.03, 0.12, tones.shade, 0.6 * left, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, 0.08, tones.bright, 0.95 * left, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, 0.05, tones.pale, left, 'light', 0));
}

/**
 * Blades sprouting from a ring on the floor, standing up and leaning out a little, swaying: each a
 * dark blade under one of full colour with a pale one down its middle.
 */
export function drawSprouts(
  drawn: Staged,
  floor: Point,
  radius: number,
  long: number,
  count: number,
  tones: MendTones,
  grown: number,
  t: number,
  seed: number,
  forward: number
): void {
  if (grown <= 0.02) return;
  const next = seededRun(seed * 17 + 5);
  for (let index = 0; index < count; index++) {
    const turn = (index / count) * Math.PI * 2 + next() * 0.5;
    const tall = long * (0.6 + next() * 0.6) * grown;
    const wide = long * 0.24;
    const sway = Math.sin(t * 2.6 + index * 1.7) * 0.14;
    const root = { x: floor.x + Math.cos(turn) * radius, y: floor.y + Math.sin(turn) * radius, z: floor.z };
    const way = leaning(turn + sway, 0.32 + next() * 0.25);
    if (tall < wide) continue;
    drawn.motes.push(blade(root, way, tall * 1.08, wide * 1.35, tones.shade, 0.9, forward, index));
    drawn.motes.push(
      blade(root, way, tall, wide, index % 3 === 0 ? tones.bright : tones.body, 1, forward + 0.5, index)
    );
    drawn.motes.push(blade(root, way, tall * 0.7, wide * 0.4, tones.pale, 0.9, forward + 1, index));
  }
}

/** A band wound about an axis, to be drawn by halves: its points, what each winds about, and how wide and how seen it is at each. */
export interface WoundBand {
  readonly points: Point[];
  readonly about: Point[];
  readonly widths: number[];
  readonly alphas: number[];
}

/**
 * A band wound up about a standing axis from one height to another, the part of it between two shares
 * of its length: thin at its tail and fading there, full at its head.
 */
export function windBand(
  foot: Point,
  heights: readonly [number, number],
  radii: readonly [number, number],
  turns: readonly [number, number],
  shares: readonly [number, number],
  wide: number
): WoundBand {
  const band: WoundBand = { points: [], about: [], widths: [], alphas: [] };
  const [tail, head] = shares;
  if (head <= tail) return band;
  const steps = Math.max(4, Math.ceil((head - tail) * Math.abs(turns[1] - turns[0]) * 3.2));
  for (let step = 0; step <= steps; step++) {
    const along = step / steps;
    const share = tail + (head - tail) * along;
    const turn = turns[0] + (turns[1] - turns[0]) * share;
    const radius = radii[0] + (radii[1] - radii[0]) * share;
    const z = foot.z + heights[0] + (heights[1] - heights[0]) * share;
    band.points.push({ x: foot.x + Math.cos(turn) * radius, y: foot.y + Math.sin(turn) * radius, z });
    band.about.push({ x: foot.x, y: foot.y, z });
    band.widths.push(wide * (0.15 + 0.85 * Math.sin((along * Math.PI) / 2)));
    band.alphas.push(Math.min(1, along * 2.5));
  }
  return band;
}

/**
 * Lays a wound band by halves: the half behind what it winds about in full, and the half before it
 * thinner, so what it winds about is seen through it; each a dark sheath, a body of colour and a
 * heart of light.
 */
export function layWound(drawn: Staged, band: WoundBand, tones: MendTones, alpha: number, core = tones.gold): void {
  if (band.points.length < 2 || alpha <= 0.01) return;
  const { points, about, alphas } = band;
  for (const [half, seen] of [
    ['far', 1],
    ['near', 0.8],
  ] as const) {
    drawn.ribbons.push(
      {
        points,
        about,
        half,
        widths: band.widths.map((wide) => wide * 1.7),
        color: tones.shade,
        alpha: 0.7 * alpha * seen,
        alphas,
        blend: 'color',
        soft: 0.35,
      },
      {
        points,
        about,
        half,
        widths: band.widths,
        color: tones.body,
        core,
        alpha: alpha * seen,
        alphas,
        blend: 'color',
      },
      {
        points,
        about,
        half,
        widths: band.widths.map((wide) => wide * 0.5),
        color: tones.pale,
        core: '#ffffff',
        alpha: 0.9 * alpha * seen,
        alphas,
        blend: 'light',
        soft: 0.4,
      }
    );
  }
}

/**
 * A flower over a point: petals standing in a ring about its heart, shut as a bud and opened out into
 * a wide cup as `opened` runs from 0 to 1, an inner ring of smaller ones, and a heart of gold.
 */
export function drawBloom(
  drawn: Staged,
  heart: Point,
  size: number,
  opened: number,
  tones: MendTones,
  alpha: number,
  turn: number,
  forward: number,
  petals = 7
): void {
  if (alpha <= 0.01 || size < 1) return;
  const rings = [
    { count: petals, long: 1, lean: 0.2 + 0.9 * opened, color: tones.rose, core: tones.blush, shift: 0 },
    {
      count: Math.max(3, petals - 2),
      long: 0.62,
      lean: 0.1 + 0.55 * opened,
      color: tones.blush,
      core: '#ffffff',
      shift: 0.5,
    },
  ];
  for (const ring of rings) {
    for (let index = 0; index < ring.count; index++) {
      const at = turn + ((index + ring.shift) / ring.count) * Math.PI * 2;
      const way = leaning(at, ring.lean);
      const long = size * ring.long * (0.55 + 0.45 * opened);
      const wide = long * 0.52;
      drawn.motes.push(
        blade(heart, way, long * 1.1, wide * 1.3, mixColor(ring.color, '#5a0f3a', 0.55), alpha, forward, index)
      );
      drawn.motes.push(blade(heart, way, long, wide, ring.color, alpha, forward + 0.5, index));
      drawn.motes.push(blade(heart, way, long * 0.72, wide * 0.42, ring.core, 0.9 * alpha, forward + 1, index));
    }
  }
  drawn.motes.push(haze(heart, size * 0.42, tones.gold, alpha, forward + 1.5));
  drawn.motes.push(glow(heart, size * 0.9 * (0.4 + 0.6 * opened), tones.gold, 0.6 * alpha * opened, forward + 2));
}

/** Where and when things drift down: about a point, from a height, born over a span of time. */
export interface Drifting {
  readonly count: number;
  /** How far out from the point they are born, at the least and at the most. */
  readonly out: readonly [number, number];
  /** How high over the floor they are born, at the least and at the most. */
  readonly high: readonly [number, number];
  /** When they are born, in seconds, from the first to the last. */
  readonly born: readonly [number, number];
  /** When the last of them must be gone, in seconds. */
  readonly ends: number;
  /** The colours they are of, taken in turn. */
  readonly colors: readonly string[];
  /** How large each is, as a share of a cell. */
  readonly size: number;
}

/**
 * Petals or leaves drifting down about a point: each a curved vane that rocks from side to side as it
 * falls, comes to rest on the floor and fades.
 */
export function drawDrifting(
  drawn: Staged,
  seed: number,
  heart: Point,
  cell: number,
  t: number,
  drifting: Drifting,
  forward: number
): void {
  const next = seededRun(seed * 67 + 9);
  for (let index = 0; index < drifting.count; index++) {
    const turn = next() * Math.PI * 2;
    const out = drifting.out[0] + (drifting.out[1] - drifting.out[0]) * Math.sqrt(next());
    const high = drifting.high[0] + (drifting.high[1] - drifting.high[0]) * next();
    const born = drifting.born[0] + (drifting.born[1] - drifting.born[0]) * next();
    const falls = cell * (0.9 + next() * 0.7);
    const rocks = 2.6 + next() * 1.8;
    const phase = next() * Math.PI * 2;
    const size = cell * drifting.size * (0.75 + next() * 0.5);
    const lean = (next() - 0.5) * 1.6;
    const life = Math.min(high / falls + 0.7, drifting.ends - born);
    const since = t - born;
    if (since < 0 || since >= life) continue;
    const down = Math.min(high, falls * since);
    const resting = down >= high;
    const swing = Math.sin(phase + rocks * (resting ? high / falls : since));
    const fade = Math.min(1, since * 6, (life - since) * 2);
    const at = {
      x: heart.x + Math.cos(turn) * out + swing * cell * 0.24,
      y: heart.y + Math.sin(turn) * out + swing * cell * 0.1,
      z: heart.z + high - down + size * 0.4,
    };
    drawn.motes.push({
      ...at,
      size,
      color: drifting.colors[index % drifting.colors.length],
      alpha: fade,
      blend: 'color',
      shape: 'feather',
      spin: lean + swing * 0.8,
      forward,
    });
  }
}

/** A twinkle at a point: a dot of colour, a glow over it and a white star turning in it. */
export function twinkle(
  drawn: Staged,
  at: Point,
  size: number,
  tones: MendTones,
  alpha: number,
  spin: number,
  forward: number
): void {
  if (alpha <= 0.01) return;
  drawn.motes.push(haze(at, size * 0.5, tones.body, 0.9 * alpha, forward));
  drawn.motes.push(glow(at, size * 0.7, tones.pale, alpha, forward + 0.5));
  drawn.motes.push({ ...glow(at, size * 1.5, '#ffffff', alpha, forward + 1), shape: 'star', spin });
}
