import { looksLikeDiceCommand, looksLikeRollWord, readRollLine } from '@axe/domain/dice/dice-roll-line';

describe('dice-roll-line', () => {
  describe('readRollLine', () => {
    it('hands on the whole first line when no count leads it', () => {
      expect(readRollLine('2d6+3 攻撃')).toEqual({ repeat: 1, rollText: '2d6+3 攻撃', rollFrom: 0 });
    });

    it('takes a leading count and the space after it', () => {
      const text = '3 2d6';
      const line = readRollLine(text);
      expect(line).toEqual({ repeat: 3, rollText: '2d6', rollFrom: 2 });
      expect(text.slice(line.rollFrom)).toBe(line.rollText);
    });

    it('reads a line that starts with a space as one roll of what follows', () => {
      expect(readRollLine('  2d6')).toEqual({ repeat: 1, rollText: '2d6', rollFrom: 2 });
    });

    it('hands on only the first line', () => {
      expect(readRollLine('2d6\n続き').rollText).toBe('2d6');
    });

    it('reads a line break before the command as the space after a count of one', () => {
      expect(readRollLine('\n2d6')).toEqual({ repeat: 1, rollText: '2d6', rollFrom: 1 });
    });

    it('hands on the whole text when nothing follows the count', () => {
      expect(readRollLine('3 ')).toEqual({ repeat: 3, rollText: '3 ', rollFrom: 0 });
      expect(readRollLine('')).toEqual({ repeat: 1, rollText: '', rollFrom: 0 });
    });

    it('reads digits with no space after them as the command itself', () => {
      expect(readRollLine('100')).toEqual({ repeat: 1, rollText: '100', rollFrom: 0 });
    });
  });

  describe('looksLikeDiceCommand', () => {
    it('takes a first word with a digit or a comparison for a command', () => {
      expect(looksLikeDiceCommand('2d6')).toBe(true);
      expect(looksLikeDiceCommand('CC<=50 目星')).toBe(true);
    });

    it('takes words without them for chat', () => {
      expect(looksLikeDiceCommand('こんにちは 2d6')).toBe(false);
    });

    it('leaves resource and buff changes to their own handling', () => {
      expect(looksLikeDiceCommand(':HP-5')).toBe(false);
      expect(looksLikeDiceCommand('st:HP-1')).toBe(false);
      expect(looksLikeDiceCommand('&加護/3')).toBe(false);
    });
  });

  describe('looksLikeRollWord', () => {
    it('takes the shapes rolls are written in', () => {
      for (const word of ['2d6+3', '(2+3)d6', 'CC<=50', 'K20@9', 'SW2', 'D66']) {
        expect(looksLikeRollWord(word), word).toBe(true);
      }
    });

    it('takes no word with letters past ASCII, or one led by a word', () => {
      for (const word of ['1日目', 'hello', 'Hello!', '{HP}', 'ｈｐ']) {
        expect(looksLikeRollWord(word), word).toBe(false);
      }
    });
  });
});
