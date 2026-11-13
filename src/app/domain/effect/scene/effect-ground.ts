import type { EffectGround } from '@axe/domain/effect/scene/effect-scene';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import type { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';

/**
 * The heights of the ground under a board of a size, as the board is laid over it, for the marks of
 * effects to lie on; null where the ground is flat, and the marks lie flat.
 */
export function effectGroundOf(
  surface: GroundSurface,
  widthPx: number,
  depthPx: number,
  gridSize: number
): EffectGround | null {
  if (surface.isFlat || !(gridSize > 0) || !(widthPx > 0) || !(depthPx > 0)) return null;
  const stepPx = gridSize / GROUND_SAMPLES_PER_CELL;
  const across = Math.ceil(widthPx / stepPx) + 1;
  const down = Math.ceil(depthPx / stepPx) + 1;
  const heights = new Float32Array(across * down);
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      heights[row * across + column] =
        surface.heightAt((column * stepPx) / gridSize, (row * stepPx) / gridSize) * gridSize;
    }
  }
  return { stepPx, across, down, heights };
}
