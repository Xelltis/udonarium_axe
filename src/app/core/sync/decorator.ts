import { defineSyncAttribute, defineSyncObject, defineSyncVariable } from '@axe/core/sync/decorator-core';
import { GameObject } from '@axe/core/sync/game-object';
import { Type } from '@axe/core/sync/object-factory';
import { ObjectNode } from '@axe/core/sync/object-node';

/** Registers a synced object class under the alias that names its XML tag and its type on the wire. */
export function SyncObject(alias: string) {
  return <T extends GameObject>(constructor: Type<T>) => {
    defineSyncObject(alias)(constructor);
  };
}

/**
 * Marks a field as synchronized with the room and saved with it.
 *
 * On an ObjectNode the field becomes an attribute of the node; on any other GameObject it is an
 * entry in the sync data. Either way assigning to it updates and broadcasts the object. The
 * alias renames the attribute or key, which otherwise is the property name.
 */
export function SyncVar(alias?: string) {
  return <T extends GameObject>(target: T, key: string | symbol) => {
    if (target instanceof ObjectNode) {
      defineSyncAttribute(alias)(target, key);
    } else {
      defineSyncVariable(alias)(target, key);
    }
  };
}
