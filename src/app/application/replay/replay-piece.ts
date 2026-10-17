import { ObjectNode } from '@axe/core/sync/object-node';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * The piece on the table an object is part of, as a character's data elements are: the nearest
 * tabletop object above it. Null for a piece itself and for anything not under one.
 */
export function pieceOf(object: unknown): ObjectNode | null {
  if (!(object instanceof ObjectNode)) return null;
  for (let current = object.parent; current; current = current.parent) {
    if (current instanceof TabletopObject) return current;
  }
  return null;
}
