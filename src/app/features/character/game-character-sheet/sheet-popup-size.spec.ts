import { setPopupMaxHeight, setPopupWidth } from '@axe/features/character/game-character-sheet/sheet-popup-size';

describe('the size of a piece’s hover popup', () => {
  it('holds the width between 270 and 800, and keeps it for what is not a number', () => {
    const piece = { overViewWidth: 300, overViewMaxHeight: 300 };

    setPopupWidth(piece, 500);
    expect(piece.overViewWidth).toBe(500);
    setPopupWidth(piece, 100);
    expect(piece.overViewWidth).toBe(270);
    setPopupWidth(piece, 5000);
    expect(piece.overViewWidth).toBe(800);
    setPopupWidth(piece, NaN);
    expect(piece.overViewWidth).toBe(800);
  });

  it('holds the greatest height between 250 and 1000, and keeps it for what is not a number', () => {
    const piece = { overViewWidth: 300, overViewMaxHeight: 300 };

    setPopupMaxHeight(piece, 100);
    expect(piece.overViewMaxHeight).toBe(250);
    setPopupMaxHeight(piece, 5000);
    expect(piece.overViewMaxHeight).toBe(1000);
    setPopupMaxHeight(piece, NaN);
    expect(piece.overViewMaxHeight).toBe(1000);
  });
});
