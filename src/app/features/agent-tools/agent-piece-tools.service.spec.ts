import { TestBed } from '@angular/core/testing';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { AgentChatTools } from '@axe/features/agent-tools/agent-chat-tools.service';
import { AgentPieceTools } from '@axe/features/agent-tools/agent-piece-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

describe('AgentPieceTools', () => {
  let tools: AgentPieceTools;
  let views: AgentViews;

  async function call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    return tools.handlers[tool](args, { signal });
  }

  function pieceAt(name: string, col: number, row: number): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: (col - 1) * GRID, y: (row - 1) * GRID };
    piece.update();
    return piece;
  }

  function hp(piece: GameCharacter, current: number, max: number): DataElement {
    const item = DataElement.create('体力', max, { type: 'numberResource', currentValue: current });
    piece.detailDataElement!.appendChild(item);
    return item;
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
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 10;
    table.height = 8;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    tools = TestBed.inject(AgentPieceTools);
    views = TestBed.inject(AgentViews);
  });

  afterEach(() => {
    TestBed.inject(AgentEventLog).stop();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('moves a piece to a square, and refuses a square off the table', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);

    expect(await call('move_piece', { piece: 'ゴブリン', col: 4, row: 3 })).toMatchObject({
      square: { col: 4, row: 3 },
    });
    expect(views.squareOf(goblin)).toEqual({ col: 4, row: 3 });
    await expect(call('move_piece', { piece: 'ゴブリン', col: 11, row: 1 })).rejects.toThrow(
      'Square 11, 1 is off the table, which is 10 by 8 squares.'
    );
  });

  it('changes a resource by saying it in chat as the piece, and tells the value before and after', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);
    const item = hp(goblin, 10, 12);
    const say = vi.spyOn(TestBed.inject(AgentChatTools), 'say').mockImplementation(async (text) => {
      item.currentValue = text === ':体力-3' ? 7 : 12;
      return { lines: [], dice: [] };
    });

    expect(await call('change_resource', { piece: 'ゴブリン', name: '体力', by: -3 })).toEqual({
      piece: 'ゴブリン',
      resource: '体力',
      before: 10,
      after: 7,
    });
    expect(say).toHaveBeenCalledWith(':体力-3', goblin.identifier, '', '', signal);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const raised = call('change_resource', { piece: 'ゴブリン', name: '体力', to: 20, part: 'maximum' });
      await vi.runAllTimersAsync();
      await raised;
    } finally {
      vi.useRealTimers();
    }
    expect(say).toHaveBeenLastCalledWith(':体力^=20', goblin.identifier, '', '', signal);
  });

  it('neither reads nor changes a resource of a piece whose sheet the seat may not open', async () => {
    const dragon = pieceAt('ドラゴン', 1, 1);
    hp(dragon, 250, 300);
    PeerCursor.myCursor.role = PeerRole.Player;
    vi.spyOn(views, 'sheetOpen').mockReturnValue(false);
    const say = vi.spyOn(TestBed.inject(AgentChatTools), 'say');

    await expect(call('change_resource', { piece: 'ドラゴン', name: '体力', by: 0 })).rejects.toThrow(
      'This seat may not open the sheet of ドラゴン.'
    );
    await expect(call('change_resource', { piece: 'ドラゴン', name: '体力', by: -1 })).rejects.toThrow(AgentToolError);
    expect(say).not.toHaveBeenCalled();
  });

  it('neither adds nor takes off a buff of a piece that keeps its buffs from the seat', async () => {
    const dragon = pieceAt('ドラゴン', 1, 1);
    dragon.hideBuff = true;
    dragon.buffs.addRound('怒り', '', 3);
    PeerCursor.myCursor.role = PeerRole.Player;

    await expect(call('remove_buff', { piece: 'ドラゴン', name: '怒り' })).rejects.toThrow(
      'This seat is not shown the buffs of ドラゴン.'
    );
    await expect(call('remove_buff', { piece: 'ドラゴン', name: 'ない' })).rejects.toThrow(/not shown the buffs/);
    await expect(call('add_buff', { piece: 'ドラゴン', name: '毒', note: '', rounds: 2 })).rejects.toThrow(
      /not shown the buffs/
    );
    expect(dragon.buffs.list().map((buff) => buff.name)).toEqual(['怒り']);
  });

  it('says nothing for a change that changes nothing, and refuses what it cannot change', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);
    hp(goblin, 10, 12);
    const say = vi.spyOn(TestBed.inject(AgentChatTools), 'say');

    expect(await call('change_resource', { piece: 'ゴブリン', name: '体力', to: 10 })).toMatchObject({ after: 10 });
    expect(say).not.toHaveBeenCalled();
    await expect(call('change_resource', { piece: 'ゴブリン', name: '体力', by: 1, to: 2 })).rejects.toThrow(
      'Give either by or to'
    );
    await expect(call('change_resource', { piece: 'ゴブリン', name: '体力' })).rejects.toThrow(AgentToolError);
    await expect(call('change_resource', { piece: 'ゴブリン', name: 'H P', by: 1 })).rejects.toThrow(/set_sheet_value/);
    await expect(call('change_resource', { piece: 'ゴブリン', name: '魔力', by: 1 })).rejects.toThrow(
      'ゴブリン has no resource named 魔力.'
    );
  });

  it('writes a number or text on a sheet, and refuses an item the sheet does not have', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);
    const level = DataElement.create('レベル', 1);
    const note = DataElement.create('メモ', '');
    goblin.detailDataElement!.appendChild(level);
    goblin.detailDataElement!.appendChild(note);

    await call('set_sheet_value', { piece: 'ゴブリン', name: 'レベル', value: '3' });
    await call('set_sheet_value', { piece: 'ゴブリン', name: 'メモ', value: '洞窟の見張り' });

    expect(level.value).toBe(3);
    expect(note.value).toBe('洞窟の見張り');
    await expect(call('set_sheet_value', { piece: 'ゴブリン', name: '弱点', value: '3' })).rejects.toThrow(
      'ゴブリン has no sheet item named 弱点.'
    );
  });

  it('puts a buff on and takes it off', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);

    await call('add_buff', { piece: 'ゴブリン', name: '毒', note: '毎ラウンド1点', rounds: 2 });
    expect(goblin.buffs.find('毒')?.value).toBe(2);
    await call('remove_buff', { piece: 'ゴブリン', name: '毒' });
    expect(goblin.buffs.find('毒')).toBeFalsy();
    await expect(call('remove_buff', { piece: 'ゴブリン', name: '毒' })).rejects.toThrow(
      'ゴブリン has no buff named 毒.'
    );
  });

  it('chooses the targets anew, and clears them', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);
    const orc = pieceAt('オーク', 2, 1);
    const targets = TestBed.inject(PieceTargetService);

    await call('set_targets', { pieces: ['ゴブリン', 'オーク'] });
    expect([goblin.targeted, orc.targeted]).toEqual([true, true]);
    await call('set_targets', { pieces: ['オーク'] });
    expect([goblin.targeted, orc.targeted]).toEqual([false, true]);
    await call('set_targets', { pieces: [] });
    expect(targets.anything()).toBe(false);
  });

  it('moves the round on without asking anybody at the screen', async () => {
    const turns = TestBed.inject(TurnOrderService);
    const advance = vi.spyOn(turns, 'advanceRound').mockResolvedValue();

    await call('advance_turn', { action: 'next_round' });
    expect(advance).toHaveBeenCalledWith({ ask: false });
    await expect(call('advance_turn', { action: 'to_piece' })).rejects.toThrow('to_piece needs a piece.');
  });

  it('puts a new piece at a square, writing its sheet and naming the items it does not have', async () => {
    const made = (await call('create_piece', {
      name: 'スケルトン',
      col: 5,
      row: 2,
      npc: true,
      values: [
        { name: 'HP', value: '15' },
        { name: '弱点', value: '殴打' },
      ],
    })) as Record<string, unknown>;

    expect(made).toMatchObject({ name: 'スケルトン', square: { col: 5, row: 2 }, npc: true, unknown_items: ['弱点'] });
    const piece = views.visiblePieces().find((each) => each.name === 'スケルトン')!;
    expect(DataElement.findElementByReference(piece.detailDataElement!, 'HP')).toMatchObject({
      value: 15,
      currentValue: 15,
    });
  });

  it('takes a piece off the table into the shared inventory', async () => {
    const goblin = pieceAt('ゴブリン', 1, 1);

    expect(await call('remove_piece', { piece: 'ゴブリン' })).toEqual({
      removed: { id: goblin.identifier, name: 'ゴブリン' },
    });
    expect(goblin.location.name).toBe('common');
  });
});
