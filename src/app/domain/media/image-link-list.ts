import { ImageFile, ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { encodeAttributeValue } from '@axe/core/util/xml-util';

/** The element each link is written as. */
const ENTRY = 'entry';

/**
 * The name a picture added by somebody goes by, its bytes' hash. A link never stands for one of
 * those, or a save could make a picture somebody added show as a file the app carries.
 */
const CONTENT_HASH = /^[0-9a-f]{64}$/i;

/** A file the app itself carries, which is the only kind of link written down or taken in again. */
const BUNDLED_PATH = /^(?:\.\/)?assets\/(?!.*\.\.)[\w\-./[\]]+$/;

/**
 * A holder for writing the pictures of a saved room that are held only as a link to a file the app
 * carries, such as the sample pieces' pictures, as `imagelink.xml`, and for taking them in again
 * from it under the identifiers the room names them by.
 *
 * Such a picture has no bytes of its own to go into the save. Read back where the sample was never
 * set out, as in a browser that starts on a room of its own, the room would name pictures nothing
 * draws. A link to anything but a file the app carries is neither written nor taken in.
 */
@SyncObject('image-link-list')
export class ImageLinkList extends ObjectNode implements InnerXml {
  private links: { identifier: string; url: string }[] = [];

  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** A plain entry for each listed link, each written once. */
  override innerXml(): string {
    const written = new Set<string>();
    const parts: string[] = [];
    for (const { identifier, url } of this.links) {
      if (written.has(identifier)) continue;
      written.add(identifier);
      parts.push(`<${ENTRY} image="${encodeAttributeValue(identifier)}" url="${encodeAttributeValue(url)}"/>`);
    }
    return parts.join('');
  }

  /**
   * Takes each saved link in under its identifier. An entry naming no picture, a picture somebody
   * added, or no file the app carries, is passed over.
   */
  override parseInnerXml(element: Element): void {
    for (const entry of Array.from(element.children)) {
      if (entry.tagName !== ENTRY) continue;
      const identifier = entry.getAttribute('image') ?? '';
      const url = entry.getAttribute('url') ?? '';
      if (!identifier || CONTENT_HASH.test(identifier) || !BUNDLED_PATH.test(url)) continue;
      const context = ImageFile.createEmpty(identifier).toContext();
      context.url = url;
      ImageStorage.instance.add(context);
    }
  }

  /** A holder for writing the links among the given pictures: those held as a link to a file the app carries. */
  static create(images: readonly ImageFile[]): ImageLinkList {
    const list = new ImageLinkList();
    list.links = images
      .filter((image) => image.state === ImageState.URL && BUNDLED_PATH.test(image.url))
      .map((image) => ({ identifier: image.identifier, url: image.url }));
    return list;
  }
}
