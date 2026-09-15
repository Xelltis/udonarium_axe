import { TestBed } from '@angular/core/testing';
import { diceBotUnreachable$, DiceBotUnreachableEvent, emitSendMessage } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { GameCharacter } from '@axe/domain/character/game-character';
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
  });

  describe('a system whose chunk cannot be fetched', () => {
    const UNREACHABLE = 'Cthulhu7th';

    /** Makes the chunk of the unreachable system fail the given number of times, then load as usual. */
    async function failFetching(times: number) {
      await DiceBot.ensureLoaded();
      const loader = DiceBot['loader'];
      const fetch = loader.dynamicLoad.bind(loader);
      const lookUp = loader.getGameSystemClass.bind(loader);
      let failures = 0;
      vi.spyOn(loader, 'getGameSystemClass').mockImplementation((id: string) => {
        if (id === UNREACHABLE) throw new Error('not loaded yet');
        return lookUp(id);
      });
      vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      return vi.spyOn(loader, 'dynamicLoad').mockImplementation(async (id: string) => {
        if (id === UNREACHABLE && failures < times) {
          failures++;
          throw new Error('Failed to fetch dynamically imported module');
        }
        return fetch(id);
      });
    }

    /** Lets every roll the queue has been handed, and any it hands itself on the way, finish. */
    async function settle() {
      for (let i = 0; i < 5; i++) await DiceBot.ensureLoaded();
    }

    afterEach(() => {
      resetPeerContextProvider();
    });

    it('does not answer a line under another system', async () => {
      await failFetching(Infinity);
      const me = { userId: 'me' } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me], peerIds: ['me'], peerId: 'me' });
      const tab = ChatTabList.instance.addChatTab('メイン');
      const bot = new DiceBot();
      bot.initialize();
      const line = tab.addMessage({ from: 'me', name: 'わたし', text: '2d6', timestamp: 1000, tag: UNREACHABLE });

      const unrolled: DiceBotUnreachableEvent[] = [];
      const stopListening = diceBotUnreachable$.subscribe((event) => unrolled.push(event));

      emitSendMessage({ messageIdentifier: line.identifier, messageTarget: null });
      await settle();
      stopListening();

      expect(tab.chatMessages.filter((message) => message.isDicebot)).toEqual([]);
      expect(unrolled).toEqual([{ messageIdentifier: line.identifier, gameType: UNREACHABLE }]);

      bot.destroy();
      tab.destroy();
    });

    it('says nothing about a line that holds no dice command', async () => {
      await failFetching(Infinity);
      const me = { userId: 'me' } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me], peerIds: ['me'], peerId: 'me' });
      const tab = ChatTabList.instance.addChatTab('メイン');
      const bot = new DiceBot();
      bot.initialize();
      const lines = ['こんにちは', 'sounds good', 'よろしくお願いします'].map((text, i) =>
        tab.addMessage({ from: 'me', name: 'わたし', text, timestamp: 1000 + i, tag: UNREACHABLE })
      );

      const unrolled: DiceBotUnreachableEvent[] = [];
      const stopListening = diceBotUnreachable$.subscribe((event) => unrolled.push(event));
      for (const line of lines) emitSendMessage({ messageIdentifier: line.identifier, messageTarget: null });
      await settle();
      stopListening();

      expect(unrolled).toEqual([]);

      bot.destroy();
      tab.destroy();
    });

    it('says nothing about a line that only changes a resource or a buff', async () => {
      await failFetching(Infinity);
      const me = { userId: 'me' } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me], peerIds: ['me'], peerId: 'me' });
      const tab = ChatTabList.instance.addChatTab('メイン');
      const bot = new DiceBot();
      bot.initialize();
      const lines = [':HP-5', 't:MP+3', 's:HP-1d6', 'st:HP-2', '&毒3'].map((text, i) =>
        tab.addMessage({ from: 'me', name: 'わたし', text, timestamp: 1000 + i, tag: UNREACHABLE })
      );

      const unrolled: DiceBotUnreachableEvent[] = [];
      const stopListening = diceBotUnreachable$.subscribe((event) => unrolled.push(event));
      for (const line of lines) emitSendMessage({ messageIdentifier: line.identifier, messageTarget: null });
      await settle();
      stopListening();

      expect(unrolled).toEqual([]);

      bot.destroy();
      tab.destroy();
    });

    it('works out a resource change with the plain dice bot meanwhile', async () => {
      await failFetching(Infinity);
      PeerCursor.createMyCursor();
      const tab = ChatTabList.instance.addChatTab('メイン');
      const character = GameCharacter.create('キャラクター', 1, '');
      const bot = new DiceBot();
      bot.initialize();
      const line = tab.addMessage({ from: 'me', name: 'わたし', text: ':HP-5', timestamp: 1000, tag: UNREACHABLE });

      const unrolled: DiceBotUnreachableEvent[] = [];
      const stopListening = diceBotUnreachable$.subscribe((event) => unrolled.push(event));
      await bot['resourceProcessor'].resourceEditProcess(
        character,
        [{ resourceCommand: ':HP-5', object: character }],
        [],
        line,
        false
      );
      stopListening();

      expect(character.status.getValue('HP', 'now')).toBe(195);
      expect(tab.chatMessages.map((message) => message.text).join('\n')).not.toContain('計算できません');
      expect(unrolled).toEqual([]);

      bot.destroy();
      character.destroy();
      tab.destroy();
    });

    it('fetches the chunk again when the system is next asked for', async () => {
      const dynamicLoad = await failFetching(1);

      const first = await DiceBot.loadGameSystemAsync(UNREACHABLE);
      const second = await DiceBot.loadGameSystemAsync(UNREACHABLE);

      expect(first.ID).toBe(UNREACHABLE);
      expect(second.eval('CC<=50')?.text).toContain('1D100<=50');
      expect(dynamicLoad.mock.calls.filter(([id]) => id === UNREACHABLE)).toHaveLength(2);
    });

    describe('telling a secret line from an ordinary one', () => {
      function standIn() {
        return DiceBot['unreachableSystem'](UNREACHABLE);
      }

      it.each(['S2d6', 'SCC<=50 hide', 'Schoice[a,b]', 's1d100 おそるおそる', 'x2 S2d6', '3 SCC<=50'])(
        'counts %s as secret',
        (line) => {
          expect(new DiceBot().checkSecretDiceCommand(standIn(), line)).toBe(true);
        }
      );

      it.each(['Sure', 'Sorry 2 late', 'sounds good', '2d6'])('counts %s as ordinary', (line) => {
        expect(new DiceBot().checkSecretDiceCommand(standIn(), line)).toBe(false);
      });

      it('leaves a loaded system to its own command pattern', async () => {
        const bot = new DiceBot();
        const loaded = await DiceBot.loadGameSystemAsync(UNREACHABLE);

        expect(bot.checkSecretDiceCommand(loaded, 'SCC<=50')).toBe(true);
        expect(bot.checkSecretDiceCommand(loaded, 'S<3 you')).toBe(false);
        expect(bot.checkSecretDiceCommand(standIn(), 'S<3 you')).toBe(true);
      });
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
