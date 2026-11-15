import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { hueOf, lightningPaths, type Point } from '@axe/domain/effect/scene/parts';

/**
 * A bolt of lightning between two points as bands: a pale light about it, the bolt white-hot, and its
 * forks thinner, none of it below the floor it strikes.
 */
export function lightningRibbons(
  from: Point,
  to: Point,
  seed: number,
  flicker: number,
  cell: number,
  ramp: readonly string[],
  alpha: number,
  floorZ: number,
  thick = 1
): EffectRibbon[] {
  const { main, forks } = lightningPaths(from, to, seed, flicker, { floorZ: floorZ + cell * 0.05 });
  const ribbons: EffectRibbon[] = [
    { points: main, widths: cell * 0.7 * thick, color: hueOf(ramp), alpha: 0.3 * alpha, blend: 'color' },
    { points: main, widths: cell * 0.5 * thick, color: hueOf(ramp), alpha: 0.45 * alpha, blend: 'light' },
    { points: main, widths: cell * 0.16 * thick, color: ramp[3], core: '#ffffff', alpha, blend: 'light' },
    { points: main, widths: cell * 0.05 * thick, color: '#ffffff', alpha, blend: 'color' },
  ];
  for (const fork of forks) {
    ribbons.push({
      points: fork,
      widths: [cell * 0.07 * thick, cell * 0.05 * thick, 0],
      color: ramp[4],
      core: '#ffffff',
      alpha: 0.8 * alpha,
      blend: 'light',
    });
  }
  return ribbons;
}
