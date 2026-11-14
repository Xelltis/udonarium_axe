import { floatOr, roundOr } from '@axe/features/character/game-character-sheet/numeric-input-helpers';

describe('numeric-input-helpers', () => {
  describe('floatOr()', () => {
    it('returns a finite value as it is', () => {
      expect(floatOr(3.14, 0)).toBe(3.14);
      expect(floatOr(-2.5, 0)).toBe(-2.5);
      expect(floatOr(0, 1)).toBe(0);
    });

    it('falls back for anything else', () => {
      expect(floatOr(NaN, 7)).toBe(7);
      expect(floatOr(Infinity, 7)).toBe(7);
      expect(floatOr(-Infinity, 7)).toBe(7);
    });
  });

  describe('roundOr()', () => {
    it('rounds a finite value', () => {
      expect(roundOr(3.4, 0)).toBe(3);
      expect(roundOr(3.5, 0)).toBe(4);
      expect(roundOr(-2.5, 0)).toBe(-2); // Math.round's rule, not banker's rounding
    });

    it('falls back for anything else', () => {
      expect(roundOr(NaN, 0)).toBe(0);
      expect(roundOr(Infinity, 99)).toBe(99);
    });
  });
});
