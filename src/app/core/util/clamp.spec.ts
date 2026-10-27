import { clamp, clamp01, clampOr } from '@axe/core/util/clamp';

describe('holding a number in a range', () => {
  it('keeps a value inside the range, and lets max win where min is above it', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(0);
  });

  it('holds a share between 0 and 1, reading what is not a finite number as 0', () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(3)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('falls back for anything that is not a finite number', () => {
    expect(clampOr(50, 0, 40, 7)).toBe(40);
    expect(clampOr('12', 0, 40, 7)).toBe(7);
    expect(clampOr(Number.NaN, 0, 40, 7)).toBe(7);
    expect(clampOr(undefined, 0, 40, 7)).toBe(7);
  });
});
