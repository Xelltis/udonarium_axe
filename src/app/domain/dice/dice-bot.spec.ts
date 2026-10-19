import { TestBed } from '@angular/core/testing';
import {
  diceBotUnreachable$,
  DiceBotUnreachableEvent,
  diceRolled$,
  emitSendMessage,
  serverRollUnanswered$,
} from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { SERVER_ROLL_WAIT_MS } from '@axe/domain/dice/server-roll-requests';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { beMyself } from '@axe/testing/peer-context-stub';

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

  describe('in a room on a room server', () => {
    // Whose lines these are is said outright, not read off whatever the network was left doing.
    beforeEach(() => beMyself('acct_me'));

    it('asks the server to roll, with the answer made ready but not placed', async () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'acct_me';
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const tab = ChatTabList.instance.addChatTab('メイン');
      const asked = tab.addMessage({
        from: PeerCursor.myUserId,
        to: 'someone',
        name: 'わたし',
        text: '３ 2d6',
        tag: 'DiceBot',
        timestamp: 1000,
      });
      const bot = new DiceBot();
      bot.initialize();

      await bot['handleSendMessage']({ messageIdentifier: asked.identifier, messageTarget: null });

      const [context, sendTo] = send.mock.calls.find(
        ([sent]) => (sent as { eventName: string }).eventName === 'ROLL_REQUEST'
      )!;
      const request = (context as { data: Record<string, unknown> }).data;
      const message = request['message'] as { aliasName: string; syncData: Record<string, unknown> };
      const attributes = message.syncData['attributes'] as Record<string, unknown>;
      expect(sendTo).toBe('@authority');
      expect(request['command']).toBe('3 2d6');
      expect(request['gameSystem']).toBe('DiceBot');
      expect(request['speaker']).toBe('わたし');
      expect(message.aliasName).toBe('chat');
      expect(message.syncData['parentIdentifier']).toBe(tab.identifier);
      expect(attributes['from']).toBe('System-BCDice');
      expect(attributes['originFrom']).toBe(PeerCursor.myUserId);
      expect(attributes['timestamp']).toBe(1001);
      expect(attributes['to']).toBe(`someone ${PeerCursor.myUserId}`);
      expect(tab.chatMessages).toHaveLength(1);

      bot.destroy();
      tab.destroy();
    });

    it('rolls a line too long for the server here, as without one', async () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'acct_me';
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const tab = ChatTabList.instance.addChatTab('メイン');
      const asked = tab.addMessage({
        from: PeerCursor.myUserId,
        name: 'わたし',
        text: `2d6 ${'x'.repeat(4000)}`,
        tag: 'DiceBot',
        timestamp: 1000,
      });
      const bot = new DiceBot();
      bot.initialize();

      await bot['handleSendMessage']({ messageIdentifier: asked.identifier, messageTarget: null });

      expect(send.mock.calls.some(([sent]) => (sent as { eventName: string }).eventName === 'ROLL_REQUEST')).toBe(
        false
      );
      expect(tab.chatMessages).toHaveLength(2);
      bot.destroy();
      tab.destroy();
    });

    it('rolls here while the table is cut off from the room, asking the server nothing', async () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'acct_me';
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const tab = ChatTabList.instance.addChatTab('メイン');
      const asked = tab.addMessage({
        from: PeerCursor.myUserId,
        name: 'わたし',
        text: '2d6',
        tag: 'DiceBot',
        timestamp: 1000,
      });
      const bot = new DiceBot();
      bot.initialize();

      setNetworkIsolated(true);
      try {
        await bot['handleSendMessage']({ messageIdentifier: asked.identifier, messageTarget: null });
      } finally {
        setNetworkIsolated(false);
      }

      expect(send.mock.calls.some(([sent]) => (sent as { eventName: string }).eventName === 'ROLL_REQUEST')).toBe(
        false
      );
      expect(tab.chatMessages).toHaveLength(2);
      bot.destroy();
      tab.destroy();
    });

    it('takes the server’s answer, once it arrives, as a roll made here', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const bot = new DiceBot();
      bot.initialize();
      const rolled = vi.fn();
      const off = diceRolled$.subscribe(rolled);

      bot['serverRolls'].ask('the-answer', 'the-line', {});
      const answer = new ChatMessage('the-answer');
      answer.initialize();

      expect(rolled).toHaveBeenCalledWith({
        sourceMessageIdentifier: 'the-line',
        resultMessageIdentifier: 'the-answer',
      });
      off();
      answer.destroy();
      bot.destroy();
    });

    /** Asks the server for a roll of a line, as sent to the target named, and gives the request. */
    async function askedRoll(bot: DiceBot, targetName?: string) {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'acct_me';
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const tab = ChatTabList.instance.addChatTab('メイン');
      const asked = tab.addMessage({ from: PeerCursor.myUserId, name: 'わたし', text: '2d6', tag: 'DiceBot' });
      await bot['handleSendMessage']({
        messageIdentifier: asked.identifier,
        messageTarget: targetName === undefined ? null : { text: '2d6', object: { name: targetName } },
      });
      const requests = () =>
        send.mock.calls
          .map(([context]) => context as { eventName: string; data: Record<string, unknown> })
          .filter((context) => context.eventName === 'ROLL_REQUEST')
          .map((context) => context.data);
      return { tab, asked, requests };
    }

    it('names a target on one line, no longer than the server takes', async () => {
      const bot = new DiceBot();
      bot.initialize();

      const { tab, requests } = await askedRoll(bot, `ゴブリン] → 12 [x\nの${'王'.repeat(200)}`);

      const suffix = requests()[0]['suffix'] as string;
      expect(suffix).toMatch(/^ \[[^\r\n[\]→]{1,128}\]$/);
      expect(suffix.startsWith(' [ゴブリン］ ⇒ 12 ［x の王')).toBe(true);
      bot.destroy();
      tab.destroy();
    });

    it('asks for the answers to a line aimed at several targets in their order', async () => {
      const bot = new DiceBot();
      bot.initialize();
      const { tab, asked, requests } = await askedRoll(bot, 'ゴブリンA');

      await bot['handleSendMessage']({
        messageIdentifier: asked.identifier,
        messageTarget: { text: '2d6', object: { name: 'ゴブリンB' } },
      });

      const fractions = requests().map(
        (request) => (request['message'] as { syncData: { minorIndex: number } }).syncData.minorIndex
      );
      expect(fractions).toEqual([0, 0.001]);
      bot.destroy();
      tab.destroy();
    });

    it('tells of a roll the server would not make, and keeps quiet about a line that is no command', async () => {
      const bot = new DiceBot();
      bot.initialize();
      const told = vi.fn();
      const off = serverRollUnanswered$.subscribe(told);
      const first = await askedRoll(bot);
      const second = await askedRoll(bot);
      const answerOf = (request: Record<string, unknown>) => (request['message'] as { identifier: string }).identifier;

      localDispatch(
        'ROLL_REJECTED',
        { identifier: answerOf(first.requests()[0]), reason: 'not-allowed' },
        '@authority'
      );
      localDispatch(
        'ROLL_REJECTED',
        { identifier: answerOf(second.requests()[1]), reason: 'not-a-command' },
        '@authority'
      );

      expect(told.mock.calls).toEqual([[{ messageIdentifier: first.asked.identifier, reason: 'not-allowed' }]]);
      expect(bot['serverRolls'].size).toBe(0);
      off();
      bot.destroy();
      first.tab.destroy();
      second.tab.destroy();
    });

    it('asks again for a roll unanswered when the seat gets back into the room', async () => {
      const bot = new DiceBot();
      bot.initialize();
      const { tab, requests } = await askedRoll(bot);

      localDispatch('PEER_RECONNECT', { peerId: 'somebody', state: 'recovered' }, 'somebody');
      expect(requests()).toHaveLength(1);
      localDispatch('PEER_RECONNECT', { peerId: 'acct_me-peer', state: 'recovered' });

      expect(requests()).toHaveLength(2);
      expect(requests()[1]).toEqual(requests()[0]);
      bot.destroy();
      tab.destroy();
    });

    it('asks again too when the seat came back on a new link the server asked for, unseen', async () => {
      const bot = new DiceBot();
      bot.initialize();
      const { tab, requests } = await askedRoll(bot);

      localDispatch('PEER_RECONNECT', { peerId: 'acct_me-peer', state: 'resumed' });

      expect(requests()).toHaveLength(2);
      bot.destroy();
      tab.destroy();
    });

    it('tells of no roll that times out once the room is left', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const bot = new DiceBot();
      bot.initialize();
      const told = vi.fn();
      const off = serverRollUnanswered$.subscribe(told);
      const { tab } = await askedRoll(bot);
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);

      vi.advanceTimersByTime(60_000);

      expect(told).not.toHaveBeenCalled();
      off();
      vi.useRealTimers();
      bot.destroy();
      tab.destroy();
    });

    it('waits on no roll while its link is down', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const bot = new DiceBot();
      bot.initialize();
      const told = vi.fn();
      const off = serverRollUnanswered$.subscribe(told);
      const { tab } = await askedRoll(bot);

      localDispatch('PEER_RECONNECT', { peerId: 'acct_me-peer', state: 'retrying' });
      vi.advanceTimersByTime(120_000);

      expect(told).not.toHaveBeenCalled();
      expect(bot['serverRolls'].size).toBe(1);
      off();
      vi.useRealTimers();
      bot.destroy();
      tab.destroy();
    });

    it('tells of a roll unanswered for a minute while its link is up', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'isAuthorityOpen', 'get').mockReturnValue(true);
      const bot = new DiceBot();
      bot.initialize();
      const told = vi.fn();
      const off = serverRollUnanswered$.subscribe(told);
      const { tab, asked } = await askedRoll(bot);

      vi.advanceTimersByTime(SERVER_ROLL_WAIT_MS);

      expect(told).toHaveBeenCalledWith({ messageIdentifier: asked.identifier, reason: 'timeout' });
      off();
      vi.useRealTimers();
      bot.destroy();
      tab.destroy();
    });

    it('keeps a roll asked while its link is down past a minute, and asks again once back', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const open = vi.spyOn(Network, 'isAuthorityOpen', 'get').mockReturnValue(false);
      const bot = new DiceBot();
      bot.initialize();
      const told = vi.fn();
      const off = serverRollUnanswered$.subscribe(told);
      localDispatch('PEER_RECONNECT', { peerId: 'acct_me-peer', state: 'retrying' });
      const { tab, requests } = await askedRoll(bot);

      vi.advanceTimersByTime(SERVER_ROLL_WAIT_MS * 2);
      expect(told).not.toHaveBeenCalled();
      open.mockReturnValue(true);
      localDispatch('PEER_RECONNECT', { peerId: 'acct_me-peer', state: 'recovered' });

      expect(requests()).toHaveLength(2);
      expect(bot['serverRolls'].size).toBe(1);
      off();
      vi.useRealTimers();
      bot.destroy();
      tab.destroy();
    });

    it('keeps the rolls asked while a replay’s board cut it off from the room, and asks again once back', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'isAuthorityOpen', 'get').mockReturnValue(true);
      const bot = new DiceBot();
      bot.initialize();
      const told = vi.fn();
      const off = serverRollUnanswered$.subscribe(told);
      const { tab, requests } = await askedRoll(bot);

      setNetworkIsolated(true);
      localDispatch('PEER_RECONNECT', { peerId: 'acct_me-peer', state: 'recovered' });
      vi.advanceTimersByTime(SERVER_ROLL_WAIT_MS * 2);
      expect(told).not.toHaveBeenCalled();
      setNetworkIsolated(false);

      expect(requests().length).toBeGreaterThan(1);
      expect(bot['serverRolls'].size).toBe(1);
      off();
      vi.useRealTimers();
      bot.destroy();
      tab.destroy();
    });

    it('forgets the rolls asked in a room once another room is opened', async () => {
      const roomKey = vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('room-1');
      const bot = new DiceBot();
      bot.initialize();
      const { tab } = await askedRoll(bot);

      roomKey.mockReturnValue('room-2');
      localDispatch('OPEN_NETWORK', { peerId: 'me' });

      expect(bot['serverRolls'].size).toBe(0);
      bot.destroy();
      tab.destroy();
    });

    it('keeps the rolls asked in a room while out of any room, and asks again on getting back in', async () => {
      const roomKey = vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('room-1');
      const bot = new DiceBot();
      bot.initialize();
      const { tab, requests } = await askedRoll(bot);

      roomKey.mockReturnValue(null);
      localDispatch('OPEN_NETWORK', { peerId: 'standby' });
      expect(bot['serverRolls'].size).toBe(1);
      roomKey.mockReturnValue('room-1');
      localDispatch('OPEN_NETWORK', { peerId: 'acct_me-peer' });

      expect(requests()).toHaveLength(2);
      bot.destroy();
      tab.destroy();
    });

    it('asks again for the rolls unanswered once the same room is opened again, under another seat too', async () => {
      vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('room-1');
      const bot = new DiceBot();
      bot.initialize();
      const { tab, requests } = await askedRoll(bot);

      localDispatch('OPEN_NETWORK', { peerId: 'acct_other-peer' });

      expect(requests()).toHaveLength(2);
      expect(requests()[1]).toEqual(requests()[0]);
      expect(bot['serverRolls'].size).toBe(1);
      bot.destroy();
      tab.destroy();
    });
  });

  describe('with SkyWay, or outside a room', () => {
    beforeEach(() => beMyself());

    it('rolls here and asks no server', async () => {
      PeerCursor.createMyCursor();
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const tab = ChatTabList.instance.addChatTab('メイン');
      const asked = tab.addMessage({ from: PeerCursor.myUserId, name: 'わたし', text: '2d6', tag: 'DiceBot' });
      const bot = new DiceBot();
      bot.initialize();

      await bot['handleSendMessage']({ messageIdentifier: asked.identifier, messageTarget: null });

      expect(send.mock.calls.some(([sent]) => (sent as { eventName: string }).eventName === 'ROLL_REQUEST')).toBe(
        false
      );
      expect(tab.chatMessages).toHaveLength(2);
      expect(tab.chatMessages[1].isServerRoll).toBe(false);
      bot.destroy();
      tab.destroy();
    });
  });

  it('throws the dice in the look the roll asked for, and in none where it asked for none', () => {
    PeerCursor.createMyCursor();
    const tab = ChatTabList.instance.addChatTab('メイン');
    const fancy = tab.addMessage({
      from: 'me',
      name: 'わたし',
      text: '2d6',
      timestamp: 1000,
      diceLook: '{"material":"marble"}',
      diceImageIdentifier: 'ab'.repeat(32),
    });
    const plain = tab.addMessage({ from: 'me', name: 'わたし', text: '2d6', timestamp: 2000 });
    const bot = new DiceBot();
    bot.initialize();

    bot['sendResultMessage']({ id: null, result: '(2D6) → 7', isSecret: false }, fancy);
    bot['sendResultMessage']({ id: null, result: '(2D6) → 9', isSecret: false }, plain);
    const answerTo = (total: number) => tab.chatMessages.find((line) => line.text.includes(`→ ${total}`))!;
    const fancyAnswer = answerTo(7);
    const plainAnswer = answerTo(9);

    expect(fancyAnswer.diceLook).toBe('{"material":"marble"}');
    expect(fancyAnswer.diceImageIdentifier).toBe('ab'.repeat(32));
    expect(plainAnswer.diceImageIdentifier ?? '').toBe('');
    expect(plainAnswer.diceLook ?? '').toBe('');

    bot.destroy();
    tab.destroy();
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
