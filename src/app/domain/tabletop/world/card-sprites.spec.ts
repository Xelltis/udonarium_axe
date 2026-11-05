import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { CardLayout, cardSprites, CardStackLayout, cardStackSprites } from '@axe/domain/tabletop/world/card-sprites';

const floor = surfaceFrame('floor', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 });

const card: CardLayout = {
  id: 'card',
  frame: floor,
  x: 100,
  y: 200,
  z: 0,
  zindex: 3,
  rotateDeg: 0,
  widthPx: 100,
  picture: { url: 'blob:front', width: 200, height: 300 },
  peek: null,
};

const stack: CardStackLayout = {
  id: 'stack',
  frame: floor,
  x: 100,
  y: 200,
  z: 0,
  zindex: 2,
  rotateDeg: 0,
  widthPx: 110,
  cardCount: 4,
  thick: true,
  top: { picture: { url: 'blob:top', width: 100, height: 150 }, rotateDeg: 180 },
  plateColour: '#21262d',
};

describe('the sprites cards are drawn with', () => {
  it('lays a card’s face flat as wide as the card, lifted a little more the higher it is in the pile', () => {
    const [face] = cardSprites(card);

    expect(face).toMatchObject({
      id: 'card#face',
      kind: 'card',
      centre: { x: 150, y: 275, z: 0.15 + 0.003 },
      widthPx: 100,
      heightPx: 150,
      look: { kind: 'picture', url: 'blob:front' },
      order: 0.15 + 0.003,
    });
  });

  it('lays the front a seat peeks at over the back, a little smaller and a little clear', () => {
    const [back, peek] = cardSprites({ ...card, peek: { url: 'blob:front', width: 100, height: 100 } });

    expect(peek).toMatchObject({ id: 'card#peek', centre: back.centre, widthPx: 90, heightPx: 90, opacity: 0.8 });
    expect(peek.order).toBe(back.order);
  });

  it('draws nothing of a card whose picture is not known yet', () => {
    expect(cardSprites({ ...card, picture: null })).toEqual([]);
  });

  it('stands a stack as thick as its cards, in layers under a plate with the top card turned on it', () => {
    const sprites = cardStackSprites(stack);

    expect(sprites.map((sprite) => sprite.id)).toEqual([
      'stack#layer-0',
      'stack#layer-1',
      'stack#layer-2',
      'stack#plate',
      'stack#top',
    ]);
    const plate = sprites[3];
    const top = sprites[4];
    // The plate reaches its rim's width past the top card's picture on every side.
    expect(plate).toMatchObject({ widthPx: 110, heightPx: 160, centre: { x: 150, y: 275 } });
    expect(plate.centre.z).toBeCloseTo(0.15 + 0.002 + 4, 9);
    expect(top).toMatchObject({ widthPx: 100, heightPx: 150, centre: plate.centre });
    expect(top.facing).not.toEqual(plate.facing);
  });

  it('thickens a stack with its cards up to a limit, in layers of two colours in turn spaced evenly through it', () => {
    const thick = cardStackSprites({ ...stack, cardCount: 200 });
    const layers = thick.filter((sprite) => sprite.id.includes('#layer-'));
    const base = 0.15 + 0.002;

    expect(layers).toHaveLength(30);
    expect(thick.find((sprite) => sprite.id === 'stack#plate')!.centre.z).toBeCloseTo(base + 60, 9);
    expect(layers.slice(0, 3).map((layer) => layer.look)).toEqual(
      ['#f5efe2', '#2a1f0d', '#f5efe2'].map((colour) => ({
        kind: 'frame',
        bands: [{ widthPx: Number.MAX_SAFE_INTEGER, colour }],
        radiusPx: 5,
      }))
    );
    expect(layers[29].centre.z).toBeCloseTo(base + (60 * 29) / 30, 9);
    const ten = cardStackSprites({ ...stack, cardCount: 10 });
    expect(ten.filter((sprite) => sprite.id.includes('#layer-'))).toHaveLength(9);
    expect(ten.find((sprite) => sprite.id === 'stack#plate')!.centre.z).toBeCloseTo(base + 10, 9);
  });

  it('lays a stack on a wall, or of one card, as a bare plate with its top card', () => {
    expect(cardStackSprites({ ...stack, thick: false }).map((sprite) => sprite.id)).toEqual([
      'stack#plate',
      'stack#top',
    ]);
    expect(cardStackSprites({ ...stack, cardCount: 1 }).map((sprite) => sprite.id)).toEqual([
      'stack#plate',
      'stack#top',
    ]);
  });

  it('lays an empty stack as a plate of its own size', () => {
    const [plate] = cardStackSprites({ ...stack, top: null, cardCount: 0 });

    expect(plate).toMatchObject({ id: 'stack#plate', widthPx: 110, heightPx: 100, centre: { x: 150, y: 245 } });
  });
});
