import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { moveKindNamed } from '@axe/domain/tabletop/move/move-kind';

/** Whether the move being worked out is one nobody may stop, and whether that may still be changed. */
export interface UnstoppableBand {
  readonly on: boolean;
  readonly mayChange: boolean;
}

/** The kinds of move offered while a move is worked out, and how far the chosen one has left. */
export interface MoveKindBand {
  /**
   * The room's kinds, each with whether it may be chosen now: until the first leg is settled, and
   * where zones let the piece go by it.
   */
  readonly kinds: readonly { readonly name: string; readonly mayChoose: boolean }[];
  readonly chosen: string;
  readonly metresLeft: number;
}

/** What a move being worked out holds whether it is counted in cells or drawn as straight legs. */
export interface PlanBasics {
  readonly characterIdentifier: string;
  /** The name of the kind of move being made, empty for the room's first or plain kind. */
  readonly kind: string;
  /** Whether the move is one nobody may stop. */
  readonly unstoppable: boolean;
  /** The way settled so far, beginning where the move begins, so one long until a leg is settled. */
  readonly settled: readonly unknown[];
}

/** What the rest of the room is told of a move being worked out: all empty where there is none. */
export interface MoveNotice {
  readonly piece: string;
  readonly table: string;
  /** The cells of a move counted in cells, joined by commas. */
  readonly way: string;
  /** `'true'` where a move counted in cells goes over what stands in the way. */
  readonly jumping: string;
  /** The corners of a move drawn as straight legs, as `writeMovingPoints` writes them. */
  readonly points: string;
  readonly kind: string;
}

/**
 * The kinds of move a room plays, offered while a move is worked out, with how far the one chosen
 * has left in metres; null where the room has written no kinds of its own.
 *
 * A kind may be chosen until the first leg is settled, where zones let the piece go by it, and the
 * one chosen is kept from then on.
 */
export function moveKindBandOf(
  zones: EngagementZoneService,
  piece: GameCharacter | null,
  plan: PlanBasics,
  metresLeft: () => number
): MoveKindBand | null {
  const kinds = zones.moveKinds();
  if (kinds.length < 2 && kinds[0].name === '') return null;
  const allowed = plan.settled.length < 2 && piece ? zones.kindsAllowed(piece) : null;
  return {
    kinds: kinds.map((kind) => ({
      name: kind.name,
      mayChoose: kind.name === plan.kind || allowed?.has(kind.name) === true,
    })),
    chosen: plan.kind,
    metresLeft: Math.round(metresLeft() * 10) / 10,
  };
}

/**
 * Whether the move being worked out is one nobody may stop, offered where the room plays zones;
 * chosen before the first leg is settled, like the kind.
 */
export function unstoppableBandOf(zones: EngagementZoneService, plan: PlanBasics | null): UnstoppableBand | null {
  if (!plan || !zones.isEnabled()) return null;
  return { on: plan.unstoppable, mayChange: plan.settled.length < 2 };
}

/** The piece a move being worked out is for, where it is still on the table. */
export function pieceOfPlan(objectStore: ObjectStore, plan: PlanBasics): GameCharacter | null {
  const piece = objectStore.get<GameCharacter>(plan.characterIdentifier);
  return piece instanceof GameCharacter ? piece : null;
}

/**
 * The piece a move being worked out is for, while how the move is made may still be chosen again:
 * nothing is being walked, and no leg has been settled. Null otherwise.
 */
export function pieceToChooseFor(
  objectStore: ObjectStore,
  plan: PlanBasics | null,
  walking: boolean
): GameCharacter | null {
  if (!plan || walking || plan.settled.length > 1) return null;
  return pieceOfPlan(objectStore, plan);
}

/**
 * The kind a move being worked out changes to when `kindName` is chosen, or null where that is the
 * kind it is made by already, or one the piece may not move by.
 */
export function kindToChangeTo(
  zones: EngagementZoneService,
  piece: GameCharacter,
  plan: PlanBasics,
  kindName: string
): string | null {
  const kind = moveKindNamed(zones.moveKinds(), kindName).name;
  return kind !== plan.kind && zones.mayMove(piece, kind) ? kind : null;
}

/**
 * Puts a move being worked out where the rest of the room can see it, on the cursor of whoever is
 * working it out, and takes it away again with a notice all empty. A notice that says what the
 * cursor says already is not sent again.
 */
export function tellTheRoomOf(notice: MoveNotice): void {
  const cursor = PeerCursor.myCursor;
  if (!cursor) return;
  if (
    cursor.movingCharacterIdentifier === notice.piece &&
    cursor.movingTableIdentifier === notice.table &&
    cursor.movingWay === notice.way &&
    cursor.movingJumping === notice.jumping &&
    cursor.movingPoints === notice.points &&
    cursor.movingKind === notice.kind
  ) {
    return;
  }
  GameObject.batch(() => {
    cursor.movingCharacterIdentifier = notice.piece;
    cursor.movingTableIdentifier = notice.table;
    cursor.movingWay = notice.way;
    cursor.movingJumping = notice.jumping;
    cursor.movingPoints = notice.points;
    cursor.movingKind = notice.kind;
  });
}
