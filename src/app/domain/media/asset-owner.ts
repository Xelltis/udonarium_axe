import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetRemovalKind } from '@axe/domain/media/asset-removal';

/** The kind the records go by, as the object store names it. */
export const ASSET_OWNER_ALIAS = 'asset-owner';

/**
 * The room's word on who added a picture or a sound, by the key that seat holds things by: the one
 * who may remove it besides the GM.
 *
 * The first to add an asset keeps it; the same file added again later is the same identifier, and
 * changes nothing. It is never destroyed, as an identifier once destroyed cannot be made again, and
 * it is a kind of its own rather than a mark on the picture's or sound's tag, which an older version
 * would wipe: such a version sends a tag it changes whole, and passes over a kind it does not know.
 */
@SyncObject(ASSET_OWNER_ALIAS)
export class AssetOwner extends ObjectNode {
  @SyncVar() assetIdentifier: string = '';
  @SyncVar() kind: string = '';
  @SyncVar() owner: string = '';

  /** Whether the asset is held by the given key. A record naming nobody is held by nobody. */
  isHeldBy(key: string): boolean {
    return this.owner !== '' && this.owner === key;
  }

  /** The record of an asset, or null when the room does not know who added it. */
  static get(assetIdentifier: string): AssetOwner | null {
    return ObjectStore.instance.get<AssetOwner>(assetOwnerIdentifierOf(assetIdentifier));
  }

  /** Every record the room has. */
  static all(): AssetOwner[] {
    return ObjectStore.instance.getObjects<AssetOwner>(AssetOwner);
  }

  /**
   * Names the key as the one who added the asset, unless the room already knows who did: the first to
   * add it keeps it. A record naming nobody is taken. Nothing is done for an empty key.
   */
  static claim(assetIdentifier: string, kind: AssetRemovalKind, key: string): void {
    if (!key) return;
    const held = AssetOwner.get(assetIdentifier);
    if (held) {
      if (held.owner === '') held.owner = key;
      return;
    }
    AssetOwner.make(assetIdentifier, kind, key);
  }

  /**
   * Sets the one who added the asset as a saved room has it, over whoever this seat named while the
   * room was being read in.
   */
  static restore(assetIdentifier: string, kind: AssetRemovalKind, key: string): void {
    const held = AssetOwner.get(assetIdentifier);
    if (held) {
      if (held.owner !== key) held.owner = key;
      return;
    }
    AssetOwner.make(assetIdentifier, kind, key);
  }

  private static make(assetIdentifier: string, kind: AssetRemovalKind, key: string): void {
    const made = new AssetOwner(assetOwnerIdentifierOf(assetIdentifier));
    made.assetIdentifier = assetIdentifier;
    made.kind = kind;
    made.owner = key;
    made.initialize();
  }
}

/** The identifier of an asset's record, which the room server keeps for this kind alone. */
export function assetOwnerIdentifierOf(assetIdentifier: string): string {
  return `asset-owner_${assetIdentifier}`;
}
