import { footUnder, handsBefore, mouthBefore } from '@axe/domain/effect/scene/effect-mouth';

describe('mouthBefore()', () => {
  it('sets the mouth before the body on the side of what it is aimed at, most of half its width out', () => {
    const mouth = mouthBefore({ x: 100, y: 100, z: 0, widthPx: 50 }, [{ x: 400, y: 100 }]);

    expect(mouth.x).toBeCloseTo(120);
    expect(mouth.y).toBeCloseTo(100);
    expect(mouth.z).toBeCloseTo(30);
    expect(mouth.widthPx).toBe(50);
  });

  it('sets it further out and higher for a larger body', () => {
    const mouth = mouthBefore({ x: 100, y: 100, z: 10, widthPx: 150 }, [{ x: 100, y: 500 }]);

    expect(mouth.x).toBeCloseTo(100);
    expect(mouth.y).toBeCloseTo(160);
    expect(mouth.z).toBeCloseTo(100);
  });

  it('aims between several targets', () => {
    const mouth = mouthBefore({ x: 0, y: 0, z: 0, widthPx: 50 }, [
      { x: 300, y: 300 },
      { x: 300, y: -300 },
    ]);

    expect(mouth.x).toBeCloseTo(20);
    expect(mouth.y).toBeCloseTo(0);
  });

  it('never sets it past a target standing close, and over the body where it is aimed at nothing', () => {
    const close = mouthBefore({ x: 0, y: 0, z: 0, widthPx: 150 }, [{ x: 40, y: 0 }]);
    const none = mouthBefore({ x: 5, y: 6, z: 0, widthPx: 50 }, []);
    const same = mouthBefore({ x: 5, y: 6, z: 0, widthPx: 50 }, [{ x: 5, y: 6 }]);

    expect(close.x).toBeCloseTo(18);
    expect([none.x, none.y, none.z]).toEqual([5, 6, 30]);
    expect([same.x, same.y]).toEqual([5, 6]);
  });
});

describe('handsBefore()', () => {
  it('leaves a caster of one cell from over its middle, its hands high', () => {
    expect(handsBefore({ x: 100, y: 100, z: 10, widthPx: 50 }, [{ x: 400, y: 100 }], 50)).toEqual({
      x: 100,
      y: 100,
      z: 40,
    });
  });

  it('leaves a caster smaller than a cell as it does one of a cell', () => {
    expect(handsBefore({ x: 100, y: 100, z: 0, widthPx: 25 }, [{ x: 400, y: 100 }], 50)).toEqual({
      x: 100,
      y: 100,
      z: 30,
    });
  });

  it('leaves a larger caster before its body by as much as it is wider than a cell, and higher', () => {
    const hands = handsBefore({ x: 100, y: 100, z: 0, widthPx: 150 }, [{ x: 100, y: 500 }], 50);

    expect(hands.x).toBeCloseTo(100);
    expect(hands.y).toBeCloseTo(150);
    expect(hands.z).toBeCloseTo(90);
  });

  it('never sets them past a target standing close, and over the body where it is aimed at nothing', () => {
    const close = handsBefore({ x: 0, y: 0, z: 0, widthPx: 150 }, [{ x: 40, y: 0 }], 50);
    const none = handsBefore({ x: 5, y: 6, z: 0, widthPx: 150 }, [], 50);

    expect(close.x).toBeCloseTo(18);
    expect([none.x, none.y, none.z]).toEqual([5, 6, 90]);
  });
});

describe('footUnder()', () => {
  it('finds the floor under a caster from where its breath leaves it', () => {
    expect(footUnder(mouthBefore({ x: 0, y: 0, z: 12, widthPx: 150 }, [{ x: 300, y: 0 }]))).toBeCloseTo(12);
  });
});
