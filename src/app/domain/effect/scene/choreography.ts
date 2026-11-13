import type { EffectLight } from '@axe/domain/effect/effect-light';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import type { EffectFloorMark, EffectMote, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

/** Where and how large an effect plays on one target, and how far into it it is. */
export interface Stage {
  /** Where it plays: the foot of the target, in table pixels, x to the east, y to the south and z up. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How high the floor under it is, in table pixels: below its foot where it flies. */
  readonly groundZ: number;
  /** How wide a cell is drawn for it, in table pixels: the table's cell, grown by the effect's size and the target's. */
  readonly cell: number;
  /**
   * How far into its playback it is, in seconds, and how long it plays: its blows land within that
   * time, and what it leaves, as smoke clearing and embers dying, lingers on after it.
   */
  readonly seconds: number;
  readonly duration: number;
  /**
   * The target's place in the cast: the first is where an effect over an area is centred, and the
   * rest are those caught in it.
   */
  readonly index: number;
  /** How far an effect over an area reaches from its centre, in table pixels; nothing for one on its targets alone. */
  readonly areaPx: number;
  /** Where an effect aimed from its caster leaves it, in table pixels: its hands or its mouth; null for one cast from nowhere. */
  readonly origin: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** When its blows land on the target, in seconds of its playback: the moment it goes off. */
  readonly blowsAt: readonly number[];
  readonly seed: number;
  readonly preset: EffectPreset;
}

/** What an effect draws on one target at a moment, and the light it throws over the table. */
export interface Staged {
  readonly motes: EffectMote[];
  readonly ribbons: EffectRibbon[];
  readonly floor: EffectFloorMark[];
  readonly lights: EffectLight[];
}

/** One look of effect: how it is drawn on one target at a moment, and how long it lingers after its playback, in seconds. */
export interface Choreography {
  readonly lingerS: number;
  draw(stage: Stage): Staged;
}

/** An empty drawing, to be filled. */
export function nothingStaged(): Staged {
  return { motes: [], ribbons: [], floor: [], lights: [] };
}

/** How far a share of a span is, from 0 before it to 1 after it. */
export function within(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}

/** Fast out, slow to settle: how far a move has gone a share of the way through its time. */
export function outQuart(share: number): number {
  const left = 1 - Math.min(1, Math.max(0, share));
  return 1 - left * left * left * left;
}

/** Fast out, slower to settle than a quartic. */
export function outCubic(share: number): number {
  const left = 1 - Math.min(1, Math.max(0, share));
  return 1 - left * left * left;
}
