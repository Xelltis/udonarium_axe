import { orbLookOf, shadowLookOf } from '@axe/domain/effect/dark-looks';
import type { EffectBlow } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * How the pieces bear a look of darkness for as long as it has hold of them, drawn off where they
 * stand. One that is drained is dragged towards the one who drains it at every beat of the pull and
 * shudders between them, until the strands snap. One a mire's hands have seized sinks into it, pulled
 * at again and again, and is dragged towards its middle, until it closes. One a black sphere has
 * clamped onto is lifted a little and shakes harder and harder until the sphere bursts, and one under
 * an eclipse shakes as the needles fall on it. The pieces themselves stay where they are.
 */

/** How far a drained piece is dragged at each beat of the pull, and how far it shudders each way, as shares of a cell. */
const DRAGGED = 0.09;
const SHUDDERS = 0.022;
/** How long one beat of a draining is, in milliseconds. */
export const DRAIN_BEAT_MS = 600;
/** How far a piece sinks into a mire and how far it is dragged towards its middle, as shares of a cell. */
const SINKS = 0.14;
const DRAWN_IN = 0.07;
/** How far a piece a sphere holds is lifted, and how far it shakes each way at the last, as shares of a cell. */
const LIFTED = 0.06;
const SQUEEZED = 0.03;
/** How far a piece shakes each way under the needles of an eclipse, as a share of a cell. */
const PRICKED = 0.02;
/** How long a piece takes to be taken hold of, and to stand again once it is let go, in milliseconds. */
const HELD_IN_MS = 140;
const STANDS_AGAIN_MS = 320;
/** How long before a sphere bursts it clamps on, and how long before the corona of an eclipse flares its needles fall, as shares of that time. */
export const ORB_CLAMPS_AT = 0.2;
export const NEEDLES_FROM = 0.5;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;
type Holding = 'drain' | 'abyss' | 'orb' | 'eclipse';

/** What a look of darkness on its own holds its targets with, or nothing for one that only strikes and for any other effect. */
function holdingOf(preset: EffectPreset): Holding | undefined {
  if (preset.isStaged) return undefined;
  if (preset.effectKind === 'drain') return 'drain';
  if (preset.effectKind === 'shadow') return shadowLookOf(preset) === 'abyss' ? 'abyss' : undefined;
  if (preset.effectKind === 'darkorb') return orbLookOf(preset);
  return undefined;
}

/** From when until when a look holds a piece, on the piece's own clock, in milliseconds. */
function heldSpanOf(holding: Holding, blows: readonly EffectBlow[]): readonly [number, number] | undefined {
  const first = blows[0]?.atMs;
  if (first === undefined) return undefined;
  if (holding === 'orb') return [first * ORB_CLAMPS_AT, first];
  if (holding === 'eclipse') return [first * NEEDLES_FROM, first];
  return [first, blows[1]?.atMs ?? first];
}

/** When a look of darkness on its own lets go of the pieces, on the first target's clock, in milliseconds; nothing for any other effect. */
export function darkLetsGoAt(preset: EffectPreset, blows: readonly EffectBlow[]): number {
  const holding = holdingOf(preset);
  const span = holding && heldSpanOf(holding, blows);
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
  const holding = holdingOf(preset);
  const span = holding && heldSpanOf(holding, blows);
  if (!holding || !span) return;
  const [from, until] = span;
  const centre = cast.targets[0];
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    if (local <= from || local >= until + STANDS_AGAIN_MS) return;
    const held = Math.min(1, (local - from) / HELD_IN_MS) * (1 - Math.max(0, (local - until) / STANDS_AGAIN_MS));
    const s = local / 1000;
    const shake = (far: number) => ({
      x: far * cellPx * Math.sin(s * 121 + index * 2.1),
      y: far * cellPx * Math.sin(s * 147 + index * 4.3),
    });
    if (holding === 'drain') {
      const towards = wayOf(target, cast.origin ?? target);
      if (!towards) return;
      const tug = DRAGGED * (0.35 + 0.65 * beatAt(local - from, DRAIN_BEAT_MS)) * held * cellPx;
      const shaken = shake(SHUDDERS * held);
      add(target.identifier, {
        x: shaken.x + towards.x * tug,
        y: shaken.y + towards.y * tug,
        z: 0,
      });
      return;
    }
    if (holding === 'abyss') {
      const towards = index === 0 ? null : wayOf(target, centre);
      const tug = 0.6 + 0.4 * beatAt(local - from, 520);
      const shaken = shake(SHUDDERS * held);
      add(target.identifier, {
        x: shaken.x + (towards?.x ?? 0) * DRAWN_IN * tug * held * cellPx,
        y: shaken.y + (towards?.y ?? 0) * DRAWN_IN * tug * held * cellPx,
        z: -SINKS * tug * held * cellPx,
      });
      return;
    }
    const closing = Math.min(1, (local - from) / Math.max(1, until - from));
    if (holding === 'orb') {
      const shaken = shake(SQUEEZED * closing * closing * held);
      add(target.identifier, { ...shaken, z: LIFTED * held * cellPx });
      return;
    }
    const shaken = shake(PRICKED * held);
    add(target.identifier, { ...shaken, z: 0 });
  });
}
