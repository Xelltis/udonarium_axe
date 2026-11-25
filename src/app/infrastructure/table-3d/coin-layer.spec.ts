import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import type { TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { CoinLayer } from '@axe/infrastructure/table-3d/coin-layer';
import type { PictureWearer } from '@axe/infrastructure/table-3d/moving-pictures';

/** A coin lying on the floor, its front showing the picture at a URL. */
function coin(pictureUrl: string): TableWorldCoin {
  return {
    id: 'coin-1',
    face: surfaceFrame('floor', { widthPx: 1000, depthPx: 1000, wallHeightPx: 500 }),
    x: 100,
    y: 100,
    base: 0,
    radiusPx: 25,
    thicknessPx: 4,
    rotateDeg: 0,
    outer: { side: 'front', pictureUrl },
    inner: { side: 'back', pictureUrl: '' },
    backUp: false,
  };
}

describe('CoinLayer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  it('has the face showing a picture wear it as it moves, to be painted again from each frame, until the coin goes', () => {
    const calledOff = vi.fn();
    const worn: { url: string; wearer: PictureWearer }[] = [];
    const layer = new CoinLayer(
      () => undefined,
      () => undefined,
      (url, wearer) => {
        worn.push({ url, wearer });
        return calledOff;
      }
    );

    layer.set([coin('blob:apng')]);

    expect(worn.map(({ url }) => url)).toEqual(['blob:apng']);
    expect(worn[0].wearer.paint).toBeTypeOf('function');

    layer.set([]);
    expect(calledOff).toHaveBeenCalledOnce();
  });
});
