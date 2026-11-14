import { isUrlText } from '@axe/features/data-element/game-data-element/game-data-element-utils';

describe('isUrlText', () => {
  it('is true for a secure address', () => {
    expect(isUrlText('https://example.com')).toBe(true);
  });

  it('is true for a plain one', () => {
    expect(isUrlText('http://example.com')).toBe(true);
  });

  it('is false for ordinary text', () => {
    expect(isUrlText('こんにちは')).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(isUrlText('')).toBe(false);
  });

  it('is false for a number', () => {
    expect(isUrlText(42)).toBe(false);
  });

  it('is false for zero', () => {
    expect(isUrlText(0)).toBe(false);
  });
});
