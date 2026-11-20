import { EventChannel } from '@axe/core/event/event-channel';

/** An object coming into the store or leaving it, by its identifier and the kind it is. */
export interface ObjectStoreEvent {
  identifier: string;
  aliasName: string;
}

/**
 * The store's own notices of an object coming in and going out. They are kept apart from the change
 * notices, which hook into `GameObject` and `ObjectNode`, so that the store those classes import
 * does not import the module that hooks them back.
 */
export const objectAdded$ = new EventChannel<ObjectStoreEvent>();
export const objectRemoved$ = new EventChannel<ObjectStoreEvent>();
