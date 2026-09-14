import { Injectable } from '@angular/core';
import {
  canClaimOwnership,
  canEditDisclosure,
  canViewDisclosable,
  Disclosable,
  DisclosureViewer,
} from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';

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
    return canEditDisclosure(this.viewer(object.owner));
  }

  /**
   * Whether this reader may change who owns an object.
   *
   * The game master and the owner always may. An object nobody owns may be claimed by any connected
   * reader whose role lets them edit the table.
   */
  canSetOwner(object: { owner?: string }): boolean {
    const viewer = this.viewer(object.owner);
    if (canEditDisclosure(viewer)) return true;
    return viewer.userId.length > 0 && canClaimOwnership(viewer) && canRoleEdit(PeerCursor.myRole);
  }

  private viewer(ownerUserId?: string): DisclosureViewer {
    return {
      userId: PeerCursor.myCursor?.userId ?? '',
      isGameMaster: PeerCursor.isMyselfGameMaster,
      ownerUserId,
    };
  }
}
