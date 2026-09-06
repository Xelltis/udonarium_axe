import { asCutInMultiDirectionMode, CUT_IN_MULTI_DIRECTION_MODES } from '@axe/domain/tabletop/cut-in-multi-direction';

describe('asCutInMultiDirectionMode()', () => {
  it('keeps every known mode', () => {
    for (const mode of CUT_IN_MULTI_DIRECTION_MODES) expect(asCutInMultiDirectionMode(mode)).toBe(mode);
  });

  it('uses none for missing and unknown values', () => {
    expect(asCutInMultiDirectionMode(undefined)).toBe('none');
    expect(asCutInMultiDirectionMode('diagonal')).toBe('none');
    expect(asCutInMultiDirectionMode(4)).toBe('none');
  });
});
