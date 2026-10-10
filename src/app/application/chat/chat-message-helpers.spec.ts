import {
  calcChatTimestamp,
  emitChatMessageEvents,
  findImageIdentifierByName,
  parsePortraitCommand,
  resolveChatMessageTag,
  resolveImagePos,
  resolveMessageColor,
  resolvePortraitIndex,
  stripPortraitCommand,
} from '@axe/application/chat/chat-message-helpers';
import { ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import GameSystemClass from 'bcdice/lib/game_system';

describe('chat-message-helpers', () => {
  describe('resolvePortraitIndex', () => {
    it('returns a positive portrait index unchanged', () => {
      expect(resolvePortraitIndex(2)).toBe(2);
    });

    it('returns zero for a missing or negative portrait index', () => {
      expect(resolvePortraitIndex(undefined)).toBe(0);
      expect(resolvePortraitIndex(0)).toBe(0);
      expect(resolvePortraitIndex(-1)).toBe(0);
    });
  });

  describe('resolveMessageColor', () => {
    it('falls back to the default colour', () => {
      expect(resolveMessageColor(undefined, '#000000')).toBe('#000000');
    });

    it('returns a given colour unchanged', () => {
      expect(resolveMessageColor('#ff0000', '#000000')).toBe('#ff0000');
    });
  });

  describe('resolveChatMessageTag', () => {
    it('returns nothing without a game system', () => {
      const dicebot = {
        checkSecretDiceCommand: vi.fn(),
        checkSecretEditCommand: vi.fn(),
      };
      expect(resolveChatMessageTag(null, 'text', dicebot)).toBe('');
    });

    it('tags a secret command as secret', () => {
      const dicebot = {
        checkSecretDiceCommand: vi.fn().mockReturnValue(true),
        checkSecretEditCommand: vi.fn().mockReturnValue(false),
      };
      const gameSystem = { ID: 'Cthulhu' } as GameSystemClass;
      expect(resolveChatMessageTag(gameSystem, 'S1D100<=50', dicebot)).toBe('Cthulhu secret');
    });

    it('tags an ordinary command with the game system', () => {
      const dicebot = {
        checkSecretDiceCommand: vi.fn().mockReturnValue(false),
        checkSecretEditCommand: vi.fn().mockReturnValue(false),
      };
      const gameSystem = { ID: 'DiceBot' } as GameSystemClass;
      expect(resolveChatMessageTag(gameSystem, '1D100<=50', dicebot)).toBe('DiceBot');
    });

    describe('under a system whose code could not be fetched', () => {
      function standIn() {
        return DiceBot['unreachableSystem']('Cthulhu7th');
      }

      it('tags a line whose first word looks like a dice command as secret', () => {
        const dicebot = new DiceBot();

        for (const line of ['S2d6', 'SCC<=50 hide', 'Schoice[a,b]', 's1d100 おそるおそる']) {
          expect(resolveChatMessageTag(standIn(), line, dicebot)).toBe('Cthulhu7th secret');
        }
      });

      it('tags an ordinary line with the game system alone', () => {
        const dicebot = new DiceBot();

        for (const line of ['Sure', 'Sorry 2 late', 'sounds good']) {
          expect(resolveChatMessageTag(standIn(), line, dicebot)).toBe('Cthulhu7th');
        }
      });

      it('leaves a loaded system to its own command pattern', async () => {
        const dicebot = new DiceBot();
        const loaded = await DiceBot.loadGameSystemAsync('Cthulhu7th');

        expect(resolveChatMessageTag(loaded, 'SCC<=50', dicebot)).toBe('Cthulhu7th secret');
        expect(resolveChatMessageTag(loaded, 'S<3 you', dicebot)).toBe('Cthulhu7th');
      });
    });
  });

  describe('parsePortraitCommand / stripPortraitCommand', () => {
    it('recognises the hide command', () => {
      expect(parsePortraitCommand('hello @hide')).toEqual({ type: 'hide' });
    });

    it('reads hide however it is typed', () => {
      expect(parsePortraitCommand('hello @HIDE')).toEqual({ type: 'hide' });
      expect(parsePortraitCommand('hello ＠ｈｉｄｅ')).toEqual({ type: 'hide' });
    });

    it('recognises a numeric command', () => {
      expect(parsePortraitCommand('hello @12')).toEqual({ type: 'index', position: 12 });
    });

    it('reads a full-width number as a number', () => {
      expect(parsePortraitCommand('hello ＠２')).toEqual({ type: 'index', position: 2 });
    });

    it('reads a zero as the position it is, which no portrait holds', () => {
      expect(parsePortraitCommand('hello @0')).toEqual({ type: 'index', position: 0 });
    });

    it('recognises the name command', () => {
      expect(parsePortraitCommand('hello @笑顔')).toEqual({ type: 'name', name: '笑顔' });
    });

    it('keeps a name that ends in digits whole', () => {
      expect(parsePortraitCommand('hello @笑顔2')).toEqual({ type: 'name', name: '笑顔2' });
    });

    it('takes nothing from a line that ends in no command', () => {
      expect(parsePortraitCommand('hello')).toEqual({ type: 'none' });
      expect(parsePortraitCommand('mail@example.com')).toEqual({ type: 'none' });
    });

    it('strips a trailing command', () => {
      expect(stripPortraitCommand('hello @hide')).toBe('hello ');
      expect(stripPortraitCommand('hello')).toBe('hello');
    });
  });

  describe('findImageIdentifierByName', () => {
    const entries = [
      { label: '通常', identifier: 'id-normal' },
      { label: '笑顔', identifier: 'id-smile' },
      { label: '怒り', identifier: 'id-angry' },
    ];

    it('prefers an exact match', () => {
      expect(findImageIdentifierByName(entries, '笑顔')).toEqual({ identifier: 'id-smile', index: 1 });
    });

    it('falls back to a prefix match', () => {
      expect(findImageIdentifierByName(entries, '怒')).toEqual({ identifier: 'id-angry', index: 2 });
    });

    it('returns nothing when there is no match', () => {
      expect(findImageIdentifierByName(entries, '不存在')).toEqual({ identifier: '', index: 0 });
    });

    it('ignores the case and the width of what was typed', () => {
      const cased = [
        { label: 'Smile', identifier: 'id-smile' },
        { label: 'Angry', identifier: 'id-angry' },
      ];
      expect(findImageIdentifierByName(cased, 'smile')).toEqual({ identifier: 'id-smile', index: 0 });
      expect(findImageIdentifierByName(cased, 'ＡＮＧＲＹ')).toEqual({ identifier: 'id-angry', index: 1 });
    });

    it('never settles on a portrait nobody named', () => {
      const unnamed = [
        { label: '', identifier: 'id-first' },
        { label: '笑顔', identifier: 'id-smile' },
      ];
      expect(findImageIdentifierByName(unnamed, '笑')).toEqual({ identifier: 'id-smile', index: 1 });
      expect(findImageIdentifierByName(unnamed, '')).toEqual({ identifier: '', index: 0 });
    });
  });

  describe('calcChatTimestamp', () => {
    it('steps past the latest stamp when the clock has not', () => {
      expect(calcChatTimestamp(1000, 1000)).toBe(1001);
      expect(calcChatTimestamp(999, 1000)).toBe(1001);
    });

    it('uses the clock once it has passed the latest stamp', () => {
      expect(calcChatTimestamp(1002, 1000)).toBe(1002);
    });
  });

  describe('resolveImagePos', () => {
    it('returns a value within range unchanged', () => {
      expect(resolveImagePos(5)).toBe(5);
    });

    it('returns zero for anything out of range', () => {
      expect(resolveImagePos(-1)).toBe(0);
      expect(resolveImagePos(12)).toBe(0);
    });

    it('returns zero for nothing at all', () => {
      expect(resolveImagePos(undefined)).toBe(0);
    });
  });

  describe('emitChatMessageEvents', () => {
    it('sends one message to nobody in particular with no targets', () => {
      const result = emitChatMessageEvents(undefined);
      expect(result.sendTargets).toEqual([null]);
      expect(result.shouldEmitDiceTable).toBe(true);
      expect(result.resourceEditTargetContext).toBeNull();
    });

    it('sends one message per target', () => {
      const targets: ChatMessageTargetContext[] = [
        { text: 'a', object: null },
        { text: 'b', object: null },
      ];
      const result = emitChatMessageEvents(targets);
      expect(result.sendTargets).toEqual(targets);
      expect(result.resourceEditTargetContext).toEqual(targets);
    });
  });
});
