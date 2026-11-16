import { wholeCells, wholeCellsOrNone } from '@axe/core/util/whole-cells';

describe('wholeCells', () => {
  it('rounds a count down to a whole one, whether typed as a number or as text', () => {
    expect(wholeCells(3.9)).toBe(3);
    expect(wholeCells('4.2')).toBe(4);
    expect(wholeCells(0)).toBe(0);
    expect(wholeCells(-1.5)).toBe(-2);
  });

  it('answers null for a field left empty or holding no number', () => {
    expect(wholeCells(null)).toBeNull();
    expect(wholeCells(undefined)).toBeNull();
    expect(wholeCells('')).toBeNull();
    expect(wholeCells('  ')).toBeNull();
    expect(wholeCells('abc')).toBeNull();
    expect(wholeCells(Infinity)).toBeNull();
    expect(wholeCells(NaN)).toBeNull();
  });
});

describe('wholeCellsOrNone', () => {
  it('rounds a count above zero down to a whole one', () => {
    expect(wholeCellsOrNone(2.7)).toBe(2);
    expect(wholeCellsOrNone('5')).toBe(5);
  });

  it('takes anything else as none', () => {
    expect(wholeCellsOrNone(0.4)).toBe(0);
    expect(wholeCellsOrNone(-3)).toBe(0);
    expect(wholeCellsOrNone('')).toBe(0);
    expect(wholeCellsOrNone(null)).toBe(0);
    expect(wholeCellsOrNone(NaN)).toBe(0);
    expect(wholeCellsOrNone(Infinity)).toBe(0);
  });
});
