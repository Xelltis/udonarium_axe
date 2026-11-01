import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { CoinLayout, tableCoinOf } from '@axe/domain/tabletop/world/table-coins';

const coin: CoinLayout = {
  id: 'coin',
  frame: surfaceFrame('floor', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 }),
  x: 100,
  y: 200,
  z: 0,
  sizePx: 50,
  rotateDeg: 30,
  backUp: false,
  frontPictureUrl: 'blob:front',
  backPictureUrl: '',
};

describe('how a coin is drawn', () => {
  it('lays a disc as wide as the coin round its middle, lifted as the page lifts a coin, as thick as a coin is', () => {
    expect(tableCoinOf(coin)).toMatchObject({
      id: 'coin',
      x: 125,
      y: 225,
      base: 0.15,
      radiusPx: 25,
      thicknessPx: 5.5,
      rotateDeg: 30,
    });
  });

  it('keeps a small coin thick enough to see', () => {
    expect(tableCoinOf({ ...coin, sizePx: 20 })!.thicknessPx).toBe(5);
  });

  it('turns the side it landed on out of the face, and the other against it', () => {
    expect(tableCoinOf(coin)).toMatchObject({
      outer: { side: 'front', pictureUrl: 'blob:front' },
      inner: { side: 'back', pictureUrl: '' },
      backUp: false,
    });
    expect(tableCoinOf({ ...coin, backUp: true })).toMatchObject({
      outer: { side: 'back', pictureUrl: '' },
      inner: { side: 'front', pictureUrl: 'blob:front' },
      backUp: true,
    });
  });

  it('draws nothing for a coin of no size', () => {
    expect(tableCoinOf({ ...coin, sizePx: 0 })).toBeNull();
  });
});
