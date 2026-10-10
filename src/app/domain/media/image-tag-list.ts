import { ImageFile } from '@axe/core/storage/image-file';
import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTag } from '@axe/domain/media/image-tag';

@SyncObject('image-tag-list')
export class ImageTagList extends ObjectNode implements InnerXml {
  private identifiers: string[] = [];

  // GameObject Lifecycle
  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this); // ObjectStoreには登録しない
  }

  /** The tags of the listed pictures, each written once. A picture that has no tag is skipped. */
  override innerXml(): string {
    const parts: string[] = [];
    for (const identifier of new Set(this.identifiers)) {
      const tag = ImageTag.get(identifier);
      if (tag) parts.push(tag.toXml());
    }
    return parts.join('');
  }

  /** A holder for writing the tags of the given pictures into a saved room or zip as `imagetag.xml`. */
  static create(images: ImageFile[]): ImageTagList {
    const imageTagList = new ImageTagList();

    imageTagList.identifiers = images.map((image) => image.identifier);

    return imageTagList;
  }
}
