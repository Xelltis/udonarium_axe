import { TestBed } from '@angular/core/testing';
import { DoorService } from '@axe/application/tabletop/door.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { ImageTag } from '@axe/domain/media/image-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import type { TerrainFogCover } from '@axe/domain/tabletop/terrain-cover';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

type Viewed = Record<string, unknown> & { id: string };

describe('AgentBoardKinds', () => {
  let tools: AgentKindTools;
  let table: GameTable;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }
  function listed(kind: string): string[] {
    return (call('list_objects', { kind }) as { id: string }[]).map((each) => each.id);
  }
  function make(kind: string, body: Record<string, unknown> = {}): Viewed {
    return call('create_object', { kind, ...body }) as Viewed;
  }
  function change(kind: string, id: string, fields: Record<string, unknown>): Viewed {
    return call('change_object', { kind, id, fields }) as Viewed;
  }
  function read(kind: string, id: string): Viewed {
    return call('get_object', { kind, id }) as Viewed;
  }
  function act(kind: string, id: string, action: string, args: Record<string, unknown> = {}): unknown {
    return call('act_on_object', { kind, id, action, args });
  }
  function seat(role: PeerRole): void {
    PeerCursor.myCursor.role = role;
  }
  function picture(identifier: string, secret = false): string {
    ImageStorage.instance.add(identifier);
    ImageTag.create(identifier).isSecret = secret;
    return identifier;
  }
  function block(name: string, image: string): Terrain {
    const terrain = Terrain.create(name, 1, 1, 1, image, image);
    table.appendChild(terrain);
    return terrain;
  }
  function pieceAt(name: string, col: number, row: number): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: (col - 1) * GRID, y: (row - 1) * GRID };
    piece.update();
    return piece;
  }
  function presetNamed(name: string, gmOnly = false): EffectPreset {
    const preset = new EffectPreset();
    preset.name = name;
    preset.gmOnly = gmOnly;
    preset.initialize();
    return preset;
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
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.name = '洞窟';
    table.width = 20;
    table.height = 15;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
  });

  it('offers every kind of the board, each made, changed and taken away by any seat that may write', () => {
    const kinds = [
      'terrain',
      'table-mask',
      'white-board',
      'light-source',
      'table-ambience',
      'table-background-layer',
      'table-ruler',
      'effect-field',
    ];
    for (const kind of kinds) {
      const [described] = call('describe_kinds', { kind }) as Record<string, unknown>[];
      expect(described).toMatchObject({ kind, create: { by: 'write' }, remove: { by: 'write' } });
    }
  });

  it('writes nothing of a call one of whose fields is refused, whether it makes a thing or changes one', () => {
    const wall = block('石壁', picture('stone-6'));
    const secret = picture('secret-6', true);
    seat(PeerRole.Player);

    expect(() => change('terrain', wall.identifier, { name: '新しい壁', pictures: { wall: secret } })).toThrow(
      /no image named/
    );
    expect([wall.name, wall.faceImageIdentifier('wall')]).toEqual(['石壁', 'stone-6']);
    expect(() => make('table-mask', { fields: { name: '覆い', colour: 'red' } })).toThrow(/#rrggbb/);
    expect(listed('table-mask')).toEqual([]);
  });

  describe('terrain', () => {
    it('lays a block in a square, shapes it, opens its door and takes it away with its switch', () => {
      const stone = picture('stone-1');
      const made = make('terrain', { options: { at: { col: 3, row: 2 } }, fields: { name: '壁', width: 4 } });

      expect(made).toMatchObject({
        name: '壁',
        square: { col: 3, row: 2 },
        width: 4,
        depth: 2,
        height: 2,
        draws: 'all',
        slope: [],
        door: 'none',
        door_open: false,
        glass: false,
      });
      expect(
        change('terrain', made.id, {
          slope: ['n', 'ne', 'e'],
          door: 'swing',
          blocks_climb: true,
          pictures: { wall: stone, top: '' },
        })
      ).toMatchObject({
        slope: ['n', 'e'],
        door: 'swing',
        blocks_climb: true,
        pictures: expect.objectContaining({ wall: stone, top: '' }),
      });
      expect(act('terrain', made.id, 'open_door')).toEqual({ id: made.id, door_open: true });
      expect(change('terrain', made.id, { door: 'none' })).toMatchObject({ door: 'none', door_open: false });
      expect(() => act('terrain', made.id, 'open_door')).toThrow(/not a door/);

      const terrain = ObjectStore.instance.get<Terrain>(made.id)!;
      const held = new BoardSwitch();
      held.initialize();
      terrain.appendChild(held);
      expect(call('remove_object', { kind: 'terrain', id: made.id })).toEqual({ removed: { id: made.id, name: '壁' } });
      expect([ObjectStore.instance.get(made.id), ObjectStore.instance.get(held.identifier)]).toEqual([null, null]);
    });

    it("leaves a glass block with no pictures out for a player's seat, as the screen draws it for the master alone", () => {
      const glass = block('ガラス', '');
      const wall = block('石壁', picture('stone-2'));

      expect(listed('terrain')).toEqual([glass.identifier, wall.identifier]);
      seat(PeerRole.Player);
      expect(listed('terrain')).toEqual([wall.identifier]);
      expect(() => read('terrain', glass.identifier)).toThrow(/no terrain named/);
    });

    it('calls glass only a block drawn with nothing, neither a picture nor a model held here', () => {
      const glass = block('ガラス', '');
      const tree = block('木', '');
      tree.modelIdentifier = 'tree-model';
      vi.spyOn(TestBed.inject(ModelStorage), 'get').mockImplementation((identifier) =>
        identifier === 'tree-model' ? ({ isReady: true, url: 'blob:tree' } as never) : null
      );

      expect(read('terrain', glass.identifier)).toMatchObject({ glass: true });
      expect(read('terrain', tree.identifier)).toMatchObject({ glass: false });
    });

    it('leaves out a block wholly on ground nobody has walked to', () => {
      const hidden = block('奥の壁', picture('stone-3'));
      const seen = block('手前の壁', 'stone-3');
      const fog: TerrainFogCover = { cols: 1, rows: 1, cleared: [false], brightness: [0] };
      vi.spyOn(TestBed.inject(VisionService), 'terrainFogCover').mockImplementation((terrain) =>
        terrain === hidden ? fog : null
      );
      seat(PeerRole.Player);

      expect(listed('terrain')).toEqual([seen.identifier]);
    });

    it('lists, reads and opens only the blocks this seat is shown, as the screen offers them', () => {
      const wall = block('石壁', picture('stone-4'));
      const kept = block('奥の扉', 'stone-4');
      kept.doorStyle = DoorStyle.SWING;
      vi.spyOn(TestBed.inject(TablePiecesService), 'isBlockShown').mockImplementation((terrain) => terrain !== kept);

      expect(listed('terrain')).toEqual([wall.identifier]);
      expect(() => act('terrain', kept.identifier, 'open_door')).toThrow(/no terrain named/);
      expect(kept.isDoorOpen).toBe(false);
    });

    it('opens no door for a seat the doors refuse', () => {
      const door = block('扉', picture('stone-5'));
      door.doorStyle = DoorStyle.SWING;
      vi.spyOn(TestBed.inject(DoorService), 'setOpen').mockReturnValue(false);

      expect(() => act('terrain', door.identifier, 'open_door')).toThrow(/may not open/);
      expect(door.isDoorOpen).toBe(false);
    });

    it('neither moves nor turns a block locked in place until it is unlocked', () => {
      const wall = block('石壁', picture('stone-4'));
      wall.isLocked = true;
      seat(PeerRole.Player);

      expect(() => change('terrain', wall.identifier, { square: { col: 5, row: 5 } })).toThrow(/locked in place/);
      expect(() => change('terrain', wall.identifier, { turn: 90 })).toThrow(/locked in place/);
      expect([wall.location.x, wall.rotate]).toEqual([0, 0]);
      change('terrain', wall.identifier, { locked: false });
      expect(change('terrain', wall.identifier, { square: { col: 5, row: 5 }, turn: 90 })).toMatchObject({
        square: { col: 5, row: 5 },
        turn: 90,
      });
    });

    it('puts on a face only a picture this seat may pick', () => {
      const wall = block('石壁', picture('stone-5'));
      const secret = picture('secret-5', true);
      seat(PeerRole.Player);

      expect(() => change('terrain', wall.identifier, { pictures: { wall: secret } })).toThrow(/no image named/);
      expect(wall.faceImageIdentifier('wall')).toBe('stone-5');
      seat(PeerRole.GameMaster);
      expect(change('terrain', wall.identifier, { pictures: { wall: secret } })).toMatchObject({
        pictures: expect.objectContaining({ wall: secret }),
      });
    });
  });

  describe('table-mask', () => {
    it('lays a mask, changes its look and lock, reads its scratching without writing it, and takes it away', () => {
      const made = make('table-mask', { options: { at: { col: 2, row: 2 } } });

      expect(made).toMatchObject({
        square: { col: 2, row: 2 },
        width: 5,
        height: 5,
        opacity: 100,
        locked: false,
        scratching_by: '',
        preview: false,
      });
      expect(
        change('table-mask', made.id, {
          opacity: 40,
          colour: '#112233',
          text: '立入禁止',
          locked: true,
          lock_mark: false,
        })
      ).toMatchObject({ opacity: 40, colour: '#112233', text: '立入禁止', locked: true, lock_mark: false });
      expect(change('table-mask', made.id, { locked: false })).toMatchObject({ locked: false, lock_mark: true });
      expect(() => change('table-mask', made.id, { scratching: '1,1' })).toThrow(/only read/);
      expect(() => change('table-mask', made.id, { colour: 'red' })).toThrow(/#rrggbb/);

      call('remove_object', { kind: 'table-mask', id: made.id });
      expect(listed('table-mask')).toEqual([]);
    });
  });

  describe('white-board', () => {
    it('stands a board, keeps its foot as it grows, and puts what stands on it back on the table as it goes', () => {
      const made = make('white-board');
      const board = ObjectStore.instance.get<WhiteBoard>(made.id)!;
      const foot = board.location.y + board.height * GRID;

      expect(made).toMatchObject({ pitch: 90, has_drawing: false, picture: '' });
      expect(change('white-board', made.id, { height: 5, opacity: 50, colour: '#ffffff' })).toMatchObject({
        height: 5,
        opacity: 50,
        colour: '#ffffff',
      });
      expect(board.location.y + 5 * GRID).toBe(foot);

      const goblin = pieceAt('ゴブリン', 1, 1);
      goblin.location = { name: 'table', x: 50, y: 100, surface: board.identifier };
      goblin.update();
      const coin = Coin.create('コイン');
      coin.location = { name: 'table', x: 20, y: 30, surface: board.identifier };
      const lamp = LightSource.create('ランタン');
      lamp.location = { name: 'table', x: 40, y: 10, surface: board.identifier };
      const { x, y } = board.location;
      call('remove_object', { kind: 'white-board', id: made.id });

      expect(ObjectStore.instance.get(made.id)).toBeNull();
      expect(goblin.location).toEqual({ name: 'table', x: x + 50, y: y + 100 });
      expect(coin.location).toEqual({ name: 'table', x: x + 20, y: y + 30 });
      expect(lamp.location).toEqual({ name: 'table', x: x + 40, y: y + 10 });
    });
  });

  describe('light-source', () => {
    it('stands a lamp, lights it as a torch and has it follow a piece this seat sees by name', () => {
      const goblin = pieceAt('ゴブリン', 6, 6);
      const made = make('light-source', { options: { at: { col: 4, row: 4 } }, fields: { preset: 'torch' } });

      expect(made).toMatchObject({ square: { col: 4, row: 4 }, on: true, preset: 'torch', following: '' });
      expect(change('light-source', made.id, { following: 'ゴブリン', on: false })).toMatchObject({
        following: goblin.identifier,
        on: false,
      });
      expect(change('light-source', made.id, { following: '' })).toMatchObject({ following: '' });
    });

    it('follows no piece whose name is kept from this seat', () => {
      const lamp = make('light-source');
      const hooded = pieceAt('覆面', 2, 2);
      hooded.hideName = true;
      hooded.owner = 'someone-else';
      seat(PeerRole.Player);

      expect(() => change('light-source', lamp.id, { following: hooded.identifier })).toThrow(/no piece named/);
    });

    it('leaves out a lamp on ground nobody has walked to', () => {
      const hidden = make('light-source', { options: { at: { col: 9, row: 9 } } });
      const seen = make('light-source', { options: { at: { col: 1, row: 1 } } });
      vi.spyOn(TestBed.inject(VisionService), 'isPieceHiddenByFog').mockImplementation(
        (object: TabletopObject) => object.identifier === hidden.id
      );
      seat(PeerRole.Player);

      expect(listed('light-source')).toEqual([seen.id]);
      expect(ObjectStore.instance.get(hidden.id)).toBeInstanceOf(LightSource);
    });
  });

  describe('table-ambience', () => {
    it('lays water, sets how it flows, and leaves it out for a player once it is shown to the master alone', () => {
      const water = make('table-ambience', { options: { kind: 'water', at: { col: 3, row: 3 } } });

      expect(water).toMatchObject({ kind: 'water', square: { col: 3, row: 3 }, width: 4, height: 4, shown_to: 'room' });
      expect(
        change('table-ambience', water.id, { murk: 80, flow_speed: 50, flow_direction: 100, colour: '#2255aa' })
      ).toMatchObject({ murk: 80, flow_speed: 50, flow_direction: 90, colour: '#2255aa' });
      expect(change('table-ambience', water.id, { colour: '' }).colour).not.toBe('#2255aa');

      change('table-ambience', water.id, { shown_to: 'master' });
      seat(PeerRole.Player);
      expect(listed('table-ambience')).toEqual([]);
      expect(() => read('table-ambience', water.id)).toThrow(/no table-ambience named/);
    });
  });

  describe('table-background-layer', () => {
    it('adds layers in front of the others up to six a table, moves and re-places them, and takes one away', () => {
      const sky = picture('sky-1');
      const made = Array.from({ length: 6 }, () => make('table-background-layer', { fields: { picture: sky } }));

      expect(made[0]).toMatchObject({ table: '洞窟', place: 1, placement: 'under', picture: sky, shown: true });
      expect(table.backgroundLayers.map((layer) => layer.order)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(() => make('table-background-layer')).toThrow(/already holds 6/);

      expect(act('table-background-layer', made[2].id, 'move_back')).toEqual({ id: made[2].id, place: 2 });
      expect(() => act('table-background-layer', made[2].id, 'move_back')).not.toThrow();
      expect(() => act('table-background-layer', made[2].id, 'move_back')).toThrow(/furthest back/);
      expect(change('table-background-layer', made[1].id, { placement: 'over' })).toMatchObject({
        placement: 'over',
        place: 1,
      });

      call('remove_object', { kind: 'table-background-layer', id: made[5].id });
      expect(make('table-background-layer', { options: { table: '洞窟' } })).toMatchObject({ table: '洞窟' });
    });
  });

  describe('table-ruler', () => {
    it('leaves a ruler between two squares, measures it, moves an end, and keeps the ends of a locked one', () => {
      const made = make('table-ruler', {
        options: { from: { square: { col: 1, row: 1 } }, to: { square: { col: 4, row: 1 } } },
      });
      const length = (viewed: Viewed) => Number((viewed['reading'] as { straight: string }).straight);

      expect(made).toMatchObject({
        line: { from: { square: { col: 1, row: 1 }, height: 0 }, to: { square: { col: 4, row: 1 }, height: 0 } },
        locked: false,
      });
      const moved = change('table-ruler', made.id, {
        line: { from: { square: { col: 1, row: 1 } }, to: { square: { col: 7, row: 1 } } },
      });
      expect(length(moved)).toBe(length(made) * 2);

      change('table-ruler', made.id, { locked: true });
      expect(() =>
        change('table-ruler', made.id, {
          line: { from: { square: { col: 2, row: 2 } }, to: { square: { col: 3, row: 3 } } },
        })
      ).toThrow(/locked/);
    });

    it('holds an end to a piece this seat sees', () => {
      const goblin = pieceAt('ゴブリン', 5, 5);
      const made = make('table-ruler', {
        options: { from: { piece: 'ゴブリン' }, to: { square: { col: 1, row: 5 } } },
      });

      expect(made['line']).toMatchObject({ from: { piece: goblin.identifier, square: { col: 5, row: 5 } } });
    });

    it('leaves out a ruler one of whose ends this seat cannot see', () => {
      vi.spyOn(TestBed.inject(VisionService), 'isHiddenByFog').mockImplementation((x: number) => x > 300);
      const near = make('table-ruler', {
        options: { from: { square: { col: 1, row: 1 } }, to: { square: { col: 3, row: 1 } } },
      });
      const far = make('table-ruler', {
        options: { from: { square: { col: 1, row: 2 } }, to: { square: { col: 9, row: 2 } } },
      });
      seat(PeerRole.Player);

      expect(listed('table-ruler')).toEqual([near.id]);
      expect(() => read('table-ruler', far.id)).toThrow(/no table-ruler named/);
    });
  });

  describe('effect-field', () => {
    it('stands an effect this seat is shown in a square or where a piece stands, and leaves out the name of one kept for the master', () => {
      presetNamed('毒沼');
      presetNamed('隠し罠', true);
      const goblin = pieceAt('ゴブリン', 6, 4);
      const swamp = make('effect-field', { options: { preset: '毒沼', at: { col: 2, row: 3 } } });
      const trap = make('effect-field', { options: { preset: '隠し罠', piece: goblin.identifier } });

      expect(swamp).toMatchObject({ name: '毒沼', preset: '毒沼', square: { col: 2, row: 3 }, size: 1 });
      expect(trap).toMatchObject({ name: '隠し罠', square: { col: 6, row: 4 } });

      seat(PeerRole.Player);
      expect(listed('effect-field')).toEqual([swamp.id, trap.id]);
      expect(read('effect-field', trap.id)).toEqual({ id: trap.id, name: '', square: { col: 6, row: 4 }, size: 1 });
      expect(() => make('effect-field', { options: { preset: '隠し罠', at: { col: 1, row: 1 } } })).toThrow(
        /no effect named 隠し罠/
      );
      call('remove_object', { kind: 'effect-field', id: trap.id });
      expect(ObjectStore.instance.getObjects(EffectField).map((field) => field.identifier)).toEqual([swamp.id]);
    });

    it('leaves out for a player an effect standing where the fog keeps the ground from it', () => {
      presetNamed('毒沼');
      const near = make('effect-field', { options: { preset: '毒沼', at: { col: 2, row: 3 } } });
      const far = make('effect-field', { options: { preset: '毒沼', at: { col: 15, row: 12 } } });
      seat(PeerRole.Player);
      vi.spyOn(TestBed.inject(VisionService), 'isPieceHiddenByFog').mockImplementation(
        (object) => object.identifier === far.id
      );

      expect(listed('effect-field')).toEqual([near.id]);
    });
  });
});
