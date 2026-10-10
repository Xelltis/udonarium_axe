import { TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { BoardStash, CONCEALED_LOCATION, stashOf } from '@axe/domain/tabletop/board-switch/concealment';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ConcealmentService', () => {
  let concealment: ConcealmentService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    concealment = TestBed.inject(ConcealmentService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function wallOnTable(): Terrain {
    const wall = Terrain.create('隠し扉', 1, 1, 2, '', '');
    wall.location = { name: 'table', x: 100, y: 150 } as never;
    table.appendChild(wall);
    return wall;
  }

  function goblinOnTable(): GameCharacter {
    const goblin = GameCharacter.create('ゴブリン', 1, '');
    goblin.location = { name: 'table', x: 200, y: 250 } as never;
    return goblin;
  }

  it('puts a block into its table’s stash, gone from the table, and back where it stood', () => {
    const wall = wallOnTable();

    expect(concealment.conceal(wall)).toBe(true);
    expect(table.terrains).not.toContain(wall);
    expect(wall.parent).toBeInstanceOf(BoardStash);
    expect(stashOf(table)?.children).toContain(wall);
    expect(concealment.concealed()).toContain(wall);

    expect(concealment.reveal(wall)).toBe(true);
    expect(table.terrains).toContain(wall);
    expect(wall.location.x).toBe(100);
    expect(concealment.concealed()).not.toContain(wall);
  });

  it('moves a piece to the concealed place where it stands, and back onto the table', () => {
    const goblin = goblinOnTable();

    concealment.conceal(goblin);
    expect(goblin.location.name).toBe(CONCEALED_LOCATION);
    expect(goblin.isVisibleOnTable).toBe(false);
    expect(concealment.concealable()).not.toContain(goblin);

    concealment.reveal(goblin);
    expect(goblin.location).toMatchObject({ name: 'table', x: 200, y: 250 });
    expect(concealment.concealable()).toContain(goblin);
  });

  it('lists what can be put out of sight on the table being looked at', () => {
    const wall = wallOnTable();
    const goblin = goblinOnTable();
    const carried = GameCharacter.create('荷物', 1, '');
    carried.location = { name: 'graveyard', x: 0, y: 0 } as never;

    expect(concealment.concealable()).toEqual(expect.arrayContaining([wall, goblin]));
    expect(concealment.concealable()).not.toContain(carried);
  });

  it('keeps a concealed piece out of the room’s shared things', async () => {
    const goblin = goblinOnTable();
    const inventory = TestBed.inject(GameObjectInventoryService);

    concealment.conceal(goblin);
    await Promise.resolve();
    inventory.commonInventory.refreshObjects();

    expect(inventory.commonInventory.tabletopObjects).not.toContain(goblin);
  });

  it('is read back from a saved table as the stash it was, with whatever it holds', () => {
    const stash = ObjectFactory.instance.create('board-stash');

    expect(stash).toBeInstanceOf(BoardStash);
    stash?.destroy();
  });

  it('finds what a switch names by where it was chosen, else by its name', () => {
    const wall = wallOnTable();

    expect(concealment.find({ identifier: wall.identifier, name: '' }, [wall])).toBe(wall);
    expect(concealment.find({ identifier: 'from-another-room', name: '隠し扉' }, [wall])).toBe(wall);
    expect(concealment.find({ identifier: '', name: '' }, [wall])).toBeNull();
  });
});
