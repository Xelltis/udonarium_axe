import { TestBed } from '@angular/core/testing';
import { type AgentEventBatch, AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { AgentReadTools } from '@axe/features/agent-tools/agent-read-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

describe('AgentReadTools', () => {
  let tools: AgentReadTools;
  let table: GameTable;
  let main: ChatTab;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  function pieceAt(name: string, col: number, row: number): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: (col - 1) * GRID, y: (row - 1) * GRID };
    piece.update();
    return piece;
  }

  /** When the next line is said: each later than the one before, whatever the clock says. */
  let said = 1000;

  function say(text: string, more: Record<string, unknown> = {}) {
    said += 1000;
    return main.addMessage({
      from: PeerCursor.myCursor.userId,
      name: 'GM',
      text,
      timestamp: said,
      tag: '',
      imageIdentifier: '',
      ...more,
    });
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
    table = new GameTable();
    table.name = '洞窟';
    table.width = 20;
    table.height = 15;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    main = new ChatTab();
    main.name = 'メイン';
    main.initialize();
    ChatTabList.instance.addChatTab(main);
    tools = TestBed.inject(AgentReadTools);
  });

  afterEach(() => {
    TestBed.inject(AgentEventLog).stop();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    vi.useRealTimers();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('describes the room as the seat sees it: the seat, the table and its grid, and the chat tabs', () => {
    expect(call('get_room')).toMatchObject({
      seat: { name: 'AI GM', role: 'gm', may_change: true },
      table: { id: table.identifier, name: '洞窟', grid: 'square', cols: 20, rows: 15, square_length: null },
      chat_tabs: [{ id: main.identifier, name: 'メイン' }],
      turn: { round: 0, current: null },
      events_cursor: expect.stringMatching(/^[0-9a-z]*\.\d+$/),
    });
  });

  it('lists the pieces with their squares counted from 1, and finds them by name', () => {
    pieceAt('ゴブリン', 3, 4);
    pieceAt('オーク', 1, 1);

    expect(call('list_pieces', { name: 'ゴブ' })).toEqual([
      expect.objectContaining({ name: 'ゴブリン', square: { col: 3, row: 4 }, altitude: 0, size: 1, npc: false }),
    ]);
    expect((call('list_pieces') as unknown[]).length).toBe(2);
  });

  it('counts squares on a hex table by its columns and rows', () => {
    table.gridType = GridType.HEX_HORIZONTAL;
    const piece = pieceAt('ゴブリン', 1, 1);

    expect((call('list_pieces') as { square: unknown }[])[0].square).toEqual(tools['views'].squareOf(piece));
    expect((call('get_room') as { table: { grid: string } }).table.grid).toBe('hex (pointy top)');
  });

  it('reads a piece in full, its sheet as a tree, and its chat palette', () => {
    const piece = pieceAt('ゴブリン', 3, 4);
    piece.detailDataElement!.appendChild(DataElement.create('HP', 10, { type: 'numberResource', currentValue: 7 }));
    piece.chatPalette?.setPalette('2d6+3 こん棒');

    const read = call('get_piece', { piece: 'ゴブリン' }) as Record<string, unknown>;
    expect(read['resources']).toContainEqual({ name: 'HP', current: 7, max: 10 });
    expect(read['sheet']).toEqual(expect.arrayContaining([{ name: 'HP', value: 10, current: 7 }]));
    expect(read['palette']).toEqual(['2d6+3 こん棒']);
  });

  it('refuses a piece it cannot find, and a name two pieces share', () => {
    pieceAt('ゴブリン', 1, 1);
    pieceAt('ゴブリン', 2, 1);

    expect(() => call('get_piece', { piece: 'ドラゴン' })).toThrow(AgentToolError);
    expect(() => call('get_piece', { piece: 'ゴブリン' })).toThrow(/2 pieces are named ゴブリン/);
  });

  it('reads the chat newest last, leaving out a whisper to someone else and blanking another’s secret roll', () => {
    say('ようこそ');
    say('ひそひそ', { to: 'someone-else', from: 'someone' });
    say('S2d6', { tag: 'DiceBot secret', from: 'someone' });

    const read = call('read_chat') as { lines: { text: string | null; secret?: boolean; seat?: string }[] };
    expect(read.lines.map((line) => line.text)).toEqual(['ようこそ', null]);
    expect(read.lines[0].seat).toBe('AI GM');
    expect(read.lines[1].secret).toBe(true);
    expect((call('read_chat', { limit: 1 }) as { lines: unknown[] }).lines).toHaveLength(1);
  });

  it('hands a game master kept to some tabs the same lines by every road: as they are said, as it waits, as it reads back', async () => {
    const chatter = ChatTabList.instance.addChatTab('雑談');
    const views = TestBed.inject(AgentViews);
    const events = TestBed.inject(AgentEventLog);
    views.tabsRead.set(new Set([main.identifier]));
    events.start();
    const waiting = call('wait_for_events', { timeout_seconds: 5 }) as Promise<AgentEventBatch>;
    const beside = (text: string, more: Record<string, unknown> = {}) =>
      chatter.addMessage({
        from: 'someone',
        name: '誰か',
        text,
        timestamp: (said += 1000),
        tag: '',
        imageIdentifier: '',
        ...more,
      });

    const notices = ChatTabList.instance.ensureSystemTab();
    const lines = [
      say('扉を開けます', { from: 'someone' }),
      beside('ここだけの話'),
      // The answer to a roll made beside is said beside, and is kept from it with the rest of that tab.
      beside('(2D6) ＞ 7', { tag: 'system', from: 'System-BCDice' }),
      beside('投票が始まりました', { tag: 'system-message', from: 'System' }),
      notices.addMessage({
        from: 'System',
        name: 'System',
        text: '罠が作動した',
        timestamp: (said += 1000),
        tag: 'system-message',
        imageIdentifier: '',
      }),
      beside('GMにだけ', { to: 'ai-gm-user' }),
    ];
    const meant = ['扉を開けます', '罠が作動した', 'GMにだけ'];

    // The rule itself.
    expect(lines.flatMap((line) => views.lineRead(line)?.text ?? [])).toEqual(meant);
    // As they are said, which is also what a game master is handed with its turn.
    const heard = (await waiting).events;
    const later = (await call('wait_for_events', {
      after: (await waiting).cursor,
      timeout_seconds: 1,
    })) as AgentEventBatch;
    expect([...heard, ...later.events].map((event) => (event as { text?: string }).text)).toEqual(meant);
    // As it reads back, from either tab.
    const read = (tab: string) =>
      (call('read_chat', { tab }) as { lines: { text: string }[] }).lines.map((line) => line.text);
    expect([...read('メイン'), ...read(notices.name), ...read('雑談')]).toEqual(meant);

    // What it wrote itself is told back to it whichever tab it wrote it in, and it finds any tab to write in.
    expect(views.chatLine(lines[1])?.text).toBe('ここだけの話');
    expect(tools.tab('雑談')).toBe(chatter);

    // Kept to no tab, every line is its to read.
    views.tabsRead.set(null);
    expect(lines.flatMap((line) => views.lineRead(line)?.text ?? [])).toEqual([
      '扉を開けます',
      'ここだけの話',
      '(2D6) ＞ 7',
      '投票が始まりました',
      '罠が作動した',
      'GMにだけ',
    ]);
  });

  it('names the seat a line came from, this seat’s own before its cursor knows its user, and says plainly who sent it', () => {
    PeerCursor.myCursor.userId = '';
    say('こんばんは', { from: 'ai-gm-user' });
    say('だれ？', { from: 'gone-user' });

    const read = call('read_chat') as { lines: { seat?: string; by_ai: boolean }[] };
    expect(read.lines.map((line) => line.seat)).toEqual(['AI GM', '(a seat no longer here)']);
    expect(read.lines.map((line) => line.by_ai)).toEqual([false, false]);
  });

  it('reads the numbers a sheet keeps as text as numbers', () => {
    const piece = pieceAt('ゴブリン', 1, 1);
    piece.detailDataElement!.appendChild(
      DataElement.create('気力', '5', { type: 'numberResource', currentValue: '3' })
    );

    const [listed] = call('list_pieces', { name: 'ゴブリン' }) as { resources: unknown[] }[];
    expect(listed.resources).toContainEqual({ name: '気力', current: 3, max: 5 });
  });

  it('lists the tables and the scenes, and refuses a kind of thing it does not know', () => {
    expect(call('list_assets', { kind: 'tables' })).toEqual([{ id: table.identifier, name: '洞窟' }]);
    expect(call('list_assets', { kind: 'scenes' })).toEqual([]);
    expect(() => call('list_assets', { kind: 'weather' })).toThrow(/no kind of thing called weather/);
  });

  it('lists and reads the scenario texts on the game master’s seat only', () => {
    const text = new ScenarioText();
    text.title = '導入';
    text.folderName = '第1話';
    text.write('村長「よく来てくれた」');
    text.initialize();

    expect(call('list_assets', { kind: 'scenario_texts' })).toEqual([{ id: text.identifier, name: '導入' }]);
    expect(call('read_scenario_text', { text: '導入' })).toEqual({
      id: text.identifier,
      title: '導入',
      folder: '第1話',
      text: '村長「よく来てくれた」',
    });

    PeerCursor.myCursor.role = PeerRole.Player;
    for (const [tool, args] of [
      ['list_assets', { kind: 'scenario_texts' }],
      ['read_scenario_text', { text: '導入' }],
    ] as const) {
      expect(() => call(tool, args)).toThrow(expect.objectContaining({ code: 'not_allowed' }) as AgentToolError);
    }
  });

  it('waits for a chat line said after it began, and carries on from the cursor it returned', async () => {
    const events = TestBed.inject(AgentEventLog);
    events.start();
    const waiting = call('wait_for_events', { timeout_seconds: 5 }) as Promise<AgentEventBatch>;
    say('こんばんは');
    const first = await waiting;

    expect(first.events).toEqual([expect.objectContaining({ kind: 'chat', text: 'こんばんは' })]);
    expect(first.events[0]).not.toHaveProperty('at');
    say('2d6');
    const second = (await call('wait_for_events', { after: first.cursor, timeout_seconds: 1 })) as AgentEventBatch;
    expect(second.events.map((event) => (event as { text?: string }).text)).toEqual(['2d6']);
  });

  it('tells a piece’s move once it has settled, at the square it ended on', async () => {
    const piece = pieceAt('ゴブリン', 1, 1);
    const events = TestBed.inject(AgentEventLog);
    events.start();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    for (const col of [2, 3, 4]) {
      piece.location = { name: 'table', x: (col - 1) * GRID, y: 0 };
      // A change is told after the task that made it, as the room batches its changes.
      await Promise.resolve();
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    const batch = await events.waitFor('0', 10);
    expect(batch.events).toEqual([
      expect.objectContaining({
        kind: 'piece_moved',
        piece: { id: piece.identifier, name: 'ゴブリン' },
        square: { col: 4, row: 1 },
      }),
    ]);
  });

  it('reads a cursor from before the log started again from the start of the new run', async () => {
    const events = TestBed.inject(AgentEventLog);
    events.start();
    say('一度目');
    const before = await events.waitFor(undefined, 10);
    events.stop();
    events.start();
    say('二度目');

    const after = await events.waitFor(before.cursor, 10);
    expect(after.events.map((event) => (event as { text?: string }).text)).toEqual(['二度目']);
    expect(after.cursor).not.toBe(before.cursor);
  });

  it('names in a turn only a piece the seat sees', async () => {
    const hidden = pieceAt('暗殺者', 2, 2);
    const events = TestBed.inject(AgentEventLog);
    events.start();
    vi.spyOn(TestBed.inject(AgentViews), 'sees').mockReturnValue(false);
    TurnState.instance.round = 1;
    TurnState.instance.phase = 'acting';
    TurnState.instance.currentIdentifier = hidden.identifier;
    TestBed.inject(ObjectChangeService).notifyChanged(TurnState.instance.identifier);
    TestBed.tick();

    const batch = await events.waitFor('0', 10);
    expect(batch.events).toContainEqual(expect.objectContaining({ kind: 'turn', current: null }));
  });

  it('returns nothing once the time is up, from now where no cursor is given', async () => {
    say('前の発言');
    TestBed.inject(AgentEventLog).start();
    const batch = (await call('wait_for_events', { timeout_seconds: 1 })) as AgentEventBatch;

    expect(batch.events).toEqual([]);
    expect(batch.cursor).toMatch(/^[0-9a-z]+\.\d+$/);
  });
});
