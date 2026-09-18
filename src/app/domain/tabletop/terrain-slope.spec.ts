import {
  encodeSlopeSides,
  FLAT_TOP_SLOPE_SIDES,
  legacySlopeDirection,
  parseSlopeSides,
  POINTY_TOP_SLOPE_SIDES,
  SlopeDirection,
  slopeSideNormal,
  slopeSidesOfGrid,
  slopeSidesOn,
  SQUARE_SLOPE_SIDES,
} from '@axe/domain/tabletop/terrain-slope';

describe('the sides a block slopes to', () => {
  describe('the sides a grid offers', () => {
    it('gives a square four and a hex six', () => {
      expect(slopeSidesOfGrid('square')).toEqual(SQUARE_SLOPE_SIDES);
      expect(slopeSidesOfGrid('flatTop')).toEqual(FLAT_TOP_SLOPE_SIDES);
      expect(slopeSidesOfGrid('pointyTop')).toEqual(POINTY_TOP_SLOPE_SIDES);
      expect(slopeSidesOfGrid('flatTop')).toHaveLength(6);
      expect(slopeSidesOfGrid('pointyTop')).toHaveLength(6);
    });

    it('points each side the way it is named, with y running down the screen', () => {
      expect(slopeSideNormal('n').y).toBeCloseTo(-1);
      expect(slopeSideNormal('s').y).toBeCloseTo(1);
      expect(slopeSideNormal('e').x).toBeCloseTo(1);
      expect(slopeSideNormal('w').x).toBeCloseTo(-1);
      expect(slopeSideNormal('ne')).toEqual({
        x: expect.closeTo(Math.SQRT1_2, 6),
        y: expect.closeTo(-Math.SQRT1_2, 6),
      });
    });
  });

  describe('reading what a block holds', () => {
    it('reads the sides it is given, clockwise from the top of the screen', () => {
      expect(parseSlopeSides('e,n')).toEqual(['n', 'e']);
      expect(parseSlopeSides('n ne se s sw nw')).toEqual(['n', 'ne', 'se', 's', 'sw', 'nw']);
    });

    it('reads a room saved before a block could slope to more than one side', () => {
      expect(parseSlopeSides('', SlopeDirection.BOTTOM)).toEqual(['s']);
      expect(parseSlopeSides('', SlopeDirection.TOP)).toEqual(['n']);
      expect(parseSlopeSides('', SlopeDirection.LEFT)).toEqual(['w']);
      expect(parseSlopeSides('', SlopeDirection.RIGHT)).toEqual(['e']);
    });

    it('reads a block that slopes to nothing as flat', () => {
      expect(parseSlopeSides('')).toEqual([]);
      expect(parseSlopeSides(undefined, SlopeDirection.NONE)).toEqual([]);
      expect(parseSlopeSides('up,down', SlopeDirection.NONE)).toEqual([]);
    });

    it('falls back to the old single direction for text that names nothing', () => {
      expect(parseSlopeSides('up,down', SlopeDirection.LEFT)).toEqual(['w']);
    });

    it('takes each side once', () => {
      expect(parseSlopeSides('n,n,N')).toEqual(['n']);
    });
  });

  describe('writing the sides back', () => {
    it('comes back as it went in', () => {
      expect(parseSlopeSides(encodeSlopeSides(['sw', 'n']))).toEqual(['n', 'sw']);
    });

    it('writes a block that slopes to nothing as empty', () => {
      expect(encodeSlopeSides([])).toBe('');
    });
  });

  describe('what an older peer is told', () => {
    it('hands over the first side it knows of', () => {
      expect(legacySlopeDirection(['s'])).toBe(SlopeDirection.BOTTOM);
      expect(legacySlopeDirection(['ne', 'e'])).toBe(SlopeDirection.RIGHT);
    });

    it('leaves a block flat where it slopes to no side an older peer knows', () => {
      expect(legacySlopeDirection([])).toBe(SlopeDirection.NONE);
      expect(legacySlopeDirection(['ne', 'nw'])).toBe(SlopeDirection.NONE);
    });
  });

  describe('a block on a grid whose sides have changed under it', () => {
    it('keeps the sides the grid has', () => {
      expect(slopeSidesOn(['n', 'e'], SQUARE_SLOPE_SIDES)).toEqual(['n', 'e']);
    });

    it('takes a side the grid has not as the one it points nearest to', () => {
      expect(slopeSidesOn(['n'], POINTY_TOP_SLOPE_SIDES)).toEqual(['ne']);
      expect(slopeSidesOn(['e'], FLAT_TOP_SLOPE_SIDES)).toEqual(['ne']);
      expect(slopeSidesOn(['ne'], SQUARE_SLOPE_SIDES)).toEqual(['n']);
    });

    it('leaves one side where two point at the same one', () => {
      expect(slopeSidesOn(['ne', 'nw'], SQUARE_SLOPE_SIDES)).toEqual(['n']);
      expect(slopeSidesOn(['n', 'ne'], FLAT_TOP_SLOPE_SIDES)).toEqual(['n', 'ne']);
    });
  });
});
