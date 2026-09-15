import {
  CellGrid,
  cellPolygonOf,
  forEachCell,
  forEachCellInBox,
  gridExtentPx,
} from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  fillHexPath,
  hexLayoutOf,
  HexPathSink,
  hexVertices,
  strokeHexPath,
  traceHexPath,
} from '@axe/domain/tabletop/hex-geometry';
import { boardExtentPx, cellCentre } from '@axe/domain/tabletop/map-grid';
import { seededRandom } from '@axe/testing/fingerprint';
import {
  legacyCellCenterOf,
  legacyCellPolygonOf,
  legacyHexCellCenter,
  legacyHexSpacing,
  legacyPixelToHexCell,
} from '@axe/testing/legacy-hex-lookup';
import { describe, expect, it } from 'vitest';

const GRID_TYPES = [
  { name: 'square', type: GridType.SQUARE },
  { name: 'flat-topped hex', type: GridType.HEX_VERTICAL },
  { name: 'pointy-topped hex', type: GridType.HEX_HORIZONTAL },
];

function sameNumbers(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => Object.is(value, expected[i]));
}

/** The corners as the trigonometry used to put them, one angle at a time. */
function legacyCorners(cx: number, cy: number, s: number, startAngle: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    values.push(cx + s * Math.cos(angle), cy + s * Math.sin(angle));
  }
  return values;
}

function isHex(type: GridType): boolean {
  return type !== GridType.SQUARE;
}

function legacyExtent(grid: CellGrid): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!isHex(grid.type)) return { minX: 0, minY: 0, maxX: grid.cols * grid.sizePx, maxY: grid.rows * grid.sizePx };
  const { colSpacing, rowSpacing } = legacyHexSpacing(grid.sizePx, grid.type === GridType.HEX_VERTICAL);
  const s = grid.sizePx / Math.sqrt(3);
  return { minX: -s, minY: -s, maxX: colSpacing * grid.cols + s, maxY: rowSpacing * grid.rows + s };
}

/** The walk over the cells whose centres fall in a box, as it stood before. */
function legacyCellsInBox(grid: CellGrid, minX: number, minY: number, maxX: number, maxY: number): number[] {
  const visited: number[] = [];
  if (grid.sizePx <= 0 || grid.cols <= 0 || grid.rows <= 0) return visited;
  const extent = legacyExtent(grid);
  const lowX = Math.max(minX, extent.minX);
  const lowY = Math.max(minY, extent.minY);
  const highX = Math.min(maxX, extent.maxX);
  const highY = Math.min(maxY, extent.maxY);
  if (lowX > highX || lowY > highY) return visited;
  const loose = (x: number, y: number) =>
    isHex(grid.type)
      ? legacyPixelToHexCell(x, y, grid.sizePx, grid.type === GridType.HEX_VERTICAL)
      : { col: Math.floor(x / grid.sizePx), row: Math.floor(y / grid.sizePx) };
  const topLeft = loose(lowX, lowY);
  const bottomRight = loose(highX, highY);
  const fromCol = Math.max(0, Math.min(topLeft.col, bottomRight.col) - 1);
  const toCol = Math.min(grid.cols - 1, Math.max(topLeft.col, bottomRight.col) + 1);
  const fromRow = Math.max(0, Math.min(topLeft.row, bottomRight.row) - 1);
  const toRow = Math.min(grid.rows - 1, Math.max(topLeft.row, bottomRight.row) + 1);
  for (let row = fromRow; row <= toRow; row++) {
    for (let col = fromCol; col <= toCol; col++) {
      const index = row * grid.cols + col;
      const centre = legacyCellCenterOf(grid, index);
      if (centre.x < minX || centre.x > maxX || centre.y < minY || centre.y > maxY) continue;
      visited.push(index, centre.x, centre.y);
    }
  }
  return visited;
}

function recordingSink(log: unknown[]): HexPathSink & { beginPath(): void; stroke(): void; fill(): void } {
  return {
    beginPath: () => log.push(['beginPath']),
    moveTo: (x, y) => log.push(['moveTo', x, y]),
    lineTo: (x, y) => log.push(['lineTo', x, y]),
    closePath: () => log.push(['closePath']),
    stroke: () => log.push(['stroke']),
    fill: () => log.push(['fill']),
  };
}

describe('hexLayoutOf', () => {
  it('holds exactly the measurements the grid has always been drawn with', () => {
    for (const gridSize of [50, 37.5, 1, 0, -3, Number.NaN]) {
      for (const isFlatTop of [true, false]) {
        const layout = hexLayoutOf(gridSize, isFlatTop);
        const spacing = legacyHexSpacing(gridSize, isFlatTop);
        expect(
          sameNumbers(
            [layout.colSpacing, layout.rowSpacing, layout.circumradius, layout.startAngle],
            [spacing.colSpacing, spacing.rowSpacing, gridSize / Math.sqrt(3), isFlatTop ? 0 : -Math.PI / 2]
          )
        ).toBe(true);
      }
    }
  });

  it('hands back the same layout for a size a table can have', () => {
    expect(hexLayoutOf(50, true)).toBe(hexLayoutOf(50, true));
    expect(hexLayoutOf(50, false)).not.toBe(hexLayoutOf(50, true));
  });

  it('works a size no table has out afresh, so it is never kept past its real value', () => {
    expect(hexLayoutOf(0, true)).not.toBe(hexLayoutOf(0, true));
    expect(hexLayoutOf(Number.NaN, false)).not.toBe(hexLayoutOf(Number.NaN, false));
  });
});

