import { GridType } from '@axe/domain/tabletop/grid-type';
import { hexCellCenter, hexSpacing } from '@axe/domain/tabletop/hex-geometry';
import {
  decodeRulerLine,
  encodeRulerLine,
  rulerReadingOf,
  squareMiddleOf,
} from '@axe/domain/tabletop/ruler/ruler-line';

describe('squareMiddleOf', () => {
  it('keeps a point to the middle of the square it lies in', () => {
    expect(squareMiddleOf({ x: 61, y: 149 }, 50, GridType.SQUARE)).toEqual({ x: 75, y: 125 });
    expect(squareMiddleOf({ x: 61, y: 149 }, 100, GridType.SQUARE)).toEqual({ x: 50, y: 150 });
  });

  it('keeps a point to the middle of the hexagon it lies in', () => {
    for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const flatTop = gridType === GridType.HEX_VERTICAL;
      const { colSpacing, rowSpacing } = hexSpacing(50, flatTop);
      const middle = hexCellCenter(3, 4, colSpacing, rowSpacing, flatTop);
      expect(squareMiddleOf({ x: middle.x + 5, y: middle.y - 4 }, 50, gridType)).toEqual(middle);
    }
  });

  it('leaves a point where it is on a table with no grid', () => {
    expect(squareMiddleOf({ x: 61, y: 149 }, 50, GridType.NONE)).toEqual({ x: 61, y: 149 });
  });
});

describe('rulerReadingOf', () => {
  const measured = { straight: 5, level: 3, rise: 4, steps: 4 };

  it('says each length to a tenth of a square, the rise with its sign, where the room counts in squares', () => {
    expect(rulerReadingOf(measured, 1.5, 'cell')).toEqual({
      unit: 'square',
      straight: '5.0',
      level: '3.0',
      rise: '+4.0',
      steps: 4,
    });
    expect(rulerReadingOf({ ...measured, rise: -1.46 }, 1, 'cell').rise).toBe('-1.5');
    expect(rulerReadingOf({ ...measured, rise: 0.04 }, 1, 'cell').rise).toBe('0.0');
  });

  it('says every length in the room’s unit of length where it counts one, and the squares as they are', () => {
    expect(rulerReadingOf(measured, 1.5, 'metre')).toEqual({
      unit: 'metre',
      straight: '7.5',
      level: '4.5',
      rise: '+6.0',
      steps: 4,
    });
    expect(rulerReadingOf({ ...measured, rise: -1 }, 5, 'foot')).toEqual({
      unit: 'foot',
      straight: '25.0',
      level: '15.0',
      rise: '-5.0',
      steps: 4,
    });
  });

  it('says the lengths in squares where the room gives a square no length', () => {
    expect(rulerReadingOf(measured, 0, 'metre')).toMatchObject({ unit: 'square', straight: '5.0' });
    expect(rulerReadingOf(measured, Number.NaN, 'foot')).toMatchObject({ unit: 'square', level: '3.0' });
    expect(rulerReadingOf(measured, 1.5, null)).toMatchObject({ unit: 'square', rise: '+4.0' });
  });
});

describe('passing a ruler on', () => {
  it('reads back the ruler it wrote, to a tenth of a pixel, an end held to a piece with its height over it', () => {
    const line = {
      from: { x: 10.04, y: 20, z: 0, piece: 'hero', lift: 25 },
      to: { x: 300.26, y: -0.01, z: 75 },
    };

    expect(decodeRulerLine(encodeRulerLine(line))).toEqual({
      from: { x: 10, y: 20, z: 0, piece: 'hero', lift: 25 },
      to: { x: 300.3, y: 0, z: 75 },
    });
  });

  it('reads nothing from empty text or text that is not a ruler', () => {
    expect(encodeRulerLine(null)).toBe('');
    expect(decodeRulerLine('')).toBeNull();
    expect(decodeRulerLine('not json')).toBeNull();
    expect(decodeRulerLine('[[1,2,3]]')).toBeNull();
    expect(decodeRulerLine('[[1,2,"x"],[1,2,3]]')).toBeNull();
  });
});
