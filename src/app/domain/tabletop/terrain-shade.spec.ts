import {
  faceShadeOf,
  hexWallShadeOf,
  sideCellIndexes,
  sideShadeLine,
  TopLight,
  topShadeGrid,
  topShadeOf,
} from '@axe/domain/tabletop/terrain-shade';
import { SlopeDirection } from '@axe/domain/tabletop/terrain-slope';
import { describe, expect, it, vi } from 'vitest';

describe('how much light each face of a block keeps', () => {
  it('lights a block that shades itself from the south, and its underside least', () => {
    expect(faceShadeOf('south', true)).toBe(1);
    expect(faceShadeOf('east', true)).toBe(0.8);
    expect(faceShadeOf('west', true)).toBe(0.5);
    expect(faceShadeOf('north', true)).toBe(0.3);
    expect(faceShadeOf('bottom', true)).toBe(0.25);
  });

  it('keeps all the light on every face of a block that does not shade itself', () => {
    for (const face of ['north', 'south', 'west', 'east', 'bottom'] as const) {
      expect(faceShadeOf(face, false)).toBe(1);
    }
    expect(topShadeOf(SlopeDirection.TOP, false)).toBe(1);
    expect(hexWallShadeOf(0, false)).toBe(1);
  });

  it('darkens the top of a slope by the way it leans', () => {
    expect(topShadeOf(SlopeDirection.TOP, true)).toBe(0.4);
    expect(topShadeOf(SlopeDirection.LEFT, true)).toBe(0.6);
    expect(topShadeOf(SlopeDirection.RIGHT, true)).toBe(0.9);
    expect(topShadeOf(SlopeDirection.BOTTOM, true)).toBe(1);
    expect(topShadeOf(SlopeDirection.NONE, true)).toBe(1);
  });

  it('keeps a hex wall between a third of the light and all of it', () => {
    for (let side = 0; side < 12; side++) {
      const shade = hexWallShadeOf((side * Math.PI) / 6, true);
      expect(shade).toBeGreaterThanOrEqual(0.3);
      expect(shade).toBeLessThanOrEqual(1);
    }
  });
});

describe('the cells along a side of a block', () => {
  // A block three cells across and two deep:
  //   0 1 2
  //   3 4 5
  it('runs west to east along the north and south sides', () => {
    expect(sideCellIndexes(3, 2, 'north')).toEqual([0, 1, 2]);
    expect(sideCellIndexes(3, 2, 'south')).toEqual([3, 4, 5]);
  });

  it('runs south to north along the west and east sides', () => {
    expect(sideCellIndexes(3, 2, 'west')).toEqual([3, 0]);
    expect(sideCellIndexes(3, 2, 'east')).toEqual([5, 2]);
  });
});

describe('the light on the top of a block', () => {
  const roof = { brightness: [1, 0.5], cols: 2, rows: 1 };
  const floor = { brightness: [0.2, 0.4], cols: 2, rows: 1 };

  function light(overrides: Partial<TopLight> = {}): TopLight {
    return {
      roof: vi.fn(() => roof),
      floor: vi.fn(() => floor),
      top: vi.fn(() => 0.7),
      whole: vi.fn(() => 0.3),
      ...overrides,
    };
  }

  it('reads a raised top cell by cell at its own height', () => {
    const readings = light();
    expect(topShadeGrid(true, true, 0.5, readings)).toEqual({ brightness: [0.5, 0.25], cols: 2, rows: 1 });
    expect(readings.floor).not.toHaveBeenCalled();
  });

  it('reads a raised top whole where its cells cannot be read, or it may not be shaded by the cell', () => {
    expect(topShadeGrid(true, true, 0.5, light({ roof: () => null }))).toEqual({
      brightness: [0.35],
      cols: 1,
      rows: 1,
    });
    const hex = light();
    expect(topShadeGrid(true, false, 1, hex)).toEqual({ brightness: [0.7], cols: 1, rows: 1 });
    expect(hex.roof).not.toHaveBeenCalled();
  });

  it('reads a top lying on the floor from the floor, cell by cell where it can', () => {
    expect(topShadeGrid(false, true, 1, light())).toEqual({ brightness: [0.2, 0.4], cols: 2, rows: 1 });
    expect(topShadeGrid(false, true, 1, light({ floor: () => null }))).toEqual({
      brightness: [0.3],
      cols: 1,
      rows: 1,
    });
    expect(topShadeGrid(false, false, 1, light())).toEqual({ brightness: [0.3], cols: 1, rows: 1 });
  });
});

describe('the light along a side of a block', () => {
  const cells = { brightness: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], cols: 3, rows: 2 };

  it('reads the cells along the side from the end it is drawn from', () => {
    expect(sideShadeLine(0.5, 'east', cells, () => 1)).toEqual({ brightness: [0.3, 0.15], cols: 2, rows: 1 });
  });

  it('takes the light of the table where the cells cannot be read', () => {
    expect(sideShadeLine(0.5, 'north', null, () => 0.8)).toEqual({ brightness: [0.4], cols: 1, rows: 1 });
  });
});
