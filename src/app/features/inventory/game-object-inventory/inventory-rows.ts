import { computed, inject } from '@angular/core';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectInventory } from '@axe/application/inventory/object-inventory';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  buildInventoryRow,
  filterInventoryRows,
  filterInventoryRowsByHidden,
  type InventoryHiddenFilter,
  type InventoryRow,
  inventorySearchText,
} from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';

const HIDDEN_FILTER_LABEL_KEYS: Record<InventoryHiddenFilter, string> = {
  all: 'feature.inventory.panel.hiddenFilterAll',
  only: 'feature.inventory.panel.hiddenFilterOnly',
  exclude: 'feature.inventory.panel.hiddenFilterExclude',
};

/** What the rows of an inventory read of the panel that lists them. */
export interface InventoryRowsHost {
  /** The tab on view. */
  selectTab(): string;
  /** Whether the panel is at work on the pieces themselves, picking several or setting the list up, which lists those hidden from the inventory too. */
  listsHidden(): boolean;
  /** The inventory behind a tab. */
  inventoryOf(tab: string): ObjectInventory;
  /** Whether this seat may see a piece's details, which alone are searched. */
  canView(object: TabletopObject): boolean;
}

/**
 * The rows an inventory lists: the pieces of the tab on view, narrowed by what is hidden from the
 * inventory and by the search, and the line that says what narrowing is in force.
 *
 * Made where services can be injected, as the panel makes its fields, so that it narrows by the
 * filter of the panel that made it.
 */
export class InventoryRows {
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly filter = inject(InventoryFilterService);
  private readonly names = inject(PieceNameService);
  private readonly t = inject(TRANSLATE_FN);

  constructor(private readonly host: InventoryRowsHost) {}

  /** Whether this seat is shown what is hidden. */
  readonly canSeeHidden = computed<boolean>(() => this.rolePermission.canSeeHidden());

  /** How the pieces hidden from the inventory are narrowed, which only a seat shown them can choose. */
  readonly activeHiddenFilter = computed<InventoryHiddenFilter>(() =>
    this.canSeeHidden() ? this.filter.hiddenFilter() : 'all'
  );

  /** Whether the list is narrowed by what is hidden from the inventory. */
  readonly isHiddenFiltered = computed<boolean>(() => this.activeHiddenFilter() !== 'all');

  /** The pieces of the tab on view, before any narrowing. */
  readonly visible = computed<InventoryRow[]>(() => {
    this.inventoryService.inventoryVersion();
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('character')();
    this.objectChange.trackMyCursor();
    return this.baseObjectsOf(this.host.selectTab()).map((object) =>
      buildInventoryRow(object, object instanceof GameCharacter ? object.folderName : '')
    );
  });

  /** The rows listed: those of the tab on view that pass the hidden filter and match the search. */
  readonly filtered = computed<InventoryRow[]>(() => {
    const terms = this.filter.searchTerms();
    const rows = filterInventoryRowsByHidden(this.visible(), this.activeHiddenFilter(), (row) =>
      isHiddenFromInventory(row.object)
    );
    if (terms.length < 1) return rows;

    // Owner names live on the cursors, so a rename over there has to reach the text being matched.
    this.objectChange.collectionOf('PeerCursor')();
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      this.objectChange.versionOf(cursor.identifier)();
    }
    const inventoryType = this.host.selectTab();
    return filterInventoryRows(rows, terms, (row) =>
      inventorySearchText(
        row,
        row.object instanceof OwnedTabletopObject ? row.object.ownerName : '',
        this.host.canView(row.object) ? this.elementTextsOf(inventoryType, row.object) : [],
        this.names.shown(row.object)
      )
    );
  });

  /** What is in force, said in one line, so the list shows its own narrowing without the box. */
  readonly summary = computed<string>(() => {
    const parts: string[] = [];
    if (this.filter.hasQuery()) parts.push(`“${this.filter.searchQuery().trim()}”`);
    if (this.isHiddenFiltered()) parts.push(this.t(HIDDEN_FILTER_LABEL_KEYS[this.activeHiddenFilter()]));
    const sortTag = this.inventoryService.sortTag;
    if (sortTag) parts.push(`${sortTag} (${this.sortOrderName()})`);
    return parts.length > 0 ? parts.join(' / ') : this.t('feature.inventory.panel.filterNone');
  });

  /** The translated name of the direction of the room's main sort. */
  sortOrderName(): string {
    return this.inventoryService.sortOrder === SortOrder.ASC
      ? this.t('feature.inventory.panel.asc')
      : this.t('feature.inventory.panel.desc');
  }

  private baseObjectsOf(inventoryType: string): TabletopObject[] {
    switch (inventoryType) {
      case 'table': {
        // What the table does not draw for this reader is not listed either, whatever mode the
        // list is in: a row would name what the dark or the fog is keeping back.
        const listed = this.inventoryService.tableInventory.tabletopObjects
          .filter((object): object is GameCharacter => object instanceof GameCharacter)
          .filter((character) => this.vision.mayBeListed(character));
        const showHidden = this.host.listsHidden() || this.rolePermission.canSeeHidden();
        return showHidden ? listed : listed.filter((character) => !character.hideInventory);
      }

      default:
        return this.host.inventoryOf(inventoryType).tabletopObjects;
    }
  }

  private elementTextsOf(inventoryType: string, object: TabletopObject): string[] {
    const elements = this.host.inventoryOf(inventoryType).dataElementMap.get(object.identifier) ?? [];
    const texts: string[] = [];
    for (const element of elements) {
      if (!element || element.name === this.inventoryService.newLineString) continue;
      texts.push(`${element.value}`);
      if (element.currentValue != null && element.currentValue !== '') texts.push(`${element.currentValue}`);
    }
    return texts;
  }
}

/** Whether the piece is a character hidden from the inventory. */
export function isHiddenFromInventory(gameObject: TabletopObject): boolean {
  return gameObject instanceof GameCharacter && gameObject.hideInventory;
}