describe('hex corners', () => {
  const angles = [0, -0, -Math.PI / 2, 0.3];
  const radii = [50 / Math.sqrt(3), 37 / Math.sqrt(3) + 1, 1, 0];
  const centres: readonly (readonly [number, number])[] = [
    [0, 0],
    [123.456, -78.9],
    [1e6 + 0.5, 3e5 - 0.25],
  ];

  it('puts every corner exactly where the trigonometry did', () => {
    for (const angle of angles) {
      for (const s of radii) {
        for (const [cx, cy] of centres) {
          const actual = hexVertices(cx, cy, s, angle).flatMap(({ x, y }) => [x, y]);
          expect(sameNumbers(actual, legacyCorners(cx, cy, s, angle))).toBe(true);
        }
      }
    }
  });

  it('traces, strokes and fills a hex with the same calls as before', () => {
    for (const angle of angles) {
      for (const s of radii) {
        for (const [cx, cy] of centres) {
          const corners = legacyCorners(cx, cy, s, angle);
          const path: unknown[] = [['moveTo', corners[0], corners[1]]];
          for (let i = 1; i < 6; i++) path.push(['lineTo', corners[i * 2], corners[i * 2 + 1]]);
          path.push(['closePath']);

          const traced: unknown[] = [];
          traceHexPath(recordingSink(traced), cx, cy, s, angle);
          expect(traced).toEqual(path);

          const stroked: unknown[] = [];
          strokeHexPath(recordingSink(stroked) as unknown as CanvasRenderingContext2D, cx, cy, s, angle);
          expect(stroked).toEqual([['beginPath'], ...path, ['stroke']]);

          const filled: unknown[] = [];
          fillHexPath(recordingSink(filled) as unknown as CanvasRenderingContext2D, cx, cy, s, angle);
          expect(filled).toEqual([['beginPath'], ...path, ['fill']]);
        }
      }
    }
  });
});

describe('cells on a grid', () => {
  for (const { name, type } of GRID_TYPES) {
    it(`walks every cell of a ${name} grid in the same order at the same centres`, () => {
      for (const sizePx of [50, 37, 1]) {
        const grid: CellGrid = { cols: 7, rows: 6, sizePx, type };
        const visited: number[] = [];
        forEachCell(grid, (index, cx, cy) => visited.push(index, cx, cy));
        const expected: number[] = [];
        for (let index = 0; index < 42; index++) {
          const centre = legacyCellCenterOf(grid, index);
          expected.push(index, centre.x, centre.y);
        }
        expect(sameNumbers(visited, expected)).toBe(true);
      }
    });

    it(`walks the cells in a box on a ${name} grid in the same order at the same centres`, () => {
      const next = seededRandom(7919);
      for (const sizePx of [50, 37]) {
        const grid: CellGrid = { cols: 9, rows: 8, sizePx, type };
        for (let round = 0; round < 60; round++) {
          const x = next() * 600 - 100;
          const y = next() * 600 - 100;
          const w = next() * 300;
          const h = next() * 300;
          const visited: number[] = [];
          forEachCellInBox(grid, x, y, x + w, y + h, (index, cx, cy) => visited.push(index, cx, cy));
          expect(sameNumbers(visited, legacyCellsInBox(grid, x, y, x + w, y + h))).toBe(true);
        }
      }
    });

    it(`outlines every cell of a ${name} grid with the same corners`, () => {
      const grid: CellGrid = { cols: 5, rows: 4, sizePx: 37, type };
      for (let index = 0; index < 20; index++) {
        const actual = cellPolygonOf(grid, index).flatMap(({ x, y }) => [x, y]);
        const expected = legacyCellPolygonOf(grid, index).flatMap(({ x, y }) => [x, y]);
        expect(sameNumbers(actual, expected)).toBe(true);
      }
    });

    it(`measures a ${name} grid's extent the same as before`, () => {
      for (const sizePx of [50, 37, 0]) {
        const grid: CellGrid = { cols: 9, rows: 8, sizePx, type };
        const actual = gridExtentPx(grid);
        const expected = legacyExtent(grid);
        expect(
          sameNumbers(
            [actual.minX, actual.minY, actual.maxX, actual.maxY],
            [expected.minX, expected.minY, expected.maxX, expected.maxY]
          )
        ).toBe(true);
      }
    });
  }

  it('puts a map cell and a board the same place as before', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const isFlatTop = type === GridType.HEX_VERTICAL;
      for (const sizePx of [50, 37]) {
        const { colSpacing, rowSpacing } = legacyHexSpacing(sizePx, isFlatTop);
        const centre = cellCentre({ x: 3, y: 5 }, { type, sizePx });
        const expected = legacyHexCellCenter(3, 5, colSpacing, rowSpacing, isFlatTop);
        expect(sameNumbers([centre.x, centre.y], [expected.x, expected.y])).toBe(true);

        const across = (sizePx / Math.sqrt(3)) * 2;
        const extent = boardExtentPx({ width: 9, height: 7 }, { type, sizePx });
        const expectedExtent = isFlatTop
          ? [colSpacing * 8 + across, rowSpacing * 7 + rowSpacing / 2]
          : [colSpacing * 9 + colSpacing / 2, rowSpacing * 6 + across];
        expect(sameNumbers([extent.widthPx, extent.heightPx], expectedExtent)).toBe(true);
      }
    }
  });
});
