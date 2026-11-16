import { clamp } from '@axe/core/util/clamp';
import type { EffectLight } from '@axe/domain/effect/effect-light';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import type { EffectFloorMark, EffectMote, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

/** One target of a cast as it stands now: its foot, the floor under it and how wide it is, in table pixels. */
export interface StageTarget {
  /** Its place in the cast, as {@link Stage.index} counts it. */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly groundZ: number;
  readonly widthPx: number;
}

/**
 * Where a breath leaves its caster, in table pixels: before its body, towards the targets, and as
 * high as the caster is large, with how wide the caster is.
 */
export interface StageMouth {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly widthPx: number;
}

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
   * How tall the target stands over its foot, in table pixels: where its head is, for what is drawn
   * over it. As tall as its picture or its model is drawn where the table tells it, and otherwise as
   * tall as it is wide.
   */
  readonly tall: number;
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
  /**
   * Every target of the cast that is drawn, as it stands now, in the order they were picked, this
   * one among them: for a look that plays over all of them at once rather than on each alone.
   */
  readonly targets: readonly StageTarget[];
  /**
   * The pieces standing on the table that are neither a target of the cast nor its caster, as they
   * stand now, for a look that breaks on whatever is in its way; left out by what has none to tell of.
   */
  readonly bystanders?: readonly StageTarget[];
  /** Where a breath leaves its caster; null for one cast from nowhere. */
  readonly mouth: StageMouth | null;
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
  return clamp((value - from) / (to - from), 0, 1);
}

/** Fast out, slower to settle than a quartic. */
export function outCubic(share: number): number {
  const left = 1 - clamp(share, 0, 1);
  return 1 - left * left * left;
}
