import type { Stage } from '@axe/domain/effect/scene/choreography';
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
