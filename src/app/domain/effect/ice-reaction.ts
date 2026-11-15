import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { blizzardTimingOf } from '@axe/domain/effect/ice-looks';

/*
 * How a piece stands in a blizzard, drawn off where it stands for as long as it blows: it is not
 * taken up as a tornado takes one, but leans from the wind as it goes round it and shivers. The
 * pieces themselves stay where they are.
 */

/** How far a piece is shoved about by a blizzard as its wind goes round it, as a share of a cell. */
const BUFFETED_CELLS = 0.04;
/** How far it shivers each way, as a share of a cell. */
const SHIVER_CELLS = 0.016;
/** How fast the wind that shoves it goes round, in radians a second. */
const WIND_PACE = 7;

/** Adds how a blizzard moves each piece it blows about at a moment, through `add`. */
export function addBlizzardJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  add: (identifier: string, jolt: { x: number; y: number; z: number }) => void
): void {
  const timing = blizzardTimingOf(preset.duration / 1000);
  cast.targets.forEach((target, index) => {
    const seconds = (elapsedMs - preset.stagger * index) / 1000;
    if (seconds <= 0 || seconds >= timing.goneAt) return;
    const blown =
      Math.min(1, seconds / timing.blowsAt) *
      (1 - Math.max(0, (seconds - timing.failsAt) / (timing.goneAt - timing.failsAt)));
    const round = seconds * WIND_PACE + index * 1.3;
    const shoved = BUFFETED_CELLS * blown * cellPx;
    const shiver = SHIVER_CELLS * blown * cellPx;
    add(target.identifier, {
      x: Math.cos(round) * shoved + shiver * Math.sin(seconds * 131 + index * 2.1),
      y: Math.sin(round) * shoved + shiver * Math.sin(seconds * 149 + index * 4.3),
      z: 0,
    });
  });
}

/** When, on a blizzard's own clock, the last piece it blows about stands still again, in milliseconds. */
export function blizzardJoltsEndOf(preset: EffectPreset, cast: EffectCast): number {
  const lastTarget = preset.stagger * Math.max(0, cast.targets.length - 1);
  return blizzardTimingOf(preset.duration / 1000).goneAt * 1000 + lastTarget;
}
