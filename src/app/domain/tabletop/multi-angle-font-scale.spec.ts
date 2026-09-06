import {
  asMultiAngleFontScale,
  DEFAULT_MULTI_ANGLE_FONT_SCALE,
  MULTI_ANGLE_FONT_SCALES,
  multiAngleFontScaleFactor,
} from '@axe/domain/tabletop/multi-angle-font-scale';

describe('multi-angle font scale', () => {
  it('keeps a known scale', () => {
    expect(asMultiAngleFontScale('medium')).toBe('medium');
    expect(asMultiAngleFontScale('large')).toBe('large');
  });

  it('falls back to the default for anything else', () => {
    expect(asMultiAngleFontScale('huge')).toBe(DEFAULT_MULTI_ANGLE_FONT_SCALE);
    expect(asMultiAngleFontScale(undefined)).toBe(DEFAULT_MULTI_ANGLE_FONT_SCALE);
    expect(asMultiAngleFontScale(2)).toBe(DEFAULT_MULTI_ANGLE_FONT_SCALE);
  });

  it('leaves the small scale at the original sizes', () => {
    expect(multiAngleFontScaleFactor('small')).toBe(1);
    expect(multiAngleFontScaleFactor(null)).toBe(1);
  });

  it('keeps the agreed factor for each larger scale', () => {
    expect(multiAngleFontScaleFactor('medium')).toBe(1.15);
    expect(multiAngleFontScaleFactor('large')).toBe(1.3);
  });

  it('offers exactly the three scales, smallest first', () => {
    expect(MULTI_ANGLE_FONT_SCALES).toEqual(['small', 'medium', 'large']);
    expect(DEFAULT_MULTI_ANGLE_FONT_SCALE).toBe('small');
  });
});
