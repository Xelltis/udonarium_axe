import { animationIntensity, flickers } from '@axe/domain/tabletop/vision-scene/light-flicker';

describe('how bright a flickering light is at a moment', () => {
  it('holds a light that neither pulses nor flickers at its full brightness', () => {
    expect(animationIntensity('none', 1234)).toBe(1);
    expect(animationIntensity(undefined, 1234)).toBe(1);
    expect(flickers('none')).toBe(false);
  });

  it('moves a pulsing or flickering light between part and full brightness', () => {
    for (const animation of ['pulse', 'flicker']) {
      expect(flickers(animation)).toBe(true);
      const readings = Array.from({ length: 50 }, (_, index) => animationIntensity(animation, index * 97));
      expect(Math.min(...readings)).toBeGreaterThanOrEqual(0.55);
      expect(Math.max(...readings)).toBeLessThanOrEqual(1);
      expect(Math.max(...readings) - Math.min(...readings)).toBeGreaterThan(0.1);
    }
  });
});
