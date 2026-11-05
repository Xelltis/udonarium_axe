import { lyingDrawOrder, lyingPlaceOfOwners } from '@axe/domain/tabletop/world/lying-order';
import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

const ON_FLOOR = { across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 } };

function sprite(id: string, order: number | undefined): TableWorldSprite {
  return {
    id,
    owner: id.split('#')[0],
    kind: 'card',
    centre: { x: 0, y: 0, z: order ?? 10 },
    widthPx: 10,
    heightPx: 10,
    facing: order === undefined ? 'eye' : ON_FLOOR,
    look: { kind: 'picture', url: 'a.png' },
    brightness: 1,
    twoSided: true,
    ...(order === undefined ? {} : { order }),
  };
}

describe('lyingDrawOrder', () => {
  it('draws the sprites lying flat from the lowest off its face, the earlier of two as low first', () => {
    const order = lyingDrawOrder([
      sprite('a#face', 0.151),
      sprite('hero#picture', undefined),
      sprite('b#face', 0.15),
      sprite('c#face', 0.15),
    ]);

    expect([...order].sort(([a], [b]) => a - b)).toEqual([
      [0, 2],
      [2, 0],
      [3, 1],
    ]);
  });
});

describe('lyingPlaceOfOwners', () => {
  it('places a piece by the last of its lying sprites drawn, and leaves out a piece with none', () => {
    const places = lyingPlaceOfOwners([
      sprite('deck#layer-0', 1),
      sprite('card#face', 2),
      sprite('deck#plate', 3),
      sprite('hero#picture', undefined),
    ]);

    expect(Object.fromEntries(places)).toEqual({ card: 1, deck: 2 });
  });
});
