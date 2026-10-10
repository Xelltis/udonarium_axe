import { Injectable } from '@angular/core';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit, canRoleEditShared, canRoleSeeHidden, PeerRole } from '@axe/domain/peer/peer-role';

@Injectable({ providedIn: 'root' })
export class RolePermissionService {
  /** The role this reader holds in the room. */
  get myRole(): PeerRole {
    return PeerCursor.myRole;
  }

  /** Whether this reader runs the game, and so is not held to the rules the table plays by. */
  get isGameMaster(): boolean {
    return PeerCursor.myRole === PeerRole.GameMaster;
  }

  /** Whether this reader may change things on the table, which every role but a guest may. */
  get canEditTabletop(): boolean {
    return canRoleEdit(PeerCursor.myRole);
  }

  /** Whether this reader sees what is kept back from the players, which only the game master does. */
  get canSeeHidden(): boolean {
    return canRoleSeeHidden(PeerCursor.myRole);
  }

  /** Whether this reader may change what the room and its tables answer for everyone. */
  get canEditShared(): boolean {
    return canRoleEditShared(PeerCursor.myRole);
  }
}
