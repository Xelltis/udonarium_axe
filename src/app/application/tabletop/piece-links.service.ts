import { inject, Injectable } from '@angular/core';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { BondedPiece, bondGroupOf, boundBelow, boundTo } from '@axe/domain/tabletop/move/piece-bonds';
import { pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/**
 * How the pieces on the table are bound together: one holding on to another, one riding another,
 * and the pieces that go where a piece goes because of them.
 *
 * The engagement zones, riding and every way of moving a piece ask the same questions of these
 * bonds, so they are answered here once rather than by whichever of them came first.
 */
@Injectable({ providedIn: 'root' })
export class PieceLinksService {
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);

  /** The piece holding on to this one, where it is on the table and in the fight; null otherwise. */
  holderOf(piece: GameCharacter): GameCharacter | null {
    if (piece.grabbedBy === '') return null;
    const holder = this.objectStore.get<GameCharacter>(piece.grabbedBy);
    return holder instanceof GameCharacter && holder.isVisibleOnTable && holder.offField !== '1' ? holder : null;
  }

  /** The pieces on the table this one holds on to. */
  captivesOf(piece: GameCharacter): GameCharacter[] {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((one) => one.grabbedBy === piece.identifier && one.isVisibleOnTable);
  }

  /** The mount a piece rides, where it is on the table and still a mount; null otherwise. */
  mountOf(piece: GameCharacter): GameCharacter | null {
    if (piece.ridingOn === '' || piece.ridingOn === piece.identifier) return null;
    const mount = this.objectStore.get<GameCharacter>(piece.ridingOn);
    return mount instanceof GameCharacter && mount.isVisibleOnTable && mount.mountable === '1' ? mount : null;
  }

  /** A piece as the bonds between pieces see it: whoever holds on to it, and the mount it rides. */
  bondOf(piece: GameCharacter): BondedPiece {
    return { id: piece.identifier, grabbedBy: piece.grabbedBy, ridingOn: this.mountOf(piece)?.identifier ?? '' };
  }

  /**
   * The pieces given with every piece bound together with one of them, held on to or riding, which go
   * together. One held fast where it stands is left out, as it moves for nothing.
   */
  withPartners(pieces: readonly GameCharacter[]): GameCharacter[] {
    const onTable = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && piece.offField !== '1');
    const bonded = onTable.map((piece) => this.bondOf(piece));
    const byId = new Map(onTable.map((piece) => [piece.identifier, piece]));
    const group = new Map(pieces.map((piece) => [piece.identifier, piece]));
    for (const piece of pieces) {
      for (const id of bondGroupOf(piece.identifier, bonded)) {
        const partner = byId.get(id);
        if (!partner || group.has(id) || partner.heldFast === '1') continue;
        group.set(id, partner);
      }
    }
    return [...group.values()];
  }

  /**
   * The piece a piece goes where it goes with: the one it is bound to, held on to or riding, and the
   * one that one is bound to in turn; the piece itself where it is bound to none.
   */
  anchorOf(piece: GameCharacter): GameCharacter {
    const counted = new Set(
      this.objectStore
        .getObjects<GameCharacter>(GameCharacter)
        .filter((one) => one.isVisibleOnTable)
        .map((one) => one.identifier)
    );
    const seen = new Set<string>();
    let at = piece;
    while (!seen.has(at.identifier)) {
      seen.add(at.identifier);
      const next = this.objectStore.get<GameCharacter>(boundTo(this.bondOf(at), counted));
      if (!(next instanceof GameCharacter)) break;
      at = next;
    }
    return at;
  }

  /**
   * Brings the pieces that go where a piece goes along to where it now stands, as a move of it does:
   * those it holds on to, those riding it, and those bound to them in turn. One held fast where it
   * stands is left there.
   */
  carryBound(anchor: GameCharacter): void {
    const onTable = this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((piece) => piece.isVisibleOnTable);
    const below = new Set(
      boundBelow(
        anchor.identifier,
        onTable.map((piece) => this.bondOf(piece))
      )
    );
    const carried = onTable.filter((piece) => below.has(piece.identifier) && piece.heldFast !== '1');
    if (carried.length < 1) return;
    GameObject.batch(() => {
      for (const piece of carried) {
        this.standAt(piece, anchor);
        piece.update();
      }
    });
  }

  /** Puts a piece's middle on another's, whatever the two sizes. */
  standAt(piece: GameCharacter, at: GameCharacter): void {
    const gridSize = this.tableSelecter.viewTable?.gridSize ?? 50;
    const offset = pieceCentreOffsetPx(at, gridSize) - pieceCentreOffsetPx(piece, gridSize);
    piece.location.x = at.location.x + offset;
    piece.location.y = at.location.y + offset;
  }
}
