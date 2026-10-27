import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { type SortKey, SortOrder } from '@axe/domain/data/data-summary-setting';
import { appendSummaryTag, removeSummaryTag, splitSummaryTags, tagLeafNames } from '@axe/domain/data/summary-tag-list';
import { displayItemCandidates } from '@axe/domain/inventory/display-item-candidates';
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
import { InventoryViewPreferenceService } from '@axe/features/inventory/inventory-view-preference.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TranslocoModule } from '@jsverse/transloco';

/** Only one of these, so pressing the button that opened it puts it away. */
export const INVENTORY_FILTER_PANEL = 'inventory-filter';

/** The two display-item boxes: the full view's and the table's. */
type DisplayItemBox = 'rich' | 'table';

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
  imports: [FormsModule, NgTemplateOutlet, TranslocoModule],
})
export class InventoryFilterPanelComponent {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly inventoryService = inject(GameObjectInventoryService);

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

  readonly canSeeHidden = computed<boolean>(() => this.rolePermission.canSeeHidden());

  readonly canEdit = computed<boolean>(() => this.rolePermission.canEditTabletop());

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

  /** The steps of the order after the second, each a row of its own below the first two. */
  get extraSortKeys(): readonly SortKey[] {
    return this.filter.extraSortKeys;
  }

  /** Adds a step to the end of the order, ascending and with its name still to be written. */
  addSortKey(): void {
    this.filter.extraSortKeys = [...this.filter.extraSortKeys, { tag: '', order: SortOrder.ASC }];
  }

  /** Rewrites the name or the direction of a step after the second, found by its place among them. */
  setSortKey(index: number, change: Partial<SortKey>): void {
    this.filter.extraSortKeys = this.filter.extraSortKeys.map((key, i) => (i === index ? { ...key, ...change } : key));
  }

  /** Takes a step after the second out of the order, and the ones below it move up. */
  removeSortKey(index: number): void {
    this.filter.extraSortKeys = this.filter.extraSortKeys.filter((_, i) => i !== index);
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

  /**
   * The data names offered to the order boxes, taken from the display items of both views. The
   * boxes still take whatever is typed; `name`, which orders by the piece's name, is offered apart
   * with its label.
   */
  get sortCandidates(): string[] {
    const names = tagLeafNames([...splitSummaryTags(this.dataTag), ...splitSummaryTags(this.tableDataTag)]);
    return names.filter((name) => name !== 'name');
  }

  /** The display-item box whose list of names is open, if either is. */
  readonly candidatesOpenFor = signal<DisplayItemBox | null>(null);

  /**
   * The names offered for the display items, from the sheets of the characters on the table. Worked
   * out only while a list is open, and again as pieces come and go, step on or off the table, or
   * their sheets change.
   */
  readonly displayCandidates = computed<string[]>(() => {
    if (this.candidatesOpenFor() === null) return [];
    this.objectChange.collectionOf('character')();
    this.objectChange.collectionOf('data')();
    this.inventoryService.inventoryVersion();
    const details = this.inventoryService.tableInventory.tabletopObjects
      .filter((object): object is GameCharacter => object instanceof GameCharacter)
      .map((character) => character.detailDataElement ?? null);
    return displayItemCandidates(details);
  });

  /** Opens the list of names under a display-item box, or puts it away if it is the one open. */
  toggleCandidates(box: DisplayItemBox): void {
    this.candidatesOpenFor.update((open) => (open === box ? null : box));
  }

  /** The names a display-item box already shows, each item read by the name at its end. */
  listedNames(box: DisplayItemBox): ReadonlySet<string> {
    return new Set(tagLeafNames(splitSummaryTags(this.lineOf(box))));
  }

  /**
   * Adds a name to the end of a display-item box, or takes it out if the box already shows it. What
   * else is written in the box stays as it was.
   */
  toggleCandidate(box: DisplayItemBox, name: string): void {
    const line = this.lineOf(box);
    const next = this.listedNames(box).has(name) ? removeSummaryTag(line, name) : appendSummaryTag(line, name);
    if (box === 'rich') this.dataTag = next;
    else this.tableDataTag = next;
  }

  private lineOf(box: DisplayItemBox): string {
    return box === 'rich' ? this.dataTag : this.tableDataTag;
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
