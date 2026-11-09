import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/** How far a piece is drawn off where it stands for a moment, in table pixels: x to the east, y to the south and z up. */
export interface EffectJolt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How long after its hold a struck piece is furthest back, in milliseconds; it is back where it stands some five times later. */
const THROWN_FURTHEST_MS = 60;
/** How long a struck piece is thrown for, after which it stands still again. */
const THROWN_FOR_MS = 420;
/** The most a piece is thrown back by blows landing one after another, as a share of a cell. */
const MOST_THROWN_CELLS = 0.25;
/** A blow from no direction, as one falling from above, presses the piece down by this share of its throw instead. */
const PRESSED_DOWN = 0.5;
/** How far the one who strikes leans in towards the target as the effect sets off, as a share of a cell, and for how long. */
const LEAN_CELLS = 0.12;
const LEAN_IN_MS = 140;
const LEAN_FOR_MS = 360;

/** The looks the one who casts them sets off at the target with, leaning in as they do. */
const LEANING_KINDS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'slash',
  'projectile',
  'bash',
  'beam',
  'raybeam',
  'arc',
  'breath',
  'drain',
  'skyblade',
  'ballistic',
  'arrowrain',
]);

/**
 * How far each piece an effect strikes is thrown at a moment on the effect's own clock, and how far
 * the one who cast it leans in: a struck piece stands still through the hold as the blow lands, is
 * thrown back away from the one who struck, as far as the blow's push, and springs back to where it
 * stands; struck from no direction, it is pressed down instead. The pieces themselves stay where
 * they are: each seat draws them off it for a moment.
 */
export function effectJoltsOf(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number
): Map<string, EffectJolt> {
  const jolts = new Map<string, EffectJolt>();
  const add = (identifier: string, jolt: EffectJolt) => {
    if (identifier.length < 1) return;
    const was = jolts.get(identifier);
    jolts.set(identifier, was ? { x: was.x + jolt.x, y: was.y + jolt.y, z: was.z + jolt.z } : jolt);
  };
  const blows = effectBlowsOf(preset);
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    let thrown = 0;
    for (const blow of blows) thrown += blow.push * cellPx * throwAt(local - blow.atMs);
    thrown = Math.min(thrown, MOST_THROWN_CELLS * cellPx);
    if (thrown <= 0) return;
    const away = directionOf(cast.origin, target);
    add(
      target.identifier,
      away ? { x: away.x * thrown, y: away.y * thrown, z: 0 } : { x: 0, y: 0, z: -thrown * PRESSED_DOWN }
    );
  });
  const first = cast.targets[0];
  const towards = first ? directionOf(cast.origin, first) : null;
  const lean = leanAt(elapsedMs) * LEAN_CELLS * cellPx;
  if (towards && lean > 0 && LEANING_KINDS.has(preset.effectKind)) {
    add(cast.casterIdentifier, { x: towards.x * lean, y: towards.y * lean, z: 0 });
  }
  return jolts;
}

/** How far a struck piece is thrown some time after its hold, as a share of the blow's push: out fast and back slower. */
function throwAt(sinceMs: number): number {
  if (sinceMs <= 0 || sinceMs >= THROWN_FOR_MS) return 0;
  const share = sinceMs / THROWN_FURTHEST_MS;
  return share * Math.exp(1 - share);
}

/** How far the one who strikes leans in some time into the effect, as a share of the lean: in, and back. */
function leanAt(elapsedMs: number): number {
  if (elapsedMs <= 0 || elapsedMs >= LEAN_FOR_MS) return 0;
  if (elapsedMs < LEAN_IN_MS) return Math.sin(((elapsedMs / LEAN_IN_MS) * Math.PI) / 2);
  return Math.cos((((elapsedMs - LEAN_IN_MS) / (LEAN_FOR_MS - LEAN_IN_MS)) * Math.PI) / 2);
}

/** The way across the table from where an effect was cast from to a target, of length one, or null where there is none. */
function directionOf(
  origin: { x: number; y: number } | null,
  target: { x: number; y: number }
): { x: number; y: number } | null {
  if (!origin) return null;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  return length < 1 ? null : { x: dx / length, y: dy / length };
}
