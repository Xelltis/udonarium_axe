import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { type NamedPiece, saidNameOf, shownNameOf } from '@axe/domain/character/hidden-name';

/**
 * The names pieces go by, a piece whose name is hidden going by the label for a hidden name: on this
 * reader's screen where they may not see what is kept back, and in every line said to the room.
 */
@Injectable({ providedIn: 'root' })
export class PieceNameService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  /** The name a piece is shown by on this reader's screen. Follows whether they may see what is kept back. */
  shown(piece: NamedPiece): string {
    return shownNameOf(piece, this.rolePermission.canSeeHidden(), this.hiddenLabel());
  }

  /** The name a piece is named by in a line said to the room, which everyone reads, whoever says it. */
  said(piece: NamedPiece): string {
    return saidNameOf(piece);
  }

  /** Whether a piece's name is kept from this reader. */
  isKept(piece: NamedPiece): boolean {
    return !!piece.hideName && !this.rolePermission.canSeeHidden();
  }

  /** The label a hidden name goes by. */
  hiddenLabel(): string {
    return this.t('common.hiddenName');
  }
}
