import { TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ArchiveEntries } from '@axe/core/storage/room-archive';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { CcfoliaRoomImportService } from '@axe/features/ccfolia-room-import/ccfolia-room-import.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function entriesOf(data: unknown, images: string[] = []): ArchiveEntries {
  const entries: ArchiveEntries = {
    '__data.json': new TextEncoder().encode(JSON.stringify(data)),
  };
  for (const image of images) entries[image] = new Uint8Array([1, 2, 3]);
  return entries;
}

function roomData(entities: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    meta: { version: '1.1.0' },
    entities: {
      room: { backgroundUrl: 'bg.jpeg', fieldWidth: 20, fieldHeight: 10 },
      items: {},
      decks: {},
      characters: {},
      effects: {},
      scenes: {},
      ...entities,
    },
    resources: {
      'bg.jpeg': { type: 'image/jpeg' },
      'icon.png': { type: 'image/png' },
      'face.png': { type: 'image/png' },
    },
  };
}

describe('CcfoliaRoomImportService', () => {
  let service: CcfoliaRoomImportService;
  let addAsync: ReturnType<typeof vi.fn>;
  let removed: Set<string>;

  beforeEach(() => {
    let counter = 0;
    removed = new Set();
    addAsync = vi.fn().mockImplementation(() => {
      const identifier = `image-${++counter}`;
      return Promise.resolve(removed.has(identifier) ? null : { identifier });
    });

    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: ImageStorage, useValue: { addAsync } }],
    });
    service = TestBed.inject(CcfoliaRoomImportService);
  });

  function tables(): GameTable[] {
    return ObjectStore.instance.getObjects<GameTable>(GameTable);
  }

  it('makes a single table for a room with no scenes', async () => {
    const before = tables().length;

    const result = await service.importAsync(entriesOf(roomData(), ['bg.jpeg']));

    expect(result.error).toBeNull();
    const table = tables()[tables().length - 1];
    expect(tables()).toHaveLength(before + 1);
    expect(table.width).toBe(20);
    expect(table.height).toBe(10);
    expect(table.gridSize).toBe(50);
    expect(result.summary!.tableCount).toBe(1);
    expect(result.summary!.tableName).toBe(table.name);
  });

  it('takes the foreground as the board image and the background as the wallpaper around it', async () => {
    const data = roomData();
    (data['entities'] as Record<string, unknown>)['room'] = {
      backgroundUrl: 'bg.jpeg',
      foregroundUrl: 'icon.png',
      fieldWidth: 20,
      fieldHeight: 10,
    };

    await service.importAsync(entriesOf(data, ['bg.jpeg', 'icon.png']));

    const table = tables()[tables().length - 1];
    expect(table.imageIdentifier).toBe('image-2');
    expect(table.backgroundImageIdentifier).toBe('image-1');
  });

  it('may put back a picture the room removed, and leaves the board without one it could not', async () => {
    const data = roomData();
    (data['entities'] as Record<string, unknown>)['room'] = {
      backgroundUrl: 'bg.jpeg',
      foregroundUrl: 'icon.png',
      fieldWidth: 20,
      fieldHeight: 10,
    };
    removed.add('image-2');

    await service.importAsync(entriesOf(data, ['bg.jpeg', 'icon.png']));

    const table = tables()[tables().length - 1];
    expect(addAsync.mock.calls.map(([, options]) => options)).toEqual([{ putBack: true }, { putBack: true }]);
    expect(table.imageIdentifier).not.toBe('image-2');
    expect(table.backgroundImageIdentifier).toBe('image-1');
  });

  it('falls back to the default size for a room that gives none', async () => {
    const data = roomData();
    (data['entities'] as Record<string, unknown>)['room'] = { backgroundUrl: null };

    await service.importAsync(entriesOf(data));

    const table = tables()[tables().length - 1];
    expect(table.width).toBe(20);
    expect(table.height).toBe(20);
  });

  it('puts the items on the table as terrain panels', async () => {
    const result = await service.importAsync(
      entriesOf(
        roomData({
          items: {
            aaaaaaaaaaaaaaaaaaaa: {
              x: 0,
              y: 0,
              width: 4,
              height: 2,
              angle: 45,
              locked: true,
              visible: true,
              type: 'plane',
              memo: '床',
              imageUrl: 'icon.png',
              order: 0,
            },
          },
        }),
        ['bg.jpeg', 'icon.png']
      )
    );

    const table = tables()[tables().length - 1];
    const terrains = table.children.filter((child): child is Terrain => child instanceof Terrain);
    expect(terrains).toHaveLength(1);
    expect(terrains[0].name).toBe('床');
    expect(terrains[0].width).toBe(4);
    expect(terrains[0].depth).toBe(2);
    expect(terrains[0].isLocked).toBe(true);
    expect(terrains[0].rotate).toBe(45);
    expect(terrains[0].blocksSight).toBe(false);
    expect(terrains[0].location.x).toBe(500);
    expect(terrains[0].location.y).toBe(250);
    expect(result.summary!.panelCount).toBe(1);
  });

  it('counts a hidden panel without importing it', async () => {
    const result = await service.importAsync(
      entriesOf(
        roomData({
          items: {
            aaaaaaaaaaaaaaaaaaaa: { x: 0, y: 0, width: 1, height: 1, visible: false, imageUrl: 'icon.png' },
          },
        }),
        ['bg.jpeg', 'icon.png']
      )
    );

    const table = tables()[tables().length - 1];
    expect(table.children.filter((child) => child instanceof Terrain)).toHaveLength(0);
    expect(result.summary!.panelCount).toBe(0);
    expect(result.summary!.hiddenPanelCount).toBe(1);
  });

  it('places the characters as pieces and keeps their alternate portraits', async () => {
    const before = ObjectStore.instance.getObjects<GameCharacter>(GameCharacter).length;

    const result = await service.importAsync(
      entriesOf(
        roomData({
          characters: {
            aaaaaaaaaaaaaaaaaaaa: {
              name: '探索者A',
              iconUrl: 'icon.png',
              faces: [{ label: '笑顔', iconUrl: 'face.png' }],
              x: 100,
              y: 50,
              angle: 90,
              width: 1,
              height: 1,
              secret: true,
              status: [{ label: 'HP', value: 8, max: 12 }],
            },
          },
        }),
        ['bg.jpeg', 'icon.png', 'face.png']
      )
    );

    const characters = ObjectStore.instance.getObjects<GameCharacter>(GameCharacter);
    expect(characters).toHaveLength(before + 1);
    const character = characters[characters.length - 1];
    expect(character.name).toBe('探索者A');
    expect(character.location.x).toBe(700);
    expect(character.location.y).toBe(350);
    expect(character.rotate).toBe(90);
    expect(character.disclosureMode).toBe(DisclosureMode.GameMaster);
    expect(character.imageDataElement!.children.map((child) => child.name)).toContain('笑顔');
    expect(result.summary!.pieceCount).toBe(1);
  });

  it('makes a table per scene and copies the panels onto all of them', async () => {
    const before = tables().length;
    const data = roomData({
      items: {
        aaaaaaaaaaaaaaaaaaaa: { x: 0, y: 0, width: 2, height: 2, imageUrl: 'icon.png', order: 0 },
      },
      scenes: {
        s1: { name: '前景なし', order: 0, backgroundUrl: 'bg.jpeg', foregroundUrl: null },
        s2: { name: '戦闘シート', order: 1, backgroundUrl: 'bg.jpeg', foregroundUrl: 'face.png' },
      },
    });
    (data['entities'] as Record<string, unknown>)['room'] = {
      backgroundUrl: 'bg.jpeg',
      foregroundUrl: 'face.png',
      fieldWidth: 20,
      fieldHeight: 10,
    };

    const result = await service.importAsync(entriesOf(data, ['bg.jpeg', 'icon.png', 'face.png']));

    const created = tables().slice(before);
    expect(created.map((table) => table.name)).toEqual(['前景なし', '戦闘シート']);
    expect(created[0].imageIdentifier).toBe('');
    expect(created[1].imageIdentifier).toBe('image-3');
    for (const table of created) {
      expect(table.children.filter((child) => child instanceof Terrain)).toHaveLength(1);
    }
    expect(result.summary!.tableCount).toBe(2);
    expect(result.summary!.panelCount).toBe(1);
  });

  describe('asked to bring the scenes as scenes', () => {
    function twoScenes(): Record<string, unknown> {
      const data = roomData({
        items: {
          aaaaaaaaaaaaaaaaaaaa: { x: 0, y: 0, width: 2, height: 2, imageUrl: 'icon.png', order: 0 },
        },
        scenes: {
          s1: { name: '前景なし', order: 0, backgroundUrl: 'bg.jpeg', foregroundUrl: null },
          s2: { name: '戦闘シート', order: 1, backgroundUrl: 'bg.jpeg', foregroundUrl: 'face.png' },
        },
      });
      (data['entities'] as Record<string, unknown>)['room'] = {
        backgroundUrl: 'bg.jpeg',
        foregroundUrl: 'face.png',
        fieldWidth: 20,
        fieldHeight: 10,
      };
      return data;
    }

    it('builds one table, the panels on it, with a scene for each, its pictures on the floor and behind', async () => {
      const before = tables().length;
      const asked: number[] = [];

      const result = await service.importAsync(entriesOf(twoScenes(), ['bg.jpeg', 'icon.png', 'face.png']), (count) => {
        asked.push(count);
        return Promise.resolve('scenes');
      });

      const [table] = tables().slice(before);
      expect(tables().slice(before)).toHaveLength(1);
      expect(table.name).toBe('戦闘シート');
      expect(table.children.filter((child) => child instanceof Terrain)).toHaveLength(1);
      const scenes = BoardScene.all();
      expect(scenes.map((scene) => [scene.name, scene.tableIdentifier, scene.floorImageIdentifier])).toEqual([
        ['前景なし', table.identifier, 'none'],
        ['戦闘シート', table.identifier, 'image-3'],
      ]);
      expect(scenes.every((scene) => scene.backgroundImageIdentifier === 'image-1')).toBe(true);
      expect(asked).toEqual([2]);
      expect([result.summary!.tableCount, result.summary!.sceneCount]).toEqual([1, 2]);
    });

    it('makes a table per scene, as before, where the answer is tables', async () => {
      const before = tables().length;

      const result = await service.importAsync(entriesOf(twoScenes(), ['bg.jpeg', 'icon.png', 'face.png']), () =>
        Promise.resolve('tables')
      );

      expect(tables().slice(before)).toHaveLength(2);
      expect(BoardScene.all()).toEqual([]);
      expect(result.summary!.sceneCount).toBe(0);
    });

    it('asks nothing of a room with fewer than two scenes', async () => {
      const chooseShape = vi.fn();

      await service.importAsync(entriesOf(roomData(), ['bg.jpeg']), chooseShape);

      expect(chooseShape).not.toHaveBeenCalled();
    });
  });

  it('shows the table for the scene matching the current foreground', async () => {
    const data = roomData({
      scenes: {
        s1: { name: '前景なし', order: 0, backgroundUrl: 'bg.jpeg', foregroundUrl: null },
        s2: { name: '戦闘シート', order: 1, backgroundUrl: 'bg.jpeg', foregroundUrl: 'face.png' },
      },
    });
    (data['entities'] as Record<string, unknown>)['room'] = {
      backgroundUrl: 'bg.jpeg',
      foregroundUrl: 'face.png',
      fieldWidth: 20,
      fieldHeight: 10,
    };

    const result = await service.importAsync(entriesOf(data, ['bg.jpeg', 'face.png']));

    expect(result.summary!.tableName).toBe('戦闘シート');
  });

  it('keeps panels and pieces that sat off the board off it', async () => {
    await service.importAsync(
      entriesOf(
        roomData({
          items: {
            aaaaaaaaaaaaaaaaaaaa: { x: -14, y: -9, width: 3, height: 3, imageUrl: 'icon.png', order: 0 },
          },
          characters: {
            bbbbbbbbbbbbbbbbbbbb: { name: '説明', x: -350, y: -225, width: 3, height: 3 },
          },
        }),
        ['bg.jpeg', 'icon.png']
      )
    );

    const table = tables()[tables().length - 1];
    const terrain = table.children.find((child): child is Terrain => child instanceof Terrain)!;
    expect(terrain.location.x).toBe(-200);
    expect(terrain.location.y).toBe(-200);

    const characters = ObjectStore.instance.getObjects<GameCharacter>(GameCharacter);
    const character = characters[characters.length - 1];
    expect(character.location.x).toBe(-200);
    expect(character.location.y).toBe(-200);
  });

  it('reports how many elements it could not take', async () => {
    const result = await service.importAsync(
      entriesOf(roomData({ decks: { d1: {} }, effects: { e1: {}, e2: {} } }), ['bg.jpeg'])
    );

    expect(result.summary!.skipped).toEqual({ panels: 0, decks: 1, effects: 2 });
  });

  it('reports a zip that is not room data as unrecognised', async () => {
    const before = tables().length;

    await expect(service.importAsync({})).resolves.toEqual({ summary: null, error: 'unrecognized' });
    await expect(service.importAsync(entriesOf({ kind: 'character', data: { name: 'A' } }))).resolves.toEqual({
      summary: null,
      error: 'unrecognized',
    });
    expect(tables()).toHaveLength(before);
  });

  it('reports broken room data as unrecognised rather than throwing', async () => {
    const result = await service.importAsync({ '__data.json': new TextEncoder().encode('{ broken') });

    expect(result).toEqual({ summary: null, error: 'unrecognized' });
  });
});
