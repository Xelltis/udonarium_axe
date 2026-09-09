import {
  perimeterSegments,
  rectangleSegments,
  segmentBlocks,
  segmentClear,
  segmentsAbove,
  segmentsCross,
} from '@axe/domain/tabletop/los/segments';

describe('los/segments', () => {
  describe('rectangleSegments', () => {
    it('returns the four sides of an unturned rectangle', () => {
      const segments = rectangleSegments(0, 0, 100, 100, 0);
      expect(segments).toHaveLength(4);
      expect(segments[0]).toEqual({ x1: 0, y1: 0, x2: 100, y2: 0 });
      expect(segments[2]).toEqual({ x1: 100, y1: 100, x2: 0, y2: 100 });
    });

    it('swings the corners about the centre as it turns', () => {
      const segments = rectangleSegments(0, 0, 100, 20, 90);
      const xs = segments.map((s) => s.x1);
      const ys = segments.map((s) => s.y1);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100);
    });
  });

  describe('perimeterSegments', () => {
    it('returns the four sides of the table', () => {
      expect(perimeterSegments(1000, 800)).toHaveLength(4);
    });
  });

  describe('segmentsCross', () => {
    it('is true for two segments that cross', () => {
      expect(segmentsCross(0, 0, 100, 0, 50, -50, 50, 50)).toBe(true);
    });
    it('is false for two that do not', () => {
      expect(segmentsCross(0, 0, 100, 0, 0, 50, 100, 50)).toBe(false);
    });
    it('is false where one only touches the end of the other', () => {
      expect(segmentsCross(0, 0, 100, 0, 50, 0, 50, 50)).toBe(false);
    });
  });

  describe('segmentClear', () => {
    const wall = [{ x1: 50, y1: -50, x2: 50, y2: 50 }];
    it('is blocked by a wall between them', () => {
      expect(segmentClear(0, 0, 100, 0, wall)).toBe(false);
    });
    it('passes where no wall stands between', () => {
      expect(segmentClear(0, 0, 0, 100, wall)).toBe(true);
    });
    it('always passes with no walls at all', () => {
      expect(segmentClear(0, 0, 100, 0, [])).toBe(true);
    });
  });
});

describe('segmentsAbove()', () => {
  const low = { x1: 0, y1: 0, x2: 10, y2: 0, heightPx: 50 };
  const high = { x1: 0, y1: 10, x2: 10, y2: 10, heightPx: 300 };
  const edgeOfTable = { x1: 0, y1: 20, x2: 10, y2: 20 };

  it('leaves everything standing for an eye on the ground', () => {
    expect(segmentsAbove([low, high, edgeOfTable], 0)).toHaveLength(3);
  });

  it('drops what the eye has climbed above', () => {
    expect(segmentsAbove([low, high, edgeOfTable], 100)).toEqual([high, edgeOfTable]);
  });

  it('keeps what the eye is level with, an eye at the top of a wall seeing none of the far side', () => {
    expect(segmentsAbove([low], 50)).toEqual([low]);
  });

  it('never drops the edge of the table, whose height nobody has said', () => {
    expect(segmentsAbove([edgeOfTable], 100_000)).toEqual([edgeOfTable]);
  });

  it('hands the same answer back rather than working the list through again', () => {
    const list = [low, high, edgeOfTable];

    expect(segmentsAbove(list, 100)).toBe(segmentsAbove(list, 100));
  });

  it('keeps an answer per height, and per list', () => {
    const list = [low, high, edgeOfTable];
    const other = [low, high, edgeOfTable];

    expect(segmentsAbove(list, 100)).toEqual([high, edgeOfTable]);
    expect(segmentsAbove(list, 400)).toEqual([edgeOfTable]);
    expect(segmentsAbove(other, 100)).not.toBe(segmentsAbove(list, 100));
    expect(segmentsAbove(other, 100)).toEqual(segmentsAbove(list, 100));
  });
});

describe('segmentBlocks()', () => {
  const wall = { x1: 50, y1: -50, x2: 50, y2: 50, heightPx: 100 };
  const bridge = { ...wall, basePx: 100, heightPx: 150 };
  const edgeOfTable = { x1: 50, y1: -50, x2: 50, y2: 50 };

  it('stops a look that passes below the top of a wall', () => {
    expect(segmentBlocks(0, 0, 0, 100, 0, 0, wall)).toBe(true);
  });

  it('lets a look pass over the top of a wall', () => {
    expect(segmentBlocks(0, 0, 200, 100, 0, 200, wall)).toBe(false);
  });

  it('lets a look pass under something that hangs in the air', () => {
    expect(segmentBlocks(0, 0, 0, 100, 0, 0, bridge)).toBe(false);
  });

  it('lets a look pass over something that hangs in the air', () => {
    expect(segmentBlocks(0, 0, 200, 100, 0, 200, bridge)).toBe(false);
  });

  it('stops a look that runs through what hangs in the air', () => {
    expect(segmentBlocks(0, 0, 120, 100, 0, 120, bridge)).toBe(true);
  });

  it('takes the height the look has risen to where it passes, not where it began', () => {
    expect(segmentBlocks(0, 0, 0, 100, 0, 300, bridge)).toBe(true);
    expect(segmentBlocks(0, 0, 0, 100, 0, 100, bridge)).toBe(false);
  });

  it('stops anything at any height where nobody has said how tall it is', () => {
    expect(segmentBlocks(0, 0, 10_000, 100, 0, 10_000, edgeOfTable)).toBe(true);
  });

  it('reaches the ground where nobody has said where it begins', () => {
    expect(segmentBlocks(0, 0, 1, 100, 0, 1, wall)).toBe(true);
  });

  it('is not in the way of a look that misses it', () => {
    expect(segmentBlocks(0, 0, 0, 0, 100, 0, bridge)).toBe(false);
  });
});

describe('segmentsAbove() with something that hangs in the air', () => {
  const bridge = { x1: 0, y1: 0, x2: 10, y2: 0, basePx: 100, heightPx: 150 };
  const onTheFloor = { x1: 0, y1: 10, x2: 10, y2: 10, basePx: 0, heightPx: 150 };

  it('keeps what hangs in the air even for an eye above it', () => {
    expect(segmentsAbove([bridge], 400)).toEqual([bridge]);
  });

  it('drops what stands on the floor as before, a bottom of zero being no bottom at all', () => {
    expect(segmentsAbove([onTheFloor], 400)).toEqual([]);
  });
});
