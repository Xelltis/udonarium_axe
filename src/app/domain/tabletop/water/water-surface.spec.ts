import { DEFAULT_SURFACE_CELLS, MAX_SURFACE_CELLS, surfaceCellsOf } from '@axe/domain/tabletop/water/water-surface';

describe('surfaceCellsOf()', () => {
  it('reads nothing stored as knee deep rather than as a drained pond', () => {
    expect(surfaceCellsOf('')).toBe(DEFAULT_SURFACE_CELLS);
    expect(surfaceCellsOf(undefined)).toBe(DEFAULT_SURFACE_CELLS);
    expect(surfaceCellsOf(null)).toBe(DEFAULT_SURFACE_CELLS);
  });

  it('reads anything that is not a number as the default', () => {
    expect(surfaceCellsOf('deep')).toBe(DEFAULT_SURFACE_CELLS);
    expect(surfaceCellsOf(Number.NaN)).toBe(DEFAULT_SURFACE_CELLS);
  });

  it('reads the text a saved room gives back', () => {
    expect(surfaceCellsOf('1.5')).toBe(1.5);
    expect(surfaceCellsOf('0')).toBe(0);
  });

  it('keeps it between a wet floor and the highest allowed', () => {
    expect(surfaceCellsOf(-2)).toBe(0);
    expect(surfaceCellsOf(99)).toBe(MAX_SURFACE_CELLS);
  });
});
