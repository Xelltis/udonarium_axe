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

  it('says each length to a tenth of a square, the rise with its sign', () => {
    expect(rulerReadingOf(measured, 1, 'cell')).toEqual({
      straight: '5.0',
      level: '3.0',
      rise: '+4.0',
      steps: 4,
      length: null,
    });
    expect(rulerReadingOf({ ...measured, rise: -1.46 }, 1, 'cell').rise).toBe('-1.5');
    expect(rulerReadingOf({ ...measured, rise: 0.04 }, 1, 'cell').rise).toBe('0.0');
  });

  it('says the length in the room’s unit of length where it counts one', () => {
    expect(rulerReadingOf(measured, 1.5, 'metre').length).toEqual({ value: '7.5', unit: 'metre' });
    expect(rulerReadingOf(measured, 5, 'foot').length).toEqual({ value: '25.0', unit: 'foot' });
    expect(rulerReadingOf(measured, 0, 'metre').length).toBeNull();
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
