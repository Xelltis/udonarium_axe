import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, haze, lightBall, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The parts of darkness that strikes. Black alone is a hole on a bright table and nothing at all on
 * a dark one, so every black thing here is laid over a burning edge of violet and a paler rim within
 * it, and takes the light out of the floor under it rather than throwing light on it: black fire, a
 * pool of shadow, the black beat as something lands, a ring racing out, shards, and the motes and
 * smoke it leaves.
 */

/** The colours of darkness: its black, the deep violet of its shadow, its burning edge, the glow of that edge, and its pale rim. */
export interface DarkTones {
  readonly ink: string;
  readonly deep: string;
  readonly edge: string;
  readonly glow: string;
  readonly pale: string;
}

/** The colours of darkness, from an effect's ramp. */
export function darkTonesOf(ramp: readonly string[]): DarkTones {
  return {
    ink: mixColor('#000000', ramp[0], 0.3),
    deep: mixColor(ramp[0], ramp[1], 0.35),
    edge: mixColor(ramp[1], ramp[2], 0.6),
    glow: ramp[3],
    pale: ramp[5],
  };
}

function unit(way: Point): Point {
  const length = Math.hypot(way.x, way.y, way.z) || 1;
  return { x: way.x / length, y: way.y / length, z: way.z / length };
}

/** How a shape that flows is painted and set in depth. */
export interface FlowPaint {
  readonly color: string;
  readonly core?: string;
  readonly alpha: number;
  readonly variant: number;
  readonly forward: number;
  /** Whether a piece standing before it hides it. */
  readonly exact?: boolean;
}

/** A lick or a wisp from its root, `wide` at its widest and reaching `long` the way it is headed, its pattern run as far as `flowed`. */
export function flowMote(
  shape: 'lick' | 'wisp',
  root: Point,
  heading: Point,
  wide: number,
  long: number,
  flowed: number,
  paint: FlowPaint
): EffectMote {
  const way = unit(heading);
  const reach = Math.max(long, wide + 0.5);
  return {
    x: root.x + way.x * reach,
    y: root.y + way.y * reach,
    z: root.z + way.z * reach,
    size: wide,
    color: paint.color,
    core: paint.core,
    alpha: Math.max(0, paint.alpha),
    blend: 'color',
    shape,
    velocity: { x: way.x * 100, y: way.y * 100, z: way.z * 100 },
    trail: (reach - wide) / 100,
    spin: flowed,
    variant: paint.variant,
    forward: paint.forward,
    exactDepth: paint.exact,
  };
}

/** How many discs a round disc is laid as, each turned from the last, so the wavering of their edges fills in to a round. */
const ROUND_TURNS = 8;

/**
 * A hard-edged round disc of a colour, turned to the eye: several discs laid over one another, each
 * turned a little from the last, since the edge of one alone wavers.
 */
export function roundDisc(
  at: Point,
  wide: number,
  color: string,
  alpha: number,
  forward: number,
  aside?: { readonly right: number; readonly up: number }
): EffectMote[] {
  return Array.from({ length: ROUND_TURNS }, (_unused, turn) => ({
    x: at.x,
    y: at.y,
    z: at.z,
    size: wide,
    color,
    alpha,
    blend: 'color' as const,
    shape: 'puff' as const,
    variant: 0,
    spin: (turn / ROUND_TURNS) * ((Math.PI * 2) / 3),
    forward,
    aside,
  }));
}

/** One flame of black fire at a moment. */
export interface BlackFlame {
  readonly root: Point;
  readonly heading: Point;
  readonly wide: number;
  readonly long: number;
  readonly flowed: number;
  readonly variant: number;
  /** How much of it is seen, all of it without. */
  readonly alpha?: number;
}

/**
 * Lays flames as one black fire, a sheet at a time over all of them: every flame's burning edge
 * before any flame's body, so that many run together into one fire edged in violet, deep violet
 * within and black at its heart, rather than each standing out ringed.
 */
