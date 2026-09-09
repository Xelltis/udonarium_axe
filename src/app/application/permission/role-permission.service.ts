import { Injectable } from '@angular/core';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit, canRoleEditShared, canRoleSeeHidden, PeerRole } from '@axe/domain/peer/peer-role';

@Injectable({ providedIn: 'root' })
export class RolePermissionService {
  get myRole(): PeerRole {
    return PeerCursor.myRole;
  }

  get canEditTabletop(): boolean {
    return canRoleEdit(PeerCursor.myRole);
  }

  get canSeeHidden(): boolean {
    return canRoleSeeHidden(PeerCursor.myRole);
  }

  /** Whether this reader may change what the room and its tables answer for everyone. */
  get canEditShared(): boolean {
    return canRoleEditShared(PeerCursor.myRole);
  }
}
