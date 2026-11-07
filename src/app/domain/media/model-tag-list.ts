import { ModelFile } from '@axe/core/storage/model-file';
import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ModelTag } from '@axe/domain/media/model-tag';

/** A holder for writing the tags of the given models into a saved room or zip as `modeltag.xml`. */
@SyncObject('model-tag-list')
export class ModelTagList extends ObjectNode implements InnerXml {
  private identifiers: string[] = [];

  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** The tags of the listed models, each written once. A model that has no tag is skipped. */
  override innerXml(): string {
    const parts: string[] = [];
    for (const identifier of new Set(this.identifiers)) {
      const tag = ModelTag.get(identifier);
      if (tag) parts.push(tag.toXml());
    }
    return parts.join('');
  }

  /** A holder for the tags of these models. */
  static create(models: readonly ModelFile[]): ModelTagList {
    const list = new ModelTagList();
    list.identifiers = models.map((model) => model.identifier);
    return list;
  }
}
