import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit, canRoleEditShared, canRoleSeeHidden, PeerRole } from '@axe/domain/peer/peer-role';

/**
 * What this reader may do in the room, by the role their own cursor holds.
 *
 * Every answer is read afresh from the cursor, so it is right straight after the role changes. Read
 * inside a computed or a template, it also follows the cursor, whose change the room announces a
 * moment later.
 */
@Injectable({ providedIn: 'root' })
export class RolePermissionService {
  private readonly objectChange = inject(ObjectChangeService);

  /** The role this reader holds in the room. */
  role(): PeerRole {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole;
  }

  /** Whether this reader runs the game, and so is not held to the rules the table plays by. */
  isGameMaster(): boolean {
    return this.role() === PeerRole.GameMaster;
  }

  /** Whether this reader may change things on the table, which every role but a guest may. */
  canEditTabletop(): boolean {
    return canRoleEdit(this.role());
  }

  /** Whether this reader sees what is kept back from the players, which only the game master does. */
  canSeeHidden(): boolean {
    return canRoleSeeHidden(this.role());
  }

  /** Whether this reader may change what the room and its tables answer for everyone. */
  canEditShared(): boolean {
    return canRoleEditShared(this.role());
  }

  /**
   * Whether the seat a peer sits in may change things on the table, as what it asks of every screen
   * is checked against on arrival; none for a peer with no seat here.
   */
  canPeerEditTabletop(peerId: string): boolean {
    const role = roleOfPeer(peerId);
    return role !== null && canRoleEdit(role);
  }

  /**
   * Whether the seat a peer sits in sees what is kept back from the players, the game master's, as
   * what only it may ask of every screen is checked against on arrival; none for a peer with no seat here.
   */
  canPeerSeeHidden(peerId: string): boolean {
    const role = roleOfPeer(peerId);
    return role !== null && canRoleSeeHidden(role);
  }
}

/**
 * The role of the seat a peer sits in: this seat's own for what this device sent itself, which its
 * cursor may not be found by yet, as before the connection opens or while playing alone; none for a
 * peer with no seat here.
 */
function roleOfPeer(peerId: string): PeerRole | null {
  if (peerId === getMyPeerId()) return PeerCursor.myRole;
  return PeerCursor.findByPeerId(peerId)?.role ?? null;
}
