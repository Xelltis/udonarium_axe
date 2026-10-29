/**
 * The two sides of the battle stage, and who stands where.
 *
 * The master puts pieces on the left or on the right, which is what the stage plays when
 * nobody says who strikes whom. A bout chosen by hand stands each piece on the side it was put
 * on, and where neither was put anywhere the one striking stands on the left.
 */

export const BATTLE_SIDES = ['left', 'right'] as const;

export type BattleSide = (typeof BATTLE_SIDES)[number];

/** Reads a side as it is held on a piece or carried in a scene; anything else is no side. */
export function asBattleSide(value: unknown): BattleSide | null {
  return value === 'left' || value === 'right' ? value : null;
}

/** What a piece holds to stand out of the lineup though its party stands on a side. */
export const BATTLE_SIDE_OUT = 'none';

/** Only what the side of a piece is read from. */
export interface SidedFighter {
  battleSide: string;
  partyIdentifier: string;
}

/**
 * Which side a piece stands on: the one it was put on, else the one its party stands on, else
 * none. A piece taken out of the lineup by hand stands on none, whatever its party does.
 */
export function battleSideOf(
  piece: SidedFighter,
  partySide: (partyIdentifier: string) => BattleSide | null
): BattleSide | null {
  if (piece.battleSide === BATTLE_SIDE_OUT) return null;
  const own = asBattleSide(piece.battleSide);
  if (own) return own;
  return piece.partyIdentifier.length > 0 ? partySide(piece.partyIdentifier) : null;
}

/** The side across the stage. */
export function oppositeBattleSide(side: BattleSide): BattleSide {
  return side === 'left' ? 'right' : 'left';
}

/** A piece the master has put on one side. */
export interface LineupMember {
  identifier: string;
  side: BattleSide;
}

/** Who strikes, who is struck, and which side the one striking stands on. */
export interface BattleBout {
  attacker: string;
  defenders: string[];
  attackerSide: BattleSide;
}

/**
 * The bout the master's lineup plays.
 *
 * The one striking is the first of those asked for that stands in the lineup - whose turn it is,
 * say, and then whoever pressed - and failing them the first on the left. Those struck are
 * everybody on the other side, as many as the stage holds. Null where either side is empty.
 */
export function lineupBout(
  members: readonly LineupMember[],
  wanted: readonly (string | null | undefined)[],
  limit: number
): BattleBout | null {
  const attacker =
    wanted.map((identifier) => members.find((member) => member.identifier === identifier)).find(Boolean) ??
    members.find((member) => member.side === 'left');
  if (!attacker) return null;

  const across = oppositeBattleSide(attacker.side);
  const defenders = members
    .filter((member) => member.side === across)
    .slice(0, Math.max(0, limit))
    .map((member) => member.identifier);
  if (defenders.length < 1) return null;

  return { attacker: attacker.identifier, defenders, attackerSide: attacker.side };
}

/**
 * Which side the one striking stands on in a bout chosen by hand: the side it was put on, else
 * across from the first of those struck that was put anywhere, else the left.
 */
export function attackerSideFor(
  attackerSide: BattleSide | null,
  defenderSides: readonly (BattleSide | null)[]
): BattleSide {
  if (attackerSide) return attackerSide;
  const placed = defenderSides.find((side): side is BattleSide => side !== null);
  return placed ? oppositeBattleSide(placed) : 'left';
}
