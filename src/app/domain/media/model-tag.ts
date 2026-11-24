import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { motionFileIdsOf, writeMotionFileIds } from '@axe/domain/media/model-motion-ids';

/** The kind the tags of models go by, as the object store names it. */
export const MODEL_TAG_ALIAS = 'model-tag';

/** The mark a tag written for an object saved on its own carries, as adding to a room's tag alone. */
export const ADDING_TAG = 'adding';

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
  /**
   * The motions for VRM models (`.vrma`) given to the model, as the identifiers they are held under,
   * written as a JSON array; empty for none. Read through `modelMotionFilesOf` (`model-motion-files`).
   */
  @SyncVar() motions: string = '';

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

  /** Gives a model the motions it is to have, as they are written down, making its tag where it has none. */
  static giveMotions(modelIdentifier: string, motions: string): ModelTag {
    const held = ModelTag.get(modelIdentifier) ?? ModelTag.create(modelIdentifier);
    if (held.motions !== motions) held.motions = motions;
    return held;
  }

  /** Sets the tag of a model, making its tag where it has none. */
  static tagWith(modelIdentifier: string, tag: string): ModelTag {
    const held = ModelTag.get(modelIdentifier) ?? ModelTag.create(modelIdentifier);
    if (held.tag !== tag) held.tag = tag;
    return held;
  }

  /**
   * Puts a tag read from a file on the model's own tag, then destroys the copy that was read. One from
   * a saved room puts the room's tag back as it was saved. One written for an object saved on its own
   * (marked {@link ADDING_TAG}) adds to the room's alone, taking nothing away: its shelf where the
   * model is on none, and its motions after those the model is given already, as a piece saved before
   * its model was moved or given more, read back, would otherwise take the room's back to what it was.
   * The tag is made first when the model has none, and the change is shared with the room.
   */
  override parseInnerXml(element: Element) {
    const held = ModelTag.get(this.modelIdentifier) ?? ModelTag.create(this.modelIdentifier);
    const adding = element.getAttribute(ADDING_TAG) === 'true';
    const motions = adding
      ? writeMotionFileIds([...motionFileIdsOf(held.motions), ...motionFileIdsOf(this.motions)])
      : this.motions;
    const tag = adding && held.tag !== '' ? held.tag : this.tag;
    if (held.tag !== tag) held.tag = tag;
    if (held.motions !== motions) held.motions = motions;
    this.destroy();
  }
}

/** The identifier the tag of a model is kept under. */
export function modelTagIdentifierOf(modelIdentifier: string): string {
  return `modeltag_${modelIdentifier}`;
}
