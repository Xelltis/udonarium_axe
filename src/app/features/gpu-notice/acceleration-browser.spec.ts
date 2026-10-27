import { accelerationBrowserOf } from '@axe/features/gpu-notice/acceleration-browser';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

describe('accelerationBrowserOf', () => {
  it('tells Chrome, Edge and Firefox apart', () => {
    expect(accelerationBrowserOf(CHROME)).toBe('chrome');
    expect(accelerationBrowserOf(`${CHROME} Edg/156.0.0.0`)).toBe('edge');
    expect(
      accelerationBrowserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0')
    ).toBe('firefox');
  });

  it('leaves the other browsers built on Chromium, whose settings it cannot name, to the rest', () => {
    expect(accelerationBrowserOf(`${CHROME} OPR/120.0.0.0`)).toBe('other');
    expect(accelerationBrowserOf(`${CHROME} Vivaldi/7.0`)).toBe('other');
    expect(
      accelerationBrowserOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Safari/605.1.15')
    ).toBe('other');
  });
});
