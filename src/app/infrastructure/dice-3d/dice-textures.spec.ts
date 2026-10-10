import { lookFor } from '@axe/infrastructure/dice-3d/dice-textures';

describe('lookFor', () => {
  it('inks a dark die in light and a light die in dark', () => {
    expect(lookFor('#000000').ink).toBe('#f6f3ec');
    expect(lookFor('#202024').ink).toBe('#f6f3ec');
    expect(lookFor('#f2efe6').ink).toBe('#161616');
    expect(lookFor('#e8c547').ink).toBe('#161616');
  });

  it('keeps the colour it was given for the body', () => {
    expect(lookFor('#3b5bdb').body).toBe('rgb(59, 91, 219)');
    expect(lookFor('#fff').body).toBe('rgb(255, 255, 255)');
    expect(lookFor('rgb(10, 20, 30)').body).toBe('rgb(10, 20, 30)');
  });

  it('paints the one pip red, unless the die is red itself', () => {
    expect(lookFor('#000000').accent).toBe('#c8102e');
    expect(lookFor('#3b5bdb').accent).toBe('#c8102e');
    const red = lookFor('#c8102e');
    expect(red.accent).toBe(red.ink);
  });

  it('falls back to a dark die for a colour it cannot read', () => {
    expect(lookFor('').body).toBe('rgb(32, 32, 36)');
    expect(lookFor('not a colour').ink).toBe('#f6f3ec');
  });

  it('inks the numbers in the colour asked for, whatever the body', () => {
    expect(lookFor('#000000', '#e8c547').ink).toBe('rgb(232, 197, 71)');
    expect(lookFor('#f2efe6', '#1e6b52').ink).toBe('rgb(30, 107, 82)');
    expect(lookFor('#3b5bdb', '').ink).toBe('#f6f3ec');
  });
});
