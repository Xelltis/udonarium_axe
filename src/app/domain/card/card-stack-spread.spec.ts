import {
  brokenCardOffset,
  drawnCardOffset,
  splitPileIndexes,
  splitPileOffset,
} from '@axe/domain/card/card-stack-spread';

describe('where the cards of a stack spread to', () => {
  const never = () => 0;
  const always = () => 1;

  it('lays each card of one draw a step further down and to the right, grown with the grid', () => {
    expect([0, 1, 2].map((index) => drawnCardOffset(index, 50, never))).toEqual([
      { x: 100, y: 25 },
      { x: 118, y: 33 },
      { x: 136, y: 41 },
    ]);
    expect(drawnCardOffset(1, 100, always)).toEqual({ x: 336, y: 166 });
  });

  it('scatters a card of a stack broken up and a pile of one split up a little to either side', () => {
    expect(brokenCardOffset(50, never)).toEqual({ x: 25, y: 25 });
    expect(brokenCardOffset(100, always)).toEqual({ x: -50, y: -50 });
    expect(splitPileOffset(50, never)).toEqual({ x: 50, y: 50 });
    expect(splitPileOffset(25, always)).toEqual({ x: -25, y: -25 });
  });

  it('gives each pile of a split an even share of the cards from the top, the first ones longer', () => {
    expect(splitPileIndexes(4, 2)).toEqual([0, 0, 1, 1]);
    expect(splitPileIndexes(5, 2)).toEqual([0, 0, 0, 1, 1]);
    expect(splitPileIndexes(7, 3)).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(splitPileIndexes(0, 3)).toEqual([]);
  });
});
