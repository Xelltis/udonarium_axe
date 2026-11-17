import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { diceRolled$ } from '@axe/core/event/domain-events';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { AgentChatTools, type AgentSaid } from '@axe/features/agent-tools/agent-chat-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type GameSystemClass from 'bcdice/lib/game_system';

const signal = new AbortController().signal;
/**
 * A dice system whose pattern takes almost anything, as the plain dice bot's does, and that rolls
 * `NdM` and nothing else.
 */
const DICE = {
  ID: 'DiceBot',
  NAME: 'DiceBot',
  COMMAND_PATTERN: /^\S/,
  eval: (command: string) => (/^S?\d*D\d+/i.test(command) ? { text: `(${command}) ＞ 7`, secret: false } : null),
} as unknown as GameSystemClass;

describe('AgentChatTools', () => {
  let tools: AgentChatTools;
  let main: ChatTab;

  function call(tool: string, args: Record<string, unknown>): Promise<AgentSaid> {
    return tools.handlers[tool](args, { signal }) as Promise<AgentSaid>;
  }

  function said(): ChatMessage[] {
    return [...main.chatMessages];
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-gm-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'ai-gm-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.name = 'AI GM';
    PeerCursor.myCursor.userId = 'ai-gm-user';
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    main = new ChatTab();
    main.name = 'メイン';
    main.initialize();
    ChatTabList.instance.addChatTab(main);
    new DiceBot('DiceBot').initialize();
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(DICE);
    tools = TestBed.inject(AgentChatTools);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    vi.useRealTimers();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('says a line as the seat, marked for everyone as the AI’s, and waits for no dice where it rolls none', async () => {
    const result = await call('send_chat', { text: 'ようこそ、冒険者たち' });

    expect(result.note).toBeUndefined();
    expect(result.lines).toEqual([
      expect.objectContaining({ speaker: 'AI GM', text: 'ようこそ、冒険者たち', by_ai: true }),
    ]);
    expect(result.dice).toEqual([]);
    const [line] = said();
    expect(line.isByAi).toBe(true);
    expect(line.toXml()).toContain('via="ai"');
  });

  it('marks nothing said outside a call of the AI', () => {
    const line = TestBed.inject(ChatMessageService).sendSystemMessageToTab(main, 'お知らせ');
    expect(line.isByAi).toBe(false);
    expect(line.toXml()).not.toContain('via=');
  });

  it('speaks as a piece, and whispers to a seat by its name', async () => {
    const goblin = GameCharacter.create('ゴブリン', 1, '');
    goblin.location = { name: 'table', x: 0, y: 0 };
    goblin.update();

    const result = await call('send_chat', { text: 'ギギッ', as: 'ゴブリン', to: 'AI GM' });

    expect(result.lines[0]).toMatchObject({ speaker: expect.stringContaining('ゴブリン'), to: ['AI GM'] });
    expect(said()[0].sendTo).toEqual(['ai-gm-user']);
  });

  it('returns the dice bot’s answer with a line that rolls', async () => {
    const stop = diceRolled$.subscribe(() => undefined);
    const pending = call('roll_dice', { command: '2d6+1' });
    await vi.waitFor(() => expect(said()).toHaveLength(1));
    const answer = main.addMessage({
      from: 'System-BCDice',
      name: '<BCDice：AI GM>',
      text: '(2D6+1) ＞ 8',
      tag: 'system',
      timestamp: Date.now(),
    });
    diceRolled$.emit({ sourceMessageIdentifier: said()[0].identifier, resultMessageIdentifier: answer.identifier });

    const result = await pending;
    expect(result.dice).toEqual([expect.objectContaining({ text: '(2D6+1) ＞ 8' })]);
    stop();
  });

  it('refuses a turn command with words after it, saying nothing, and says one on its own', async () => {
    await expect(call('send_chat', { text: '&RN 次のラウンドです' })).rejects.toThrow(/line of its own/);
    expect(said()).toEqual([]);
  });

  it('refuses before saying anything a command the dice system does not read as a roll', async () => {
    await expect(call('roll_dice', { command: 'こんにちは' })).rejects.toThrow(/does not read こんにちは as a roll/);
    expect(said()).toEqual([]);
  });

  it('keeps a command the system reads as secret as it is, and puts S before one it does not', async () => {
    const dicebot = ObjectStore.instance.get<DiceBot>('DiceBot')!;
    vi.spyOn(dicebot, 'checkSecretDiceCommand').mockImplementation((_system, text) => /^S\d/i.test(text));
    vi.useFakeTimers();

    void call('roll_dice', { command: 'S2d6', secret: true }).catch(() => undefined);
    await vi.waitFor(() => expect(said()).toHaveLength(1));
    void call('roll_dice', { command: '1d20', secret: true }).catch(() => undefined);
    await vi.waitFor(() => expect(said()).toHaveLength(2));

    expect(said().map((line) => line.text)).toEqual(['S2d6', 'S1d20']);
    await vi.advanceTimersByTimeAsync(4000);
  });

  it('returns the line with a note, rather than failing, where the dice answer is slow', async () => {
    vi.useFakeTimers();
    const pending = call('roll_dice', { command: '2d6' });
    await vi.waitFor(() => expect(said()).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(4000);

    const result = await pending;
    expect(result.lines).toHaveLength(1);
    expect(result.dice).toEqual([]);
    expect(result.note).toMatch(/do not roll again/);
  });

  it('refuses to speak in a tab the seat may not speak in, saying nothing', async () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    main.plCanSpeak = false;

    await expect(call('send_chat', { text: 'やあ', tab: 'メイン' })).rejects.toThrow(
      /may not speak in the chat tab メイン/
    );
    expect(said()).toEqual([]);
  });
});
