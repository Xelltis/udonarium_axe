import { outCubic, within } from '@axe/domain/effect/scene/choreography';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { circlePoints, type Point } from '@axe/domain/effect/scene/parts';

/*
 * What the looks that bless, guard or carry a piece share: how strong something that comes and goes
 * is, and a level ring of light.
 */

/** How far into its run something that comes and goes is, shown as how strong it is: up fast, held, and gone slowly. */
export function swell(t: number, duration: number, rises = 0.25, falls = 0.5): number {
  return Math.min(outCubic(within(t, 0, rises)), 1 - within(t, duration - falls, duration));
}

/** A level ring of light as a band, at a height. */
export function ringRibbon(
  middle: Point,
  radius: number,
  width: number,
  color: string,
  core: string | undefined,
  alpha: number
): EffectRibbon {
  return { points: circlePoints(middle, radius, 40), widths: width, color, core, alpha, blend: 'light' };
}
