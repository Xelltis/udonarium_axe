import { seededRandom } from '@axe/core/util/seeded-random';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { type ShapeColors } from '@axe/domain/effect/effect-shapes';
import { type ViewRotation } from '@axe/domain/effect/effect-view';

export { seededRandom };

/**
 * The shared groundwork.
 *
 * Only what every effect uses: the coordinates, the colours and the randomness.
 * It refers to no family of effects, which would make a loop.
 */

/**
 * How a landing is drawn.
 *
 * A projectile or a blade leaves how it bursts to the effect of its element. Referring to
 * that effect would have them call each other, so it is **handed in** instead.
 */
export type ImpactPainter = (
  kind: EffectKind,
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
) => void;

export interface EffectSprite {
  key: string;
  x: number;
  y: number;
  z: number;
  /** The offset across the billboard, which holds its shape as the camera turns. */
  offsetX: number;
  /** The offset down it, positive towards the bottom of the screen. */
  offsetY: number;
  width: number;
  height: number;
  rotate: number;
  opacity: number;
  background: string;
  borderRadius: string;
  /** Empty for no clip. */
  clipPath: string;
  /** Empty for no shadow; otherwise the shadow is passed through as it is. */
  shadow: string;
  /** Empty for no animation; otherwise it is applied to the inner layer. */
  animation: string;
  /** What the animated layer turns about. Empty for its centre. */
  origin: string;
  /** Anything but empty is drawn as a drawing, and must not change with the elapsed time. */
  svg: string;
  /** True to lay it flat on the board, false to face it at the camera. */
  flat: boolean;
}

/** Where the effect is happening, which follows the target when it is set to. */
export function effectTargetCenter(
  target: { identifier: string; x: number; y: number; z: number },
  preset: { followTarget: boolean },
  options: EffectSpriteOptions
): Point3 {
  if (!preset.followTarget || target.identifier.length < 1) return target;
  return options.resolvePosition?.(target.identifier) ?? target;
}

export interface EffectSpriteOptions {
  baseSize: number;
  /** Which way the board faces, which is how a projectile is drawn out along its travel on the screen. */
  viewRotation?: ViewRotation | null;
  /** The targets not to draw, such as a piece out of sight. */
  hiddenIdentifiers?: ReadonlySet<string>;
  /** Resolves where a target is now, for an effect that follows it. Without it the position at the firing is used. */
  resolvePosition?: (identifier: string) => { x: number; y: number; z: number } | null;
  /**
   * The picture of the target. Crumbling and cleaving cut that picture and move it.
   * A piece with no picture makes do with shards of light.
   */
  resolveImage?: (identifier: string) => string;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const FLARE_SPIKE_COUNT = 4;
/** A point the given share of the way from the origin to the centre, in a straight line. */
export function along(origin: Point3, center: Point3, at: number): Point3 {
  return {
    x: origin.x + (center.x - origin.x) * at,
    y: origin.y + (center.y - origin.y) * at,
    z: origin.z + (center.z - origin.z) * at,
  };
}

/** With no additive blending here, the glow comes from the spread of the shadow. */
export function glow(innerRadius: number, innerColor: string, outerRadius?: number, outerColor?: string): string {
  const inner = `0 0 ${Math.round(innerRadius * 1.4)}px ${innerColor}`;
  if (outerRadius == null || outerColor == null) return inner;
  return `${inner}, 0 0 ${Math.round(outerRadius * 1.4)}px ${outerColor}`;
}

/**
 * The preset's primary and secondary colours, as the core and edge colours the shape drawings take.
 */
export function colorsOf(preset: EffectPreset): ShapeColors {
  return { core: preset.colorPrimary, edge: preset.colorSecondary };
}

/** The streaks of light reaching out from the centre, without which a drawn flash is not one. */
export function appendFlareSpikes(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  local: number,
  preset: EffectPreset,
  span: number,
  lift: number
): void {
  for (let spike = 0; spike < FLARE_SPIKE_COUNT; spike++) {
    const length = base * span * (0.4 + easeOutCubic(local) * 1.4);
    sprites.push({
      ...blank(),
      key: `${prefix}-flare-${spike}`,
      x: center.x,
      y: center.y,
      z: center.z + lift,
      width: length,
      height: base * 0.08 * (1 - local * 0.7),
      rotate: spike * 45,
      opacity: (1 - local) * 0.9,
      background: `linear-gradient(90deg, transparent, ${preset.colorPrimary} 30%, #ffffff 50%, ${preset.colorPrimary} 70%, transparent)`,
      borderRadius: '50%',
    });
  }
}

/** The picture of the target. Empty when there is none, and the caller makes do with shards of light. */
export function imageOf(options: EffectSpriteOptions, identifier: string): string {
  return options.resolveImage?.(identifier) ?? '';
}

/** The origin. Without one it comes down at an angle onto the target. */
export function projectileOrigin(cast: EffectCast, center: Point3, base: number): Point3 {
  if (cast.origin) return cast.origin;
  return { x: center.x - base * 4, y: center.y - base * 4, z: center.z + base * 4 };
}

/** Rounds to two decimal places, which keeps the numbers written into a sprite's CSS short. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One point along the path. Unlike a projectile it does not arc. */
export function pointBetween(from: Point3, to: Point3, at: number): Point3 {
  return {
    x: from.x + (to.x - from.x) * at,
    y: from.y + (to.y - from.y) * at,
    z: from.z + (to.z - from.z) * at,
  };
}

/**
 * A sprite with every field at its neutral value: at the origin, unturned, fully opaque, facing the
 * camera and drawing nothing.
 *
 * Painters spread it first and set only what they use.
 */
export function blank(): EffectSprite {
  return {
    key: '',
    x: 0,
    y: 0,
    z: 0,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    rotate: 0,
    opacity: 1,
    background: '',
    borderRadius: '0',
    clipPath: '',
    shadow: '',
    animation: '',
    origin: '',
    svg: '',
    flat: false,
  };
}

/** What is needed is drawn first, so the elapsed time does not change how much randomness is used. */
export function takeRandoms(random: () => number, count: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < count; index++) values.push(random());
  return values;
}

/**
 * A progress value with anything that is not a finite number turned into 0.
 *
 * Unlike clamp01 it leaves the value unbounded, so a painter can still tell below 0 and past 1
 * apart from the span in between.
 */
export function normalize(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Holds a value between 0 and 1, reading anything that is not a finite number as 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Cubic ease-out over 0 to 1: quick at first and settling towards the end. Input outside that range
 * is clamped.
 */
export function easeOutCubic(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/** It rises to full over the given share and falls away over the rest. */
export function fadeInOut(value: number, rise: number): number {
  // A progress that is not a number falls back to nothing; passed through it slips the guard that keeps particles from being made at all and breaks them.
  const clamped = clamp01(value);
  if (clamped < rise) return clamped / rise;
  return 1 - (clamped - rise) / (1 - rise);
}