export function layBlackFlames(
  drawn: Staged,
  flames: readonly BlackFlame[],
  tones: DarkTones,
  forward: number,
  exact = false
): void {
  const sheets = [
    { wide: 1.3, long: 1.07, color: tones.glow, core: tones.edge, alpha: 1 },
    { wide: 1.06, long: 1, color: tones.deep, core: tones.ink, alpha: 1 },
    { wide: 0.8, long: 0.9, color: tones.ink, core: '#000000', alpha: 1 },
  ];
  for (const sheet of sheets) {
    for (const flame of flames) {
      if (flame.wide <= 0.5 || (flame.alpha ?? 1) <= 0.01) continue;
      drawn.motes.push(
        flowMote('lick', flame.root, flame.heading, flame.wide * sheet.wide, flame.long * sheet.long, flame.flowed, {
          color: sheet.color,
          core: sheet.core,
          alpha: sheet.alpha * (flame.alpha ?? 1),
          variant: flame.variant,
          forward,
          exact,
        })
      );
    }
  }
}

/**
 * A pool of shadow on the floor: the light taken out of the floor about it, a ragged burning edge,
 * and the black of it within.
 */
export function layShadowPool(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  shown: number,
  seed: number,
  dims = 0.45
): void {
  if (shown <= 0.01 || reach < 1) return;
  const ragged = (seed % 89) + 1;
  drawn.floor.push(floorMark('disc', floor, reach * 1.7, 1, '#000000', dims * shown, 'color', 0));
  drawn.floor.push(floorMark('scorch', floor, reach * 1.3, 1, tones.glow, 0.5 * shown, 'light', ragged));
  drawn.floor.push(floorMark('scorch', floor, reach * 1.2, 1, tones.edge, 0.95 * shown, 'color', ragged));
  drawn.floor.push(floorMark('scorch', floor, reach * 1.08, 1, tones.ink, shown, 'color', ragged));
}

/**
 * The black beat as darkness lands: for an instant the floor about it lit violet, a black heart rimmed
 * in pale light at the struck point, and streaks of violet thrown across it.
 */
export function drawDarkBeat(
  drawn: Staged,
  struck: Point,
  floor: Point,
  wide: number,
  tones: DarkTones,
  since: number,
  lasts = 0.09
): void {
  if (since < 0 || since >= lasts) return;
  const left = 1 - since / lasts;
  const near = wide * 0.6;
  drawn.floor.push(floorMark('disc', floor, wide * 2.6, 1, tones.edge, 0.3 * left, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, wide * 1.2, 1, '#000000', 0.6 * left, 'color', 0));
  drawn.motes.push(glow(struck, wide * 3.2, tones.glow, 0.8 * left, near));
  drawn.motes.push(lightBall(struck, wide * 1.36, tones.pale, 1, near + 1));
  drawn.motes.push(haze(struck, wide * 2.2, tones.edge, 0.7 * left, near));
  drawn.motes.push(...roundDisc(struck, wide * 1.16, '#000000', 1, near + 2));
  for (const [spin, long] of [
    [0.2, 7],
    [Math.PI / 2 + 0.1, 5],
    [-0.75, 4],
  ] as const) {
    drawn.motes.push({ ...glow(struck, wide * 0.5, tones.pale, left, near + 3), shape: 'flare', trail: long, spin });
    drawn.motes.push({
      ...haze(struck, wide * 0.3, tones.edge, left, near + 3),
      shape: 'flare',
      trail: long * 1.2,
      spin,
    });
  }
}

/**
 * A ring of darkness racing out over the floor: a band of black edged in violet, a line of violet
 * light on it, thinning and fading over `lifeS` seconds.
 */
export function layDarkRing(
  drawn: Staged,
  floor: Point,
  from: number,
  to: number,
  thick: number,
  tones: DarkTones,
  since: number,
  lifeS: number
): void {
  const left = 1 - since / lifeS;
  if (since < 0 || left <= 0) return;
  const radius = from + (to - from) * (1 - left * left * left);
  const width = Math.max(thick * 0.3, thick * left + thick * 0.1) / radius;
  const fade = Math.min(1, left * 1.6);
  drawn.floor.push(floorMark('ring', floor, radius, width * 1.5, tones.edge, 0.9 * fade, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius * (1 - width * 0.3), width * 0.9, '#000000', fade, 'color', 0));
}

