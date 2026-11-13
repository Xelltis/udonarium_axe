import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { BondedPiece, bondGroupOf, boundBelow, boundTo } from '@axe/domain/tabletop/move/piece-bonds';
import { pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { isPartOf } from '@axe/domain/tabletop/ride/ride-rules';
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
  private readonly objectChange = inject(ObjectChangeService);

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
    if (piece.ridingOn === '' || piece.ridingOn === piece.identifier || writtenAsPart(piece)) return null;
    const mount = this.objectStore.get<GameCharacter>(piece.ridingOn);
    return mount instanceof GameCharacter && mount.isVisibleOnTable && mount.mountable === '1' ? mount : null;
  }

  /**
   * The piece this one is a part of, as a head or an arm is of a creature of many parts, where the
   * body is on the table; null otherwise. A body need not be a mount.
   */
  bodyOf(piece: GameCharacter): GameCharacter | null {
    if (!writtenAsPart(piece)) return null;
    const body = this.objectStore.get<GameCharacter>(piece.ridingOn);
    // A body is no part itself: parts of parts, and two pieces each a part of the other, make none.
    return body instanceof GameCharacter && body.isVisibleOnTable && !writtenAsPart(body) ? body : null;
  }

  /** The pieces on the table that are parts of this one, in the order they were made. */
  partsOf(body: GameCharacter): GameCharacter[] {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece !== body && piece.isVisibleOnTable && this.bodyOf(piece) === body);
  }

  /**
   * The parts of each body on the table, by the body's identifier, read again as any piece changes:
   * worked out once for all, so whatever follows the parts of many pieces follows this rather than
   * every piece in the room once for each of them. It tells of a change only where a body's parts
   * changed, so what follows how a part stands follows the part itself as well.
   */
  private readonly partsByBody = computed<ReadonlyMap<string, readonly GameCharacter[]>>(
    () => {
      this.objectChange.collectionOf(GameCharacter.aliasName)();
      const pieces = this.objectStore.getObjects<GameCharacter>(GameCharacter);
      for (const piece of pieces) this.objectChange.versionOf(piece.identifier)();
      const byBody = new Map<string, GameCharacter[]>();
      for (const piece of pieces) {
        if (!piece.isVisibleOnTable) continue;
        const body = this.bodyOf(piece);
        if (!body || body === piece) continue;
        const parts = byBody.get(body.identifier);
        if (parts) parts.push(piece);
        else byBody.set(body.identifier, [piece]);
      }
      return byBody;
    },
    { equal: sameParts }
  );

  /** The parts of a body on the table, as {@link partsOf} finds them, followed as any piece changes. */
  followedPartsOf(body: GameCharacter): readonly GameCharacter[] {
    return this.partsByBody().get(body.identifier) ?? [];
  }

  /**
   * The identifiers of every part on the table, followed as any piece changes but telling of a change
   * only where the parts did, so what is drawn of every piece but the parts is not worked out again as
   * a piece moves.
   */
  readonly partIdentifiers = computed<ReadonlySet<string>>(() => {
    const identifiers = new Set<string>();
    for (const parts of this.partsByBody().values()) for (const part of parts) identifiers.add(part.identifier);
    return identifiers;
  });

  /** A piece as the bonds between pieces see it: whoever holds on to it, and the mount it rides or the body it is a part of. */
  bondOf(piece: GameCharacter): BondedPiece {
    const carrier = this.mountOf(piece) ?? this.bodyOf(piece);
    return { id: piece.identifier, grabbedBy: piece.grabbedBy, ridingOn: carrier?.identifier ?? '' };
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
   * The pieces a piece is carried off with, from it up to the one they are carried as: the mount it
   * rides or the body it is a part of, the one that one rides or is a part of in turn, and so on, up
   * to one riding nothing. One held on to by a piece on the table is carried alone, as a captive is,
   * and the climb stops there. The piece alone where it rides nothing; the last is always carried.
   */
  rideChainOf(piece: GameCharacter): GameCharacter[] {
    const chain = [piece];
    let at = piece;
    while (!this.boundHolderOf(at)) {
      const next = this.mountOf(at) ?? this.bodyOf(at);
      if (!next || chain.includes(next)) break;
      chain.push(next);
      at = next;
    }
    return chain;
  }

  /**
   * The piece holding on to this one as the bonds between pieces count it: one on the table, in the
   * fight or not, unlike {@link holderOf}; null where none is.
   */
  boundHolderOf(piece: GameCharacter): GameCharacter | null {
    if (piece.grabbedBy === '' || piece.grabbedBy === piece.identifier) return null;
    const holder = this.objectStore.get<GameCharacter>(piece.grabbedBy);
    return holder instanceof GameCharacter && holder.isVisibleOnTable ? holder : null;
  }

  /**
   * Brings along what goes where each of several pieces goes, as {@link carryBoundAll} does, for
   * pieces set on the floor: one brought along off a board or a wall is set on the floor with them.
   * Answers the pieces brought along.
   */
  carryBoundOntoFloor(anchors: readonly GameCharacter[], cellPx?: number): GameCharacter[] {
    return GameObject.batch(() => {
      const carried = this.carryBoundAll(anchors, cellPx);
      for (const piece of carried) {
        if (!piece.location.surface) continue;
        piece.location = { name: piece.location.name, x: piece.location.x, y: piece.location.y };
        piece.update();
      }
      return carried;
    });
  }

  /**
   * Stands the pieces of a chain {@link rideChainOf} answers on the one they are carried as, held
   * fast or not, and on the floor where it stands on the floor: the carrying took them as it took
   * the piece itself, which nothing held fast holds back.
   */
  standChainOn(chain: readonly GameCharacter[], cellPx?: number): void {
    const carrier = chain[chain.length - 1];
    GameObject.batch(() => {
      for (const piece of chain) {
        if (piece === carrier || piece.heldFast !== '1') continue;
        this.standAt(piece, carrier, cellPx);
        if (piece.location.surface !== carrier.location.surface) {
          piece.location = { ...piece.location, surface: carrier.location.surface };
        }
        piece.update();
      }
    });
  }

  /**
   * Brings the pieces that go where a piece goes along to where it now stands, as a move of it does:
   * those it holds on to, those riding it, and those bound to them in turn. One held fast where it
   * stands is left there.
   */
  carryBound(anchor: GameCharacter): void {
    this.carryBoundAll([anchor]);
  }

  /**
   * Brings along what goes where each of several pieces goes, as {@link carryBound} does for one,
   * the bonds of the room read once for them all and every move told together. Answers the pieces
   * brought along. Stood by the cells of the table in view, or `cellPx` across where given, as for a
   * table not yet looked at.
   */
  carryBoundAll(anchors: readonly GameCharacter[], cellPx?: number): GameCharacter[] {
    if (anchors.length < 1) return [];
    const onTable = this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((piece) => piece.isVisibleOnTable);
    const bonds = onTable.map((piece) => this.bondOf(piece));
    const carried = new Set<GameCharacter>();
    GameObject.batch(() => {
      for (const anchor of anchors) {
        const below = new Set(boundBelow(anchor.identifier, bonds));
        for (const piece of onTable) {
          if (!below.has(piece.identifier) || piece.heldFast === '1') continue;
          this.standAt(piece, anchor, cellPx);
          piece.update();
          carried.add(piece);
        }
      }
    });
    return [...carried];
  }

  /**
   * Puts a piece's middle on another's, whatever the two sizes, by the cells of the table in view, or
   * `cellPx` across where given.
   */
  standAt(piece: GameCharacter, at: GameCharacter, cellPx?: number): void {
    const gridSize = cellPx ?? this.tableSelecter.viewTable?.gridSize ?? 50;
    const offset = pieceCentreOffsetPx(at, gridSize) - pieceCentreOffsetPx(piece, gridSize);
    piece.location.x = at.location.x + offset;
    piece.location.y = at.location.y + offset;
  }
}

/** Whether a piece is written down as a part of another; see `isPartOf`. */
function writtenAsPart(piece: GameCharacter): boolean {
  return isPartOf({ id: piece.identifier, ridingOn: piece.ridingOn, rideSeat: piece.rideSeat });
}

/** Whether two tables of the parts of each body hold the same parts of the same bodies, in order. */
function sameParts(
  a: ReadonlyMap<string, readonly GameCharacter[]>,
  b: ReadonlyMap<string, readonly GameCharacter[]>
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [body, parts] of a) {
    const other = b.get(body);
    if (!other || other.length !== parts.length || parts.some((part, index) => part !== other[index])) return false;
  }
  return true;
}
