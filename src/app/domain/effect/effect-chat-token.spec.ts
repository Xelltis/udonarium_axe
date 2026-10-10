import {
  buildEffectChatToken,
  parseEffectChatToken,
  stripEffectChatTokens,
} from '@axe/domain/effect/effect-chat-token';

describe('parseEffectChatToken()', () => {
  it('takes the effect token out of a line', () => {
    expect(parseEffectChatToken('2d6+3 t:HP-10 《爆炎》')).toEqual({ name: '爆炎', text: '2d6+3 t:HP-10' });
  });

  it('returns nothing when there is none', () => {
    expect(parseEffectChatToken('2d6+3 t:HP-10')).toBeNull();
  });

  it('ignores an empty one', () => {
    expect(parseEffectChatToken('攻撃《》')).toBeNull();
    expect(parseEffectChatToken('攻撃《 》')).toBeNull();
  });

  it('trims its ends', () => {
    expect(parseEffectChatToken('《 爆炎 》')?.name).toBe('爆炎');
  });

  it('picks one up mid-line', () => {
    expect(parseEffectChatToken('《斬撃》 で斬りかかる')).toEqual({ name: '斬撃', text: 'で斬りかかる' });
  });

  it('never reads the reading of a ruby as one', () => {
    expect(parseEffectChatToken('|炎《ほのお》を放つ')).toBeNull();
    expect(parseEffectChatToken('｜炎《ほのお》を放つ')).toBeNull();
  });

  it('finds the one that comes after a ruby, keeping the ruby in the line', () => {
    expect(parseEffectChatToken('|火球《ファイアボール》を撃つ《爆炎》')).toEqual({
      name: '爆炎',
      text: '|火球《ファイアボール》を撃つ',
    });
  });
});

describe('stripEffectChatTokens()', () => {
  it('takes every token out', () => {
    expect(stripEffectChatTokens('攻撃《斬撃》と《爆炎》')).toBe('攻撃と');
  });

  it('leaves a ruby as it is', () => {
    expect(stripEffectChatTokens('|斬撃《スラッシュ》《斬撃》')).toBe('|斬撃《スラッシュ》');
  });

  it('leaves the dice and the resource changes alone', () => {
    // It reads the double brackets alone, so it collides with no existing notation.
    expect(stripEffectChatTokens('2d6+3 t:HP-10 s:MP-2')).toBe('2d6+3 t:HP-10 s:MP-2');
  });
});

describe('buildEffectChatToken()', () => {
  it('writes it in a form that can be pasted onto a palette', () => {
    expect(buildEffectChatToken('爆炎')).toBe('《爆炎》');
    expect(parseEffectChatToken(buildEffectChatToken('爆炎'))?.name).toBe('爆炎');
  });
});
