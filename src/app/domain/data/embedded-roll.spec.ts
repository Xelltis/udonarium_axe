import {
  findEmbeddedRolls,
  isPlainArithmetic,
  replaceEmbeddedRolls,
  unwrapEmbeddedRolls,
  unwrapParentheses,
} from '@axe/domain/data/embedded-roll';

describe('embedded-roll', () => {
  describe('findEmbeddedRolls', () => {
    it('finds nothing where no brackets are written', () => {
      expect(findEmbeddedRolls('-(2d6+5-3)+(1d1-1)')).toEqual([]);
    });

    it('takes the command out of a bracketed run', () => {
      expect(findEmbeddedRolls('-([k10]+5-3)+(1d1-1)')).toEqual([{ command: 'k10', start: 2, end: 7 }]);
    });

    it('takes each of several in the order they were written', () => {
      const sites = findEmbeddedRolls('[k10]+[k5]');

      expect(sites.map((site) => site.command)).toEqual(['k10', 'k5']);
    });

    it('keeps a nested bracket with the command it belongs to', () => {
      expect(findEmbeddedRolls('[choice[a,b]]').map((site) => site.command)).toEqual(['choice[a,b]']);
    });

    it('passes over a bracket that is never closed', () => {
      expect(findEmbeddedRolls('[k10+5')).toEqual([]);
    });

    it('passes over an empty pair, which is a checkbox rather than a command', () => {
      expect(findEmbeddedRolls('-[]+(1d1-1)')).toEqual([]);
    });
  });

  describe('replaceEmbeddedRolls', () => {
    it('puts the answer where its command stood', () => {
      expect(replaceEmbeddedRolls('-([k10]+5-3)+(1d1-1)', [2])).toBe('-(2+5-3)+(1d1-1)');
    });

    it('answers each command in turn', () => {
      expect(replaceEmbeddedRolls('[k10]+[k5]', [7, 3])).toBe('7+3');
    });

    it('wraps a negative answer so it does not run into the sign before it', () => {
      expect(replaceEmbeddedRolls('5-[2d6-10]', [-4])).toBe('5-(-4)');
    });

    it('leaves a command as it was when nothing answered it', () => {
      expect(replaceEmbeddedRolls('[k10]+[k5]', [7])).toBe('7+[k5]');
    });
  });

  describe('isPlainArithmetic', () => {
    it('takes numbers, dice and operators, with bracketed commands answered', () => {
      expect(isPlainArithmetic('([k10]+5-3)')).toBe(true);
      expect(isPlainArithmetic('2d6+3*(4/2)')).toBe(true);
    });

    it('does not take a letter a command takes after its total, outside the brackets', () => {
      expect(isPlainArithmetic('([k10@13]+5h+3)')).toBe(false);
      expect(isPlainArithmetic('k10+5')).toBe(false);
    });

    it('does not take a reference left unfilled', () => {
      expect(isPlainArithmetic('t{敏捷度}')).toBe(false);
    });
  });

  describe('unwrapEmbeddedRolls', () => {
    it('leaves each bracketed command standing in place of its brackets', () => {
      expect(unwrapEmbeddedRolls('([k10@13]+5h+[2d6])')).toBe('(k10@13+5h+2d6)');
    });
  });

  describe('unwrapParentheses', () => {
    it('takes off one pair round the whole expression', () => {
      expect(unwrapParentheses('(k10+(2+3)h)')).toBe('k10+(2+3)h');
    });

    it('leaves pairs that do not wrap the whole of it', () => {
      expect(unwrapParentheses('(1+2)+(3+4)')).toBe('(1+2)+(3+4)');
      expect(unwrapParentheses('k10+5')).toBe('k10+5');
    });
  });
});
