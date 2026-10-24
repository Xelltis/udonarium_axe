import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { encodeAttributeValue } from '@axe/core/util/xml-util';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';

/** The element each locked tag is written as. Not the record's own kind, so reading one makes no record of its own. */
const ENTRY = 'entry';

/**
 * A holder for writing the room's locked tags into a saved room as `imagelock.xml`, and for locking
 * them again from it.
 *
 * Each is written as a plain entry and read back by this holder itself, rather than as a record of
 * its own kind, which would come into the room under an identifier of its own and be destroyed
 * again; the room server keeps that kind to the one identifier a tag's record has.
 */
@SyncObject('image-tag-lock-list')
export class ImageTagLockList extends ObjectNode implements InnerXml {
  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** A plain entry for each tag locked now. One unlocked since is left out, as nothing need be done to it. */
  override innerXml(): string {
    return ImageTagLock.all()
      .filter((lock) => lock.isLocked && lock.owner !== '')
      .map((lock) => `<${ENTRY} tag="${encodeAttributeValue(lock.tag)}" owner="${encodeAttributeValue(lock.owner)}"/>`)
      .join('');
  }

  /** Locks each saved tag to its saved holder. Entries naming no tag, or nobody, are passed over. */
  override parseInnerXml(element: Element): void {
    for (const entry of Array.from(element.children)) {
      if (entry.tagName !== ENTRY) continue;
      const tag = entry.getAttribute('tag') ?? '';
      const owner = entry.getAttribute('owner') ?? '';
      if (tag && owner) ImageTagLock.lock(tag, owner);
    }
  }

  /** A holder for writing the room's locked tags. */
  static create(): ImageTagLockList {
    return new ImageTagLockList();
  }
}
