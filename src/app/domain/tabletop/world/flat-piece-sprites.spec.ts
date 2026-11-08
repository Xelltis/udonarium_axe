import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { FlatPieceLayout, maskSprites, rangeSprites } from '@axe/domain/tabletop/world/flat-piece-sprites';

const mask: FlatPieceLayout = {
  id: 'mask',
  frame: surfaceFrame('floor', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 }),
  x: 100,
  y: 200,
  z: 0,
  altitudePx: 50,
  picture: { url: 'blob:mask', widthPx: 150, heightPx: 100 },
};

describe('the sprites of pieces the page draws flat', () => {
  it('lays the picture of the mask flat over its place, at its altitude, lifted as the page lifts a mask', () => {
    expect(maskSprites(mask)).toMatchObject([
      {
        id: 'mask#picture',
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

  it('lays the picture of a range’s cells off its place as far as the page lays them, lifted as the page lifts a range', () => {
    const [cells] = rangeSprites({
      ...mask,
      id: 'range',
      picture: { url: 'blob:cells', widthPx: 300, heightPx: 200, offsetX: -150, offsetY: -100 },
    });

    expect(cells).toMatchObject({ id: 'range#picture', kind: 'range', centre: { x: 100, y: 200, z: 50.25 } });
  });
});
