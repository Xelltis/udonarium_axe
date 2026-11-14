import { EventChannel } from '@axe/core/event/event-channel';

/**
 * Tells that how far this seat's object sync has come may have changed: how many objects are still
 * to arrive, or whether its first sync has settled. Held back so that a run of changes tells once
 * in a while, however fast the objects arrive.
 */
export const syncProgressChanged$ = new EventChannel<void>();
