import { keepFocusFromZoomingOnAppleTouch } from '@axe/core/util/apple-input-zoom';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const PAGE_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';

describe('keepFocusFromZoomingOnAppleTouch', () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = PAGE_VIEWPORT;
    document.head.appendChild(meta);
  });

  afterEach(() => {
    meta.remove();
  });

  it('caps the scale on an iPhone, which stops the zoom onto a focused box', () => {
    keepFocusFromZoomingOnAppleTouch(document, { userAgent: IPHONE, maxTouchPoints: 5 });

    expect(meta.content).toBe(`${PAGE_VIEWPORT}, maximum-scale=1`);
  });

  it('leaves the page alone elsewhere, where the cap would take the pinch away', () => {
    keepFocusFromZoomingOnAppleTouch(document, { userAgent: ANDROID, maxTouchPoints: 5 });

    expect(meta.content).toBe(PAGE_VIEWPORT);
  });

  it('caps it only once, however often it is asked', () => {
    keepFocusFromZoomingOnAppleTouch(document, { userAgent: IPHONE, maxTouchPoints: 5 });
    keepFocusFromZoomingOnAppleTouch(document, { userAgent: IPHONE, maxTouchPoints: 5 });

    expect(meta.content.match(/maximum-scale/g)).toHaveLength(1);
  });
});
