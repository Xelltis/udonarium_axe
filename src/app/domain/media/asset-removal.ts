import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

/** What a removed asset is: a picture or a sound. */
export type AssetRemovalKind = 'image' | 'audio';

/** What `removed` holds while the room keeps the asset removed. Anything else, a missing value too, means it is not. */
const REMOVED = '1';

/**
 * The room's word that its GM removed a picture or a sound: every seat lets go of it and takes it
 * from nobody, and a seat that comes in later learns it as it learns the rest of the room.
 *
 * It is never destroyed. A record put back keeps its place with `removed` emptied, since an
 * identifier once destroyed cannot be made again. It is a kind of its own rather than a mark on the
 * picture's or sound's tag, which an older version would wipe: such a version sends a tag it changes
 * whole, and passes over a kind it does not know.
 */
@SyncObject('asset-removal')
export class AssetRemoval extends ObjectNode {
  @SyncVar() assetIdentifier: string = '';
  @SyncVar() kind: string = '';
  @SyncVar() removed: string = '';

  /** Whether the room keeps the asset removed. */
  get isRemoved(): boolean {
    return this.removed === REMOVED;
  }

  /** The record of an asset, or null when it has never been removed. */
  static get(assetIdentifier: string): AssetRemoval | null {
    return ObjectStore.instance.get<AssetRemoval>(identifierOf(assetIdentifier));
  }

  /** Every record the room has, of assets removed now and of those put back since. */
  static all(): AssetRemoval[] {
    return ObjectStore.instance.getObjects<AssetRemoval>(AssetRemoval);
  }

  /** Marks the asset removed for the room, making its record when it has none. */
  static remove(assetIdentifier: string, kind: AssetRemovalKind): AssetRemoval {
    const record = AssetRemoval.get(assetIdentifier);
    if (record) {
      if (!record.isRemoved) record.removed = REMOVED;
      return record;
    }
    const made = new AssetRemoval(identifierOf(assetIdentifier));
    made.assetIdentifier = assetIdentifier;
    made.kind = kind;
    made.removed = REMOVED;
    made.initialize();
    return made;
  }

  /** Puts the asset back for the room, when the room had removed it. */
  static restore(assetIdentifier: string): void {
    const record = AssetRemoval.get(assetIdentifier);
    if (record?.isRemoved) record.removed = '';
  }
}

function identifierOf(assetIdentifier: string): string {
  return `asset-removal_${assetIdentifier}`;
}
