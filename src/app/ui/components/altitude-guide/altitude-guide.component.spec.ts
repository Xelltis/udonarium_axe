import { altitudeGuideOf } from '@axe/ui/components/altitude-guide/altitude-guide.component';
import { describe, expect, it } from 'vitest';

describe('the guide to how high a piece floats', () => {
  const foot = { surface: 'floor', x: 120, y: 80, height: 10 };

  it('runs up from the face to a piece raised off it, and says how many cells', () => {
    expect(altitudeGuideOf(foot, 2, 50)).toEqual({ lifted: { ...foot, height: 110 }, ground: foot, altitude: 2 });
  });

  it('runs down from the face to a piece sunk under it, and says how many cells', () => {
    expect(altitudeGuideOf(foot, -1.5, 50)).toEqual({ lifted: { ...foot, height: -65 }, ground: foot, altitude: 1.5 });
  });

  it('is left out within half a cell of the face, and where there is no face to stand it on', () => {
    expect(altitudeGuideOf(foot, 0.4, 50)).toBeNull();
    expect(altitudeGuideOf(foot, -0.4, 50)).toBeNull();
    expect(altitudeGuideOf(null, 2, 50)).toBeNull();
  });
});
