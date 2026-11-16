import { cappedPixelRatio, MOST_PIXEL_RATIO } from '@axe/infrastructure/three-kit/pixel-ratio';

describe('cappedPixelRatio', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('holds a fine screen to the most a canvas is drawn at', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect(cappedPixelRatio()).toBe(MOST_PIXEL_RATIO);
  });

  it('keeps a coarser screen as it is', () => {
    vi.stubGlobal('devicePixelRatio', 1.5);
    expect(cappedPixelRatio()).toBe(1.5);
  });

  it('draws one for one where the page says nothing', () => {
    vi.stubGlobal('devicePixelRatio', 0);
    expect(cappedPixelRatio()).toBe(1);
  });
});
