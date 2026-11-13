import {
  cellKey,
  cellPatternBoundingBox,
  cellPatternToSet,
  normalizeCellPattern,
  parseCellPattern,
  patternCellToWorld,
  rotateCellPattern,
  serializeCellPattern,
  worldCellToPattern,
} from '@axe/domain/tabletop/cell-pattern';

describe('cell-pattern', () => {
  describe('parseCellPattern', () => {
    it('returns nothing for an empty string', () => {
      expect(parseCellPattern('')).toEqual([]);
    });

    it('reads three cells out of a list', () => {
      expect(parseCellPattern('0,0;1,2;3,-4')).toEqual([
        { gx: 0, gy: 0 },
        { gx: 1, gy: 2 },
        { gx: 3, gy: -4 },
      ]);
    });

    it('forgives spaces and a trailing separator', () => {
      expect(parseCellPattern(' 0, 0 ; 1, 1 ; ')).toEqual([
        { gx: 0, gy: 0 },
        { gx: 1, gy: 1 },
      ]);
    });

    it('drops the repeats', () => {
      expect(parseCellPattern('1,1;1,1;2,2')).toEqual([
        { gx: 1, gy: 1 },
        { gx: 2, gy: 2 },
      ]);
    });

    it('ignores a token it cannot read', () => {
      expect(parseCellPattern('1,1;abc;2,;,3;4,5')).toEqual([
        { gx: 1, gy: 1 },
        { gx: 4, gy: 5 },
      ]);
    });
  });

  describe('serializeCellPattern', () => {
    it('rounds to whole cells and joins them', () => {
      expect(
        serializeCellPattern([
          { gx: 1.7, gy: -2.3 },
          { gx: 3, gy: 4 },
        ])
      ).toBe('1,-2;3,4');
    });

    it('drops the repeats', () => {
      expect(
        serializeCellPattern([
          { gx: 1, gy: 1 },
          { gx: 1, gy: 1 },
        ])
      ).toBe('1,1');
    });

    it('normalises through a read and a write', () => {
      const round = serializeCellPattern(parseCellPattern('0,0;1,1;0,0'));
      expect(round).toBe('0,0;1,1');
    });
  });

  describe('cellPatternBoundingBox', () => {
    it('is nothing when there are no cells', () => {
      expect(cellPatternBoundingBox([])).toEqual({
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        width: 0,
        height: 0,
      });
    });

    it('measures the extent', () => {
      expect(
        cellPatternBoundingBox([
          { gx: -1, gy: 2 },
          { gx: 3, gy: -4 },
          { gx: 0, gy: 0 },
        ])
      ).toEqual({ minX: -1, minY: -4, maxX: 3, maxY: 2, width: 5, height: 7 });
    });
  });

  describe('rotateCellPattern', () => {
    const cells = [
      { gx: 1, gy: 0 },
      { gx: 0, gy: 1 },
    ];

    it('leaves the cells alone at no turn', () => {
      expect(rotateCellPattern(cells, 0)).toEqual(cells);
    });

    it('turns the cells a quarter', () => {
      expect(rotateCellPattern(cells, 1)).toEqual([
        { gx: 0, gy: 1 },
        { gx: -1, gy: 0 },
      ]);
    });

    it('brings them back round the full turn', () => {
      expect(rotateCellPattern(cells, 4)).toEqual(cells);
    });

    it('normalises a turn the other way', () => {
      expect(rotateCellPattern(cells, -1)).toEqual(rotateCellPattern(cells, 3));
    });
  });

  describe('normalizeCellPattern', () => {
    it('puts the top left of the extent at the origin', () => {
      const normalized = normalizeCellPattern([
        { gx: 2, gy: 3 },
        { gx: 4, gy: 5 },
      ]);
      expect(normalized).toEqual([
        { gx: 0, gy: 0 },
        { gx: 2, gy: 2 },
      ]);
    });

    it('leaves an empty list empty', () => {
      expect(normalizeCellPattern([])).toEqual([]);
    });
  });

  describe('cellKey & cellPatternToSet', () => {
    it('rounds a cell key to whole numbers', () => {
      expect(cellKey(1.7, -2.3)).toBe('1,-2');
    });

    it('gathers the pattern into a set', () => {
      const set = cellPatternToSet([
        { gx: 1, gy: 2 },
        { gx: 3, gy: 4 },
        { gx: 1, gy: 2 },
      ]);
      expect(set.size).toBe(2);
      expect(set.has('1,2')).toBe(true);
      expect(set.has('3,4')).toBe(true);
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
});
