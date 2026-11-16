import { TestBed } from '@angular/core/testing';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectInventory } from '@axe/application/inventory/object-inventory';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  InventoryRows,
  InventoryRowsHost,
  isHiddenFromInventory,
} from '@axe/features/inventory/game-object-inventory/inventory-rows';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('InventoryRows', () => {
  let hero: GameCharacter;
  let goblin: GameCharacter;
  let lurker: GameCharacter;
  let filter: InventoryFilterService;
  let inventory: GameObjectInventoryService;
  let canSeeHidden: ReturnType<typeof vi.fn<() => boolean>>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
    lurker = GameCharacter.create('伏兵', 1, '');
    lurker.hideInventory = true;
    filter = TestBed.inject(InventoryFilterService);
    inventory = TestBed.inject(GameObjectInventoryService);
    vi.spyOn(inventory.tableInventory, 'tabletopObjects', 'get').mockReturnValue([hero, goblin, lurker]);
    canSeeHidden = vi.fn(() => false);
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockImplementation(canSeeHidden);
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockReturnValue(true);
  });

  afterEach(() => {
    for (const piece of [hero, goblin, lurker]) piece.destroy();
    vi.restoreAllMocks();
  });

  /** An inventory standing in for a tab's, holding these pieces and the display items of each. */
  function inventoryOf(pieces: TabletopObject[], items = new Map<string, (DataElement | null)[]>()): ObjectInventory {
    return { tabletopObjects: pieces, dataElementMap: items } as unknown as ObjectInventory;
  }

  function setup(over: Partial<InventoryRowsHost> = {}) {
    const host: InventoryRowsHost = {
      selectTab: () => 'table',
      listsHidden: () => false,
      inventoryOf: () => inventoryOf([]),
      canView: () => true,
      ...over,
    };
    return TestBed.runInInjectionContext(() => new InventoryRows(host));
  }

  const named = (rows: readonly { object: TabletopObject }[]) => rows.map((row) => row.object.name);

  it('tells a character hidden from the inventory from any other piece', () => {
    expect(isHiddenFromInventory(lurker)).toBe(true);
    expect(isHiddenFromInventory(hero)).toBe(false);
  });

  it('lists the characters on the table, leaving out those hidden from the inventory', () => {
    expect(named(setup().visible())).toEqual(['勇者', 'ゴブリン']);
  });

  it('lists the hidden ones too for a seat shown them, or while the panel is at work on the pieces', () => {
    expect(named(setup({ listsHidden: () => true }).visible())).toEqual(['勇者', 'ゴブリン', '伏兵']);

    canSeeHidden.mockReturnValue(true);
    expect(named(setup().visible())).toEqual(['勇者', 'ゴブリン', '伏兵']);
  });

  it('lists nothing the table keeps in the dark, whoever reads the list', () => {
    canSeeHidden.mockReturnValue(true);
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockImplementation((piece) => piece !== goblin);

    expect(named(setup({ listsHidden: () => true }).visible())).toEqual(['勇者', '伏兵']);
  });

  it('lists every piece of another tab as its inventory holds them', () => {
    const rows = setup({ selectTab: () => 'graveyard', inventoryOf: () => inventoryOf([lurker, hero]) });

    expect(named(rows.visible())).toEqual(['伏兵', '勇者']);
  });

  it('narrows by what is hidden only for a seat shown it', () => {
    filter.hiddenFilter.set('only');
    const players = setup({ listsHidden: () => true });
    expect(players.activeHiddenFilter()).toBe('all');
    expect(players.isHiddenFiltered()).toBe(false);
    expect(named(players.filtered())).toEqual(['勇者', 'ゴブリン', '伏兵']);

    canSeeHidden.mockReturnValue(true);
    const master = setup();
    expect(master.activeHiddenFilter()).toBe('only');
    expect(master.isHiddenFiltered()).toBe(true);
    expect(named(master.filtered())).toEqual(['伏兵']);

    filter.hiddenFilter.set('exclude');
    expect(named(master.filtered())).toEqual(['勇者', 'ゴブリン']);
  });

  it('narrows by the search, matching the name the reader is shown', () => {
    const rows = setup();
    filter.searchQuery.set('ゴブ');
    expect(named(rows.filtered())).toEqual(['ゴブリン']);

    vi.spyOn(TestBed.inject(PieceNameService), 'shown').mockReturnValue('？？？');
    filter.searchQuery.set('ゴブ ');
    expect(named(rows.filtered())).toEqual([]);
  });

  it('searches the display items of a piece only where the reader may see them', () => {
    const items = new Map([[goblin.identifier, [DataElement.create('武器', 'こんぼう'), null]]]);
    filter.searchQuery.set('こんぼう');

    expect(named(setup({ inventoryOf: () => inventoryOf([], items) }).filtered())).toEqual(['ゴブリン']);
    expect(named(setup({ inventoryOf: () => inventoryOf([], items), canView: () => false }).filtered())).toEqual([]);
  });

  it('says in one line what narrowing is in force', () => {
    const before = { sortTag: inventory.sortTag, sortOrder: inventory.sortOrder };
    canSeeHidden.mockReturnValue(true);

    try {
      inventory.sortTag = '';
      const none = setup().summary();
      expect(none.length).toBeGreaterThan(0);

      filter.searchQuery.set(' 勇者 ');
      filter.hiddenFilter.set('only');
      inventory.sortTag = 'HP';
      inventory.sortOrder = SortOrder.ASC;
      const rows = setup();

      expect(rows.summary().split(' / ')).toHaveLength(3);
      expect(rows.summary()).toContain('“勇者”');
      expect(rows.summary()).toContain(`HP (${rows.sortOrderName()})`);
      expect(rows.summary()).not.toBe(none);
    } finally {
      Object.assign(inventory, before);
    }
  });
});
