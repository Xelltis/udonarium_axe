import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { InventoryViewPreferenceService } from '@axe/application/ui/inventory-view-preference.service';
import { PanelService } from '@axe/application/ui/panel.service';
import {
  INVENTORY_CHROME_LABEL_KEYS,
  INVENTORY_CHROME_PARTS,
  InventoryChromePart,
} from '@axe/domain/inventory/inventory-chrome';
import { STATUS_AILMENT_PANEL } from '@axe/domain/ui/room-panel';
import {
  INVENTORY_HIDDEN_FILTERS,
  type InventoryHiddenFilter,
} from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TranslocoModule } from '@jsverse/transloco';

/** Only one of these, so pressing the button that opened it puts it away. */
export const INVENTORY_FILTER_PANEL = 'inventory-filter';

/**
 * What the inventory is narrowed to and what it shows of each piece.
 *
 * Carried above the list, all of this would cost four rows of a panel that is read for its
 * rows. It stands beside the list instead, and the list keeps a line saying what is in force
 * here.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'inventory-filter-panel',
  templateUrl: './inventory-filter-panel.component.html',
  host: { class: 'block h-full' },
  imports: [FormsModule, TranslocoModule],
})
export class InventoryFilterPanelComponent {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * The inventory being worked on, handed over by the one that opened this window.
   *
   * Each inventory keeps its own narrowing and its own way of being read, so this window is
   * told whose it is rather than reaching for one of its own. Asked for through the injector,
   * a root pair would be built on every opening and thrown away unread on the next line.
   */
  filter!: InventoryFilterService;
  viewPreference!: InventoryViewPreferenceService;

  /** Told to that inventory when this window goes, so its button stops looking pressed. */
  closed: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.closed?.());
  }

  /** The text the inventory is narrowed by, which the search box reads and writes. */
  get searchQuery() {
    return this.filter.searchQuery;
  }
  /** Whether the search text holds anything to narrow by, which shows the button that clears it. */
  get hasQuery() {
    return this.filter.hasQuery;
  }
  /** Whether hidden pieces are listed along with the rest, on their own, or not at all. */
  get hiddenFilter() {
    return this.filter.hiddenFilter;
  }
  /** Whether hidden pieces are drawn dimmed or at full strength in the list. */
  get hiddenDisplay() {
    return this.filter.hiddenDisplay;
  }

  private readonly hiddenFilterLabelKeys: Record<InventoryHiddenFilter, string> = {
    all: 'feature.inventory.panel.hiddenFilterAll',
    only: 'feature.inventory.panel.hiddenFilterOnly',
    exclude: 'feature.inventory.panel.hiddenFilterExclude',
  };

  readonly hiddenFilterOptions = INVENTORY_HIDDEN_FILTERS.map((value) => ({
    value,
    labelKey: this.hiddenFilterLabelKeys[value],
  }));

  readonly canSeeHidden = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canSeeHidden;
  });

  readonly canEdit = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /**
   * The name of the data the inventory is sorted by first, in the summary setting every inventory
   * shares.
   */
  get sortTag(): string {
    return this.filter.sortTag;
  }
  set sortTag(value: string) {
    this.filter.sortTag = value;
  }

  /** Whether the first sort runs ascending or descending. */
  get sortOrder(): string {
    return this.filter.sortOrder;
  }
  set sortOrder(value: string) {
    this.filter.sortOrder = value as typeof this.filter.sortOrder;
  }

  /** The name of the data the inventory is sorted by where the first sort leaves pieces level. */
  get sortTag2nd(): string {
    return this.filter.sortTag2nd;
  }
  set sortTag2nd(value: string) {
    this.filter.sortTag2nd = value;
  }

  /** Whether the second sort runs ascending or descending. */
  get sortOrder2nd(): string {
    return this.filter.sortOrder2nd;
  }
  set sortOrder2nd(value: string) {
    this.filter.sortOrder2nd = value as typeof this.filter.sortOrder2nd;
  }

  /**
   * Which data each piece shows in the full list, written as space-separated tag names with a slash
   * for a new line.
   */
  get dataTag(): string {
    return this.filter.dataTag;
  }
  set dataTag(value: string) {
    this.filter.dataTag = value;
  }

  /** Which data each piece shows in the table list, written the same way as the full list's. */
  get tableDataTag(): string {
    return this.filter.tableDataTag;
  }
  set tableDataTag(value: string) {
    this.filter.tableDataTag = value;
  }

  readonly chromeParts = INVENTORY_CHROME_PARTS.map((part) => ({
    part,
    labelKey: INVENTORY_CHROME_LABEL_KEYS[part],
  }));

  /** Whether a strip above the list is being shown. Putting one away closes the space up. */
  shows(part: InventoryChromePart): boolean {
    return this.viewPreference.shows(part);
  }

  /** Shows or puts away one of the strips above the list. The choice is kept in this browser. */
  setShown(part: InventoryChromePart, shown: boolean): void {
    this.viewPreference.setShown(part, shown);
  }

  /** Empties the search text, so everything is listed again. */
  clearSearch(): void {
    this.filter.clearSearch();
  }

  /** Switches hidden pieces between dimmed and full strength in the list. */
  toggleHiddenDisplay(): void {
    this.filter.toggleHiddenDisplay();
  }

  /** The states that can be named among the display items, which is where their columns come from. */
  openStatusAilments(): void {
    if (this.panelService.closeSingle(STATUS_AILMENT_PANEL)) return;
    this.roomPanels.open('statusAilment');
  }
}
