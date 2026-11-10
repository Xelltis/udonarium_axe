import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { pieceCentreOf, pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { writtenSeat } from '@axe/domain/tabletop/ride/ride-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/**
 * The parts of a piece, as the head and the arms of a creature of many parts are each a piece of
 * their own: a part rides its body as a part, goes where the body goes, is drawn as the body alone
 * with its own name, bars and buffs listed under the body's, and acts in the body's turn. A piece is
 * made a part of one standing where it stands, and nothing is a part of a part.
 */
@Injectable({ providedIn: 'root' })
export class PiecePartsService {
  private readonly objectStore = inject(ObjectStore);
  private readonly links = inject(PieceLinksService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly rolePermission = inject(RolePermissionService);

  /** The piece this one is a part of, where the body is on the table; null otherwise. */
  bodyOf(piece: GameCharacter): GameCharacter | null {
    return this.links.bodyOf(piece);
  }

  /** The pieces on the table that are parts of this one. */
  partsOf(body: GameCharacter): GameCharacter[] {
    return this.links.partsOf(body);
  }

  /**
   * The pieces a piece could be made a part of: those on the table whose base its middle stands on,
   * none of them a part itself, and none where the piece rides, is ridden or has parts of its own.
   * None for one who may not change the table.
   */
  bodiesFor(piece: GameCharacter): GameCharacter[] {
    if (!this.rolePermission.canEditTabletop() || !piece.isVisibleOnTable || this.bodyOf(piece)) return [];
    if (this.links.mountOf(piece) || this.partsOf(piece).length > 0 || this.isRidden(piece)) return [];
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((body) => body !== piece && body.isVisibleOnTable && !this.bodyOf(body))
      .filter((body) => body.ridingOn !== piece.identifier && this.standsOn(piece, body));
  }

  /** Makes a piece a part of one it may be made a part of, its middle put on the body's. Answers whether it was. */
  attach(part: GameCharacter, body: GameCharacter): boolean {
    if (!this.bodiesFor(part).includes(body)) return false;
    GameObject.batch(() => {
      part.ridingOn = body.identifier;
      part.rideSeat = writtenSeat('part');
      this.links.standAt(part, body);
      part.update();
    });
    return true;
  }

  /** Takes a part off its body, leaving it standing where the body stands. Answers whether it was a part. */
  detach(part: GameCharacter): boolean {
    if (!this.rolePermission.canEditTabletop() || !this.bodyOf(part)) return false;
    GameObject.batch(() => {
      part.ridingOn = '';
      part.rideSeat = '';
    });
    return true;
  }

  /** Whether anybody rides a piece, or holds on to it, so that it goes with others already. */
  private isRidden(piece: GameCharacter): boolean {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .some((one) => one !== piece && one.isVisibleOnTable && one.ridingOn === piece.identifier);
  }

  /** Whether a piece's middle stands on another's base. */
  private standsOn(piece: GameCharacter, body: GameCharacter): boolean {
    const gridSize = this.tableSelecter.viewTable?.gridSize ?? 50;
    const middle = pieceCentreOf(piece, gridSize);
    const base = pieceCentreOf(body, gridSize);
    const half = pieceCentreOffsetPx(body, gridSize);
    return Math.abs(middle.x - base.x) <= half + 1e-6 && Math.abs(middle.y - base.y) <= half + 1e-6;
  }
}
