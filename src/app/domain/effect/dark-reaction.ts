import type { EffectBlow } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * How the pieces bear a look of darkness for as long as it has hold of them, drawn off where they
 * stand. One that is drained is dragged towards the one who drains it at every beat of the pull and
 * shudders between them, until the strands snap. The pieces themselves stay where they are.
 */

/** How far a drained piece is dragged at each beat of the pull, and how far it shudders each way, as shares of a cell. */
const DRAGGED = 0.09;
const SHUDDERS = 0.022;
/** How long one beat of a draining is, in milliseconds. */
export const DRAIN_BEAT_MS = 600;
/** How long a piece takes to be taken hold of, and to stand again once it is let go, in milliseconds. */
const HELD_IN_MS = 140;
const STANDS_AGAIN_MS = 320;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/** Whether a look of darkness on its own holds its targets: a draining does; nothing else here. */
function holds(preset: EffectPreset): boolean {
  return !preset.isStaged && preset.effectKind === 'drain';
}

/** From when until when a look holds a piece, on the piece's own clock, in milliseconds. */
function heldSpanOf(blows: readonly EffectBlow[]): readonly [number, number] | undefined {
  const first = blows[0]?.atMs;
  if (first === undefined) return undefined;
  return [first, blows[1]?.atMs ?? first];
}

/** When a look of darkness on its own lets go of the pieces, on the first target's clock, in milliseconds; nothing for any other effect. */
export function darkLetsGoAt(preset: EffectPreset, blows: readonly EffectBlow[]): number {
  const span = holds(preset) ? heldSpanOf(blows) : undefined;
  return span ? span[1] + STANDS_AGAIN_MS : 0;
}

function wayOf(from: { x: number; y: number } | null, to: { x: number; y: number }): { x: number; y: number } | null {
  if (!from) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const far = Math.hypot(dx, dy);
  return far < 1 ? null : { x: dx / far, y: dy / far };
}

/** How hard a pull that beats is pulling some time into it, from 0 to 1: a sharp tug at each beat, easing off after it. */
export function beatAt(sinceMs: number, beatMs: number): number {
  if (sinceMs <= 0) return 0;
  const share = (sinceMs % beatMs) / beatMs;
  return Math.exp(-share * 4.5) * Math.min(1, share * 14);
}

/**
 * Adds how a look of darkness on its own moves the pieces it holds at a moment of its own clock: see
 * the header. Any other effect adds nothing.
 */
export function addDarkJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  blows: readonly EffectBlow[],
  add: Add
): void {
  const span = holds(preset) ? heldSpanOf(blows) : undefined;
  if (!span) return;
  const [from, until] = span;
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    if (local <= from || local >= until + STANDS_AGAIN_MS) return;
    const held = Math.min(1, (local - from) / HELD_IN_MS) * (1 - Math.max(0, (local - until) / STANDS_AGAIN_MS));
    const s = local / 1000;
    const towards = wayOf(target, cast.origin ?? target);
    if (!towards) return;
    const tug = DRAGGED * (0.35 + 0.65 * beatAt(local - from, DRAIN_BEAT_MS)) * held * cellPx;
    const shudder = SHUDDERS * held * cellPx;
    add(target.identifier, {
      x: shudder * Math.sin(s * 121 + index * 2.1) + towards.x * tug,
      y: shudder * Math.sin(s * 147 + index * 4.3) + towards.y * tug,
      z: 0,
    });
  });
}
