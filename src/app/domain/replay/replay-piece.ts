import { ObjectNode } from '@axe/core/sync/object-node';
import { saidNameOf } from '@axe/domain/character/hidden-name';
import { DataElement } from '@axe/domain/data/data-element';
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

/**
 * What a recording calls an object: a piece by its name as everyone is told it, a hidden one as
 * {@link saidNameOf} names it, and a data element by its own.
 */
export function targetNameOf(object: unknown): string {
  if (object instanceof TabletopObject) return saidNameOf(object);
  if (object instanceof DataElement) return String(object.getAttribute('name') ?? '');
  const named = object as { name?: unknown };
  return typeof named?.name === 'string' ? named.name : '';
}
