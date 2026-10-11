import { pieceStandPx } from '@axe/domain/tabletop/first-person/first-person-stand';

describe('pieceStandPx', () => {
  it('stands a picture as wide as its ground and as tall as its proportions make it', () => {
    expect(pieceStandPx({ sizeCells: 2, gridSize: 50, aspect: 0.5 })).toEqual({ widthPx: 100, heightPx: 200 });
    expect(pieceStandPx({ sizeCells: 10, gridSize: 50, aspect: 2 })).toEqual({ widthPx: 500, heightPx: 250 });
  });

  it('stands a picture square until its proportions are known', () => {
    expect(pieceStandPx({ sizeCells: 3, gridSize: 50 })).toEqual({ widthPx: 150, heightPx: 150 });
    expect(pieceStandPx({ sizeCells: 3, gridSize: 50, aspect: 0 })).toEqual({ widthPx: 150, heightPx: 150 });
  });

  it('stands a picture given a height of its own that tall, and as wide as that makes it', () => {
    expect(pieceStandPx({ sizeCells: 1, gridSize: 50, aspect: 0.5, specifiedHeightPx: 300 })).toEqual({
      widthPx: 150,
      heightPx: 300,
    });
    expect(pieceStandPx({ sizeCells: 1, gridSize: 50, specifiedHeightPx: 300 })).toEqual({
      widthPx: 50,
      heightPx: 300,
    });
  });

  it('stands nothing for a piece of no size', () => {
    expect(pieceStandPx({ sizeCells: -1, gridSize: 50, aspect: 1 })).toEqual({ widthPx: 0, heightPx: 0 });
  });
});
