import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { encodeAttributeValue } from '@axe/core/util/xml-util';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetRemovalKind } from '@axe/domain/media/asset-removal';

/** The element each record is written as. Not the record's own kind, so reading one makes no record of its own. */
const ENTRY = 'entry';

/**
 * A holder for writing who added the pictures and sounds of a saved room or zip as
 * `assetowner.xml`, and for setting them again from it.
 *
 * Each record is written as a plain entry and read back by this holder itself, rather than as a
 * record of its own kind, which would come into the room under an identifier of its own and be
 * destroyed again; the room server keeps that kind to the one identifier an asset's record has.
 */
@SyncObject('asset-owner-list')
export class AssetOwnerList extends ObjectNode implements InnerXml {
  private identifiers: string[] = [];

  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** A plain entry for each listed asset whose adder the room knows, each written once. */
  override innerXml(): string {
    const parts: string[] = [];
    for (const identifier of new Set(this.identifiers)) {
      const record = AssetOwner.get(identifier);
      if (!record?.owner) continue;
      parts.push(
        `<${ENTRY} asset="${encodeAttributeValue(identifier)}" kind="${encodeAttributeValue(record.kind)}"` +
          ` owner="${encodeAttributeValue(record.owner)}"/>`
      );
    }
    return parts.join('');
  }

  /** Sets who added each asset as the saved entries have it. Entries naming nobody, or no asset, are passed over. */
  override parseInnerXml(element: Element): void {
    for (const entry of Array.from(element.children)) {
      if (entry.tagName !== ENTRY) continue;
      const asset = entry.getAttribute('asset') ?? '';
      const owner = entry.getAttribute('owner') ?? '';
      if (!asset || !owner) continue;
      AssetOwner.restore(asset, kindOf(entry.getAttribute('kind')), owner);
    }
  }

  /** A holder for writing who added the given pictures and sounds. */
  static create(assetIdentifiers: readonly string[]): AssetOwnerList {
    const list = new AssetOwnerList();
    list.identifiers = [...assetIdentifiers];
    return list;
  }
}

function kindOf(value: string | null): AssetRemovalKind {
  return value === 'audio' ? 'audio' : 'image';
}
