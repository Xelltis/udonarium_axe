import { PERF_HEX_CELL_SCAN, perfCounters } from '@axe/core/util/perf-counters';
import { pixelToHexCell } from '@axe/domain/tabletop/hex-geometry';
import { legacyHexCellCenter, legacyHexSpacing, legacyPixelToHexCell } from '@axe/testing/legacy-hex-lookup';
import { afterEach, describe, expect, it } from 'vitest';

type Point = readonly [number, number];

interface Miss {
  px: number;
  py: number;
  expected: { col: number; row: number };
  actual: { col: number; row: number };
}

const GRID_SIZES = [25, 37, 50, 64, 100];
const ORIENTATIONS = [
  { name: 'flat-topped', isFlatTop: true },
  { name: 'pointy-topped', isFlatTop: false },
];

function mismatchesOver(points: Iterable<Point>, gridSize: number, isFlatTop: boolean): Miss[] {
  const misses: Miss[] = [];
  for (const [px, py] of points) {
    const expected = legacyPixelToHexCell(px, py, gridSize, isFlatTop);
    const actual = pixelToHexCell(px, py, gridSize, isFlatTop);
    if (Object.is(expected.col, actual.col) && Object.is(expected.row, actual.row)) continue;
    misses.push({ px, py, expected, actual });
    if (misses.length >= 5) break;
  }
  return misses;
}

function* integerLattice(gridSize: number): Generator<Point> {
  for (let px = -gridSize; px < gridSize * 4; px++) {
    for (let py = -gridSize; py < gridSize * 4; py++) yield [px, py];
  }
}

function* halfStepLattice(gridSize: number, isFlatTop: boolean): Generator<Point> {
  const { colSpacing, rowSpacing } = legacyHexSpacing(gridSize, isFlatTop);
  for (let i = -4; i <= 16; i++) {
    for (let j = -4; j <= 16; j++) yield [(i * colSpacing) / 2, (j * rowSpacing) / 2];
  }
}

function* scatteredPoints(seed: number, count: number, gridSize: number): Generator<Point> {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let i = 0; i < count; i++) {
    yield [next() * gridSize * 44 - gridSize * 4, next() * gridSize * 44 - gridSize * 4];
  }
}

function nudged(value: number, direction: number): number {
  return value + direction * Math.max(Math.abs(value), 1) * Number.EPSILON;
}

function* cornersAndMidpoints(gridSize: number, isFlatTop: boolean): Generator<Point> {
  const { colSpacing, rowSpacing } = legacyHexSpacing(gridSize, isFlatTop);
  const s = gridSize / Math.sqrt(3);
  const start = isFlatTop ? 0 : -Math.PI / 2;
  for (let col = -1; col <= 4; col++) {
    for (let row = -1; row <= 4; row++) {
      const centre = legacyHexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const corners: Point[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = start + (i * Math.PI) / 3;
        corners.push([centre.x + s * Math.cos(angle), centre.y + s * Math.sin(angle)]);
      }
      const midpoints = corners.map(([x, y], i): Point => {
        const [nx, ny] = corners[(i + 1) % 6];
        return [(x + nx) / 2, (y + ny) / 2];
      });
      for (const [x, y] of [...corners, ...midpoints]) {
        for (const dx of [-1, 0, 1]) {
          for (const dy of [-1, 0, 1]) yield [nudged(x, dx), nudged(y, dy)];
        }
      }
    }
  }
}

function* farAndUnnumberedPoints(): Generator<Point> {
  const far = [1e6 + 0.25, -1e6 - 0.75, 1e9 + 0.5, -1e9 + 0.125, 0, -0];
  for (const x of far) {
    for (const y of far) yield [x, y];
  }
  yield [Number.NaN, 10];
  yield [10, Number.NaN];
  yield [Number.NaN, Number.NaN];
}

describe('pixelToHexCell against the scan it replaced', () => {
  for (const { name, isFlatTop } of ORIENTATIONS) {
    describe(name, () => {
      it('agrees on every whole pixel near the origin', () => {
        for (const gridSize of GRID_SIZES) {
          expect(mismatchesOver(integerLattice(gridSize), gridSize, isFlatTop)).toEqual([]);
        }
      });

      it('agrees on the half-step lattice where cells meet', () => {
        for (const gridSize of GRID_SIZES) {
          expect(mismatchesOver(halfStepLattice(gridSize, isFlatTop), gridSize, isFlatTop)).toEqual([]);
        }
      });

      it('agrees on scattered points', () => {
        for (const gridSize of GRID_SIZES) {
          expect(mismatchesOver(scatteredPoints(gridSize, 20_000, gridSize), gridSize, isFlatTop)).toEqual([]);
        }
      });

      it('agrees on corners and edge midpoints, and a hair either side of them', () => {
        for (const gridSize of GRID_SIZES) {
          expect(mismatchesOver(cornersAndMidpoints(gridSize, isFlatTop), gridSize, isFlatTop)).toEqual([]);
        }
      });

      it('agrees far from the origin and on points that are not numbers', () => {
        for (const gridSize of GRID_SIZES) {
          expect(mismatchesOver(farAndUnnumberedPoints(), gridSize, isFlatTop)).toEqual([]);
        }
      });
    });
  }
});

describe('pixelToHexCell on ordinary points', () => {
  afterEach(() => {
    perfCounters.enabled = false;
    perfCounters.clear();
  });

  it('names almost every cell without comparing the centres around it', () => {
    perfCounters.enabled = true;
    perfCounters.clear();
    const count = 50_000;
    for (const [px, py] of scatteredPoints(42, count, 50)) {
      pixelToHexCell(px, py, 50, true);
      pixelToHexCell(px, py, 50, false);
    }
    const scans = perfCounters.drain().get(PERF_HEX_CELL_SCAN) ?? 0;
    expect(scans).toBeLessThan(count * 2 * 0.01);
  });
});
