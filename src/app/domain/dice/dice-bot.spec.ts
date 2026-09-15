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

    describe('a fetch that never settles', () => {
      const FETCH_TIMEOUT_MS = 10_000;
      let giveUp: () => void = () => undefined;

      afterEach(async () => {
        vi.useRealTimers();
        giveUp();
        giveUp = () => undefined;
        await settle();
      });

      /** What the promise has settled with so far, or 'pending'. */
      function settledValue<T>(promise: Promise<T>): () => T | 'pending' {
        let value: T | 'pending' = 'pending';
        void promise.then((settled) => (value = settled));
        return () => value;
      }

      it('gives the stand-in once the fetch has taken too long, and fetches again next time', async () => {
        await DiceBot.ensureLoaded();
        const loader = DiceBot['loader'];
        const lookUp = loader.getGameSystemClass.bind(loader);
        const fetch = loader.dynamicLoad.bind(loader);
        vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(loader, 'getGameSystemClass').mockImplementation((id: string) => {
          if (id === UNREACHABLE) throw new Error('not loaded yet');
          return lookUp(id);
        });
        let stall = true;
        const dynamicLoad = vi.spyOn(loader, 'dynamicLoad').mockImplementation((id: string) => {
          if (id === UNREACHABLE && stall) {
            return new Promise((_, reject) => (giveUp = () => reject(new Error('gave up'))));
          }
          return fetch(id);
        });
        vi.useFakeTimers();

        const first = settledValue(DiceBot.loadGameSystemAsync(UNREACHABLE));
        await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
        expect(first()).toBe('pending');
        await vi.advanceTimersByTimeAsync(1);

        const standIn = first();
        expect(standIn).not.toBe('pending');
        expect(standIn !== 'pending' && standIn.ID).toBe(UNREACHABLE);
        expect(standIn !== 'pending' && DiceBot['isUnreachable'](standIn)).toBe(true);

        stall = false;
        vi.useRealTimers();
        const second = await DiceBot.loadGameSystemAsync(UNREACHABLE);
        expect(second.eval('CC<=50')?.text).toContain('1D100<=50');
        expect(dynamicLoad.mock.calls.filter(([id]) => id === UNREACHABLE)).toHaveLength(2);
      });
    });

    describe('a line sent while the system is being fetched', () => {
      let release: () => void = () => undefined;

      afterEach(async () => {
        release();
        release = () => undefined;
        await settle();
      });

      /** Holds the fetch of the unreachable system until the returned function is called. */
      async function holdFetching(): Promise<() => void> {
        await DiceBot.ensureLoaded();
        const loader = DiceBot['loader'];
        const lookUp = loader.getGameSystemClass.bind(loader);
        const fetch = loader.dynamicLoad.bind(loader);
        const released = new Promise<void>((resolve) => (release = resolve));
        let arrived = false;
        vi.spyOn(loader, 'getGameSystemClass').mockImplementation((id: string) => {
          if (id === UNREACHABLE && !arrived) throw new Error('not loaded yet');
          return lookUp(id);
        });
        vi.spyOn(loader, 'dynamicLoad').mockImplementation(async (id: string) => {
          if (id === UNREACHABLE && !arrived) {
            await released;
            arrived = true;
          }
          return fetch(id);
        });
        void DiceBot.getHelpMessage(UNREACHABLE);
        return release;
      }

      /** The tag the chat would give the line under the system it is handed. */
      async function tagOf(line: string): Promise<string> {
        const gameSystem = await DiceBot.gameSystemForLineAsync(UNREACHABLE, line);
        const bot = new DiceBot();
        if (bot.checkSecretDiceCommand(gameSystem, line) || bot.checkSecretEditCommand(line)) {
          return `${gameSystem.ID} secret`;
        }
        return gameSystem.ID;
      }

      it.each(['こんにちは', '2d6 攻撃', 'CC<=50', 'x3 2d6', ':HP-5', 'hello there'])(
        'sends %s at once under the id the room chose',
        async (line) => {
          const release = await holdFetching();
          const sent: string[] = [];

          void tagOf(line).then((tag) => sent.push(tag));
          await new Promise((resolve) => setTimeout(resolve, 20));

          expect(sent).toEqual([UNREACHABLE]);
          release();
          await settle();
        }
      );

      it('sends a line holding a secret resource change at once, tagged as secret', async () => {
        await holdFetching();
        const sent: string[] = [];

        void tagOf('よろしく st:HP-2').then((tag) => sent.push(tag));
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(sent).toEqual([`${UNREACHABLE} secret`]);
      });

      it.each(['SCC<=50', 'x2 S2d6', '3 s1d100', 'sure', '{秘密}CC<=50', 'x{回数} S2d6'])(
        'holds %s until the system has arrived, then tags it as the system does',
        async (line) => {
          const release = await holdFetching();
          const sent: string[] = [];

          const tagged = tagOf(line).then((tag) => sent.push(tag));
          await new Promise((resolve) => setTimeout(resolve, 20));
          expect(sent).toEqual([]);

          release();
          await tagged;
          const loaded = await DiceBot.loadGameSystemAsync(UNREACHABLE);
          const secret = new DiceBot().checkSecretDiceCommand(loaded, line);
          expect(sent).toEqual([secret ? `${UNREACHABLE} secret` : UNREACHABLE]);
        }
      );

      it('keeps an ordinary line behind a held one, so lines go out in the order they were written', async () => {
        const release = await holdFetching();
        const sent: string[] = [];

        const held = DiceBot.gameSystemForLineAsync(UNREACHABLE, 'SCC<=50').then(() => sent.push('SCC<=50'));
        const ordinary = DiceBot.gameSystemForLineAsync(UNREACHABLE, 'こんにちは').then(() => sent.push('こんにちは'));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(sent).toEqual([]);

        release();
        await Promise.all([held, ordinary]);
        expect(sent).toEqual(['SCC<=50', 'こんにちは']);
      });

      it('hands over the system itself once it has been loaded', async () => {
        await DiceBot.loadGameSystemAsync(UNREACHABLE);
        const loader = DiceBot['loader'];
        const fetch = vi.spyOn(loader, 'dynamicLoad');

        for (const line of ['SCC<=50', 'こんにちは']) {
          const gameSystem = await DiceBot.gameSystemForLineAsync(UNREACHABLE, line);
          expect(gameSystem.ID).toBe(UNREACHABLE);
          expect(gameSystem.eval('CC<=50')?.text).toContain('1D100<=50');
        }
        expect(fetch).not.toHaveBeenCalled();
      });

      it('sends an ordinary line under the plain dice bot for an id not in the catalog', async () => {
        await DiceBot.ensureLoaded();

        const gameSystem = await DiceBot.gameSystemForLineAsync('NoSuchSystem', 'こんにちは');

        expect(gameSystem.ID).toBe('DiceBot');
      });
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
