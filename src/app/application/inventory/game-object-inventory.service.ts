import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ObjectInventory } from '@axe/application/inventory/object-inventory';
import {
  personalFolderStorage,
  readPersonalFolders,
  writePersonalFolders,
} from '@axe/application/inventory/personal-folders';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/index';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isHandLocation } from '@axe/domain/card/hand-location';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isResourceElement } from '@axe/domain/character/resource-catalog';
import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import { tagLeafNames } from '@axe/domain/data/summary-tag-list';

type ObjectIdentifier = string;
type LocationName = string;
type ElementName = string;

@Injectable({
  providedIn: 'root',
})
export class GameObjectInventoryService {
  private readonly objectStore = inject(ObjectStore);
  private readonly dataSummarySetting = inject(DataSummarySetting);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly inventoryVersion = signal(0);

  private get summarySetting(): DataSummarySetting {
    return this.dataSummarySetting;
  }

  /**
   * The name of the data element inventories sort by. Kept in the room summary setting, so a change
   * reaches every peer.
   */
  get sortTag(): string {
    return this.summarySetting.sortTag;
  }
  set sortTag(sortTag: string) {
    this.summarySetting.sortTag = sortTag;
  }
  /** Which way inventories sort by `sortTag`. Shared with the room. */
  get sortOrder(): SortOrder {
    return this.summarySetting.sortOrder;
  }
  set sortOrder(sortOrder: SortOrder) {
    this.summarySetting.sortOrder = sortOrder;
  }

  /** The data element that breaks ties left by `sortTag`. Shared with the room. */
  get sortTag2nd(): string {
    return this.summarySetting.sortTag2nd;
  }
  set sortTag2nd(sortTag: string) {
    this.summarySetting.sortTag2nd = sortTag;
  }
  /** Which way ties are sorted by `sortTag2nd`. Shared with the room. */
  get sortOrder2nd(): SortOrder {
    return this.summarySetting.sortOrder2nd;
  }
  set sortOrder2nd(sortOrder: SortOrder) {
    this.summarySetting.sortOrder2nd = sortOrder;
  }

  /**
   * The columns the room has named for its inventories, written as one line of item names. Shared
   * with the room; empty until the room names any.
   */
  get dataTag(): string {
    return this.summarySetting.dataTag;
  }
  set dataTag(dataTag: string) {
    this.summarySetting.dataTag = dataTag;
  }
  /** The room's inventory columns, `dataTag` split into item names. */
  get dataTags(): string[] {
    return this.summarySetting.dataTags;
  }

  /**
   * The display items shown as columns when the inventory is laid out as a table, written as one
   * line of item names separated by spaces. Kept on the room's summary setting, so shared with the
   * room.
   */
  get tableDataTag(): string {
    return this.summarySetting.tableDataTag;
  }
  set tableDataTag(tableDataTag: string) {
    this.summarySetting.tableDataTag = tableDataTag;
  }
  /** `tableDataTag` split into item names, which the inventory's table layout reads for its columns. */
  get tableDataTags(): string[] {
    return this.summarySetting.tableDataTags;
  }

  /** The folders of the inventory's shared tab. Shared with the room, unlike the personal tab's folders. */
  get folderPaths(): string[] {
    return this.summarySetting.folderPaths;
  }
  set folderPaths(folderPaths: string[]) {
    this.summarySetting.folderPaths = folderPaths;
  }

  /**
   * The personal tab's folders belong to this device rather than the room, but every inventory
   * panel has to see the same ones, so they are held here rather than in a component.
   */
  private readonly personalStorage = personalFolderStorage();
  private personalRoomId = '';
  private readonly _personalFolderPaths = signal<string[]>([]);
  readonly personalFolderPaths = this._personalFolderPaths.asReadonly();

  /**
   * Replaces the personal tab's folders for every inventory panel, and keeps them in this browser
   * under the current room.
   */
  setPersonalFolderPaths(folderPaths: string[]): void {
    this._personalFolderPaths.set(folderPaths);
    writePersonalFolders(this.personalStorage, this.personalRoomId, folderPaths);
  }

  private reloadPersonalFolders(): void {
    this.personalRoomId = Network.peerContext?.roomId ?? '';
    this._personalFolderPaths.set(readPersonalFolders(this.personalStorage, this.personalRoomId));
  }

  tableInventory: ObjectInventory = new ObjectInventory((object) => object.isVisibleOnTable);
  commonInventory: ObjectInventory = new ObjectInventory((object) => {
    return !this.isAnyLocation(object.location.name);
  });
  privateInventory: ObjectInventory = new ObjectInventory((object) => {
    return object.location.name === Network.peerId;
  });
  graveyardInventory: ObjectInventory = new ObjectInventory((object) => {
    return object.location.name === 'graveyard';
  });

  private locationMap: Map<ObjectIdentifier, LocationName> = new Map();
  private tagNameMap: Map<ObjectIdentifier, ElementName> = new Map();
  private summarySnapshot: string = '';

  readonly newLineString: string = '/';
  readonly newLineDataElement: DataElement = DataElement.create(this.newLineString);

  constructor() {
    this.initialize();
  }

