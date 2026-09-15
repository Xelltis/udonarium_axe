import { getPeerContext, getPeerContexts } from '@axe/core/network/peer-context-source';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export abstract class OwnedTabletopObject extends TabletopObject {
  abstract owner: string;

  /**
   * The display name of the user who owns the object, or empty when nobody does or no peer cursor
   * carries that user.
   */
  get ownerName(): string {
    const object = PeerCursor.findByUserId(this.owner);
    return object ? object.name : '';
  }

  /** Whether some user has claimed the object. */
  get hasOwner(): boolean {
    return this.owner.length > 0;
  }

  /** Whether the object is owned by this client's user. */
  get isMine(): boolean {
    return this.isOwnedBy(getPeerContext().userId);
  }

  /** Whether the object is owned by the given user id. */
  isOwnedBy(userId: string): boolean {
    return userId === this.owner;
  }

  /** Whether the owner is connected right now, judged against the current peer contexts. */
  get ownerIsOnline(): boolean {
    return this.isOwnerOnline(getPeerContexts());
  }

  /**
   * Whether the owner is among the given peer contexts with an open connection. False when the
   * object has no owner.
   */
  isOwnerOnline(peerContexts: { userId: string; isOpen: boolean }[]): boolean {
    return this.hasOwner && peerContexts.some((context) => context.userId === this.owner && context.isOpen);
  }
}
