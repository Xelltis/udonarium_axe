import { joinList } from '@axe/core/util/join-list';

describe('joinList', () => {
  it('joins names the way the reader’s language lists them', () => {
    expect(joinList(['勇者', 'ゴブリン', '魔法使い'], 'ja')).toBe('勇者、ゴブリン、魔法使い');
    expect(joinList(['Hero', 'Goblin', 'Mage'], 'en')).toBe('Hero, Goblin, and Mage');
  });

  it('gives one name as it is and nothing for none', () => {
    expect(joinList(['勇者'], 'ja')).toBe('勇者');
    expect(joinList([], 'ja')).toBe('');
  });

  it('falls back to commas for a language that cannot be read', () => {
    expect(joinList(['a', 'b'], 'not a language')).toBe('a, b');
  });
});
