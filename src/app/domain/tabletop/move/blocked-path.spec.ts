import { clearRunAlong, MoveBlock, turnedMoveBlock } from '@axe/domain/tabletop/move/blocked-path';

describe('clearRunAlong', () => {
  const wall: MoveBlock = { minX: 100, minY: 0, maxX: 200, maxY: 200 };

  it('lets a piece all the way when nothing stands between', () => {
    expect(clearRunAlong({ x: 0, y: 300 }, { x: 400, y: 300 }, [wall])).toBe(1);
    expect(clearRunAlong({ x: 0, y: 100 }, { x: 90, y: 100 }, [wall])).toBe(1);
  });

  it('stops it at the near face of what is in the way', () => {
    expect(clearRunAlong({ x: 0, y: 100 }, { x: 400, y: 100 }, [wall])).toBeCloseTo(0.25);
  });

  it('stops it at the nearest of several', () => {
    const far: MoveBlock = { minX: 300, minY: 0, maxX: 400, maxY: 200 };

    expect(clearRunAlong({ x: 0, y: 100 }, { x: 400, y: 100 }, [far, wall])).toBeCloseTo(0.25);
  });

  it('lets a piece standing in one walk out of it', () => {
    expect(clearRunAlong({ x: 150, y: 100 }, { x: 400, y: 100 }, [wall])).toBe(1);
  });

  it('lets a piece walk up to a face it is already touching without holding it there', () => {
    expect(clearRunAlong({ x: 100, y: 100 }, { x: 0, y: 100 }, [wall])).toBe(1);
  });

  it('holds a piece where it stands when it starts against the face', () => {
    expect(clearRunAlong({ x: 99.9, y: 100 }, { x: 400, y: 100 }, [wall])).toBeCloseTo(0.00033, 4);
  });

  it('holds a piece resting against a face rather than reading it as already inside', () => {
    expect(clearRunAlong({ x: 200, y: 100 }, { x: 0, y: 100 }, [wall])).toBe(0);
    expect(clearRunAlong({ x: 100, y: 100 }, { x: 400, y: 100 }, [wall])).toBe(0);
  });

  it('stops short of the face by the gap it is given', () => {
    expect(clearRunAlong({ x: 0, y: 100 }, { x: 400, y: 100 }, [wall], 4)).toBeCloseTo(0.24);
    expect(clearRunAlong({ x: 0, y: 100 }, { x: 400, y: 100 }, [wall], 0)).toBeCloseTo(0.25);
  });

  it('keeps a clear way clear however wide the gap', () => {
    expect(clearRunAlong({ x: 0, y: 300 }, { x: 400, y: 300 }, [wall], 40)).toBe(1);
  });

  it('gives no ground at all rather than backing a piece away from where it stands', () => {
    expect(clearRunAlong({ x: 99, y: 100 }, { x: 400, y: 100 }, [wall], 40)).toBe(0);
  });

  it('answers for a way that goes nowhere', () => {
    expect(clearRunAlong({ x: 0, y: 0 }, { x: 0, y: 0 }, [wall])).toBe(1);
  });

  it('passes a block the way runs alongside without ever entering', () => {
    expect(clearRunAlong({ x: 0, y: 250 }, { x: 400, y: 250 }, [wall])).toBe(1);
  });

  it('reads a way that runs square on one axis', () => {
    // Down the same column at x 150, stopped where the wall's far edge stands at y 200.
    expect(clearRunAlong({ x: 150, y: 400 }, { x: 150, y: 100 }, [wall])).toBeCloseTo(2 / 3);
    expect(clearRunAlong({ x: 150, y: 600 }, { x: 150, y: 100 }, [wall])).toBeCloseTo(0.8);
  });

  it('is clear with nothing in the way at all', () => {
    expect(clearRunAlong({ x: 0, y: 0 }, { x: 400, y: 400 }, [])).toBe(1);
  });
});

describe('clearRunAlong past a turned block', () => {
  /** Two hundred square about 300, 100, turned an eighth round: a diamond with corners 141.4 out. */
  const diamond: MoveBlock = { minX: 200, minY: 0, maxX: 400, maxY: 200, rotate: 45 };
  const reach = 100 * Math.SQRT2;

  it('stops a piece at the corner it walks straight at', () => {
    expect(clearRunAlong({ x: 0, y: 100 }, { x: 400, y: 100 }, [diamond])).toBeCloseTo((300 - reach) / 400, 6);
  });

  it('stops a piece passing off the middle at the face, further in than the box that holds it', () => {
    // 100 below the middle the diamond is 41.4 either side of it.
    expect(clearRunAlong({ x: 0, y: 200 }, { x: 400, y: 200 }, [diamond])).toBeCloseTo((300 - (reach - 100)) / 400, 6);
  });

  it('lets a piece through the corner of that box, where the block is not', () => {
    // Alongside the lower left face and 20 clear of it, crossing the box's corner on the way.
    expect(clearRunAlong({ x: 150, y: 120 }, { x: 270, y: 240 }, [diamond])).toBe(1);
  });

  it('lets a piece standing in it walk out of it', () => {
    expect(clearRunAlong({ x: 300, y: 100 }, { x: 0, y: 100 }, [diamond])).toBe(1);
  });
});

describe('turnedMoveBlock', () => {
  const box: MoveBlock = { minX: 0, minY: 0, maxX: 200, maxY: 50 };

  it('grows a block square to the table by the overhang as it is', () => {
    expect(turnedMoveBlock(box, 0, 25, 0)).toEqual({ minX: -25, minY: 0, maxX: 225, maxY: 50, rotate: 0 });
  });

  it('lays the overhang along the sides of a block turned a quarter round', () => {
    const grown = turnedMoveBlock(box, 90, 25, 0);

    expect(grown.minX).toBeCloseTo(0, 6);
    expect(grown.minY).toBeCloseTo(-25, 6);
    expect(grown.maxY).toBeCloseTo(75, 6);
    expect(grown.rotate).toBe(90);
  });
});
