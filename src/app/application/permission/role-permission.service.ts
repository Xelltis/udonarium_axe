import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
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
}
