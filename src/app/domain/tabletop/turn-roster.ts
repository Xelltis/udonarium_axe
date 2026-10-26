import { turnCarriers } from '@axe/domain/tabletop/ride/ride-rules';
import { TurnOrderMode } from '@axe/domain/tabletop/turn-order-mode';
import { groupBySide, SidedPiece, SideGroup } from '@axe/domain/tabletop/turn-side';
import { TurnHolding, TurnPhase } from '@axe/domain/tabletop/turn-state';

/** What the round reads of a piece. */
export interface TurnPiece extends SidedPiece {
  readonly ridingOn: string;
  readonly rideSeat: string;
  /** `'1'` for a piece others may ride. */
  readonly mountable: string;
  readonly noTurn: boolean;
  readonly hideInventory: boolean;
}

/** The pieces the round goes round, worked out once for everything asked of them at a time. */
export interface TurnRoster<T extends TurnPiece> {
  /**
   * The pieces the turn goes round, in the order the inventory lists them. Taken side by side, the
   * same pieces come gathered under their sides in the order the sides are taken, so walking the
   * list walks the round.
   */
  readonly order: readonly T[];
  /** The sides the round goes round, each with its pieces. Empty unless it is taken side by side. */
  readonly sides: readonly SideGroup<T>[];
  /**
   * The pieces that take their turn in another's, under the one whose turn it is: a mount ridden in
   * front, and whoever sits behind on it, act in the turn of the one riding in front.
   */
  readonly companions: ReadonlyMap<string, readonly T[]>;
}

/** How the round is taken, for working out who it goes round. */
export interface TurnRosterTerms {
  readonly mode: TurnOrderMode;
  /** The sides in the order the round takes them. */
  readonly sideOrder: readonly string[];
  /** Whether the pieces kept out of the inventory are listed too, as the game master sees the round. */
  readonly includeHidden?: boolean;
}

/**
 * Who the round goes round, from everyone on the table: those who take turns and are not carried in
 * another's. A piece kept out of the inventory takes none, but still carries others.
 */
export function buildTurnRoster<T extends TurnPiece>(pieces: readonly T[], terms: TurnRosterTerms): TurnRoster<T> {
  const carried = turnCarriers(
    pieces.map((piece) => ({
      id: piece.identifier,
      ridingOn: piece.ridingOn,
      rideSeat: piece.rideSeat,
      mountable: piece.mountable === '1',
      takesTurns: !piece.noTurn && !piece.hideInventory,
    }))
  );
  const taking = pieces.filter(
    (piece) => !piece.noTurn && !carried.has(piece.identifier) && (terms.includeHidden || !piece.hideInventory)
  );
  const sides = terms.mode === 'faction' ? groupBySide(taking, terms.sideOrder) : [];
  const order = terms.mode === 'faction' ? sides.flatMap((group) => group.members) : taking;

  const companions = new Map<string, T[]>();
  for (const piece of pieces) {
    const carrier = carried.get(piece.identifier);
    if (!carrier) continue;
    const under = companions.get(carrier);
    if (under) under.push(piece);
    else companions.set(carrier, [piece]);
  }
  return { order, sides, companions };
}

/** Where the round stands, as far as who may wait or step in goes. */
export interface TurnStanding {
  readonly phase: TurnPhase;
  readonly acted: readonly string[];
  readonly holding: TurnHolding;
}

/** Whether a round is under way: one has begun and not yet ended. */
export function isTurnUnderWay(phase: TurnPhase): boolean {
  return phase === 'acting' || phase === 'roundStart';
}

/**
 * Whether a piece may wait to step in later: a round is under way, the round reaches it, and it has
 * neither had its turn, begun to wait already, nor had its turn stepped into, which it takes up again
 * in its own time.
 */
export function mayHoldTurn(standing: TurnStanding, order: readonly string[], identifier: string): boolean {
  if (!isTurnUnderWay(standing.phase)) return false;
  if (standing.acted.includes(identifier) || standing.holding.held.includes(identifier)) return false;
  if (standing.holding.interrupted.includes(identifier)) return false;
  return order.includes(identifier);
}

/**
 * Whether a piece may step in now, which a piece still waiting may while the round is under way and
 * still reaches it.
 */
export function mayInterruptTurn(standing: TurnStanding, order: readonly string[], identifier: string): boolean {
  if (!isTurnUnderWay(standing.phase)) return false;
  return (
    standing.holding.held.includes(identifier) && !standing.acted.includes(identifier) && order.includes(identifier)
  );
}
