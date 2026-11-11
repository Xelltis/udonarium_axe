import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { pieceCentreOf, pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { writtenSeat } from '@axe/domain/tabletop/ride/ride-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/** How a part is drawn on its body, as its look is written down; all empty for none. */
export interface PartLookWritten {
  readonly layer: string;
  readonly mask: string;
  readonly faces: string;
}

/** Whether a part is drawn on its body in any way. */
export function hasPartLook(look: PartLookWritten): boolean {
  return look.layer !== '' || look.mask !== '' || look.faces !== '';
}

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
  private readonly vision = inject(VisionService);

  /** The piece this one is a part of, where the body is on the table; null otherwise. */
  bodyOf(piece: GameCharacter): GameCharacter | null {
    return this.links.bodyOf(piece);
  }

  /** The pieces on the table that are parts of this one. */
  partsOf(body: GameCharacter): GameCharacter[] {
    return this.links.partsOf(body);
  }

  /** The parts of a body on the table, as {@link partsOf} finds them, followed as any piece changes. */
  partsOfFollowed(body: GameCharacter): readonly GameCharacter[] {
    return this.links.followedPartsOf(body);
  }

  /**
   * The pieces a piece could be made a part of: those on the table whose base its middle stands on,
   * none of them a part itself, and none where the piece rides, is ridden, has parts of its own, or
   * holds on to another or is held. A piece kept from the reader's sight, or whose name is kept from
   * them, is not offered, as the menu would name it.
   * None for one who may not change the table.
   */
  bodiesFor(piece: GameCharacter): GameCharacter[] {
    if (!this.rolePermission.canEditTabletop() || !piece.isVisibleOnTable || this.bodyOf(piece)) return [];
    if (this.links.mountOf(piece) || this.partsOf(piece).length > 0 || this.isRidden(piece)) return [];
    // One held on to, or holding on to another, goes where the hold takes it, not where a body goes.
    if (this.links.holderOf(piece) || this.links.captivesOf(piece).length > 0) return [];
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((body) => body !== piece && body.isVisibleOnTable && !this.bodyOf(body))
      .filter((body) => body.ridingOn !== piece.identifier && this.standsOn(piece, body))
      .filter((body) => this.vision.isTokenVisible(body) && (!body.hideName || this.rolePermission.canSeeHidden()));
  }

  /**
   * Makes a piece a part of one it may be made a part of, its middle put on the body's. Answers whether
   * it was. How it was drawn on a body before, laid over its picture, painted on it or on its model's
   * faces, is let go of: it was worked out on that body's picture and model, not this one's.
   */
  attach(part: GameCharacter, body: GameCharacter): boolean {
    if (!this.bodiesFor(part).includes(body)) return false;
    GameObject.batch(() => {
      part.ridingOn = body.identifier;
      part.rideSeat = writtenSeat('part');
      part.partLayer = '';
      part.partMask = '';
      part.partFaces = '';
      this.links.standAt(part, body);
      part.update();
    });
    return true;
  }

  /** How a piece is drawn on its body: laid over its picture, painted on it, and painted on its model's faces. */
  lookOf(part: GameCharacter): PartLookWritten {
    return { layer: part.partLayer, mask: part.partMask, faces: part.partFaces };
  }

  /**
   * Puts back how a part was drawn, as {@link lookOf} read it before {@link attach} let go of it,
   * while it is still in the room and a part of the body it was made a part of. Answers whether it was.
   */
  putBackLook(part: GameCharacter, body: GameCharacter, look: PartLookWritten): boolean {
    if (!this.rolePermission.canEditTabletop()) return false;
    if (this.objectStore.get(part.identifier) !== part || this.bodyOf(part) !== body) return false;
    GameObject.batch(() => {
      part.partLayer = look.layer;
      part.partMask = look.mask;
      part.partFaces = look.faces;
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
