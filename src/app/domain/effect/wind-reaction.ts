import { type EffectBlow } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { tornadoTimingOf } from '@axe/domain/effect/wind-looks';

/*
 * How a storm moves the pieces it has caught: it takes every one of them up off the floor and whirls
 * it round where it stands, bobbing, for as long as the funnel stands, and each shudders as its
 * lightning strikes; all are let down as the storm thins away.
 */

/** How far a storm lifts a piece it has caught off the floor, and how far it whirls it round, as shares of a cell. */
const LIFTED_CELLS = 0.22;
const WHIRLED_CELLS = 0.09;
/** How fast a piece is whirled round, in radians a second. */
const WHIRLS_RATE = 7;
/** How far a piece struck by lightning shudders each way, as a share of a cell, and for how long, in milliseconds. */
const SHUDDERS_CELLS = 0.04;
const SHUDDERS_MS = 380;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/** Adds how a storm moves the pieces it has caught at a moment, through `add`; see the head of this file. */
export function addStormJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  blows: readonly EffectBlow[],
  add: Add
): void {
  const timing = tornadoTimingOf(preset.duration / 1000);
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    const seconds = local / 1000;
    if (seconds <= 0 || seconds >= timing.goneAt) return;
    const held =
      Math.min(1, seconds / timing.risenAt) *
      (1 - Math.max(0, (seconds - timing.thinsAt) / (timing.goneAt - timing.thinsAt)));
    const turn = seconds * WHIRLS_RATE + index * 2.1;
    const whirl = WHIRLED_CELLS * held * cellPx;
    const lift = LIFTED_CELLS * held * (0.8 + 0.2 * Math.sin(seconds * 4.3 + index)) * cellPx;
    const struck = blows.reduce((most, blow) => {
      const since = local - blow.atMs;
      return since > 0 && since < SHUDDERS_MS ? Math.max(most, 1 - since / SHUDDERS_MS) : most;
    }, 0);
    const shudder = SHUDDERS_CELLS * struck * cellPx;
    add(target.identifier, {
      x: Math.cos(turn) * whirl + shudder * Math.sin(seconds * 131 + index),
      y: Math.sin(turn) * whirl + shudder * Math.sin(seconds * 157 + index * 3),
      z: lift,
    });
  });
}

/** When, on a storm's own clock, the last piece it has caught is let down, in milliseconds. */
export function stormJoltsEndOf(preset: EffectPreset, cast: EffectCast): number {
  return tornadoTimingOf(preset.duration / 1000).goneAt * 1000 + preset.stagger * Math.max(0, cast.targets.length - 1);
}
