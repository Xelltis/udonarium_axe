import { buildDiceChatToken, diceChatTokenSite, parseDiceChatToken } from '@axe/domain/dice/dice-chat-token';

describe('parseDiceChatToken()', () => {
  it('takes the piece named after the roll', () => {
    expect(parseDiceChatToken('2d6 dice:ゴブリンA')).toEqual({ name: 'ゴブリンA' });
  });

  it('takes it from a full-width space as readily', () => {
    expect(parseDiceChatToken('2d6　dice:ゴブリンA')).toEqual({ name: 'ゴブリンA' });
  });

  it('leaves the name empty for whoever spoke the line', () => {
    expect(parseDiceChatToken('2d6 dice:')).toEqual({ name: '' });
  });

  it('takes one written first', () => {
    expect(parseDiceChatToken('dice:ゴブリンA 2d6')).toEqual({ name: 'ゴブリンA' });
  });

  it('returns nothing for a line that carries none', () => {
    expect(parseDiceChatToken('2d6 攻撃')).toBeNull();
  });

  it('does not read it out of the middle of a word', () => {
    // A word that happens to end in the token is not the token.
    expect(parseDiceChatToken('nodice:A')).toBeNull();
  });

  it('leaves the dice and the resource changes alone', () => {
    expect(parseDiceChatToken('2d6+3 t:HP-10')).toBeNull();
  });
});

describe('buildDiceChatToken()', () => {
  it('writes it in a form that can be pasted onto a palette', () => {
    expect(buildDiceChatToken('ゴブリンA')).toBe('dice:ゴブリンA');
  });
});

describe('diceChatTokenSite', () => {
  it('places the token from its d to the end of the name', () => {
    const text = '2d6\u3000dice:ゴブリンA 攻撃';
    const site = diceChatTokenSite(text)!;
    expect(text.slice(site.from, site.to)).toBe('dice:ゴブリンA');
    expect(site.name).toBe('ゴブリンA');
  });

  it('places a token that starts the line', () => {
    expect(diceChatTokenSite('dice: 2d6')).toEqual({ name: '', from: 0, to: 5 });
  });

  describe('a stamp put right after the dice token', () => {
    it('ends the name, as a space would', () => {
      expect(parseDiceChatToken('2d6 dice:ゴブリン［笑:sfx:laugh］')).toEqual({ name: 'ゴブリン' });
    });
  });
});
