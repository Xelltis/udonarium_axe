import { NO_ALLIANCE, PartyAlliance } from '@axe/domain/party/party-alliance';
import { SidedPiece } from '@axe/domain/tabletop/turn-side';

/**
 * What a piece standing in the way is to the piece walking into it.
 *
 * Told by the party each is in and nothing else. A table where nobody has been put in a party
 * is a table of strangers, which is what most tables are, and a table that has been sorted into
 * parties gets the three answers it was sorted for.
 */
export const PIECE_RELATIONS = ['same', 'other', 'none'] as const;

export type PieceRelation = (typeof PIECE_RELATIONS)[number];

/**
 * Which of the three the piece in the way is.
 *
 * A piece in no party is a stranger to everybody, itself included: two pieces nobody has placed
 * are not thereby companions, and a table that has never opened the party panel is answered the
 * same way for every piece on it.
 *
 * Two parties that stand together answer as one. A band of allied villagers is not a way
 * through to be barred, and the whole point of saying who your friends are is being told apart
 * from the people you are fighting.
 */
export function relationBetween(
  piece: SidedPiece,
  mover: SidedPiece,
  allied: PartyAlliance = NO_ALLIANCE
): PieceRelation {
  const standing = piece.partyIdentifier;
  if (standing.length < 1) return 'none';
  const ours = mover.partyIdentifier;
  if (standing === ours) return 'same';
  return ours.length > 0 && allied(standing, ours) ? 'same' : 'other';
}
