import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { withoutExtension } from '@axe/core/util/file-name';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { DataElement } from '@axe/domain/data/data-element';

/** A room's set of stamps as it is offered: its name and its stamps. */
export interface StampPackView {
  readonly identifier: string;
  readonly name: string;
  readonly stamps: readonly { readonly stampId: string; readonly imageIdentifier: string; readonly name: string }[];
}

/**
 * The room's own sets of stamps, and the changes made to them.
 *
 * Anybody may use them; only somebody who may change the table may make, change or take them away,
 * as with any other picture in the room.
 */
@Injectable({ providedIn: 'root' })
export class StampPackService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  /** Every set, with its stamps, following every set and stamp added, changed or taken away. */
  readonly packs = computed<readonly StampPackView[]>(() => {
    this.objectChange.collectionOf(StampPack.aliasName)();
    return this.objectStore.getObjects<StampPack>(StampPack).map((pack) => {
      this.objectChange.versionOf(pack.identifier)();
      return {
        identifier: pack.identifier,
        name: pack.name,
        stamps: pack.stamps.map(({ stampId, imageIdentifier, name }) => ({ stampId, imageIdentifier, name })),
      };
    });
  });

  /** Whether the reader may make, change and take away the sets. */
  get canManage(): boolean {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  }

  /** The name a picture goes by as a stamp, from the first set that holds it; empty where none does. */
  nameOf(imageIdentifier: string): string {
    for (const pack of this.packs()) {
      const stamp = pack.stamps.find((each) => each.imageIdentifier === imageIdentifier);
      if (stamp && stamp.name.trim().length > 0) return stamp.name.trim();
    }
    return '';
  }

  /** Makes an empty set under a name; nothing for a reader who may not. */
  create(name: string): StampPack | null {
    if (!this.canManage) return null;
    return StampPack.create(name.trim());
  }

  /** Renames a set. */
  rename(pack: StampPack, name: string): void {
    if (!this.canManage) return;
    pack.name = name.trim();
  }

  /** Takes a set away. The pictures stay in the room, and lines already answered with them keep them. */
  remove(pack: StampPack): void {
    if (!this.canManage) return;
    pack.destroy();
  }

  /**
   * Adds pictures to a set as stamps, each under the name of its file, leaving out any already in it.
   * How many were added.
   */
  addImages(pack: StampPack, images: readonly { identifier: string; name: string }[]): number {
    if (!this.canManage) return 0;
    let added = 0;
    for (const image of images) {
      if (pack.addStamp(image.identifier, withoutExtension(image.name).trim())) added++;
    }
    return added;
  }

  /** Renames a stamp in a set. */
  renameStamp(element: DataElement, name: string): void {
    if (!this.canManage) return;
    element.name = name.trim();
  }

  /** Takes a stamp out of its set. The picture stays in the room. */
  removeStamp(element: DataElement): void {
    if (!this.canManage) return;
    element.destroy();
  }

  /** The set with this identifier, or null where it is gone. */
  find(identifier: string): StampPack | null {
    const pack = this.objectStore.get(identifier);
    return pack instanceof StampPack ? pack : null;
  }
}
