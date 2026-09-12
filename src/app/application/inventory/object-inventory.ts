import { sortObjectsByTags } from '@axe/application/inventory/game-object-inventory-helpers';
import { displayItemNames } from '@axe/application/inventory/summary-items';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

type ObjectIdentifier = string;

export class ObjectInventory {
  newLineString: string = '/';
  private newLineDataElement: DataElement = DataElement.create(this.newLineString);

  private get summarySetting(): DataSummarySetting {
    return DataSummarySetting.instance;
  }

  get sortTag(): string {
    return this.summarySetting.sortTag;
  }
  set sortTag(sortTag: string) {
    this.summarySetting.sortTag = sortTag;
  }

  get sortOrder(): SortOrder {
    return this.summarySetting.sortOrder;
  }
  set sortOrder(sortOrder: SortOrder) {
    this.summarySetting.sortOrder = sortOrder;
  }

  get sortTag2nd(): string {
    return this.summarySetting.sortTag2nd;
  }
  set sortTag2nd(sortTag: string) {
    this.summarySetting.sortTag2nd = sortTag;
  }

  get sortOrder2nd(): SortOrder {
    return this.summarySetting.sortOrder2nd;
  }
  set sortOrder2nd(sortOrder: SortOrder) {
    this.summarySetting.sortOrder2nd = sortOrder;
  }

  get dataTag(): string {
    return this.summarySetting.dataTag;
  }
  set dataTag(dataTag: string) {
    this.summarySetting.dataTag = dataTag;
  }

  /** What the room named, or what its pieces carry while it has named none. */
  get dataTags(): string[] {
    return displayItemNames(this.summarySetting.dataTags, this.pieces());
  }

  private _tabletopObjects: TabletopObject[] = [];

  /** The pieces of this inventory, before the order is settled: what is here, not how it reads. */
  private pieces(): TabletopObject[] {
    if (this.needsRefreshObjects) {
      this._tabletopObjects = this.searchTabletopObjects();
      this.needsRefreshObjects = false;
    }
    return this._tabletopObjects;
  }

  get tabletopObjects(): TabletopObject[] {
    this.pieces();
    if (this.needsSort) {
      this._tabletopObjects = sortObjectsByTags(
        this._tabletopObjects,
        this.sortTag,
        this.sortOrder,
        this.sortTag2nd,
        this.sortOrder2nd
      );
      this.needsSort = false;
    }
    return this._tabletopObjects;
  }

  get length(): number {
    return this.pieces().length;
  }

  private _dataElementMap: Map<ObjectIdentifier, (DataElement | null)[]> = new Map();
  get dataElementMap(): Map<ObjectIdentifier, (DataElement | null)[]> {
    if (this.needsRefreshElements) {
      this._dataElementMap.clear();
      const caches = this.tabletopObjects;
      for (const object of caches) {
        if (!object.rootDataElement) continue;
        const elements = this.dataTags.map((tag) =>
          tag === this.newLineString
            ? this.newLineDataElement
            : object.rootDataElement
              ? DataElement.findElementByReference(object.rootDataElement, tag)
              : null
        );
        this._dataElementMap.set(object.identifier, elements);
      }
      this.needsRefreshElements = false;
    }
    return this._dataElementMap;
  }

  private needsRefreshObjects: boolean = true;
  private needsRefreshElements: boolean = true;
  private needsSort: boolean = true;

  constructor(readonly classifier: (object: TabletopObject) => boolean) {}

  refreshObjects() {
    this.needsRefreshObjects = true;
  }

  refreshDataElements() {
    this.needsRefreshElements = true;
  }

  refreshSort() {
    this.needsSort = true;
  }

  private searchTabletopObjects(): TabletopObject[] {
    const objects: TabletopObject[] = ObjectStore.instance.getObjects(GameCharacter);
    const caches: TabletopObject[] = [];
    for (const object of objects) {
      if (this.classifier(object)) caches.push(object);
    }
    return caches;
  }
}
