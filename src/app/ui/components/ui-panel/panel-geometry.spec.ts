import { fullScreenBox, leastSizeCorrection, viewportShift } from '@axe/ui/components/ui-panel/panel-geometry';

describe('fullScreenBox()', () => {
  it('fills the window from its corner', () => {
    expect(fullScreenBox({ width: 1200, height: 800 }, false)).toEqual({ left: 0, top: 0, width: 1200, height: 800 });
  });

  it('turns the window a quarter and centres it for a sideways panel', () => {
    expect(fullScreenBox({ width: 1200, height: 800 }, true)).toEqual({
      left: 200,
      top: -200,
      width: 800,
      height: 1200,
    });
  });
});

describe('viewportShift()', () => {
  const view = { width: 1000, height: 600 };

  function rect(left: number, top: number, width: number, height: number) {
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  it('leaves a panel inside the window where it is', () => {
    expect(viewportShift(rect(100, 100, 300, 200), view)).toEqual({ x: 0, y: 0 });
  });

  it('brings a panel over the near edges back to them', () => {
    expect(viewportShift(rect(-40, -15, 300, 200), view)).toEqual({ x: 40, y: 15 });
  });

  it('brings a panel over the far edges back to them', () => {
    expect(viewportShift(rect(800, 500, 300, 200), view)).toEqual({ x: -100, y: -100 });
  });

  it('centres a panel larger than the window', () => {
    expect(viewportShift(rect(100, 50, 1400, 900), view)).toEqual({ x: -300, y: -200 });
  });
});

describe('leastSizeCorrection()', () => {
  const view = { width: 1000, height: 600 };
  const least = { width: 448, height: 252 };

  it('says nothing of a panel already large enough and inside the window', () => {
    expect(leastSizeCorrection({ left: 100, top: 100, width: 640, height: 360 }, least, view)).toEqual({});
  });

  it('grows a side that is shorter than the least', () => {
    expect(leastSizeCorrection({ left: 100, top: 100, width: 300, height: 360 }, least, view)).toEqual({
      width: 448,
    });
    expect(leastSizeCorrection({ left: 100, top: 100, width: 640, height: 100 }, least, view)).toEqual({
      height: 252,
    });
  });

  it('pulls a panel back from the edge the least size would push it over', () => {
    expect(leastSizeCorrection({ left: 700, top: 500, width: 640, height: 360 }, least, view)).toEqual({
      left: 552,
      top: 348,
    });
  });

  it('stops at the corner of the window rather than going past it', () => {
    const narrow = { width: 400, height: 200 };
    expect(leastSizeCorrection({ left: 10, top: 10, width: 640, height: 360 }, least, narrow)).toEqual({
      left: 0,
      top: 0,
    });
  });

  it('leaves a side it could not read alone', () => {
    expect(leastSizeCorrection({ left: 100, top: 100, width: NaN, height: NaN }, least, view)).toEqual({});
  });
});
