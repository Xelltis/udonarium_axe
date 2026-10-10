import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCellCenter, hexCircumradius, hexSpacing } from '@axe/domain/tabletop/hex-geometry';
import { seededRandom } from '@axe/testing/fingerprint';
import { legacyCalcHexSnapPosition, legacyCalcHexVertexSnapPosition } from '@axe/testing/legacy-hex-lookup';
import { calcHexSnapPosition, calcHexVertexSnapPosition } from '@axe/ui/directives/movable-helpers';
import { describe, expect, it } from 'vitest';

const GRID_TYPES: readonly GridType[] = [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL, GridType.SQUARE];
const GRID_SIZES: readonly number[] = [25, 37, 50, 64];

/** Where a piece dropped on a hex table may land: cell centres, corners, boundaries and points between them. */
function samplePoints(gridSize: number, gridType: GridType): { x: number; y: number }[] {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const s = hexCircumradius(gridSize);
  const points: { x: number; y: number }[] = [];

  for (let col = -3; col <= 3; col++) {
    for (let row = -3; row <= 3; row++) {
      const centre = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      points.push(centre);
      for (let k = 0; k < 6; k++) {
        const angle = (k * Math.PI) / 3 + (isFlatTop ? 0 : -Math.PI / 2);
        points.push({ x: centre.x + s * Math.cos(angle), y: centre.y + s * Math.sin(angle) });
      }
      const across = hexCellCenter(col + 1, row, colSpacing, rowSpacing, isFlatTop);
      points.push({ x: (centre.x + across.x) / 2, y: (centre.y + across.y) / 2 });
      const down = hexCellCenter(col, row + 1, colSpacing, rowSpacing, isFlatTop);
      points.push({ x: (centre.x + down.x) / 2, y: (centre.y + down.y) / 2 });
    }
  }

  const random = seededRandom(0x5eed + gridSize);
  for (let i = 0; i < 2000; i++) {
    points.push({ x: (random() - 0.5) * 20 * gridSize, y: (random() - 0.5) * 20 * gridSize });
  }
  points.push({ x: 0, y: 0 }, { x: -0.5, y: -0.5 }, { x: 1e7, y: -1e7 });
  return points;
}

describe('snapping a piece to a hex', () => {
  for (const gridType of GRID_TYPES) {
    for (const gridSize of GRID_SIZES) {
      const where = `${GridType[gridType]} at ${gridSize}px`;

      it(`lands on the same cell centre as the scan did, ${where}`, () => {
        const wrong: string[] = [];
        for (const point of samplePoints(gridSize, gridType)) {
          const found = calcHexSnapPosition(point.x, point.y, gridSize, gridType);
          const before = legacyCalcHexSnapPosition(point.x, point.y, gridSize, gridType);
          if (!Object.is(found.x, before.x) || !Object.is(found.y, before.y)) {
            wrong.push(`(${point.x},${point.y}) → (${found.x},${found.y}) not (${before.x},${before.y})`);
          }
        }
        expect(wrong).toEqual([]);
      });

      it(`lands on the same corner as the trigonometry did, ${where}`, () => {
        const wrong: string[] = [];
        for (const point of samplePoints(gridSize, gridType)) {
          const found = calcHexVertexSnapPosition(point.x, point.y, gridSize, gridType);
          const before = legacyCalcHexVertexSnapPosition(point.x, point.y, gridSize, gridType);
          if (!Object.is(found.x, before.x) || !Object.is(found.y, before.y)) {
            wrong.push(`(${point.x},${point.y}) → (${found.x},${found.y}) not (${before.x},${before.y})`);
          }
        }
        expect(wrong).toEqual([]);
      });
    }
  }

  it('keeps a piece of its own size on the centre, whatever its anchor', () => {
    const anchors = [
      { halfWidth: 0, halfHeight: 0 },
      { halfWidth: 12.5, halfHeight: 37.5 },
      { halfWidth: -10, halfHeight: 4 },
    ];
    for (const { halfWidth, halfHeight } of anchors) {
      const found = calcHexSnapPosition(73, -19, 50, GridType.HEX_VERTICAL, halfWidth, halfHeight);
      const before = legacyCalcHexSnapPosition(73, -19, 50, GridType.HEX_VERTICAL, halfWidth, halfHeight);
      expect(found).toEqual(before);
    }
  });
});
