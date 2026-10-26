import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Puts a piece into stealth and takes it out again.
 *
 * Only the game master and the piece's owner may: stealth hides the piece from the rest of the
 * table, which is not for anybody else to decide about somebody's piece.
 */
@Injectable({ providedIn: 'root' })
export class StealthService {
  private readonly rolePermission = inject(RolePermissionService);

  /** Whether this seat may put the piece into stealth or take it out of it. */
  mayToggle(character: GameCharacter): boolean {
    if (this.rolePermission.isGameMaster()) return true;
    if (!this.rolePermission.canEditTabletop()) return false;
    return character.owner !== '' && character.owner === PeerCursor.myUserId;
  }

  /** Puts the piece into stealth or takes it out, for a seat that may. */
  set(character: GameCharacter, stealth: boolean): void {
    if (!this.mayToggle(character)) return;
    character.stealth = stealth ? '1' : '';
  }
}
