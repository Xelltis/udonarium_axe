import { calcHexFlowerParams, HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { hexFloorClipPathOf, hexWallsOf, TerrainHexWall } from '@axe/features/tabletop/terrain/terrain-hex-shapes';
import { describe, expect, it } from 'vitest';

/** The clip path exactly as the terrain component cut it for itself. */
function clipPathBefore(params: HexFlowerParams): string {
  const { outline, bbox } = params;
  const W = bbox.maxX - bbox.minX;
  const H = bbox.maxY - bbox.minY;
  const points = outline
    .map((v) => {
      const px = v.x - bbox.minX;
      const py = v.y - bbox.minY;
      return `${((px / W) * 100).toFixed(2)}% ${((py / H) * 100).toFixed(2)}%`;
    })
    .join(', ');
  return `polygon(${points})`;
}

/** The walls exactly as the terrain component laid them out for itself. */
function wallsBefore(
  params: HexFlowerParams,
  containerW: number,
  containerH: number,
  useSurfaceShading: boolean
): TerrainHexWall[] {
  const { outline } = params;
  return outline.map((v1, i) => {
    const v2 = outline[(i + 1) % outline.length];
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const edgeLength = Math.sqrt(dx * dx + dy * dy);
    const edgeAngle = Math.atan2(dy, dx);
    const brightness = useSurfaceShading
      ? Math.max(0.3, Math.min(1.0, 0.65 - 0.35 * Math.cos(edgeAngle) + 0.15 * Math.sin(edgeAngle)))
      : 1.0;
    return {
      edgeLength: edgeLength + 1,
      px: containerW / 2 + v2.x,
      py: containerH / 2 + v2.y,
      angle: edgeAngle + Math.PI,
      brightness,
    };
  });
}

const SIZES = [1, 2, 3, 2.5];
const GRID_SIZES = [50, 37];

describe('the shapes hex terrains of a size share', () => {
  it('cuts the floor to the same outline as each terrain cut for itself', () => {
    for (const isFlatTop of [true, false]) {
      for (const gridSize of GRID_SIZES) {
        for (const size of SIZES) {
          const params = calcHexFlowerParams(size, gridSize, isFlatTop);
          expect(hexFloorClipPathOf(params)).toBe(clipPathBefore(params));
        }
      }
    }
  });

  it('lays the walls out where each terrain laid its own', () => {
    for (const isFlatTop of [true, false]) {
      for (const size of SIZES) {
        const params = calcHexFlowerParams(size, 50, isFlatTop);
        for (const shading of [true, false]) {
          const walls = hexWallsOf(params, size * 50, size * 50, shading);
          expect(walls).toEqual(wallsBefore(params, size * 50, size * 50, shading));
        }
      }
    }
  });

  it('hands the same outline and walls to every terrain of a size', () => {
    const params = calcHexFlowerParams(2, 50, true);
    expect(hexFloorClipPathOf(params)).toBe(hexFloorClipPathOf(calcHexFlowerParams(2, 50, true)));
    expect(hexWallsOf(params, 100, 100, true)).toBe(hexWallsOf(calcHexFlowerParams(2, 50, true), 100, 100, true));
  });

  it('lays out a layout of its own for another box or another light', () => {
    const params = calcHexFlowerParams(2, 50, true);
    expect(hexWallsOf(params, 100, 100, true)).not.toBe(hexWallsOf(params, 150, 100, true));
    expect(hexWallsOf(params, 100, 100, true)).not.toBe(hexWallsOf(params, 100, 100, false));
    expect(hexWallsOf(params, 100, 100, false)[0].brightness).toBe(1);
  });
});
