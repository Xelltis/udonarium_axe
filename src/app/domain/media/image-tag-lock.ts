import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

/** The kind the records go by, as the object store names it. */
export const IMAGE_TAG_LOCK_ALIAS = 'image-tag-lock';

/** What `locked` holds while the tag is kept to its holder. Anything else, a missing value too, means it is not. */
const LOCKED = '1';

/**
 * A tag of pictures kept to the one who locked it: every picture under it stays out of everyone
 * else's lists and pickers but the GM's, whoever added it.
 *
 * It keeps the pictures from being come across, not from being seen: one already on the table shows
 * as it did, and every seat still holds its bytes, as with a picture the GM keeps back.
 *
 * It is never destroyed. A tag unlocked keeps its record with `locked` emptied, since an identifier
 * once destroyed cannot be made again. It is a kind of its own rather than a mark on each picture's
 * tag, which an older version would wipe and which would not reach a picture filed under it later.
 */
@SyncObject(IMAGE_TAG_LOCK_ALIAS)
export class ImageTagLock extends ObjectNode {
  @SyncVar() tag: string = '';
  @SyncVar() owner: string = '';
  @SyncVar() locked: string = '';

  /** Whether the tag is kept to its holder now. */
  get isLocked(): boolean {
    return this.locked === LOCKED;
  }

  /** Whether the tag is locked and held by the given key. A record naming nobody is held by nobody. */
  isHeldBy(key: string): boolean {
    return this.isLocked && this.owner !== '' && this.owner === key;
  }

  /** The record of a tag, or null when it has never been locked. */
  static get(tag: string): ImageTagLock | null {
    return ObjectStore.instance.get<ImageTagLock>(imageTagLockIdentifierOf(tag));
  }

  /** Every record the room has, of tags locked now and of those unlocked since. */
  static all(): ImageTagLock[] {
    return ObjectStore.instance.getObjects<ImageTagLock>(ImageTagLock);
  }

  /** Keeps the tag to the given key, making its record when it has none. Nothing is done for an empty tag or key. */
  static lock(tag: string, key: string): void {
    if (!tag || !key) return;
    const held = ImageTagLock.get(tag);
    if (held) {
      if (held.owner !== key) held.owner = key;
      if (!held.isLocked) held.locked = LOCKED;
      return;
    }
    const made = new ImageTagLock(imageTagLockIdentifierOf(tag));
    made.tag = tag;
    made.owner = key;
    made.locked = LOCKED;
    made.initialize();
  }

  /** Lets the tag's pictures be come across by everyone again, when it was kept. */
  static unlock(tag: string): void {
    const held = ImageTagLock.get(tag);
    if (held?.isLocked) held.locked = '';
  }
}

/**
 * The identifier of a tag's record, which the room server keeps for this kind alone. A tag is any
 * text, so it goes in escaped, as nothing in it may break the identifier up.
 */
export function imageTagLockIdentifierOf(tag: string): string {
  return `image-tag-lock_${encodeURIComponent(tag)}`;
}
