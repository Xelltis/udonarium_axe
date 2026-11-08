import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { LightSourceLayout, lightSourceSprites } from '@axe/domain/tabletop/world/light-source-sprites';

const light: LightSourceLayout = {
  id: 'light',
  frame: surfaceFrame('floor', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 }),
  x: 100,
  y: 200,
  z: 10,
  altitudePx: 50,
  cellPx: 50,
  lit: true,
  picture: { url: 'blob:bulb', widthPx: 36, heightPx: 36 },
};

describe('the sprite a light source is drawn with', () => {
  it('turns what marks the light to the reader, half a cell over its altitude, lifted again by how far it stands off the face', () => {
    expect(lightSourceSprites(light)).toMatchObject([
      {
        id: 'light#mark',
        kind: 'light-source',
        centre: { x: 125, y: 225, z: 10 + 0.25 + 50 + 10 + 25 },
        widthPx: 36,
        heightPx: 36,
        facing: 'eye',
      },
    ]);
  });

  it('draws a light put out a little clear, and nothing of one not pictured yet', () => {
    expect(lightSourceSprites({ ...light, lit: false })[0].opacity).toBe(0.4);
    expect(lightSourceSprites({ ...light, picture: null })).toEqual([]);
  });
});
