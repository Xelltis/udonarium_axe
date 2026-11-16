import { computed, inject } from '@angular/core';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { tableItemNames } from '@axe/application/inventory/summary-items';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { buffIconUrlOf } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement } from '@axe/domain/data/data-element';
import { findReferencedElement } from '@axe/domain/data/element-reference';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import type { InventoryRow } from '@axe/features/inventory/game-object-inventory/inventory-list';
import {
  buildInventoryTable,
  InventoryTable,
  InventoryTableColumn,
} from '@axe/features/inventory/game-object-inventory/inventory-table';

/** What the table view of an inventory reads of the panel that draws it. */
export interface InventoryTableViewHost {
  /** The rows the panel lists, which the table lays out sideways. */
  rows(): readonly InventoryRow[];
}

/**
 * The table view of an inventory: the cast laid out sideways, and the status columns whose boxes
 * put a state on a piece or take it off.
 *
 * Made where services can be injected, as the panel makes its fields.
 */
export class InventoryTableView {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly ailmentService = inject(StatusAilmentService);
  private readonly inventoryService = inject(GameObjectInventoryService);

  constructor(private readonly host: InventoryTableViewHost) {}

  /**
   * The cast laid out sideways: one row a piece, one column a display item.
   *
   * The states the room keeps are watched as a whole rather than piece by piece, since ticking
   * one on writes a buff onto a sheet somewhere below the piece.
   */
  readonly table = computed<InventoryTable>(() => {
    this.objectChange.collectionOf('data')();
    // The table keeps a list of its own, so the elements are looked up against that rather
    // than taken from the map the full view's list is cached in.
    const objects = this.host.rows().map((row) => row.object);
    const ailments = this.ailmentService.ailments();
    const tags = tableItemNames(
      this.inventoryService.tableDataTags,
      objects,
      ailments.map((ailment) => ailment.name)
    );
    return buildInventoryTable(
      objects,
      tags,
      ailments,
      (object) => this.elementsOf(object, tags),
      this.inventoryService.newLineString,
      this.inventoryService.sortTag
    );
  });

  /** The colour behind a status column's heading, transparent for any other column. */
  ailmentSwatch(column: InventoryTableColumn): string {
    return column.ailment ? resolveBuffColor(column.ailment.color) || 'transparent' : 'transparent';
  }

  /** The icon of a status column's heading, empty for any other column. */
  ailmentIconUrl(column: InventoryTableColumn): string {
    this.objectChange.fileVersion();
    return column.ailment ? buffIconUrlOf(column.ailment.icon) : '';
  }

  /** Whether a status is on a piece, as its box shows; always false for anything but a character. */
  isAilmentOn(object: TabletopObject, ailment: StatusAilment): boolean {
    this.objectChange.collectionOf('data')();
    this.objectChange.versionOf(object.identifier)();
    return object instanceof GameCharacter && this.ailmentService.isOn(object, ailment.name);
  }

  /** Puts a status on a character or takes it off, from its box. */
  toggleAilment(event: Event, object: TabletopObject, ailment: StatusAilment): void {
    event.stopPropagation();
    if (!(object instanceof GameCharacter)) return;
    this.ailmentService.toggle(object, ailment, (event.target as HTMLInputElement).checked);
  }

  private elementsOf(object: TabletopObject, tags: readonly string[]): (DataElement | null)[] {
    const root = object.rootDataElement;
    if (!root) return tags.map(() => null);
    const newLine = this.inventoryService.newLineString;
    return tags.map((tag) => (tag === newLine ? null : findReferencedElement(root, tag)));
  }
}
