import { HostilityBy } from '@axe/domain/tabletop/move/zone-of-control';

/** What tells a piece's side, as the table tells sides apart. */
export interface SidedPiece {
  readonly isNpc: boolean;
  readonly partyIdentifier: string;
}

/** A party and the parties it stands with. */
export interface SidedParty {
  readonly identifier: string;
  readonly alliedWith: readonly string[];
}

/**
 * Tells each piece which side it fights on, as one key per side, or null for a piece on no side.
 *
 * Told by whether a piece is a non-player one, or by party, the same two ways the table tells an
 * enemy. By party, parties that stand with one another fight as one side, and a piece in no
 * party is on no side at all: it is nobody's enemy, so it takes no part in a fight's sides.
 */
export function sideOfPiece(by: HostilityBy, parties: readonly SidedParty[]): (piece: SidedPiece) => string | null {
  if (by !== 'party') return (piece) => (piece.isNpc ? 'npc' : 'pc');
  const group = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (group.has(root) && group.get(root) !== root) root = group.get(root)!;
    group.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) group.set(rb, ra);
    else group.set(ra, rb);
  };
  for (const party of parties) {
    find(party.identifier);
    for (const ally of party.alliedWith) {
      if (ally.length > 0) join(party.identifier, ally);
    }
  }
  return (piece) => (piece.partyIdentifier.length > 0 ? `party:${find(piece.partyIdentifier)}` : null);
}
