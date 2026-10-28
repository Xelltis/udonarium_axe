import {
  calcChatTimestamp,
  emitChatMessageEvents,
  resolveChatMessageTag,
  resolveImagePos,
  resolveMessageColor,
  resolvePortraitIndex,
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
