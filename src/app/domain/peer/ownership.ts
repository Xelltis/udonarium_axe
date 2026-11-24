import { ObjectStore } from '@axe/core/sync/object-store';
import { handLocationOf, isHandOf } from '@axe/domain/card/hand-location';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * Hands what one user id holds over to another: everything it owns, and everything in its hand.
 *
 * For a seat whose user id changes outside a room, as when somebody logs in, so that the cards in
 * their hand and the pieces they own stay theirs when they take them into a room, and the dice they
 * sealed stay sealed, as each object hands itself over within a seat.
 */
export function handOverOwnership(fromUserId: string, toUserId: string): void {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;
  for (const object of ObjectStore.instance.getObjects()) {
    if (object instanceof OwnedTabletopObject) {
      if (object.owner === fromUserId) object.handOverWithinSeat(toUserId);
    } else if ('owner' in object && object.owner === fromUserId) (object as { owner: string }).owner = toUserId;
    if (object instanceof TabletopObject && isHandOf(object.location.name, fromUserId)) {
      object.setLocation(handLocationOf(toUserId));
    }
  }
}
