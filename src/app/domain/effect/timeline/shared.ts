import { clamp01 } from '@axe/core/util/clamp';
import { seededRandom } from '@axe/core/util/seeded-random';

export { clamp01 };

export { seededRandom };

/*
 * The shared groundwork of the pictures an effect cuts up over the table: where they stand, how
 * large, and the randomness they scatter by.
 */

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
  /** The targets not to draw, such as a piece out of sight. */
  hiddenIdentifiers?: ReadonlySet<string>;
  /** Resolves where a target is now, for an effect that follows it. Without it the position at the firing is used. */
  resolvePosition?: (identifier: string) => { x: number; y: number; z: number } | null;
  /** The picture of the target, which crumbling and cleaving cut and move; nothing is cut without one. */
  resolveImage?: (identifier: string) => string;
  /**
   * How many cells across a target is, as a piece of two or three cells is: what strikes it is drawn
   * as large as it is. Without it every target is one cell across.
   */
  resolveSize?: (identifier: string) => number;
}

/** The largest a target is counted, in cells, so a giant piece does not have its picture drawn past what a screen holds. */
const LARGEST_COUNTED_CELLS = 4;

/**
 * How much larger an effect is drawn on a target than on a piece of one cell: as large as the target
 * for what goes off about it, so a blast on a dragon three cells across covers the dragon rather than
 * its foot, and by the root of that for what flies at it from the caster, whose flight it would
 * otherwise blow up too.
 */
export function targetScaleOf(options: EffectSpriteOptions, identifier: string, aimed: boolean): number {
  const cells = Math.min(LARGEST_COUNTED_CELLS, Math.max(1, options.resolveSize?.(identifier) ?? 1));
  return aimed ? Math.sqrt(cells) : cells;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** The picture of the target, empty where it has none. */
export function imageOf(options: EffectSpriteOptions, identifier: string): string {
  return options.resolveImage?.(identifier) ?? '';
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

/**
 * Cubic ease-out over 0 to 1: quick at first and settling towards the end. Input outside that range
 * is clamped.
 */
export function easeOutCubic(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 1);
  return 1 - Math.pow(1 - clamped, 3);
}
