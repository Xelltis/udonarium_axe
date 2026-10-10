import type { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { buildReplayBoardScene, collectBoardAssetIds, framingOf } from '@axe/domain/replay/replay-board-view';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';

function table(identifier: string, overrides: Record<string, unknown> = {}): ReplayObjectSnapshot {
  return {
    identifier,
    aliasName: 'game-table',
    syncData: {
      attributes: { width: 30, height: 20, gridSize: 40, imageIdentifier: `top-${identifier}`, ...overrides },
    },
  };
}

function selecter(viewTableIdentifier: string): ReplayObjectSnapshot {
  return { identifier: 'TableSelecter', aliasName: 'TableSelecter', syncData: { attributes: { viewTableIdentifier } } };
}

function piece(identifier: string, aliasName: string, attributes: Record<string, unknown> = {}): ReplayObjectSnapshot {
  return {
    identifier,
    aliasName,
    syncData: { attributes: { location: { name: 'table', x: 100, y: 200 }, posZ: 0, ...attributes } },
  };
}

function data(identifier: string, parent: string, name: string, value: unknown): ReplayObjectSnapshot {
  return { identifier, aliasName: 'data', syncData: { value, parentIdentifier: parent, attributes: { name } } };
}

describe('buildReplayBoardScene()', () => {
  it('returns the size and the picture of the table in use', () => {
    const scene = buildReplayBoardScene([table('t1'), table('t2'), selecter('t2')])!;

    expect(scene).toMatchObject({ width: 30, height: 20, gridSize: 40, imageIdentifier: 'top-t2' });
  });

  it('falls back to the first table when none is', () => {
    expect(buildReplayBoardScene([table('t1'), table('t2')])?.imageIdentifier).toBe('top-t1');
  });

  it('builds no board without a table', () => {
    expect(buildReplayBoardScene([piece('c1', 'character')])).toBeNull();
  });

  it('returns the pieces on the table, each with where it stands', () => {
    const scene = buildReplayBoardScene([
      table('t1'),
      piece('c1', 'character', { location: { name: 'table', x: 120, y: 80 }, posZ: 5, rotate: 90 }),
      data('d1', 'c1', 'common', ''),
      data('d2', 'd1', 'name', '盗賊'),
      data('d3', 'd1', 'size', 2),
      data('d4', 'c1', 'image', ''),
      data('d5', 'd4', 'imageIdentifier', 'img-1'),
    ])!;

    expect(scene.pieces).toEqual([
      {
        identifier: 'c1',
        aliasName: 'character',
        x: 120,
        y: 80,
        z: 5,
        size: 2,
        rotate: 90,
        name: '盗賊',
        imageIdentifier: 'img-1',
        shape: 'figure',
        width: 2,
        height: 2,
        showsName: true,
        isConcealed: false,
        color: '',
        title: '',
        text: '',
        count: 0,
        openCells: [],
        tiled: false,
        elevation: 0,
        view: 3,
        door: null,
        sideImageIdentifier: '',
      },
    ]);
  });

  it('leaves a piece that is put away off the board', () => {
    const scene = buildReplayBoardScene([
      table('t1'),
      piece('c1', 'character', { location: { name: 'stand', x: 0, y: 0 } }),
      piece('c2', 'character'),
    ])!;

    expect(scene.pieces.map((one) => one.identifier)).toEqual(['c2']);
  });

  it('leaves off anything shared that is not a piece', () => {
    const scene = buildReplayBoardScene([table('t1'), piece('m1', 'chat'), piece('c1', 'card')])!;
    expect(scene.pieces.map((one) => one.identifier)).toEqual(['c1']);
  });

  it('stacks them by height and then by depth', () => {
    const scene = buildReplayBoardScene([
      table('t1'),
      piece('a', 'character', { location: { name: 'table', x: 0, y: 300 }, posZ: 0 }),
      piece('b', 'character', { location: { name: 'table', x: 0, y: 100 }, posZ: 0 }),
      piece('c', 'character', { location: { name: 'table', x: 0, y: 0 }, posZ: 9 }),
    ])!;

    expect(scene.pieces.map((one) => one.identifier)).toEqual(['b', 'a', 'c']);
  });

  it('reads a piece with no size as one cell', () => {
    const scene = buildReplayBoardScene([table('t1'), piece('c1', 'character')])!;
    expect(scene.pieces[0].size).toBe(1);
  });

  it('falls back to the defaults for a value it cannot read', () => {
    const scene = buildReplayBoardScene([
      table('t1', { width: 'ひろい', height: null, gridSize: 0 }),
      piece('c1', 'character', { location: { name: 'table', x: 'よこ', y: 10 } }),
    ])!;

    expect(scene).toMatchObject({ width: 20, height: 20, gridSize: 1 });
    expect(scene.pieces[0].x).toBe(0);
  });
});

describe('which table a piece is on', () => {
  it('leaves the terrain of another table off the one in view', () => {
    const wall = {
      ...piece('w1', 'terrain'),
      syncData: { ...piece('w1', 'terrain').syncData, parentIdentifier: 't1' },
    };
    const scene = buildReplayBoardScene([table('t1'), table('t2'), selecter('t2'), wall, piece('c1', 'character')])!;

    expect(scene.pieces.map((one) => one.identifier)).toEqual(['c1']);
  });
});

describe('the dark', () => {
  const dark = [table('t1', { darknessEnabled: true, darknessLevel: 1 }), selecter('t1'), piece('c1', 'character')];

  it('hides a figure a guest could not see in the dark', () => {
    expect(buildReplayBoardScene(dark, { userId: '', role: PeerRole.Guest })!.pieces).toEqual([]);
  });

  it('shows it to the game master', () => {
    expect(buildReplayBoardScene(dark, { userId: 'gm', role: PeerRole.GameMaster })!.pieces).toHaveLength(1);
  });

  it('shows every figure where the table is not dark', () => {
    expect(
      buildReplayBoardScene([table('t1'), piece('c1', 'character')], { userId: '', role: PeerRole.Guest })!.pieces
    ).toHaveLength(1);
  });
});

describe('framingOf()', () => {
  it('crops about the pieces with a margin', () => {
    const scene = buildReplayBoardScene([
      table('t1', { width: 40, height: 40, gridSize: 50 }),
      piece('c1', 'character', { location: { name: 'table', x: 1000, y: 1000 } }),
    ])!;

    expect(framingOf(scene)).toEqual({ x: 900, y: 900, width: 250, height: 250 });
  });

  it('never runs off the table', () => {
    const scene = buildReplayBoardScene([
      table('t1', { width: 4, height: 4, gridSize: 50 }),
      piece('c1', 'character', { location: { name: 'table', x: 0, y: 0 } }),
    ])!;

    expect(framingOf(scene)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
  });

  it('shows the whole table when there are no pieces', () => {
    const scene = buildReplayBoardScene([table('t1', { width: 10, height: 8, gridSize: 50 })])!;
    expect(framingOf(scene)).toEqual({ x: 0, y: 0, width: 500, height: 400 });
  });
});

describe('collectBoardAssetIds()', () => {
  it('returns the pictures of the table and the pieces together', () => {
    const scene = buildReplayBoardScene([
      table('t1', { backgroundImageIdentifier: 'bg-1' }),
      piece('c1', 'character'),
      data('d4', 'c1', 'image', ''),
      data('d5', 'd4', 'imageIdentifier', 'img-1'),
    ]);

    expect(collectBoardAssetIds(scene)).toEqual(['top-t1', 'bg-1', 'img-1', '']);
  });

  it('returns nothing without a board', () => {
    expect(collectBoardAssetIds(null)).toEqual([]);
  });
});

describe('built from real pieces', () => {
  const mine: GameObject[] = [];

  afterEach(() => {
    for (const object of mine.splice(0)) ObjectStore.instance.remove(object);
  });

  function keep<T extends GameObject>(object: T): T {
    mine.push(object);
    return object;
  }

  /** Only what this test made is copied, so it does not mix with another watching the same table. */
  function snapshotStore(root: GameObject): ReplayObjectSnapshot[] {
    const wanted = new Set(mine.map((object) => object.identifier));
    const visited = new Set<string>();
    const descend = (identifier: string): void => {
      if (visited.has(identifier)) return;
      visited.add(identifier);
      for (const object of ObjectStore.instance.getObjects()) {
        const parent = String((object.toContext().syncData as Record<string, unknown>)['parentIdentifier'] ?? '');
        if (parent !== identifier) continue;
        wanted.add(object.identifier);
        descend(object.identifier);
      }
    };
    for (const identifier of [root.identifier, ...wanted]) descend(identifier);

    return ObjectStore.instance
      .getObjects()
      .filter((object) => wanted.has(object.identifier))
      .map((object) => {
        const context = object.toContext();
        return {
          identifier: context.identifier,
          aliasName: context.aliasName,
          syncData: context.syncData as Record<string, unknown>,
        };
      });
  }

  it('reads the name, the picture and the size off a real character', () => {
    const table = keep(new GameTable('board-view-table'));
    table.width = 12;
    table.height = 8;
    table.gridSize = 50;
    ObjectStore.instance.add(table, false);

    const character = keep(GameCharacter.create('盗賊', 2, 'img-1'));
    character.location.x = 150;
    character.location.y = 100;

    const scene = buildReplayBoardScene(snapshotStore(character))!;
    const piece = scene.pieces.find((one) => one.identifier === character.identifier)!;

    expect(scene).toMatchObject({ width: 12, height: 8, gridSize: 50 });
    expect(piece).toMatchObject({ name: '盗賊', imageIdentifier: 'img-1', size: 2, x: 150, y: 100 });
  });

  describe('each kind of piece', () => {
    function onTable<T extends GameObject & { location: { name: string; x: number; y: number } }>(object: T): T {
      object.location.name = 'table';
      object.location.x = 50;
      object.location.y = 50;
      return keep(object);
    }

    function pieceOf(root: GameObject) {
      return buildReplayBoardScene(snapshotStore(root), guest)!.pieces.find(
        (one) => one.identifier === root.identifier
      )!;
    }

    const guest = { userId: 'guest', role: PeerRole.Guest };

    beforeEach(() => {
      ObjectStore.instance.add(keep(new GameTable('board-view-shapes')), false);
    });

    it('shows the back of a card lying face down, and its front once turned up', () => {
      const card = onTable(Card.create('ace', 'front-1', 'back-1'));
      card.state = CardState.BACK;
      expect(pieceOf(card)).toMatchObject({ shape: 'card', imageIdentifier: 'back-1', width: 2, height: 0 });

      card.state = CardState.FRONT;
      expect(pieceOf(card).imageIdentifier).toBe('front-1');
    });

    it('shows the top card of a pile, and how many it holds', () => {
      const pile = onTable(CardStack.create('deck'));
      pile.putOnTop(keep(Card.create('two', 'front-2', 'back-2')));
      pile.putOnTop(keep(Card.create('one', 'front-1', 'back-1')));

      expect(pieceOf(pile)).toMatchObject({ shape: 'card', imageIdentifier: 'front-1', count: 2 });
    });

    it('shows the face a die was rolled to, by its picture and its number', () => {
      const die = onTable(DiceSymbol.create('d6', DiceType.D6, 1));
      die.imageDataElement!.getFirstElementByName('4')!.value = 'face-4';
      die.face = '4';

      expect(pieceOf(die)).toMatchObject({ shape: 'die', imageIdentifier: 'face-4', text: '4', isConcealed: false });
    });

    it('keeps the face of a die rolled in secret from anyone but its owner', () => {
      const die = onTable(DiceSymbol.create('d6', DiceType.D6, 1));
      die.imageDataElement!.getFirstElementByName('4')!.value = 'face-4';
      die.face = '4';
      die.owner = 'alice';

      expect(pieceOf(die)).toMatchObject({ imageIdentifier: '', text: '', isConcealed: true });
    });

    it('shows the side a coin landed on', () => {
      const coin = onTable(Coin.create('coin'));
      coin.imageDataElement!.getFirstElementByName('back')!.value = 'coin-back';
      coin.face = 'back';

      expect(pieceOf(coin)).toMatchObject({ shape: 'coin', imageIdentifier: 'coin-back' });
    });

    it('covers as much of the table as a terrain spreads over', () => {
      const terrain = onTable(Terrain.create('wall', 3, 2, 1, 'wall-img', 'floor-img'));

      expect(pieceOf(terrain)).toMatchObject({ shape: 'terrain', width: 3, height: 2, imageIdentifier: 'floor-img' });
    });

    it('fills a mask with its colour and leaves its scratched cells open', () => {
      const mask = onTable(GameTableMask.create('fog', 4, 3, 100));
      mask.paintColor('#223344');
      mask.scratchedGrids = '0:0,1:2';

      expect(pieceOf(mask)).toMatchObject({ shape: 'mask', width: 4, height: 3, color: '#223344' });
      expect(pieceOf(mask).openCells).toEqual(['0:0', '1:2']);
    });

    it('reads the title and the text of a note', () => {
      const note = onTable(TextNote.create('memo', 'the door is locked', 16, 3, 2));

      expect(pieceOf(note)).toMatchObject({ shape: 'note', title: 'memo', text: 'the door is locked', width: 3 });
    });

    it('reads a dungeon wall: its picture laid a cell to a tile, how tall it stands, which faces show', () => {
      const wall = onTable(Terrain.create('wall', 4, 1, 3, 'bricks', 'cobbles'));
      wall.isTiledTexture = true;
      wall.mode = TerrainViewState.ALL;

      expect(pieceOf(wall)).toMatchObject({
        imageIdentifier: 'cobbles',
        tiled: true,
        elevation: 3,
        view: 3,
        door: null,
      });
    });

    it('reads a door, how it opens and whether it stands open', () => {
      const door = onTable(Terrain.create('door', 1, 0.2, 3, 'door', 'door'));
      door.doorStyle = DoorStyle.SWING;
      door.isDoorOpen = true;

      expect(pieceOf(door).door).toEqual({ style: 'swing', open: true, mirrored: false });
    });

    it('reads a light, its picture and its colour', () => {
      const light = onTable(LightSource.create('torch'));
      light.imageDataElement!.getFirstElementByName('imageIdentifier')!.value = 'torch-img';
      light.lightColor = '#ffaa33';

      expect(pieceOf(light)).toMatchObject({ shape: 'light', imageIdentifier: 'torch-img', color: '#ffaa33' });
    });

    it('leaves a piece kept to the game master off the board a guest sees', () => {
      const character = onTable(GameCharacter.create('boss', 1, 'img-boss'));
      character.disclosureMode = 'gm';

      const snapshots = snapshotStore(character);
      expect(buildReplayBoardScene(snapshots, guest)!.pieces).toEqual([]);
      expect(buildReplayBoardScene(snapshots, { userId: 'gm', role: PeerRole.GameMaster })!.pieces).toHaveLength(1);
    });
  });

  it('leaves a real character that is put away off the board', () => {
    ObjectStore.instance.add(keep(new GameTable('board-view-empty')), false);
    const character = keep(GameCharacter.create('盗賊', 1, 'img-1'));
    character.setLocation('stand');

    const scene = buildReplayBoardScene(snapshotStore(character))!;
    expect(scene.pieces.some((one) => one.identifier === character.identifier)).toBe(false);
  });
});

describe('building without working the darkness out', () => {
  it('works no sight out when it is turned off', () => {
    // Working it out even for a pass that only counts the pictures would work the sight out once per scene before the export starts.
    const snapshots = [table('t1', { darknessEnabled: true, darknessLevel: 0.9 }), selecter('t1')];
    const viewer = { userId: 'alice', role: PeerRole.Player };

    expect(buildReplayBoardScene(snapshots, viewer)?.overlay).not.toBeNull();
    expect(buildReplayBoardScene(snapshots, viewer, { withOverlay: false })?.overlay).toBeNull();
  });
});
