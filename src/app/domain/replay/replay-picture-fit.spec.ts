import { containRect, coverRect } from '@axe/domain/replay/replay-picture-fit';

describe('coverRect() / containRect()', () => {
  it('covers the whole screen with the background', () => {
    const rect = coverRect({ width: 100, height: 100 }, { width: 400, height: 200 });

    expect(rect.width).toBe(400);
    expect(rect.height).toBe(400);
    expect(rect.y).toBe(-100);
  });

  it('fits it exactly to the screen when its size is unknown', () => {
    expect(coverRect({ width: 0, height: 0 }, { width: 400, height: 200 })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
  });

  it('fits a portrait to its frame without stretching it', () => {
    expect(containRect({ width: 200, height: 400 }, 100, 400)).toEqual({ width: 100, height: 200 });
    expect(containRect({ width: 50, height: 50 }, 500, 500)).toEqual({ width: 50, height: 50 });
    expect(containRect({ width: 0, height: 0 }, 500, 500)).toEqual({ width: 0, height: 0 });
  });
});
