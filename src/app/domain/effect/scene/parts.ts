import type { Stage } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectBlend, EffectFloorMark, EffectFloorShape, EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { seededRun, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';

/** A point of the table, in table pixels: x to the east, y to the south and z up. */
export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A soft round glow of light. */
export function glow(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: Math.max(0, alpha), blend: 'light', shape: 'glow', forward };
}

/** A hard-edged disc of light, as the white of a flash. */
export function lightBall(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  const shown = Math.max(0, alpha);
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: shown, blend: 'light', shape: 'puff', variant: 0, forward };
}

/** A hard-edged ball of colour, as one step of a ball of flame. */
export function ball(
  at: Point,
  size: number,
  color: string,
  alpha: number,
  forward: number,
  variant: number
): EffectMote {
  const shown = Math.max(0, alpha);
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: shown, blend: 'color', shape: 'puff', variant, forward };
}

/** A soft disc of smoke or dust, lit on top. */
export function smokePuff(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: Math.max(0, alpha), blend: 'color', shape: 'smoke', forward };
}

/** A mark laid flat on the floor about a point. */
export function floorMark(
  shape: EffectFloorShape,
  at: Point,
  radius: number,
  width: number,
  color: string,
  alpha: number,
  blend: EffectBlend,
  seed: number,
  turn = 0
): EffectFloorMark {
  return { shape, x: at.x, y: at.y, z: at.z, radius, width, color, alpha: Math.max(0, alpha), blend, turn, seed };
}

/** Takes what was made for a key from the cache, or makes it and keeps it, forgetting the oldest past `most`. */
export function keptFor<T>(cache: Map<string, T>, key: string, make: () => T, most = 48): T {
  const kept = cache.get(key);
  if (kept) return kept;
  const made = make();
  cache.set(key, made);
  if (cache.size > most) cache.delete(cache.keys().next().value!);
  return made;
}

/** What tells one stage's throw from another's, its preset and its look among them: the same key throws the same parts. */
export function stageKey(stage: Stage, ends: number): string {
  const { preset } = stage;
  return [
    preset.identifier,
    preset.effectKind,
    preset.slashLook,
    preset.gradeLevel,
    preset.gradeDensity,
    stage.seed,
    stage.cell,
    ends,
    stage.x,
    stage.y,
    stage.z,
    stage.groundZ,
  ].join('|');
}

/**
 * Throws the parts of an effect on one target from its seed, in cells and cells a second: every
 * number drawn from the same run, so every seat throws the same.
 */
export interface Thrower {
  /** How wide a cell is drawn for the effect, in table pixels. */
  readonly cell: number;
  /** Where the floor under the target is, in table pixels up. */
  readonly floorZ: number;
  /** How hard a thing falls, in table pixels a second squared. */
  readonly fall: number;
  range(low: number, high: number): number;
  chance(share: number): boolean;
  /** How many of a part to throw for the effect's grade, from how many at the middle grade. */
  count(base: number): number;
  /** A way out over the floor. */
  outward(): { readonly cos: number; readonly sin: number };
  /** How long a part born at a moment lives, between two lengths, ending before the effect does. */
  lifeOf(bornAt: number, low: number, high: number): number;
  /** A part thrown, on the floor under the target. */
  mote(fields: Omit<ThrownMote, 'floorZ'>): ThrownMote;
}

/** A thrower for a stage, its parts to be gone `ends` seconds after the moment it goes off. */
export function throwerFor(stage: Stage, ends: number): Thrower {
  const next = seededRun(stage.seed);
  const range = (low: number, high: number) => low + (high - low) * next();
  const density = stage.preset.gradeDensity;
  return {
    cell: stage.cell,
    floorZ: stage.groundZ,
    fall: 13 * stage.cell,
    range,
    chance: (share) => next() < share,
    count: (base) => Math.max(1, Math.round(base * density)),
    outward: () => {
      const angle = range(0, Math.PI * 2);
      return { cos: Math.cos(angle), sin: Math.sin(angle) };
    },
    lifeOf: (bornAt, low, high) => Math.max(0.05, Math.min(range(low, high), ends - bornAt - 0.02)),
    mote: (fields) => ({ ...fields, floorZ: stage.groundZ }),
  };
}

/** A point a share of the way from one to another. */
export function lerpPoint(from: Point, to: Point, share: number): Point {
  return {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    z: from.z + (to.z - from.z) * share,
  };
}

/** The way from one point to another, of length one, and how far it is. */
export function wayBetween(from: Point, to: Point): { readonly way: Point; readonly length: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { way: { x: dx / length, y: dy / length, z: dz / length }, length };
}

