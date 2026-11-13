import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { type NamedPiece, saidNameOf } from '@axe/domain/character/hidden-name';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * The names pieces go by, a piece whose name is hidden going by the label for a hidden name: on this
 * reader's screen where they may not see what is kept back, and in every line said to the room.
 */
@Injectable({ providedIn: 'root' })
export class PieceNameService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * The name a piece is shown by on this reader's screen: its own to one who may see what is kept back
   * or whose piece it is, the label for a hidden name to anyone else.
   */
  shown(piece: NamedPiece): string {
    return this.isKept(piece) ? this.hiddenLabel() : piece.name;
  }

  /** The name a piece is named by in a line said to the room, which everyone reads, whoever says it. */
  said(piece: NamedPiece): string {
    return saidNameOf(piece);
  }

  /** Whether a piece's name is kept from this reader: hidden, and neither theirs nor theirs to see. */
  isKept(piece: NamedPiece): boolean {
    if (!piece.hideName || this.rolePermission.canSeeHidden()) return false;
    const me = PeerCursor.myCursor?.userId ?? '';
    return !(me.length > 0 && piece.owner === me);
  }

  /** The label a hidden name goes by. */
  hiddenLabel(): string {
    return this.t('common.hiddenName');
  }
}
