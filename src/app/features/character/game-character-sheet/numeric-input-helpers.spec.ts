import { clampInRange, floatOr, roundOr } from '@axe/features/character/game-character-sheet/numeric-input-helpers';

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

  describe('clampInRange()', () => {
    it('leaves a value in range alone', () => {
      expect(clampInRange(50, 0, 100, 0)).toBe(50);
    });

    it('stops at the bottom', () => {
      expect(clampInRange(-5, 0, 100, 999)).toBe(0);
    });

    it('stops at the top', () => {
      expect(clampInRange(150, 0, 100, 999)).toBe(100);
    });

    it('falls back for anything else', () => {
      expect(clampInRange(NaN, 0, 100, 50)).toBe(50);
      expect(clampInRange(Infinity, 0, 100, 50)).toBe(50);
    });

    it('counts the ends as in range', () => {
      expect(clampInRange(0, 0, 100, 999)).toBe(0);
      expect(clampInRange(100, 0, 100, 999)).toBe(100);
    });
  });
});
