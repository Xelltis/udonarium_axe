import {
  clampPieceImageHeight,
  clampPieceImageWidth,
  heightInProportion,
  pieceImageWidthApart,
  widthInProportion,
} from '@axe/domain/character/piece-image-size';

describe('the size a piece picture is given', () => {
  it('keeps the picture in proportion for a width left empty, at 0, or not a positive number', () => {
    for (const value of [undefined, null, '', '0', 0, -40, 'abc', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pieceImageWidthApart(value)).toBeNull();
    }
  });

  it('reads a positive width, from a number or from a save, as given apart from the height', () => {
    expect(pieceImageWidthApart(120)).toBe(120);
    expect(pieceImageWidthApart('240')).toBe(240);
  });

  it('holds a height within 50 to 750 and a width within 10 to 2000, keeping the old value for one that is not a number', () => {
    expect(clampPieceImageHeight(900, 100)).toBe(750);
    expect(clampPieceImageHeight(20, 100)).toBe(50);
    expect(clampPieceImageHeight(Number.NaN, 100)).toBe(100);
    expect(clampPieceImageWidth(3000, 100)).toBe(2000);
    expect(clampPieceImageWidth(4, 100)).toBe(10);
    expect(clampPieceImageWidth(Number.NaN, 100)).toBe(100);
  });

  it("works the width out from the height by the picture's proportions, once they are known", () => {
    expect(widthInProportion(300, 0.5)).toBe(150);
    expect(widthInProportion(301, 0.5)).toBe(151);
    expect(widthInProportion(300, null)).toBeNull();
    expect(widthInProportion(300, 0)).toBeNull();
  });

  it('works the height out from a width typed, held within its bounds, and keeps it where it cannot', () => {
    expect(heightInProportion(150, 0.5, 100)).toBe(300);
    expect(heightInProportion(1000, 0.5, 100)).toBe(750);
    expect(heightInProportion(150, null, 100)).toBe(100);
    expect(heightInProportion(Number.NaN, 0.5, 100)).toBe(100);
  });
});
