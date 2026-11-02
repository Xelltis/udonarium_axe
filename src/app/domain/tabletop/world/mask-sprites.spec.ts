import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { MaskLayout, maskSprites } from '@axe/domain/tabletop/world/mask-sprites';

const mask: MaskLayout = {
  id: 'mask',
  frame: surfaceFrame('floor', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 }),
  x: 100,
  y: 200,
  z: 0,
  altitudePx: 50,
  picture: { url: 'blob:mask', widthPx: 150, heightPx: 100 },
};

describe('the sprite a map mask is drawn with', () => {
  it('lays the picture of the mask flat over its place, at its altitude, lifted as the page lifts a mask', () => {
    expect(maskSprites(mask)).toMatchObject([
      {
        id: 'mask#cover',
        kind: 'game-table-mask',
        centre: { x: 175, y: 250, z: 50.1 },
        widthPx: 150,
        heightPx: 100,
        look: { kind: 'picture', url: 'blob:mask' },
        order: 50.1,
      },
    ]);
  });

  it('draws nothing of a mask not pictured yet', () => {
    expect(maskSprites({ ...mask, picture: null })).toEqual([]);
  });
});