/** Two ways across a line running one way: one level, and one up as near as may be. */
export function acrossOf(way: Point): { readonly side: Point; readonly lift: Point } {
  const flat = Math.hypot(way.x, way.y);
  const side = flat > 0.001 ? { x: -way.y / flat, y: way.x / flat, z: 0 } : { x: 1, y: 0, z: 0 };
  const lift = {
    x: side.y * way.z - side.z * way.y,
    y: side.z * way.x - side.x * way.z,
    z: side.x * way.y - side.y * way.x,
  };
  return { side, lift: lift.z < 0 ? { x: -lift.x, y: -lift.y, z: -lift.z } : lift };
}

/** Points round a level circle about a middle, from one turn to another, in radians. */
export function circlePoints(middle: Point, radius: number, steps: number, from = 0, to = Math.PI * 2): Point[] {
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const turn = from + ((to - from) * index) / steps;
    return { x: middle.x + Math.cos(turn) * radius, y: middle.y + Math.sin(turn) * radius, z: middle.z };
  });
}

/**
 * A bolt of lightning from one point to another: a jagged line, each bend thrown aside at random as
 * far as `jag` of its length, the middle bends the furthest, and forks branching off it, none of it
 * thrown below `floorZ`. `flicker` picks among the shapes the same bolt takes, so it can be made to
 * dance.
 */
export function lightningPaths(
  from: Point,
  to: Point,
  seed: number,
  flicker: number,
  options: { bends?: number; jag?: number; forks?: number; floorZ?: number } = {}
): { readonly main: Point[]; readonly forks: Point[][] } {
  const next = seededRun(seed * 977 + flicker * 131);
  const bends = options.bends ?? 10;
  const jag = options.jag ?? 0.12;
  const floorZ = options.floorZ ?? Number.NEGATIVE_INFINITY;
  const { way, length } = wayBetween(from, to);
  const { side, lift } = acrossOf(way);
  const throwAside = (point: Point, reach: number): Point => {
    const a = (next() - 0.5) * 2 * reach;
    const b = (next() - 0.5) * 2 * reach;
    return {
      x: point.x + side.x * a + lift.x * b,
      y: point.y + side.y * a + lift.y * b,
      z: Math.max(floorZ, point.z + side.z * a + lift.z * b),
    };
  };
  const main = Array.from({ length: bends + 1 }, (_unused, index) => {
    const share = index / bends;
    const point = lerpPoint(from, to, share);
    return index === 0 || index === bends ? point : throwAside(point, length * jag * Math.sin(Math.PI * share));
  });
  const forks: Point[][] = [];
  for (let fork = 0; fork < (options.forks ?? 3); fork++) {
    const at = 1 + Math.floor(next() * (bends - 2));
    const start = main[at];
    const reach = length * (0.12 + next() * 0.18);
    const aside = throwAside(lerpPoint(start, to, 0), reach);
    const end = {
      x: aside.x + way.x * reach * 0.6,
      y: aside.y + way.y * reach * 0.6,
      z: aside.z + way.z * reach * 0.6,
    };
    forks.push([start, throwAside(lerpPoint(start, end, 0.5), reach * 0.25), end]);
  }
  return { main, forks };
}

/**
 * A soft volume of colour laid over what is behind it, not added as light: a coloured cloud, a halo
 * or the body of an aura, which keeps its colour on a bright table where light would wash to white.
 */
export function haze(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: Math.max(0, alpha), blend: 'color', shape: 'glow', forward };
}

/**
 * A star of light at the moment something strikes: thin white streaks shooting out every way from it
 * and a wider coloured glare under them, shrinking and fading as `share` runs from 0 to 1.
 */
export function starBurst(
  at: Point,
  size: number,
  color: string,
  share: number,
  forward: number,
  spikes = 6,
  turn = 0
): EffectMote[] {
  if (share < 0 || share >= 1) return [];
  const left = 1 - share;
  const motes: EffectMote[] = [];
  // Turned within one round: the graphics card keeps too few figures to turn by a seed's worth.
  const round = Math.PI * 2;
  const from = ((turn % round) + round) % round;
  for (let spike = 0; spike < spikes; spike++) {
    const angle = from + (spike * Math.PI) / spikes;
    const long = spike % 2 === 0 ? 1 : 0.55;
    motes.push({
      ...glow(at, size * 0.3 * left, color, left, forward),
      shape: 'flare',
      trail: 4.5 * long,
      spin: angle,
    });
    motes.push({
      ...glow(at, size * 0.14 * left, '#ffffff', left, forward + 1),
      shape: 'flare',
      trail: 6 * long,
      spin: angle,
    });
  }
  motes.push(glow(at, size * (0.8 + 0.4 * share), color, 0.7 * left, forward));
  return motes;
}

/** The saturated colour of an effect's ramp, for its bodies and halos: its dark colour taken a little towards its light one. */
export function hueOf(ramp: readonly string[]): string {
  return mixColor(ramp[1], ramp[2], 0.3);
}
