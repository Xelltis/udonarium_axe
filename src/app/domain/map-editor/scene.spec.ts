import { createScene, sceneHeightPx, sceneWidthPx } from '@axe/domain/map-editor/scene';
import { GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { describe, expect, it } from 'vitest';

describe('sceneWidthPx / sceneHeightPx', () => {
  it('uses cols/rows * cellPx for square scenes', () => {
    const scene = createScene(10, 8, 64, GridType.SQUARE);
    expect(sceneWidthPx(scene)).toBe(640);
    expect(sceneHeightPx(scene)).toBe(512);
  });

  it('uses cols/rows * cellPx for grid type NONE', () => {
    const scene = createScene(5, 4, 32, GridType.NONE);
    expect(sceneWidthPx(scene)).toBe(160);
    expect(sceneHeightPx(scene)).toBe(128);
  });

  for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
    it(`equals computeHexMaskGeometry footprint for gridType ${gridType}`, () => {
      for (const [cols, rows] of [
        [1, 1],
        [2, 3],
        [5, 4],
        [7, 6],
      ]) {
        const scene = createScene(cols, rows, 64, gridType);
        const geo = computeHexMaskGeometry(cols, rows, 64, gridType)!;
        expect(sceneWidthPx(scene)).toBe(geo.pixelW);
        expect(sceneHeightPx(scene)).toBe(geo.pixelH);
      }
    });
  }
});
