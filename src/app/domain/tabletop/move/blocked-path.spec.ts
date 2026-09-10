import { clearRunAlong, MoveBlock } from '@axe/domain/tabletop/move/blocked-path';

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
