import { ObjectStore } from '@axe/core/sync/object-store';
import { handLocationOf, isHandOf } from '@axe/domain/card/hand-location';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * Hands what one user id holds over to another: everything it owns, and everything in its hand.
 *
 * For a seat whose user id changes outside a room, as when somebody logs in, so that the cards in
 * their hand and the pieces they own stay theirs when they take them into a room.
 */
export function handOverOwnership(fromUserId: string, toUserId: string): void {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;
  for (const object of ObjectStore.instance.getObjects()) {
    if ('owner' in object && object.owner === fromUserId) (object as { owner: string }).owner = toUserId;
    if (object instanceof TabletopObject && isHandOf(object.location.name, fromUserId)) {
      object.setLocation(handLocationOf(toUserId));
    }
  }
}
