import { hexChannels, withAlpha } from '@axe/core/util/hex-color';

describe('a colour written in hex', () => {
  it('reads three, six or eight digits, with or without the hash, leaving the opacity of eight out', () => {
    expect(hexChannels('#ff8800')).toEqual([255, 136, 0]);
    expect(hexChannels(' #fff ')).toEqual([255, 255, 255]);
    expect(hexChannels('3a7bd5')).toEqual([58, 123, 213]);
    expect(hexChannels('#ff880080')).toEqual([255, 136, 0]);
  });

  it('reads nothing from a colour written any other way', () => {
    expect(hexChannels('rgb(1, 2, 3)')).toBeNull();
    expect(hexChannels('#ff88')).toBeNull();
    expect(hexChannels('#gg8800')).toBeNull();
  });

  it('takes an opacity, and leaves a colour written any other way as it was', () => {
    expect(withAlpha('#ff5a33', 0.5)).toBe('rgba(255, 90, 51, 0.5)');
    expect(withAlpha('rgb(1, 2, 3)', 0.4)).toBe('rgb(1, 2, 3)');
  });
});
