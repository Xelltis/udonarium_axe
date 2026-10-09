import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { imageStampId } from '@axe/domain/chat/stamp-catalog';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';

/** One stamp in a room's set: a picture from the room, under the name it goes by. */
export interface PackedStamp {
  readonly stampId: string;
  readonly imageIdentifier: string;
  readonly name: string;
  readonly element: DataElement;
}

/**
 * A set of stamps the room has made from its own pictures, as a server keeps its own stickers.
 *
 * Each stamp is a picture element under the set, named as the stamp is, so the pictures go into a
 * saved room with it. A stamp is known by its picture, not by its place in a set, so a line already
 * answered with one still shows it after the set is changed or gone.
 */
@SyncObject('stamp-pack')
export class StampPack extends ObjectNode {
  @SyncVar() name: string = '';

  /** The stamps in the set, once each, in the order they were added. */
  get stamps(): PackedStamp[] {
    const seen = new Set<string>();
    const stamps: PackedStamp[] = [];
    for (const child of this.children) {
      if (!(child instanceof DataElement) || child.type !== DataElementType.IMAGE) continue;
      const imageIdentifier = `${child.value ?? ''}`.trim();
      if (imageIdentifier.length < 1 || seen.has(imageIdentifier)) continue;
      seen.add(imageIdentifier);
      stamps.push({ stampId: imageStampId(imageIdentifier), imageIdentifier, name: child.name, element: child });
    }
    return stamps;
  }

  /** Adds a picture as a stamp under a name, unless it is in the set already. The stamp's element, or null. */
  addStamp(imageIdentifier: string, name: string): DataElement | null {
    const identifier = imageIdentifier.trim();
    if (identifier.length < 1 || this.stamps.some((stamp) => stamp.imageIdentifier === identifier)) return null;
    const element = DataElement.create(name, identifier, { type: DataElementType.IMAGE });
    this.appendChild(element);
    return element;
  }

  /** Makes an empty set under a name and adds it to the room. */
  static create(name: string): StampPack {
    const pack = new StampPack();
    pack.name = name;
    pack.initialize();
    return pack;
  }
}
