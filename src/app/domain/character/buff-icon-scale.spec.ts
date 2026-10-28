import {
  BUFF_ICON_SCALES,
  type BuffIconScale,
  DEFAULT_BUFF_ICON_SCALE,
  nextBuffIconScale,
  readBuffIconScale,
} from '@axe/domain/character/buff-icon-scale';

describe('the size of the buff icons over a piece', () => {
  it('steps up through the sizes and back to the smallest', () => {
    const walked: BuffIconScale[] = [75];
    for (let step = 0; step < BUFF_ICON_SCALES.length; step++)
      walked.push(nextBuffIconScale(walked[walked.length - 1]));

    expect(walked).toEqual([75, 100, 125, 150, 200, 75]);
  });

  it('reads back a size kept as text', () => {
    expect(readBuffIconScale('150')).toBe(150);
    expect(readBuffIconScale(' 75 ')).toBe(75);
  });

  it('reads the usual size from nothing kept, an empty value, or one that is no size', () => {
    for (const kept of [null, undefined, '', '0', '130', 'large', 0]) {
      expect(readBuffIconScale(kept), String(kept)).toBe(DEFAULT_BUFF_ICON_SCALE);
    }
  });
});
