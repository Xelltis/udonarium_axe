import { computed, inject, Injectable, signal } from '@angular/core';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { splitSearchTerms } from '@axe/core/util/text-search';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import type {
  InventoryHiddenDisplay,
  InventoryHiddenFilter,
} from '@axe/features/inventory/game-object-inventory/inventory-list';

/**
 * What an inventory is being narrowed to, and how its list is ordered.
 *
 * It sits outside the list because the two are in separate windows: the list draws the pieces
 * and a panel of its own holds the search, the filters and the display items. The order and
 * the display items themselves belong to the room and live on the summary setting; only the
 * narrowing is this reader's own, and each inventory window keeps its own.
 */
@Injectable({ providedIn: 'root' })
export class InventoryFilterService {
  private readonly inventoryService = inject(GameObjectInventoryService);

  readonly searchQuery = signal('');
  readonly searchTerms = computed<string[]>(() => splitSearchTerms(this.searchQuery()));
  readonly hasQuery = computed<boolean>(() => this.searchTerms().length > 0);

  readonly hiddenFilter = signal<InventoryHiddenFilter>('all');
  readonly hiddenDisplay = signal<InventoryHiddenDisplay>('dim');

  /** Whether the panel holding all of this is standing, which the list shows in its own bar. */
  readonly isPanelOpen = signal(false);

  /** Empties the inventory search, showing every piece again. */
  clearSearch(): void {
    this.searchQuery.set('');
  }

  /**
   * Switches pieces hidden from the inventory between being drawn dimmed and being drawn in full.
   */
  toggleHiddenDisplay(): void {
    this.hiddenDisplay.update((display) => (display === 'dim' ? 'full' : 'dim'));
  }

  /**
   * The name of the data item the inventory is sorted by; it belongs to the room, so changing it
   * reorders everyone's list.
   */
  get sortTag(): string {
    return this.inventoryService.sortTag;
  }
  set sortTag(value: string) {
    this.inventoryService.sortTag = value;
  }

  /** Whether the inventory sorts ascending or descending by its sort item, shared with the room. */
  get sortOrder(): SortOrder {
    return this.inventoryService.sortOrder;
  }
  set sortOrder(value: SortOrder) {
    this.inventoryService.sortOrder = value;
  }

  /** The data item that breaks ties in the inventory's sort order, shared with the room. */
  get sortTag2nd(): string {
    return this.inventoryService.sortTag2nd;
  }
  set sortTag2nd(value: string) {
    this.inventoryService.sortTag2nd = value;
  }

  /** The direction of the tie-breaking sort, shared with the room. */
  get sortOrder2nd(): SortOrder {
    return this.inventoryService.sortOrder2nd;
  }
  set sortOrder2nd(value: SortOrder) {
    this.inventoryService.sortOrder2nd = value;
  }

  /**
   * The display items the inventory list shows for each piece, as typed into the filter panel and
   * shared with the room.
   */
  get dataTag(): string {
    return this.inventoryService.dataTag;
  }
  set dataTag(value: string) {
    this.inventoryService.dataTag = value;
  }

  /**
   * The display items the inventory's table view shows as columns, as typed into the filter panel
   * and shared with the room.
   */
  get tableDataTag(): string {
    return this.inventoryService.tableDataTag;
  }
  set tableDataTag(value: string) {
    this.inventoryService.tableDataTag = value;
  }
}
