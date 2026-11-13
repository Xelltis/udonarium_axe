import { drawMask, drawRange } from '@axe/application/tabletop/piece-drawings/flat-piece-drawings';
import { floorPlace, stubPictures, wallPlace } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { RangeArea } from '@axe/domain/tabletop/range';

describe('the flat pieces', () => {
  const made: (GameTableMask | RangeArea)[] = [];

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('lays a map mask flat over its place from the picture the page takes of it', () => {
    const mask = GameTableMask.create('mask', 3, 2, 50);
    made.push(mask);
    const pictures = stubPictures();
    pictures.pages.set(mask.identifier, { url: 'blob:mask', widthPx: 150, heightPx: 100 });

    expect(drawMask(mask, floorPlace(100, 200), 50, pictures)).toMatchObject([
      { id: `${mask.identifier}#picture`, owner: mask.identifier, centre: { x: 175, y: 250 } },
    ]);
    expect(drawMask(mask, floorPlace(100, 200), 50, stubPictures())).toEqual([]);
  });

  it('lays a range over the raised ground on the floor, and flat where it is lifted or off the floor', () => {
    const range = RangeArea.create('range', 1, 3, 0.5);
    made.push(range);
    const pictures = stubPictures();
    pictures.pages.set(range.identifier, {
      url: 'blob:cells',
      widthPx: 300,
      heightPx: 200,
      offsetX: -150,
      offsetY: -100,
    });

    const onGround = drawRange(range, floorPlace(100, 200), 50, pictures);
    const lifted = drawRange(range, floorPlace(100, 200, 50), 50, pictures);
    const onWall = drawRange(range, wallPlace(100, 200), 50, pictures);

    expect(onGround).toMatchObject([{ id: `${range.identifier}#picture`, centre: { x: 100, y: 200 } }]);
    expect(onGround[0].drapes).toBeDefined();
    expect(lifted[0].drapes).toBeUndefined();
    expect(onWall[0].drapes).toBeUndefined();
  });
});