  private currentSummarySnapshot(): string {
    return [this.sortTag, this.sortOrder, this.sortTag2nd, this.sortOrder2nd, this.dataTag, this.tableDataTag].join(
      '\n'
    );
  }

  private initialize() {
    this.summarySnapshot = this.currentSummarySnapshot();
    this.reloadPersonalFolders();
    this.objectChange.objectAdded$.subscribe((e) => {
      if (e.aliasName === GameCharacter.aliasName) this.refresh();
    }, this.destroyRef);
    this.objectChange.networkOpen$.subscribe(() => {
      this.reloadPersonalFolders();
      this.refresh();
    }, this.destroyRef);
    this.objectChange.peerConnect$.subscribe(() => {
      this.refresh();
    }, this.destroyRef);
    this.objectChange.peerDisconnect$.subscribe(() => {
      this.refresh();
    }, this.destroyRef);
    this.objectChange.onObjectChangedForSingleAlias(
      'character',
      (e) => {
        const object = this.objectStore.get(e.identifier);
        if (!(object instanceof GameCharacter)) return;
        const prevLocation = this.locationMap.get(object.identifier);
        if (object.location.name !== prevLocation) {
          this.locationMap.set(object.identifier, object.location.name);
          this.refresh();
        } else {
          this.callInventoryUpdate();
        }
      },
      this.destroyRef
    );
    this.objectChange.onObjectChangedForSingleAlias(
      'data',
      (e) => {
        const object = this.objectStore.get(e.identifier);
        if (!(object instanceof DataElement) || !this.containsInGameCharacter(object)) return;

        const prevName = this.tagNameMap.get(object.identifier);
        if (this.isWatchedName(object, prevName) && object.name !== prevName) {
          this.tagNameMap.set(object.identifier, object.name);
          this.refreshDataElements();
        }
        if (this.sortTag === object.name || this.sortTag2nd === object.name) {
          this.refreshSort();
        }
        if (object.children.length > 0) {
          this.refreshDataElements();
          this.refreshSort();
        }
        this.callInventoryUpdate();
      },
      this.destroyRef
    );
    this.objectChange.onObjectChangedForSingleAlias(
      'summary-setting',
      (e) => {
        if (!(this.objectStore.get(e.identifier) instanceof DataSummarySetting)) return;
        const snapshot = this.currentSummarySnapshot();
        if (snapshot !== this.summarySnapshot) {
          this.summarySnapshot = snapshot;
          this.refreshDataElements();
          this.refreshSort();
        }
        this.callInventoryUpdate();
      },
      this.destroyRef
    );
    this.objectChange.objectDeleted$.subscribe((e) => {
      this.locationMap.delete(e.identifier);
      this.tagNameMap.delete(e.identifier);
      this.refresh();
    }, this.destroyRef);
    this.objectChange.fileSyncList$.subscribe((e) => {
      if (e.isSendFromSelf) this.callInventoryUpdate();
    }, this.destroyRef);
  }

  /**
   * Whether a change to this item's name can change the columns.
   *
   * A room that names its items is watched by the name at the end of each, so a column written
   * as a path follows a rename too. A room that names none shows what its pieces carry, so any
   * resource being named, renamed or added can bring a column in or take one away.
   */
  private isWatchedName(element: DataElement, prevName: string | undefined): boolean {
    if (this.dataTags.length < 1) return isResourceElement(element);
    const watched = tagLeafNames(this.dataTags);
    return watched.includes(prevName ?? '') || watched.includes(element.name);
  }

  private containsInGameCharacter(element: DataElement): boolean {
    let parent = element.parent;
    const aliasName = GameCharacter.aliasName;
    while (parent) {
      if (parent.aliasName === aliasName) return true;
      parent = parent.parent;
    }
    return false;
  }

  private refresh() {
    this.refreshObjects();
    this.refreshDataElements();
    this.refreshSort();
    this.callInventoryUpdate();
  }

  private refreshObjects() {
    this.tableInventory.refreshObjects();
    this.commonInventory.refreshObjects();
    this.privateInventory.refreshObjects();
    this.graveyardInventory.refreshObjects();
  }

  private refreshDataElements() {
    this.tableInventory.refreshDataElements();
    this.commonInventory.refreshDataElements();
    this.privateInventory.refreshDataElements();
    this.graveyardInventory.refreshDataElements();
  }

  private refreshSort() {
    this.tableInventory.refreshSort();
    this.commonInventory.refreshSort();
    this.privateInventory.refreshSort();
    this.graveyardInventory.refreshSort();
  }

  private callInventoryUpdate() {
    this.inventoryVersion.update((v) => v + 1);
  }

  /** Asks inventory views to draw again, for a change to a piece that the service does not watch for itself. */
  notifyInventoryUpdate() {
    this.callInventoryUpdate();
  }

  private isAnyLocation(location: string): boolean {
    if (isHandLocation(location)) return true;
    if (location === 'table' || location === Network.peerId || location === 'graveyard') return true;
    for (const conn of Network.peerContexts) {
      if (conn.isOpen && location === conn.peerId) {
        return true;
      }
    }
    return false;
  }
}