/**
 * Shards of darkness thrown out from a struck point: slivers of black edged in violet flying out
 * fast, slowed and falling, and sparks of violet among them; gone within `lasts` seconds.
 */
export function drawShards(
  drawn: Staged,
  seed: number,
  heart: Point,
  floorZ: number,
  count: number,
  cell: number,
  since: number,
  tones: DarkTones,
  forward: number,
  lasts = 0.7
): void {
  if (since < 0 || since > lasts) return;
  const next = seededRun(seed * 37 + 5);
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const fast = cell * (3 + next() * 6.5);
    const up = cell * (0.5 + next() * 5.5);
    const life = lasts * (0.45 + next() * 0.55);
    const size = cell * (0.1 + next() * 0.14);
    if (since >= life) continue;
    const slowed = Math.exp(-3 * since);
    const gone = (fast * (1 - slowed)) / 3;
    const age = since / life;
    const at = {
      x: heart.x + Math.cos(turn) * gone,
      y: heart.y + Math.sin(turn) * gone,
      z: Math.max(floorZ, heart.z + up * since - 6.5 * cell * since * since),
    };
    const velocity = {
      x: Math.cos(turn) * fast * slowed,
      y: Math.sin(turn) * fast * slowed,
      z: up - 13 * cell * since,
    };
    if (index % 3 === 2) {
      drawn.motes.push({
        ...at,
        size: cell * 0.06,
        color: age < 0.4 ? tones.pale : tones.glow,
        alpha: 1 - age * age,
        blend: 'light',
        shape: 'spark',
        velocity,
        trail: 0.035,
        forward,
      });
      continue;
    }
    drawn.motes.push({
      ...at,
      size: size * 1.5,
      color: tones.edge,
      alpha: 1 - age * age,
      blend: 'color',
      shape: 'spark',
      velocity,
      trail: 0.05,
      forward,
    });
    drawn.motes.push({
      ...at,
      size,
      color: '#000000',
      alpha: 1 - age * age * age,
      blend: 'color',
      shape: 'spark',
      velocity,
      trail: 0.045,
      forward: forward + 1,
    });
  }
}

/** The light taken out of the air about a point: a soft black over what stands there, as wide as given. */
export function drawDim(drawn: Staged, at: Point, wide: number, amount: number, forward: number): void {
  if (amount <= 0.01) return;
  drawn.motes.push(haze(at, wide, '#000000', amount, forward));
}

/**
 * What darkness burns into the floor where it strikes: a ragged patch of black edged in violet,
 * cracks of violet light across it while it is fresh; gone over `lasts` seconds.
 */
export function layDarkScorch(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  since: number,
  lasts: number,
  seed: number
): void {
  if (since < 0 || since >= lasts) return;
  const left = 1 - since / lasts;
  const fresh = Math.pow(Math.max(0, 1 - since / Math.min(lasts, 1.5)), 1.5);
  const spread = reach * Math.min(1, since / 0.06 + 0.3);
  const fading = Math.min(1, left * 2.5);
  const ragged = (seed % 89) + 1;
  drawn.floor.push(floorMark('scorch', floor, spread * 1.12, 1, tones.edge, 0.7 * fading, 'color', ragged));
  drawn.floor.push(floorMark('scorch', floor, spread, 1, tones.ink, 0.92 * fading, 'color', ragged));
  drawn.floor.push(floorMark('cracks', floor, spread * 1.25, 0.5, tones.edge, 0.8 * fading, 'color', ragged));
  if (fresh <= 0.01) return;
  drawn.floor.push(floorMark('cracks', floor, spread * 1.25, 0.34, tones.glow, fresh, 'light', ragged));
  drawn.floor.push(floorMark('disc', floor, reach * 2.2, 1, tones.glow, 0.3 * fresh, 'light', 0));
}
