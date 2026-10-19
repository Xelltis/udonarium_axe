import { evalCalcFormula } from '@axe/domain/data/data-element-calc';

describe('evalCalcFormula', () => {
  it('evaluates a number', () => {
    expect(evalCalcFormula('42', {})).toBe(42);
    expect(evalCalcFormula('3.14', {})).toBeCloseTo(3.14);
  });

  it('evaluates the four operations', () => {
    expect(evalCalcFormula('2 + 3', {})).toBe(5);
    expect(evalCalcFormula('10 - 4', {})).toBe(6);
    expect(evalCalcFormula('3 * 4', {})).toBe(12);
    expect(evalCalcFormula('10 / 4', {})).toBe(2.5);
  });

  it('keeps a division exact unless asked to round it down', () => {
    expect(evalCalcFormula('7 / 2', {})).toBe(3.5);
    expect(evalCalcFormula('7 / 2', {}, { division: 'exact' })).toBe(3.5);
    expect(evalCalcFormula('7 / 2', {}, { division: 'floor' })).toBe(3);
    expect(evalCalcFormula('(5 / 2) * 2', {}, { division: 'floor' })).toBe(4);
  });

  it('leaves the rounding of a division to floor, ceil and round inside them', () => {
    expect(evalCalcFormula('ceil(7 / 2)', {}, { division: 'floor' })).toBe(4);
    expect(evalCalcFormula('round(5 / 2) + 7 / 2', {}, { division: 'floor' })).toBe(6);
    expect(evalCalcFormula('min(7 / 2, 9)', {}, { division: 'floor' })).toBe(3);
  });

  it('gets the precedence right', () => {
    expect(evalCalcFormula('2 + 3 * 4', {})).toBe(14);
    expect(evalCalcFormula('(2 + 3) * 4', {})).toBe(20);
  });

  it('evaluates a power', () => {
    expect(evalCalcFormula('2 ** 10', {})).toBe(1024);
  });

  it('evaluates a negation', () => {
    expect(evalCalcFormula('-5', {})).toBe(-5);
    expect(evalCalcFormula('-(2 + 3)', {})).toBe(-5);
  });

  it('takes a variable', () => {
    expect(evalCalcFormula('HP + MP', { HP: 30, MP: 20 })).toBe(50);
  });

  it('takes a bracketed path as one', () => {
    expect(evalCalcFormula('[戦闘特技/最終能力/コスト] + 2', { '戦闘特技/最終能力/コスト': 3 })).toBe(5);
  });

  it('pays no attention to the case of a name', () => {
    expect(evalCalcFormula('hp + mp', { HP: 10, MP: 5 })).toBe(15);
  });

  it('evaluates a built-in function', () => {
    expect(evalCalcFormula('floor(3.7)', {})).toBe(3);
    expect(evalCalcFormula('ceil(3.1)', {})).toBe(4);
    expect(evalCalcFormula('round(3.5)', {})).toBe(4);
    expect(evalCalcFormula('abs(-7)', {})).toBe(7);
    expect(evalCalcFormula('min(3, 1, 2)', {})).toBe(1);
    expect(evalCalcFormula('max(3, 1, 2)', {})).toBe(3);
  });

  it('returns nothing for a variable it does not know', () => {
    expect(evalCalcFormula('UNDEFINED', {})).toBeNaN();
  });

  it('returns nothing for an empty formula', () => {
    expect(evalCalcFormula('', {})).toBeNaN();
  });

  it('evaluates something long', () => {
    const env = { 基本値: 10, レベル: 5 };
    expect(evalCalcFormula('基本値 + floor(レベル / 2)', env)).toBe(12);
  });
});
