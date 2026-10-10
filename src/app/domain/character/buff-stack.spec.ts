import { stackBuffEffect } from '@axe/domain/character/buff-stack';

describe('stackBuffEffect', () => {
  it('adds the two numbers and keeps the words around them', () => {
    expect(stackBuffEffect('攻撃+2', '攻撃+2')).toBe('攻撃+4');
  });

  it('takes a second helping the other way', () => {
    expect(stackBuffEffect('攻撃+2', '攻撃-3')).toBe('攻撃-1');
  });

  it('writes a sum of zero where the two cancel out', () => {
    expect(stackBuffEffect('攻撃+2', '攻撃-2')).toBe('攻撃+0');
  });

  it('leaves the sign off where neither note carried one', () => {
    expect(stackBuffEffect('継続2', '継続3')).toBe('継続5');
  });

  it('adds a bare number to a bare number', () => {
    expect(stackBuffEffect('2', '3')).toBe('5');
  });

  it('keeps the words that stand after the number', () => {
    expect(stackBuffEffect('2点ダメージ', '3点ダメージ')).toBe('5点ダメージ');
  });

  it('reads a number written full width', () => {
    expect(stackBuffEffect('攻撃+2', '攻撃＋3')).toBe('攻撃+5');
  });

  it('adds up to one place and no further', () => {
    expect(stackBuffEffect('+0.1', '+0.2')).toBe('+0.3');
  });

  it('refuses two notes about different things', () => {
    expect(stackBuffEffect('攻撃+2', '防御+1')).toBeNull();
  });

  it('refuses a note with no number to add', () => {
    expect(stackBuffEffect('攻撃+2', '猛攻撃')).toBeNull();
    expect(stackBuffEffect('猛攻撃', '攻撃+2')).toBeNull();
  });

  it('refuses an empty note', () => {
    expect(stackBuffEffect('攻撃+2', '')).toBeNull();
  });
});
