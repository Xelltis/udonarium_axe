import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

/** The kind the tags of models go by, as the object store names it. */
export const MODEL_TAG_ALIAS = 'model-tag';

/**
 * The words a 3D model of the room is sorted by in the list of models, as the pictures are, shared
 * with the room. A model nobody has tagged has none.
 *
 * It is a kind of its own, under an identifier made from the model's, which an older version passes
 * over as a kind it does not know.
 */
@SyncObject(MODEL_TAG_ALIAS)
export class ModelTag extends ObjectNode {
  @SyncVar() modelIdentifier: string = '';
  @SyncVar() tag: string = '';

  /** The tag of a model, or null when the model has never been tagged. */
  static get(modelIdentifier: string): ModelTag | null {
    return ObjectStore.instance.get<ModelTag>(modelTagIdentifierOf(modelIdentifier));
  }

  /** Makes an empty tag for a model and adds it to the room, under the identifier `get` looks for. */
  static create(modelIdentifier: string): ModelTag {
    const object = new ModelTag(modelTagIdentifierOf(modelIdentifier));
    object.modelIdentifier = modelIdentifier;
    object.initialize();
    return object;
  }

  /** Sets the tag of a model, making its tag where it has none. */
  static tagWith(modelIdentifier: string, tag: string): ModelTag {
    const held = ModelTag.get(modelIdentifier) ?? ModelTag.create(modelIdentifier);
    if (held.tag !== tag) held.tag = tag;
    return held;
  }

  /**
   * Copies a tag read from a file onto the model's own tag, then destroys the copy that was read. The
   * tag is made first when the model has none, and the change is shared with the room.
   */
  override parseInnerXml(_element: Element) {
    const held = ModelTag.get(this.modelIdentifier) ?? ModelTag.create(this.modelIdentifier);
    const context = held.toContext();
    context.syncData = this.toContext().syncData;
    held.apply(context);
    held.update();
    this.destroy();
  }
}

/** The identifier the tag of a model is kept under. */
export function modelTagIdentifierOf(modelIdentifier: string): string {
  return `modeltag_${modelIdentifier}`;
}
