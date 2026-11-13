import { effectGroundOf } from '@axe/domain/effect/scene/effect-ground';
import type { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';

const GRID = 50;

function surfaceRising(isFlat = false): GroundSurface {
  return { isFlat, heightAt: (x: number) => x * 0.25 } as unknown as GroundSurface;
}

describe('effectGroundOf()', () => {
  it('samples the ground every half cell from the board’s corner to its far edge, in table pixels', () => {
    const ground = effectGroundOf(surfaceRising(), 200, 100, GRID)!;

    expect(ground.stepPx).toBe(25);
    expect([ground.across, ground.down]).toEqual([9, 5]);
    expect(ground.heights[0]).toBe(0);
    expect(ground.heights[8]).toBeCloseTo(4 * 0.25 * GRID, 6);
    expect(ground.heights[4 * 9 + 2]).toBeCloseTo(1 * 0.25 * GRID, 6);
  });

  it('gives nothing for flat ground, so the marks lie flat', () => {
    expect(effectGroundOf(surfaceRising(true), 200, 100, GRID)).toBeNull();
  });
});
