import { edgeScrollStep } from '@axe/ui/dragging/edge-scroll';

const area = { top: 100, bottom: 700 };

describe('edgeScrollStep', () => {
  it('leaves the area alone away from its edges', () => {
    expect(edgeScrollStep(400, area)).toBe(0);
  });

  it('scrolls up near the top, faster nearer the edge', () => {
    const near = edgeScrollStep(110, area);
    const nearer = edgeScrollStep(101, area);
    expect(near).toBeLessThan(0);
    expect(nearer).toBeLessThan(near);
  });

  it('scrolls down near the bottom', () => {
    expect(edgeScrollStep(690, area)).toBeGreaterThan(0);
  });

  it('goes no faster than its most, even past the edge', () => {
    expect(edgeScrollStep(-50, area, 56, 18)).toBe(-18);
    expect(edgeScrollStep(900, area, 56, 18)).toBe(18);
  });

  it('keeps the bands within a short area', () => {
    expect(edgeScrollStep(150, { top: 100, bottom: 220 })).toBe(0);
  });
});
