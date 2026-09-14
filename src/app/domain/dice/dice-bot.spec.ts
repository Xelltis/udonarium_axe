import { TestBed } from '@angular/core/testing';
import { Logger } from '@axe/core/logging/logger';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

describe('DiceBot', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the line it answers with', () => {
    it('wears the colours of the roll it answers, bubble and all', () => {
      PeerCursor.createMyCursor();
      const tab = ChatTabList.instance.addChatTab('メイン');
      const asked = tab.addMessage({
        from: 'me',
        name: 'わたし',
        text: '2d6',
        timestamp: 1000,
        messColor: '#ff0000',
        messBubbleLight: '#ffeeee',
        messBubbleDark: '#330000',
      });
      const bot = new DiceBot();
      bot.initialize();

      bot['sendResultMessage']({ id: null, result: '(2D6) → 7', isSecret: false }, asked);

      const answer = tab.chatMessages[tab.chatMessages.length - 1];
      expect(answer.text).toContain('→ 7');
      expect(answer.messColor).toBe('#ff0000');
      expect(answer.messBubbleLight).toBe('#ffeeee');
      expect(answer.messBubbleDark).toBe('#330000');

      bot.destroy();
      tab.destroy();
    });
  });

  describe('an instance', () => {
    it('can be created', () => {
      const bot = new DiceBot();
      bot.initialize();
      expect(bot).toBeTruthy();
    });

    it('names itself the dice bot', () => {
      const bot = new DiceBot();
      bot.initialize();
      expect(bot.aliasName).toBe('dice-bot');
    });
  });

  describe('its static members', () => {
    it('fetches nothing until a roll or a system is asked for', () => {
      const kept = DiceBot['queue'];
      DiceBot['queue'] = null;
      try {
        const bot = new DiceBot();
        bot.initialize();
        expect(DiceBot['queue']).toBeNull();
        bot.destroy();
      } finally {
        DiceBot['queue'] = kept;
      }
    });

    it('lists the systems it knows', () => {
      expect(Array.isArray(DiceBot.diceBotInfos)).toBe(true);
    });

    it('rolls with the plain dice bot when the chunk of a system cannot be fetched', async () => {
      await DiceBot.ensureLoaded();
      const loader = DiceBot['loader'];
      const fetch = loader.dynamicLoad.bind(loader);
      vi.spyOn(loader, 'getGameSystemClass').mockImplementation(() => {
        throw new Error('not loaded yet');
      });
      vi.spyOn(loader, 'dynamicLoad').mockImplementation(async (id: string) => {
        if (id === 'Amadeus') throw new Error('Failed to fetch dynamically imported module');
        return fetch(id);
      });
      vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

      const system = await DiceBot.loadGameSystemAsync('Amadeus');

      expect(system.ID).toBe('DiceBot');
    });
  });

  describe('does not throw away what was rolled', () => {
    /** A stand-in that only mimics the shape of the library's result; loading the real one is expensive. */
    function fakeSystem(result: unknown) {
      return { ID: 'FakeSystem', eval: () => result } as unknown as Parameters<typeof DiceBot.diceRollAsync>[1];
    }

    // Every roll goes through the queue that first fetches the BCDice loader, so the first roll
    // pays for that fetch. Drain it here instead of charging it to whichever test rolls first.
    beforeAll(async () => {
      await DiceBot.diceRollAsync('1D1', fakeSystem(null));
    });

    it('puts the roll and whether it succeeded onto the result', async () => {
      const rolled = await DiceBot.diceRollAsync(
        '2D6',
        fakeSystem({
          text: '(2D6) ＞ 6[5,1] ＞ 6',
          secret: false,
          detailedRands: [
            { kind: 'normal', sides: 6, value: 5 },
            { kind: 'normal', sides: 6, value: 1 },
          ],
          success: true,
          failure: false,
          critical: false,
          fumble: false,
        })
      );

      // Neither can be read back out of the formatted text, so what is not taken here can never be counted.
      expect(rolled.detail?.faces.map((face) => face.value)).toEqual([5, 1]);
      expect(rolled.detail?.outcome).toBe('success');
      expect(rolled.detail?.system).toBe('FakeSystem');
    });

    it('returns nothing when nothing could be rolled', async () => {
      const rolled = await DiceBot.diceRollAsync('2D6', fakeSystem(null));

      expect(rolled.result).toBe('');
      expect(rolled.detail).toBeNull();
    });
  });
});
