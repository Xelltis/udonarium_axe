import { drawCoin } from '@axe/application/tabletop/piece-drawings/coin-drawing';
import { floorPlace, stubPictures } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Coin } from '@axe/domain/coin/coin';

describe('drawCoin', () => {
  const made: Coin[] = [];

  function coin(): Coin {
    const one = Coin.create('coin');
    made.push(one);
    return one;
  }

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('lays a coin at the middle of its cell with the side it landed on turned out', () => {
    const one = coin();
    one.face = 'back';
    one.rotate = 30;

    const drawn = drawCoin(one, floorPlace(100, 200), { gridSize: 50, poses: new Map() }, stubPictures());

    expect(drawn).toMatchObject([
      { id: one.identifier, x: 125, y: 225, radiusPx: 25, rotateDeg: 30, backUp: true, outer: { side: 'back' } },
    ]);
    expect(drawn[0].motion).toBeUndefined();
  });

  it('draws a coin of no size as one cell, and a flipping coin as its move has it', () => {
    const one = coin();
    one.size = 0;
    const pose = { across: 0, down: 0, out: 90, scale: 1.18, turnDeg: 0, flipDeg: 720, shown: 1 };
    const poses = new Map([[one.identifier, { pose, backUp: true }]]);

    const drawn = drawCoin(one, floorPlace(0, 0), { gridSize: 50, poses }, stubPictures());

    expect(drawn).toMatchObject([{ radiusPx: 25, backUp: true, motion: pose }]);
  });
});
