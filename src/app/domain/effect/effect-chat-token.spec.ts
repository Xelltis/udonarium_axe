import {
  BATTLE_CHAT_TOKEN,
  buildEffectChatToken,
  effectTokenSites,
  hasBattleChatToken,
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

  it('passes over the battle stage token, which names no effect', () => {
    expect(parseEffectChatToken('t:HP-10 《vs》')).toBeNull();
    expect(parseEffectChatToken('t:HP-10 《VS》《爆炎》')).toEqual({ name: '爆炎', text: 't:HP-10' });
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

describe('hasBattleChatToken()', () => {
  it('finds the token in either width and either case', () => {
    expect(hasBattleChatToken(`t:HP-10 ${BATTLE_CHAT_TOKEN}`)).toBe(true);
    expect(hasBattleChatToken('t:HP-10 《VS》')).toBe(true);
    expect(hasBattleChatToken('t:HP-10 《ｖｓ》')).toBe(true);
    expect(hasBattleChatToken('《 vs 》で斬る')).toBe(true);
  });

  it('finds nothing in a line without it', () => {
    expect(hasBattleChatToken('t:HP-10 《爆炎》')).toBe(false);
    expect(hasBattleChatToken('勇者 vs 魔王')).toBe(false);
  });

  it('never reads the reading of a ruby as the token', () => {
    expect(hasBattleChatToken('|対決《vs》')).toBe(false);
  });
});

describe('buildEffectChatToken()', () => {
  it('writes it in a form that can be pasted onto a palette', () => {
    expect(buildEffectChatToken('爆炎')).toBe('《爆炎》');
    expect(parseEffectChatToken(buildEffectChatToken('爆炎'))?.name).toBe('爆炎');
  });
});

describe('effectTokenSites', () => {
  it('places every token, brackets included, passing over the readings of rubies', () => {
    const text = '|爆炎《ばくえん》だ《爆炎》《 vs 》《 》';
    const sites = effectTokenSites(text);
    expect(sites.map((site) => [text.slice(site.from, site.to), site.name, site.battle])).toEqual([
      ['《爆炎》', '爆炎', false],
      ['《 vs 》', 'vs', true],
      ['《 》', '', false],
    ]);
  });
});
