import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  cellPathsFor,
  moveRangeOutline,
  moveRangePolygons,
  OutlineSegment,
  wayRunsOn,
} from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { legacyCellCenterOf, legacyCellIndexAt, legacyCellPolygonOf } from '@axe/testing/legacy-hex-lookup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The outline as it was drawn before, each edge checked by probing just past its midpoint. */
function legacyOutline(grid: CellGrid, cells: CellBits): OutlineSegment[] {
  const edges: OutlineSegment[] = [];
  if (grid.sizePx <= 0) return edges;
  for (let index = 0; index < cells.count; index++) {
    if (!cells.get(index)) continue;
    const centre = legacyCellCenterOf(grid, index);
    const corners = legacyCellPolygonOf(grid, index);
    for (let corner = 0; corner < corners.length; corner++) {
      const a = corners[corner];
      const b = corners[(corner + 1) % corners.length];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const beyond = legacyCellIndexAt(grid, centre.x + (midX - centre.x) * 1.2, centre.y + (midY - centre.y) * 1.2);
      if (beyond >= 0 && beyond !== index && cells.get(beyond)) continue;
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return edges;
}

function scatteredBits(count: number, seed: number): CellBits {
  let state = seed >>> 0;
  const bits = new CellBits(count);
  for (let index = 0; index < count; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    if (state / 2 ** 32 < 0.5) bits.set(index);
  }
  return bits;
}

describe('the shape of a reach against the way it was drawn before', () => {
  const types = [
    { name: 'square', type: GridType.SQUARE },
    { name: 'flat-topped hex', type: GridType.HEX_VERTICAL },
    { name: 'pointy-topped hex', type: GridType.HEX_HORIZONTAL },
  ];
  const boards: readonly (readonly [number, number])[] = [
    [6, 6],
    [1, 7],
    [7, 1],
  ];

  for (const { name, type } of types) {
    it(`draws the same outline on a ${name} grid`, () => {
      for (const [cols, rows] of boards) {
        for (const sizePx of [50, 37, 0]) {
          const grid: CellGrid = { cols, rows, sizePx, type };
          for (let seed = 1; seed <= 5; seed++) {
            const bits = scatteredBits(cols * rows, seed * 7919);
            expect(moveRangeOutline(grid, bits)).toEqual(legacyOutline(grid, bits));
          }
        }
      }
    });

    it(`fills the same polygons on a ${name} grid`, () => {
      for (const [cols, rows] of boards) {
        const grid: CellGrid = { cols, rows, sizePx: 37, type };
        const bits = scatteredBits(cols * rows, 104729);
        const expected: { x: number; y: number }[][] = [];
        for (let index = 0; index < bits.count; index++) {
          if (bits.get(index)) expected.push(legacyCellPolygonOf(grid, index));
        }
        expect(moveRangePolygons(grid, bits)).toEqual(expected);
      }
    });
  }
});

function bitsOf(count: number, indexes: number[]): CellBits {
  const bits = new CellBits(count);
  for (const index of indexes) bits.set(index);
  return bits;
}

describe('the shape a reach is drawn as', () => {
  const grid = cellGridOf(6, 6, 50, GridType.SQUARE);

  it('gives one polygon per cell reached', () => {
    const bits = bitsOf(cellCount(grid), [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1)]);
    const polygons = moveRangePolygons(grid, bits);
    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveLength(4);
  });

  it('draws all four sides of a cell standing on its own', () => {
    const bits = bitsOf(cellCount(grid), [cellIndexOf(grid, 2, 2)]);
    expect(moveRangeOutline(grid, bits)).toHaveLength(4);
  });

  it('leaves out the side two cells share', () => {
    const bits = bitsOf(cellCount(grid), [cellIndexOf(grid, 2, 2), cellIndexOf(grid, 3, 2)]);
    expect(moveRangeOutline(grid, bits)).toHaveLength(6);
  });

  it('draws all six sides of a hex standing on its own', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const hex = cellGridOf(6, 6, 50, type);
      const bits = bitsOf(cellCount(hex), [cellIndexOf(hex, 2, 2)]);
      expect(moveRangeOutline(hex, bits)).toHaveLength(6);
    }
  });

  it('leaves out the side two hexes share', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const hex = cellGridOf(6, 6, 50, type);
      const bits = bitsOf(cellCount(hex), [cellIndexOf(hex, 2, 2), cellIndexOf(hex, 2, 3)]);
      expect(moveRangeOutline(hex, bits)).toHaveLength(10);
    }
  });
});

describe('the paths a drawn reach is kept as', () => {
  const grid = cellGridOf(6, 6, 50, GridType.SQUARE);
  let traced: number;

  beforeEach(() => {
    traced = 0;
    // happy-dom has no canvas, so the paths are counted rather than drawn.
    vi.stubGlobal(
      'Path2D',
      class {
        constructor() {
          traced++;
        }
        moveTo(): void {}
        lineTo(): void {}
        closePath(): void {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('traces a set of cells once and hands the same paths back', () => {
    const cells = bitsOf(cellCount(grid), [cellIndexOf(grid, 2, 2), cellIndexOf(grid, 3, 2)]);

    const first = cellPathsFor(grid, cells);
    const second = cellPathsFor(grid, cells);

    expect(second.area).toBe(first.area);
    expect(second.border).toBe(first.border);
    expect(traced).toBe(2);
  });

  it('traces them again on a board of another size', () => {
    const cells = bitsOf(cellCount(grid), [cellIndexOf(grid, 2, 2)]);
    const first = cellPathsFor(grid, cells);

    const smaller = cellPathsFor(cellGridOf(6, 6, 37, GridType.SQUARE), cells);

    expect(smaller.area).not.toBe(first.area);
    expect(traced).toBe(4);
  });

  it('traces them again on a board whose cells are numbered differently', () => {
    const cells = bitsOf(cellCount(grid), [cellIndexOf(grid, 2, 2)]);
    const first = cellPathsFor(grid, cells);

    const hex = cellPathsFor(cellGridOf(6, 6, 50, GridType.HEX_VERTICAL), cells);

    expect(hex.area).not.toBe(first.area);
    expect(traced).toBe(4);
  });
});

describe('wayRunsOn', () => {
  /** A layer holding the cells given, as the raised ground on a board reads. */
  function raised(...cells: number[]): (cell: number) => boolean {
    return (cell) => cells.includes(cell);
  }

  it('takes the whole way where all of it lies on the layer', () => {
    expect(wayRunsOn([1, 2, 3], raised(1, 2, 3))).toEqual([[1, 2, 3]]);
  });

  it('takes none of it where none of it does', () => {
    expect(wayRunsOn([1, 2, 3], raised(8))).toEqual([]);
  });

  it('carries the step onto the layer with it, so the line climbs the ledge', () => {
    expect(wayRunsOn([1, 2, 3, 4], raised(3, 4))).toEqual([[2, 3, 4]]);
    expect(wayRunsOn([1, 2, 3, 4], raised(1, 2))).toEqual([[1, 2, 3]]);
  });

  it('breaks a way that leaves the layer and comes back into two runs', () => {
    expect(wayRunsOn([1, 2, 3, 4, 5, 6], raised(1, 6))).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  it('has nothing to draw for a way of one cell or none', () => {
    expect(wayRunsOn([1], raised(1))).toEqual([]);
    expect(wayRunsOn([], raised(1))).toEqual([]);
  });
});
