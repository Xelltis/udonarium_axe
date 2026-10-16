import { Injectable } from '@angular/core';
import { Network } from '@axe/core/network/network';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import {
  canClaimOwnership,
  canEditDisclosure,
  canViewDisclosable,
  Disclosable,
  DisclosureViewer,
} from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';

@Injectable({ providedIn: 'root' })
export class DisclosureService {
  /**
   * Whether this reader may see what an object keeps back: the game master and its owner always
   * may, others as its disclosure says.
   */
  canView(object: Disclosable & { owner?: string }): boolean {
    return canViewDisclosable(object, this.viewer(object.owner));
  }

  /** Whether this reader may change who an object is disclosed to, which is the game master's or its owner's to do. */
  canEdit(object: { owner?: string }): boolean {
    return canRoleEdit(PeerCursor.myRole) && canEditDisclosure(this.viewer(object.owner));
  }

  /**
   * Whether this reader may change who owns an object.
   *
   * The game master and the owner always may. An object nobody owns may be claimed by any connected
   * reader whose role lets them edit the table, and, in a room server's room, who may see what it
   * keeps back. There, a card in a deck gets an owner from the game master alone, as its owner sees
   * the face the deck keeps from everyone.
   */
  canSetOwner(object: Disclosable & { owner?: string }): boolean {
    const viewer = this.viewer(object.owner);
    if (!canRoleEdit(PeerCursor.myRole)) return false;
    if (canEditDisclosure(viewer)) return true;
    if (Network.authorityPeerId !== null && object instanceof Card && object.parent?.parent instanceof CardStack)
      return false;
    return (
      viewer.userId.length > 0 &&
      canClaimOwnership(object, viewer, Network.authorityPeerId !== null && object instanceof TextNote) &&
      canRoleEdit(PeerCursor.myRole)
    );
  }

  private viewer(ownerUserId?: string): DisclosureViewer {
    return {
      userId: PeerCursor.myCursor?.userId ?? '',
      isGameMaster: PeerCursor.isMyselfGameMaster,
      ownerUserId,
    };
  }
}
