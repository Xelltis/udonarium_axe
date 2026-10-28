import BCDiceLoader from '@axe/domain/dice/bcdice/bcdice-loader';
import {
  checkRollLine,
  diceCommandExamples,
  looksLikeDiceCommand,
  looksLikeRollWord,
  readRollLine,
  type RollCheckSystem,
  rollLimitBreaches,
} from '@axe/domain/dice/dice-roll-line';

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

  describe('checkRollLine', () => {
    let plain: RollCheckSystem;
    let cthulhu: RollCheckSystem;

    beforeAll(async () => {
      const loader = new BCDiceLoader();
      plain = await loader.dynamicLoad('DiceBot');
      cthulhu = await loader.dynamicLoad('Cthulhu7th');
    });

    it('rolls what the system takes, with its repeat count', () => {
      expect(checkRollLine(cthulhu, false, 'CC<=50 目星')).toMatchObject({ kind: 'rolled' });
      expect(checkRollLine(plain, false, '２ ２ｄ６')).toMatchObject({
        kind: 'rolled',
        result: expect.stringContaining('#2'),
      });
    });

    it('says nothing of chat, digits alone or a plain sum', () => {
      for (const line of ['こんにちは', '1日目は休み', '100', '2+3', 'hello there']) {
        expect(checkRollLine(cthulhu, false, line), line).toEqual({ kind: 'notRoll' });
      }
    });

    it('tells a command this system does not take from chat', () => {
      expect(checkRollLine(plain, false, 'CC<=50')).toEqual({ kind: 'plainText' });
    });

    it('tells a command the system takes but cannot roll', () => {
      expect(checkRollLine(cthulhu, false, 'CC<=abc')).toEqual({ kind: 'unrollable' });
      expect(checkRollLine(plain, false, '2d6>=')).toEqual({ kind: 'unrollable' });
    });

    it('does not try a roll that throws more dice than the system rolls', () => {
      expect(checkRollLine(plain, false, 'x100 200d6')).toEqual({ kind: 'tooMany' });
      expect(checkRollLine(plain, false, '100 200d6')).toEqual({ kind: 'tooMany' });
    });

    it('says a count of nothing is not rolled', () => {
      expect(checkRollLine(plain, false, '0 2d6')).toEqual({ kind: 'noRepeat' });
    });

    it('says a roll broken off by the system went unanswered', () => {
      const breaking: RollCheckSystem = {
        COMMAND_PATTERN: /^\d/,
        eval: () => {
          throw new Error('broken');
        },
      };
      expect(checkRollLine(breaking, false, '2d6')).toEqual({ kind: 'failed' });
    });

    it('cannot tell under a system whose code could not be fetched', () => {
      const standIn: RollCheckSystem = { COMMAND_PATTERN: null, eval: () => null };
      expect(checkRollLine(standIn, true, '2d6')).toEqual({ kind: 'cannotCheck' });
      expect(checkRollLine(standIn, true, 'こんにちは')).toEqual({ kind: 'notRoll' });
    });
  });

  describe('rollLimitBreaches', () => {
    it('places terms with too many dice or sides, and too many repeats', () => {
      const text = '150 300d6+2d10001+3d6';
      expect(rollLimitBreaches(text).map((breach) => [breach.limit, text.slice(breach.from, breach.to)])).toEqual([
        ['repeats', '150'],
        ['dice', '300d6'],
        ['sides', '2d10001'],
      ]);
      expect(rollLimitBreaches('x101 2d6').map((breach) => breach.limit)).toEqual(['repeats']);
    });

    it('finds nothing in a roll within the limits', () => {
      expect(rollLimitBreaches('100 200d6+1d10000')).toEqual([]);
    });
  });

  describe('diceCommandExamples', () => {
    it('picks the commands a system rolls out of its help', async () => {
      const cthulhu = await new BCDiceLoader().dynamicLoad('Cthulhu7th');
      const examples = diceCommandExamples(cthulhu);
      expect(examples).toContain('CC<=30');
      expect(examples.length).toBeLessThanOrEqual(12);
      for (const example of examples) expect(cthulhu.eval(example), example).toBeTruthy();
    });

    it('offers nothing from a help with no commands in it', () => {
      expect(diceCommandExamples({ HELP_MESSAGE: '', COMMAND_PATTERN: null, eval: () => null })).toEqual([]);
    });
  });
});
