import { ModelFile } from '@axe/core/storage/model-file';
import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ADDING_TAG, ModelTag } from '@axe/domain/media/model-tag';

/** A holder for writing the tags of the given models into a saved room or zip as `modeltag.xml`. */
@SyncObject('model-tag-list')
export class ModelTagList extends ObjectNode implements InnerXml {
  private identifiers: string[] = [];
  private adding = false;

  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /**
   * The tags of the listed models, each written once, marked as adding to a room's own where the list
   * is so (see `ModelTag.parseInnerXml`). A model that has no tag is skipped.
   */
  override innerXml(): string {
    const parts: string[] = [];
    for (const identifier of new Set(this.identifiers)) {
      const tag = ModelTag.get(identifier);
      if (tag)
        parts.push(this.adding ? tag.toXml().replace(/^<model-tag /, `<model-tag ${ADDING_TAG}="true" `) : tag.toXml());
    }
    return parts.join('');
  }

  /**
   * A holder for the tags of these models: for a saved room, which puts the room's tags back as they
   * were, or, `adding`, for an object saved on its own, whose tags add to a room's and take nothing.
   */
  static create(models: readonly ModelFile[], { adding = false }: { readonly adding?: boolean } = {}): ModelTagList {
    const list = new ModelTagList();
    list.identifiers = models.map((model) => model.identifier);
    list.adding = adding;
    return list;
  }
}
