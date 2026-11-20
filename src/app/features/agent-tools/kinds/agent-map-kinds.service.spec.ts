import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { switchOf } from '@axe/domain/tabletop/board-switch/board-switch';
import { stashOf } from '@axe/domain/tabletop/board-switch/concealment';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { GROUND_CHUNK_SAMPLE_COUNT } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { ensureGroundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { ensureMoveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

describe('AgentMapKinds', () => {
  let tools: AgentKindTools;
  let table: GameTable;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  function seat(role: PeerRole): void {
    PeerCursor.myCursor.role = role;
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'ai-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'ai-user';
    seat(PeerRole.GameMaster);
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.name = '地上';
    table.width = 20;
    table.height = 15;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    Config.instance.zoneEnabled = null;
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  /**
   * Hides the cells west of a column under fog nobody has explored, as a seat that is not the master sees
   * it: the cells the screen shows (`VisionService.isCellShown`), which a stretch of ground is shown by,
   * and any point of the table.
   */
  function fogWestOf(col: number): void {
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'isHiddenByFog').mockImplementation((x) => x < col * GRID);
    vi.spyOn(vision as unknown as { hidesGround(): boolean }, 'hidesGround').mockReturnValue(true);
    vi.spyOn(vision, 'isCellShown').mockImplementation(
      (grid, index) => index >= 0 && cellColRow(grid, index).col >= col
    );
  }

  describe('game-table', () => {
    it('makes a table without switching to it, writes its settings as the panel does, and takes it away', () => {
      const made = call('create_object', {
        kind: 'game-table',
        fields: {
          name: '地下',
          width: 30,
          grid_type: 'hex_vertical',
          snap: 'vertex',
          darkness: true,
          darkness_level: 50,
          weather: 'rain',
          fog_colour: '#112233',
          grid_colour: '#ff0000',
          music_on_show: 'stop',
        },
      }) as { id: string };
      const underground = ObjectStore.instance.get<GameTable>(made.id)!;

      expect(made).toMatchObject({
        name: '地下',
        in_view: false,
        width: 30,
        grid_type: 'hex_vertical',
        snap: 'vertex',
        darkness_level: 50,
        weather: 'rain',
        grid_shown: true,
        music_on_show: 'stop',
      });
      expect([underground.gridType, underground.gridSnap, underground.gridSnapStyle]).toEqual([
        GridType.HEX_VERTICAL,
        true,
        GridSnapStyle.VERTEX,
      ]);
      expect([underground.darknessLevel, underground.gridColor, underground.tableBgm]).toEqual([
        0.5,
        '#ff0000e6',
        'stop',
      ]);
      expect(TableSelecter.instance.viewTableIdentifier).toBe(table.identifier);
      expect(call('list_objects', { kind: 'game-table' })).toEqual([
        { id: table.identifier, name: '地上' },
        { id: made.id, name: '地下' },
      ]);

      expect(call('change_object', { kind: 'game-table', id: made.id, fields: { snap: 'off' } })).toMatchObject({
        snap: 'off',
      });
      expect(call('remove_object', { kind: 'game-table', id: made.id })).toEqual({
        removed: { id: made.id, name: '地下' },
      });
      expect(ObjectStore.instance.getObjects(GameTable)).toEqual([table]);
    });

    it('keeps the last table, as the panel does', () => {
      expect(() => call('remove_object', { kind: 'game-table', id: table.identifier })).toThrow(/last table/);
      expect(ObjectStore.instance.get(table.identifier)).toBe(table);
    });

    it('copies a table with what is laid on it under a name no table has, leaving the view where it was', () => {
      const trap = new TableTrigger();
      trap.initialize();
      table.appendChild(trap);

      const copied = call('act_on_object', {
        kind: 'game-table',
        id: table.identifier,
        action: 'duplicate',
        args: { name: '地上' },
      }) as { made: { id: string; name: string } };
      const copy = ObjectStore.instance.get<GameTable>(copied.made.id)!;

      expect(copied.made.name).toBe('地上 (2)');
      expect(copy.children.some((child) => child instanceof TableTrigger)).toBe(true);
      expect(TableSelecter.instance.viewTableIdentifier).toBe(table.identifier);
    });

    it('lets a player set what the table panel lets them, and keeps the billboard for the game master', () => {
      seat(PeerRole.Player);

      expect(
        call('change_object', { kind: 'game-table', id: table.identifier, fields: { recommends_flat: true } })
      ).toMatchObject({ recommends_flat: true });
      expect(() =>
        call('change_object', { kind: 'game-table', id: table.identifier, fields: { image_billboard: true } })
      ).toThrow(/Only the game master's seat may write the image_billboard/);
      expect([table.mode2d, table.imageBillboard]).toEqual([true, false]);
    });

    it('puts cells together into squares on a grid of squares alone, and takes only a colour as a colour', () => {
      table.gridType = GridType.HEX_HORIZONTAL;

      expect(() =>
        call('change_object', { kind: 'game-table', id: table.identifier, fields: { square_span: 2 } })
      ).toThrow(/Only a grid of squares/);
      expect(() =>
        call('change_object', {
          kind: 'game-table',
          id: table.identifier,
          fields: { name: '改名', fog_colour: 'redddd' },
        })
      ).toThrow(/fog_colour must be a colour written #rrggbb/);
      expect([table.squareSpan, table.fogColor, table.name]).toEqual([1, new GameTable('probe').fogColor, '地上']);
    });

    it('names the music and the cut-ins of a table only from what the room has, writing nothing otherwise', () => {
      expect(() =>
        call('change_object', {
          kind: 'game-table',
          id: table.identifier,
          fields: { name: '改名', music_on_show: '存在しない曲' },
        })
      ).toThrow(/There is no track named 存在しない曲/);
      expect(() =>
        call('change_object', {
          kind: 'game-table',
          id: table.identifier,
          fields: { name: '改名', cut_ins_on_show: ['無い演出'] },
        })
      ).toThrow(/There is no cut-in named 無い演出/);
      expect([table.name, table.tableBgm, table.cutInIdentifiers]).toEqual(['地上', '', '']);
    });
  });

  describe('table-trigger', () => {
    function layTrap(): string {
      return (
        call('create_object', {
          kind: 'table-trigger',
          options: { area: { col: 3, row: 4, width: 2, height: 1 } },
          fields: { name: '落とし穴', say: '床が抜けた', element: 'HP', amount: '2d6', check: '回避' },
        }) as { id: string }
      ).id;
    }

    it('lays ground for the game master in the cells named, with everything it does', () => {
      const id = layTrap();
      const trap = ObjectStore.instance.get<TableTrigger>(id)!;

      expect(trap.parent).toBe(table);
      expect([trap.col, trap.row, trap.width, trap.height]).toEqual([2, 3, 2, 1]);
      expect(call('get_object', { kind: 'table-trigger', id })).toMatchObject({
        name: '落とし穴',
        area: { col: 3, row: 4, width: 2, height: 1 },
        moment: 'stop',
        shown_to: 'master',
        say: '床が抜けた',
        on_the_ground: 'HP -2d6',
        armed: true,
      });
      expect(call('remove_object', { kind: 'table-trigger', id })).toEqual({ removed: { id, name: '落とし穴' } });
      expect(ObjectStore.instance.getObjects(TableTrigger)).toEqual([]);
    });

    it('keeps ground the players are not shown from them, and what any ground does', () => {
      const id = layTrap();
      seat(PeerRole.Player);

      expect(call('list_objects', { kind: 'table-trigger' })).toEqual([]);
      expect(() =>
        call('create_object', { kind: 'table-trigger', options: { area: { col: 1, row: 1, width: 1, height: 1 } } })
      ).toThrow(/Only the game master's seat may make a table-trigger/);

      ObjectStore.instance.get<TableTrigger>(id)!.shownTo = 'room';
      const read = call('get_object', { kind: 'table-trigger', id }) as Record<string, unknown>;

      expect(read).toEqual({
        id,
        name: '落とし穴',
        area: { col: 3, row: 4, width: 2, height: 1 },
        colour: expect.any(String),
        spent: false,
        on_the_ground: 'HP -2d6',
      });
      expect(() => call('change_object', { kind: 'table-trigger', id, fields: { name: '安全' } })).toThrow(
        /Only the game master's seat may write the name/
      );
    });

    it('hangs a switch on ground turned to be pressed and guards it as the map editor does, and takes it off again', () => {
      const id = layTrap();
      const trap = ObjectStore.instance.get<TableTrigger>(id)!;

      call('change_object', { kind: 'table-trigger', id, fields: { moment: 'press' } });

      expect([trap.once, trap.repeat, trap.spent]).toEqual([true, 'once', true]);
      expect(trap.pressSwitch).not.toBeNull();
      expect(call('list_objects', { kind: 'board-switch' })).toEqual([
        { id: trap.pressSwitch!.identifier, name: '落とし穴' },
      ]);
      expect(() => call('change_object', { kind: 'table-trigger', id, fields: { repeat: 'always' } })).toThrow(
        /change the repeat of that/
      );
      expect(() => call('remove_object', { kind: 'board-switch', id: trap.pressSwitch!.identifier })).toThrow(
        /needs its switch/
      );

      call('change_object', { kind: 'table-trigger', id, fields: { moment: 'enter' } });

      expect([trap.once, trap.repeat, trap.spent, switchOf(trap)]).toEqual([false, '', false, null]);
    });
  });

  describe('table-move-cost', () => {
    it('lays dear ground for the game master and shows it to everyone out of the fog', () => {
      const made = call('create_object', {
        kind: 'table-move-cost',
        options: { area: { col: 2, row: 2, width: 2, height: 2 } },
        fields: { extra_cost: 3 },
      }) as { id: string };
      const area = ObjectStore.instance.get<TableMoveCost>(made.id)!;

      expect([area.parent, area.extraCost]).toEqual([table, 3]);
      seat(PeerRole.Player);
      expect(call('get_object', { kind: 'table-move-cost', id: made.id })).toMatchObject({
        area: { col: 2, row: 2, width: 2, height: 2 },
        extra_cost: 3,
        road: false,
      });
      expect(() => call('change_object', { kind: 'table-move-cost', id: made.id, fields: { road: true } })).toThrow(
        /Only the game master's seat/
      );

      fogWestOf(4);
      expect(call('list_objects', { kind: 'table-move-cost' })).toEqual([]);
    });
  });

  describe('board-switch', () => {
    it('makes a terrain block into a switch for the game master, writes what it does, and resets and takes it off', () => {
      const lever = Terrain.create('レバー', 1, 1, 1, '', '');
      table.appendChild(lever);

      const made = call('create_object', {
        kind: 'board-switch',
        options: { on: 'レバー' },
        fields: { label: '引く', range: 1, actions: [{ kind: 'say', text: 'ガコン', delayMs: 0 }] },
      }) as { id: string };
      const target = switchOf(lever)!;

      expect(made).toMatchObject({
        id: target.identifier,
        on: { id: lever.identifier, kind: 'terrain', name: 'レバー' },
        label: '引く',
        range: 1,
        actions: [{ kind: 'say', text: 'ガコン', delayMs: 0 }],
      });
      expect(target.def.actions).toEqual([{ kind: 'say', text: 'ガコン', delayMs: 0, extra: {} }]);
      expect(() => call('create_object', { kind: 'board-switch', options: { on: lever.identifier } })).toThrow(
        /a switch already/
      );

      target.spent = true;
      call('act_on_object', { kind: 'board-switch', id: target.identifier, action: 'reset' });
      expect(target.spent).toBe(false);

      call('remove_object', { kind: 'board-switch', id: target.identifier });
      expect(switchOf(lever)).toBeNull();
    });

    it('shows a seat that is not the master no switch and lets it make none', () => {
      const lever = Terrain.create('レバー', 1, 1, 1, '', '');
      table.appendChild(lever);
      call('create_object', { kind: 'board-switch', options: { on: lever.identifier } });
      seat(PeerRole.Player);

      expect(call('list_objects', { kind: 'board-switch' })).toEqual([]);
      expect(() => call('create_object', { kind: 'board-switch', options: { on: lever.identifier } })).toThrow(
        /Only the game master's seat may make a board-switch/
      );
    });
  });

  describe('board-stash', () => {
    it('puts a block out of sight and brings it back for the game master', () => {
      const door = Terrain.create('隠し扉', 1, 1, 2, '', '');
      table.appendChild(door);

      expect(call('act_on_object', { kind: 'board-stash', action: 'conceal', args: { id: '隠し扉' } })).toEqual({
        concealed: { id: door.identifier, kind: 'terrain', name: '隠し扉' },
      });
      expect(door.parent).toBe(stashOf(table));
      expect(call('get_object', { kind: 'board-stash' })).toMatchObject({
        things: [{ id: door.identifier, kind: 'terrain', name: '隠し扉' }],
      });

      call('act_on_object', { kind: 'board-stash', action: 'reveal', args: { id: door.identifier } });
      expect(door.parent).toBe(table);
    });

    it('tells a seat that is not the master nothing of what is out of sight', () => {
      const door = Terrain.create('隠し扉', 1, 1, 2, '', '');
      table.appendChild(door);
      call('act_on_object', { kind: 'board-stash', action: 'conceal', args: { id: door.identifier } });
      seat(PeerRole.Player);

      expect(call('list_objects', { kind: 'board-stash' })).toEqual([]);
      expect(() =>
        call('act_on_object', { kind: 'board-stash', action: 'reveal', args: { id: door.identifier } })
      ).toThrow(/Only the game master's seat may reveal/);
      expect(door.parent).toBe(stashOf(table));
    });
  });

  describe('fog-memory', () => {
    it('counts what the party explored and lets a player clear it, as the table panel does', () => {
      const memory = ensureFogMemoryOn(table);
      const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
      const bits = new CellBits(grid.cols * grid.rows);
      for (const index of [0, 1, 21]) bits.set(index);
      memory.write(grid, bits);
      seat(PeerRole.Player);

      expect(call('get_object', { kind: 'fog-memory' })).toMatchObject({ table: table.identifier, explored_cells: 3 });
      call('act_on_object', { kind: 'fog-memory', action: 'reset' });
      expect([memory.bits, memory.generation]).toEqual(['', 1]);
    });
  });

  describe('engagement-zone', () => {
    let hero: GameCharacter;
    let foe: GameCharacter;

    beforeEach(() => {
      Config.instance.zoneEnabled = true;
      vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null as never);
      hero = GameCharacter.create('勇者', 1, '');
      hero.location = { name: 'table', x: 5 * GRID, y: 5 * GRID } as never;
      foe = GameCharacter.create('ゴブリン', 1, '');
      foe.location = { name: 'table', x: 5 * GRID, y: 5 * GRID } as never;
      foe.isNpc = true;
    });

    function declared(): string {
      return TestBed.inject(EngagementZoneService).declare(hero, foe)!.identifier;
    }

    it('lets the game master shape a zone, set what it holds and end it, taking everyone out', () => {
      const id = declared();

      expect(call('get_object', { kind: 'engagement-zone', id })).toMatchObject({
        centre: { col: 6, row: 6 },
        shape: 'circle',
        limit: 0,
        holding: { occupants: 2 },
        members: expect.arrayContaining([hero.identifier, foe.identifier]),
      });
      expect(
        call('change_object', { kind: 'engagement-zone', id, fields: { shape: 'square', limit: 4 } })
      ).toMatchObject({ shape: 'square', limit: 4 });
      expect(() => call('change_object', { kind: 'engagement-zone', id, fields: { limit: 1 } })).toThrow(
        /A zone holds from 2 to 20/
      );

      call('remove_object', { kind: 'engagement-zone', id });
      expect(zonesOn(table)).toEqual([]);
      expect([hero.engagementZone, foe.engagementZone]).toEqual(['', '']);
    });

    it('shows a player only zones holding a piece it sees, without what they hold, and lets it change none', () => {
      const id = declared();
      seat(PeerRole.Player);
      const read = call('get_object', { kind: 'engagement-zone', id }) as Record<string, unknown>;

      expect(read).not.toHaveProperty('limit');
      expect(read).not.toHaveProperty('holding');
      expect(() => call('change_object', { kind: 'engagement-zone', id, fields: { shape: 'square' } })).toThrow(
        /Only the game master's seat/
      );

      const sees = vi
        .spyOn(TestBed.inject(VisionService), 'isTokenVisible')
        .mockImplementation((piece) => piece === hero);
      expect(call('get_object', { kind: 'engagement-zone', id })).toMatchObject({ members: [hero.identifier] });
      sees.mockReturnValue(false);
      expect(call('list_objects', { kind: 'engagement-zone' })).toEqual([]);
    });

    it('lists and changes no zone where the room does not play them', () => {
      const id = declared();
      Config.instance.zoneEnabled = false;

      expect(call('list_objects', { kind: 'engagement-zone' })).toEqual([]);
      expect(() => call('remove_object', { kind: 'engagement-zone', id })).toThrow(/There is no engagement-zone/);
      expect(zonesOn(table)).toHaveLength(1);
    });
  });

  describe('move-block-map', () => {
    it('reads the closed cells a row at a time, leaving out those a player has not explored', () => {
      const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
      const bits = new CellBits(grid.cols * grid.rows);
      for (const index of [22, 23, 27, 80]) bits.set(index);
      ensureMoveBlockMapOn(table).write(grid, bits);

      expect(call('get_object', { kind: 'move-block-map' })).toMatchObject({
        closed: [
          { row: 2, cols: '3-4, 8' },
          { row: 5, cols: '1' },
        ],
      });

      seat(PeerRole.Player);
      fogWestOf(4);
      expect(call('get_object', { kind: 'move-block-map' })).toMatchObject({ closed: [{ row: 2, cols: '8' }] });
    });
  });

  it('keeps from a seat the closed cells and the dear ground the screen keeps from it, by the same rule', () => {
    const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
    const bits = new CellBits(grid.cols * grid.rows);
    bits.set(22);
    ensureMoveBlockMapOn(table).write(grid, bits);
    call('create_object', {
      kind: 'table-move-cost',
      options: { area: { col: 2, row: 2, width: 2, height: 2 } },
      fields: { extra_cost: 3 },
    });
    seat(PeerRole.Player);
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision as unknown as { hidesGround(): boolean }, 'hidesGround').mockReturnValue(true);
    vi.spyOn(vision, 'isCellShown').mockReturnValue(false);

    expect(call('get_object', { kind: 'move-block-map' })).toMatchObject({ closed: [] });
    expect(call('list_objects', { kind: 'table-move-cost' })).toEqual([]);
  });

  describe('ground-chunk', () => {
    it('reads the height at the middle of each cell, null off the board or under fog a player has not explored', () => {
      const raised = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
      raised[3 * 32 + 5] = 64;
      raised[1 * 32 + 1] = -32;
      const field = ensureGroundFieldOn(table);
      field.writeChunk({ cx: 0, cy: 0, heights: raised, paint: null });
      field.writeChunk({ cx: 1, cy: 0, heights: new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), paint: null });

      const [near, far] = call('list_objects', { kind: 'ground-chunk' }) as { id: string; name: string }[];
      const heights = (call('get_object', { kind: 'ground-chunk', id: near.id }) as { heights: (number | null)[][] })
        .heights;
      const beyond = call('get_object', { kind: 'ground-chunk', id: far.id }) as {
        first_cell: unknown;
        heights: (number | null)[][];
      };

      expect(near.name).toBe('cols 1-16, rows 1-16');
      expect([heights[1][2], heights[0][0], heights[0][1], heights[15][0]]).toEqual([1, -0.5, 0, null]);
      expect(beyond.first_cell).toEqual({ col: 17, row: 1 });
      expect([beyond.heights[0][3], beyond.heights[0][4]]).toEqual([0, null]);

      seat(PeerRole.Player);
      fogWestOf(2);
      const fogged = (call('get_object', { kind: 'ground-chunk', id: near.id }) as { heights: (number | null)[][] })
        .heights;
      expect([fogged[1][1], fogged[1][2]]).toEqual([null, 1]);
    });
  });
});
