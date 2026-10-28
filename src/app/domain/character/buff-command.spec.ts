import {
  buffCommandFields,
  buffCommandKind,
  readBuffStacking,
  readCalculatedBuff,
  removedBuffName,
} from '@axe/domain/character/buff-command';

describe('buff-command', () => {
  it('tells what each kind of command does', () => {
    expect(buffCommandKind('&R-')).toBe('roundsDown');
    expect(buffCommandKind('t&ｒ+')).toBe('roundsUp');
    expect(buffCommandKind('&D')).toBe('clearZero');
    expect(buffCommandKind('&加護-')).toBe('remove');
    expect(buffCommandKind('&!猛攻撃/攻撃/+/2/3')).toBe('calculated');
    expect(buffCommandKind('&加護/防御+2/3')).toBe('plain');
  });

  it('names the buff a removal takes off', () => {
    expect(removedBuffName('t&加護-')).toBe('加護');
  });

  it('takes the stacking mark off before the rest is read', () => {
    expect(readBuffStacking('&++!猛攻撃/攻撃/+/2/3')).toEqual({ piles: 'extend', command: '&!猛攻撃/攻撃/+/2/3' });
    expect(readBuffStacking('&加護')).toEqual({ piles: 'none', command: '&加護' });
  });

  it('reads the statuses a calculated buff moves, in either layout', () => {
    expect(readCalculatedBuff('&!猛攻撃/攻撃/+/2/3/手番開始')).toMatchObject({
      name: '猛攻撃',
      requests: [{ target: '攻撃', operator: 'add', amount: 2 }],
      rest: ['3', '手番開始'],
    });
    expect(readCalculatedBuff('&!全力攻撃/追D+4,回避-2/1').requests).toHaveLength(2);
  });

  it('reads no statuses where one of them cannot be read', () => {
    expect(readCalculatedBuff('&!猛攻撃/攻撃/+/たくさん/3').requests).toBeNull();
  });

  it('places each field after the marks', () => {
    const command = 't&+!猛攻撃/攻撃/+/2';
    expect(buffCommandFields(command).map((field) => [field.text, command.slice(field.from, field.to)])).toEqual([
      ['猛攻撃', '猛攻撃'],
      ['攻撃', '攻撃'],
      ['+', '+'],
      ['2', '2'],
    ]);
  });
});
