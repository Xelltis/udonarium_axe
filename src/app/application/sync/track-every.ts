import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';

/**
 * Follows every object of a kind, read inside a computed: which of them there are, and what each
 * one holds.
 *
 * For a list sorted or narrowed by a field of theirs, a tag among them. `collectionOf` alone rises
 * only as one arrives or goes, so a field written at another seat would leave the list as it was.
 */
export function trackEvery(objectChange: ObjectChangeService, aliasName: string): void {
  objectChange.collectionOf(aliasName)();
  for (const object of ObjectStore.instance.getObjects(aliasName)) objectChange.versionOf(object.identifier)();
}
