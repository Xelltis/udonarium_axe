import { screenDeltaToElementDelta } from '@axe/core/transform/screen-delta';

describe('screenDeltaToElementDelta()', () => {
  it('keeps pointer movement unchanged at zero degrees', () => {
    expect(screenDeltaToElementDelta(12, -7, 0)).toEqual({ x: 12, y: -7 });
  });

  it('maps downward movement to the local right edge after a clockwise quarter turn', () => {
    const delta = screenDeltaToElementDelta(0, 20, 90);
    expect(delta.x).toBeCloseTo(20);
    expect(delta.y).toBeCloseTo(0);
  });

  it('maps leftward movement to the local right edge after a half turn', () => {
    const delta = screenDeltaToElementDelta(-20, 0, 180);
    expect(delta.x).toBeCloseTo(20);
    expect(delta.y).toBeCloseTo(0);
  });

  it('maps upward movement to the local right edge after three quarter turns', () => {
    const delta = screenDeltaToElementDelta(0, -20, 270);
    expect(delta.x).toBeCloseTo(20);
    expect(delta.y).toBeCloseTo(0);
  });
});
