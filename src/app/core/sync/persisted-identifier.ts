import { Attributes } from '@axe/core/sync/attributes';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';

const IDENTIFIER_ATTRIBUTE = 'identifier';

/**
 * The object's fields as XML attributes, with its identifier written alongside them.
 *
 * The serializer leaves identifiers out, so whatever is read back is a new object under a new
 * name. That is wrong for an object others point at by its identifier, which has to come back
 * as itself for those pointers to find it.
 */
export function toAttributesKeepingIdentifier(gameObject: GameObject): Attributes {
  return {
    ...ObjectSerializer.toAttributes(gameObject.toContext().syncData),
    [IDENTIFIER_ATTRIBUTE]: gameObject.identifier,
  };
}

/** How an object read back from a file takes up the identifier written with it. */
export interface KeepIdentifierOptions {
  /**
   * What happens when something here already goes by the identifier: the object read back takes
   * its place, as a preset brought in again does, or stands beside it as a copy under a fresh
   * identifier, for an object whose parts are tied to it by its identifier. Taking its place is
   * the default.
   */
  whenTaken?: 'replace' | 'copy';
}

/**
 * Reads the fields back from a file into the object, taking up the identifier written with them.
 *
 * The written identifier is kept only when it has not been deleted in this room, nor, when asked
 * to copy, is gone by here already; otherwise the object stays under the fresh identifier it was
 * made with. Everyone else at the table has a deleted one down as gone and would answer its
 * return with the deletion again, taking it from the one who brought it back.
 */
export function parseAttributesKeepingIdentifier(
  gameObject: GameObject,
  attributes: NamedNodeMap,
  options: KeepIdentifierOptions = {}
): void {
  const context = gameObject.toContext();
  const syncData = context.syncData as Record<string, unknown>;
  ObjectSerializer.parseAttributes(syncData, attributes);

  const persisted = syncData[IDENTIFIER_ATTRIBUTE];
  // The context is the one place an identifier belongs; it is no part of what is synchronised.
  delete syncData[IDENTIFIER_ATTRIBUTE];
  gameObject.apply(context);
  if (
    typeof persisted === 'string' &&
    persisted.length > 0 &&
    !ObjectStore.instance.isDeleted(persisted) &&
    !(options.whenTaken === 'copy' && ObjectStore.instance.get(persisted))
  ) {
    (gameObject as unknown as { context: { identifier: string } }).context.identifier = persisted;
  }
}
