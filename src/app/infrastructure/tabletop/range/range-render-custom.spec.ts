import { CellCoord } from '@axe/domain/tabletop/cell-pattern';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  makeCustomHitTest,
  patternCellToWorld,
  worldCellToPattern,
} from '@axe/infrastructure/tabletop/range/range-render-custom';
import { RangeRenderSetting } from '@axe/infrastructure/tabletop/range/range-render-types';

function makeSetting(overrides: Partial<RangeRenderSetting> = {}): RangeRenderSetting {
  return {
    areaWidth: 10,
    areaHeight: 10,
    range: 1,
    width: 1,
    centerX: 525,
    centerY: 175,
    gridSize: 50,
    type: 'CUSTOM',
    gridColor: '#FFFF00',
    rangeColor: '#000000',
    fanDegree: 0,
    degree: 0,
    offSetX: false,
    offSetY: false,
    fillOutLine: false,
    gridType: GridType.SQUARE,
    isDocking: false,
    ...overrides,
  };
}

describe('makeCustomHitTest', () => {
  describe('square grid (centerX=525, centerY=175 i.e. baseCell=10,3)', () => {
    const setting = makeSetting();
    const cells: CellCoord[] = [
      { gx: 0, gy: 0 },
      { gx: 1, gy: 0 },
      { gx: 2, gy: 0 },
      { gx: 3, gy: 0 },
      { gx: 3, gy: -1 },
      { gx: 3, gy: 1 },
    ];
    const hit = makeCustomHitTest(setting, cells);

    it('hits the origin cell', () => {
      expect(hit(0, 0)).toBe(true);
    });

    it('hits the centre of the cell to the right', () => {
      expect(hit(50, 0)).toBe(true);
    });

    it('hits the centre three cells to the right', () => {
      expect(hit(150, 0)).toBe(true);
    });

    it('hits three cells right and one up', () => {
      expect(hit(150, -50)).toBe(true);
    });

    it('hits three cells right and one down', () => {
      expect(hit(150, 50)).toBe(true);
    });

    it('misses a cell outside the pattern', () => {
      expect(hit(200, 0)).toBe(false);
    });

    it('misses the cell to the left', () => {
      expect(hit(-50, 0)).toBe(false);
    });
  });

  describe('square grid (centerX=540, centerY=185 i.e. baseCell=10,3 but offset)', () => {
    // The centre of the range does not sit on a cell boundary: the base cell is the same, but
    // an offset of zero points away from that cell's centre.
    const setting = makeSetting({ centerX: 540, centerY: 185 });
    const cells: CellCoord[] = [
      { gx: 0, gy: 0 },
      { gx: 1, gy: 0 },
    ];
    const hit = makeCustomHitTest(setting, cells);

    it('hits the centre of the base cell', () => {
      // the base cell centre, the range centre, and the difference between them
      expect(hit(-15, -10)).toBe(true);
    });

    it('hits the centre of the cell to the right', () => {
      // that cell's centre, the range centre, and the difference between them
      expect(hit(35, -10)).toBe(true);
    });

    it('puts the boundary on the near side into the base cell', () => {
      // worldX = 540 + (-15) = 525 → col = 10
      expect(hit(-15, 0)).toBe(true);
    });

    it('puts the boundary on the far side into the next cell, which the pattern covers', () => {
      // worldX = 540 + 10 = 550 → col = 11
      expect(hit(10, 0)).toBe(true);
    });

    it('puts a hair further out into the cell before, which it does not', () => {
      // worldX = 540 - 16 = 524 → col = 10... wait floor(524/50) = 10. Actually let's pick worldX = 499 → col = 9
      expect(hit(-41, 0)).toBe(false);
    });
  });

  describe('hex grid (HEX_HORIZONTAL)', () => {
    const setting = makeSetting({
      centerX: 525,
      centerY: 175,
      gridType: GridType.HEX_HORIZONTAL,
    });
    const cells: CellCoord[] = [
      { gx: 0, gy: 0 },
      { gx: 1, gy: 0 },
      { gx: 2, gy: 0 },
    ];
    const hit = makeCustomHitTest(setting, cells);

    it('hits the origin cell', () => {
      expect(hit(0, 0)).toBe(true);
    });

    it('hits the centre of the hex to the right', () => {
      // hex-horizontal: colSpacing = gridSize = 50
      expect(hit(50, 0)).toBe(true);
    });
  });

  describe('patternCellToWorld / worldCellToPattern (pointy-top)', () => {
    it('keeps the column on an even row', () => {
      expect(patternCellToWorld(10, 2, 0, 1, false)).toEqual({ col: 10, row: 3 });
    });

    it('shifts the column by one on an odd row, so the pattern is not mirrored', () => {
      expect(patternCellToWorld(10, 3, 0, 1, false)).toEqual({ col: 11, row: 4 });
    });

    it('leaves an even offset from an odd row as it is', () => {
      expect(patternCellToWorld(10, 3, 0, 2, false)).toEqual({ col: 10, row: 5 });
    });

    it('shifts upwards from an odd row by one as well', () => {
      expect(patternCellToWorld(10, 3, 0, -1, false)).toEqual({ col: 11, row: 2 });
    });

    it('makes the round trip from pattern to board and back', () => {
      const cases: { gx: number; gy: number }[] = [
        { gx: 0, gy: 0 },
        { gx: 1, gy: 0 },
        { gx: 0, gy: 1 },
        { gx: 0, gy: -1 },
        { gx: 2, gy: -3 },
      ];
      for (const baseRow of [0, 1, 2, 3, -1, -2]) {
        for (const c of cases) {
          const w = patternCellToWorld(10, baseRow, c.gx, c.gy, false);
          const p = worldCellToPattern(10, baseRow, w.col, w.row, false);
          expect(p, `baseRow=${baseRow} (${c.gx},${c.gy})`).toEqual(c);
        }
      }
    });
  });

  describe('patternCellToWorld / worldCellToPattern (flat-top)', () => {
    it('keeps the row on an even column', () => {
      expect(patternCellToWorld(2, 10, 1, 0, true)).toEqual({ col: 3, row: 10 });
    });

    it('shifts the row by one on an odd column', () => {
      expect(patternCellToWorld(3, 10, 1, 0, true)).toEqual({ col: 4, row: 11 });
    });

    it('leaves an even offset from an odd column as it is', () => {
      expect(patternCellToWorld(3, 10, 2, 0, true)).toEqual({ col: 5, row: 10 });
    });

    it('makes the round trip on a flat-topped grid too', () => {
      const cases: { gx: number; gy: number }[] = [
        { gx: 0, gy: 0 },
        { gx: 1, gy: 0 },
        { gx: -1, gy: 0 },
        { gx: 1, gy: 1 },
        { gx: 3, gy: -2 },
      ];
      for (const baseCol of [0, 1, 2, 3, -1, -2]) {
        for (const c of cases) {
          const w = patternCellToWorld(baseCol, 10, c.gx, c.gy, true);
          const p = worldCellToPattern(baseCol, 10, w.col, w.row, true);
          expect(p, `baseCol=${baseCol} (${c.gx},${c.gy})`).toEqual(c);
        }
      }
    });
  });

  describe('keeps the shape of the pattern from an odd row', () => {
    // three cells in a column
    const cells: CellCoord[] = [
      { gx: 0, gy: -1 },
      { gx: 0, gy: 0 },
      { gx: 0, gy: 1 },
    ];

    it('hits all three from an even row', () => {
      // with the centre on a hex of an even row
      // hex-horizontal, gridSize=50, row=2: rowSpacing = 1.5*s = 1.5*(50/sqrt(3)) ≈ 43.3
      // row 2 center y ≈ 86.6
      const setting = makeSetting({
        centerX: 0, // col=0 even row → x = 0
        centerY: 0, // row=0
        gridType: GridType.HEX_HORIZONTAL,
      });
      const hit = makeCustomHitTest(setting, cells);
      // no offset lands on the origin cell
      expect(hit(0, 0)).toBe(true);
      // a row's offset lands on the cell below, half a hex to the right
      const rowSpacing = (1.5 * 50) / Math.sqrt(3);
      expect(hit(50 / 2, rowSpacing)).toBe(true);
      // and the same offset upwards lands on the cell above
      expect(hit(50 / 2, -rowSpacing)).toBe(true);
    });
  });
});
