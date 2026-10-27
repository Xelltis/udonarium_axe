import { inject, Injectable } from '@angular/core';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SYSTEM_RESERVED_TAG, TagHidden } from '@axe/domain/media/image-tag';
import { IMAGE_TAG_LOCK_ALIAS, ImageTagLock } from '@axe/domain/media/image-tag-lock';

/**
 * Tags of pictures kept to the one who locked them, and whether this seat is kept from one.
 *
 * A locked tag's pictures stay out of the lists and pickers of everyone but its holder and the GM,
 * whoever added them. That is all it does: what is on the table shows as it did, and every seat still
 * holds the bytes, so between peers it keeps them from none but those who play fair, as a picture the
 * GM keeps back does.
 */
@Injectable({ providedIn: 'root' })
export class ImageTagLockService {
  private readonly ownership = inject(AssetOwnershipService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);

  /** Whether the tag's pictures are kept from this seat: locked by someone else, and this seat no GM. */
  readonly hides: TagHidden = (tag: string) => {
    if (!tag || this.rolePermission.canSeeHidden()) return false;
    const lock = ImageTagLock.get(tag);
    return !!lock?.isLocked && !lock.isHeldBy(this.ownership.myOwnerKey());
  };

  /** Whether the tag is kept to someone now. */
  isLocked(tag: string): boolean {
    return ImageTagLock.get(tag)?.isLocked ?? false;
  }

  /** Whether the tag is kept to this seat. */
  isMine(tag: string): boolean {
    return ImageTagLock.get(tag)?.isHeldBy(this.ownership.myOwnerKey()) ?? false;
  }

  /**
   * Whether this seat may lock or unlock the tag: any tag a person files pictures under, by anyone who
   * plays, while nobody else holds it; a held one by its holder and the GM.
   */
  mayToggle(tag: string): boolean {
    if (!tag || tag === SYSTEM_RESERVED_TAG || !this.rolePermission.canEditTabletop()) return false;
    return !this.isLocked(tag) || this.isMine(tag) || this.rolePermission.canEditShared();
  }

  /** Keeps the tag to this seat, or lets everyone come across its pictures again, as this seat may. */
  toggle(tag: string): void {
    if (!this.mayToggle(tag)) return;
    if (this.isLocked(tag)) ImageTagLock.unlock(tag);
    else ImageTagLock.lock(tag, this.ownership.myOwnerKey());
  }

  /**
   * Whether this seat may file a picture under the tag: not one someone else keeps from it, under which
   * the picture would go out of this seat's own lists as well.
   */
  mayFileUnder(tag: string): boolean {
    return !this.hides(tag);
  }

  /** Reads the room's locks, so that what asks follows them as they are made, locked and unlocked. */
  track(): void {
    this.objectChange.collectionOf(IMAGE_TAG_LOCK_ALIAS)();
    for (const lock of ImageTagLock.all()) this.objectChange.versionOf(lock.identifier)();
  }
}
