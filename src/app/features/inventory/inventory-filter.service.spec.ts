import { TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('InventoryFilterService', () => {
  let service: InventoryFilterService;
  let inventory: GameObjectInventoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(InventoryFilterService);
    inventory = TestBed.inject(GameObjectInventoryService);
  });

  it('cuts the search into its terms, and has no query for blanks alone', () => {
    expect(service.hasQuery()).toBe(false);

    service.searchQuery.set('  勇者　HP ');
    expect(service.searchTerms()).toEqual(['勇者', 'hp']);
    expect(service.hasQuery()).toBe(true);

    service.searchQuery.set('   ');
    expect(service.hasQuery()).toBe(false);
  });

  it('empties the search', () => {
    service.searchQuery.set('勇者');

    service.clearSearch();

    expect(service.searchQuery()).toBe('');
    expect(service.searchTerms()).toEqual([]);
  });

  it('switches hidden pieces between dimmed and drawn in full', () => {
    expect(service.hiddenDisplay()).toBe('dim');

    service.toggleHiddenDisplay();
    expect(service.hiddenDisplay()).toBe('full');

    service.toggleHiddenDisplay();
    expect(service.hiddenDisplay()).toBe('dim');
  });

  it('reads and writes the order and the display items on the room, not on itself', () => {
    const before = {
      sortTag: inventory.sortTag,
      sortOrder: inventory.sortOrder,
      sortTag2nd: inventory.sortTag2nd,
      sortOrder2nd: inventory.sortOrder2nd,
      extraSortKeys: inventory.extraSortKeys,
      dataTag: inventory.dataTag,
      tableDataTag: inventory.tableDataTag,
    };

    try {
      service.sortTag = 'HP';
      service.sortOrder = SortOrder.ASC;
      service.sortTag2nd = 'MP';
      service.sortOrder2nd = SortOrder.DESC;
      service.extraSortKeys = [{ tag: '敏捷', order: SortOrder.ASC }];
      service.dataTag = 'HP MP';
      service.tableDataTag = 'HP 防護点';

      expect(inventory.sortTag).toBe('HP');
      expect(inventory.sortOrder).toBe(SortOrder.ASC);
      expect(inventory.sortTag2nd).toBe('MP');
      expect(inventory.sortOrder2nd).toBe(SortOrder.DESC);
      expect(inventory.extraSortKeys).toEqual([{ tag: '敏捷', order: SortOrder.ASC }]);
      expect(inventory.dataTag).toBe('HP MP');
      expect(inventory.tableDataTag).toBe('HP 防護点');
      expect(service.sortTag).toBe('HP');
      expect(service.sortOrder).toBe(SortOrder.ASC);
      expect(service.sortTag2nd).toBe('MP');
      expect(service.sortOrder2nd).toBe(SortOrder.DESC);
      expect(service.extraSortKeys).toEqual([{ tag: '敏捷', order: SortOrder.ASC }]);
      expect(service.dataTag).toBe('HP MP');
      expect(service.tableDataTag).toBe('HP 防護点');
    } finally {
      Object.assign(inventory, before);
    }
  });
});
