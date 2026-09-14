import { isAppleTouchDevice } from '@axe/core/util/apple-touch';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

describe('isAppleTouchDevice', () => {
  it('counts an iPhone and an iPad that say so', () => {
    expect(isAppleTouchDevice(IPHONE)).toBe(true);
    expect(isAppleTouchDevice(IPAD)).toBe(true);
  });

  it('counts an iPad asking for the desktop site, which calls itself a Mac that takes touches', () => {
    expect(isAppleTouchDevice(MAC_SAFARI, 5)).toBe(true);
  });

  it('leaves out a Mac without a touch screen, and anything that is not Apple', () => {
    expect(isAppleTouchDevice(MAC_SAFARI, 0)).toBe(false);
    expect(isAppleTouchDevice(MAC_SAFARI)).toBe(false);
    expect(isAppleTouchDevice(ANDROID, 5)).toBe(false);
  });
});
