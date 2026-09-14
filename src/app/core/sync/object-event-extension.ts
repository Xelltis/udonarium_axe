import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';

ObjectNode.onChildrenChanged = (node) => markForChildrenChanged(node);
GameObject.onUpdate = (obj) => markForChanged(obj);

export interface ObjectChangeEvent {
  identifier: string;
  aliasName: string;
  isSendFromSelf: boolean;
}

export interface ChildrenChangeEvent {
  identifier: string;
}

export const objectChanged$ = new EventChannel<ObjectChangeEvent>();
export const childrenChanged$ = new EventChannel<ChildrenChangeEvent>();

export interface ObjectStoreEvent {
  identifier: string;
  aliasName: string;
}

export const objectAdded$ = new EventChannel<ObjectStoreEvent>();
export const objectRemoved$ = new EventChannel<ObjectStoreEvent>();

const objectBatches = new Map<string, { object: GameObject; originFrom: string }>();
const nodeBatches = new Set<string>();

let isBatching = false;

/**
 * Queues an objectChanged$ notice for the object, and childrenChanged$ for its ancestors if a node.
 *
 * Notices are gathered and delivered together in a microtask, one per object however often it
 * changed, followed by a LOCAL_OBJECT_UPDATED message. sendFrom decides whether listeners see the
 * change as their own; the last one given for an object wins.
 */
export function markForChanged(object: GameObject, sendFrom: string = Network.peerId) {
  if (!object) return;
  objectBatches.set(object.identifier, {
    object,
    originFrom: sendFrom,
  });
  if (object instanceof ObjectNode) markForChildrenChanged(object.parent);

  startBatching();
}

/**
 * Queues a childrenChanged$ notice for the node and every ancestor above it.
 *
 * They go out in the same microtask as queued object changes. A null node adds nothing.
 */
export function markForChildrenChanged(node: ObjectNode | null) {
  let current = node;
  while (current) {
    nodeBatches.add(current.identifier);
    current = current.parent;
    if (current === node) break;
  }

  startBatching();
}

function startBatching() {
  if (!isBatching) {
    queueMicrotask(triggerEvent);
    isBatching = true;
  }
}

const triggerEvent = () => {
  isBatching = false;
  const objects = [...objectBatches.values()];
  const nodes = [...nodeBatches];
  objectBatches.clear();
  nodeBatches.clear();

  for (const data of objects) {
    objectChanged$.emit({
      aliasName: data.object.aliasName,
      identifier: data.object.identifier,
      isSendFromSelf: data.originFrom === Network.peerId,
    });
  }

  for (const identifier of nodes) {
    childrenChanged$.emit({ identifier });
  }

  if (objects.length > 0 || nodes.length > 0) {
    localDispatch('LOCAL_OBJECT_UPDATED', null);
  }
};
