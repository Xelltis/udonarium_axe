/** The side a piece belongs to where it belongs to no party. Never written onto a piece. */
export const UNASSIGNED_SIDE = '@none';

/** Only what a side needs of a party, so a spec need not build one. */
export interface PartyLike {
  identifier: string;
  name: string;
  color: string;
}

/** Only what a side needs of a piece. */
export interface SidedPiece {
  identifier: string;
  partyIdentifier: string;
}

export interface SideGroup<T> {
  side: string;
  members: T[];
}

/** Reads the comma-separated order a room holds, dropping blanks and repeats. */
export function parseFactionOrder(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const side = part.trim();
    if (side.length > 0) seen.add(side);
  }
  return [...seen];
}

/** Writes the order back in the form a room holds it. */
export function encodeFactionOrder(sides: readonly string[]): string {
  return parseFactionOrder(sides.join(',')).join(',');
}

export interface FactionOrderOptions {
  /** Whether the pieces belonging to no party sit the round out. */
  skipUnassigned?: boolean;
}

/**
 * The sides the round goes round, in the order it takes them.
 *
 * What the room wrote down is read first, and anything in it that is no longer a party is
 * dropped. A party the room has never put in order comes after those, in the order the
 * parties themselves are given, so a party made while the round is running joins the end
 * rather than going missing. Reading fixes the order without writing it back: two people
 * making a party at once would otherwise have one of the two lost to the other's save.
 */
export function normalizeFactionOrder(
  raw: string,
  parties: readonly PartyLike[],
  options: FactionOrderOptions = {}
): string[] {
  const known = new Set(parties.map((party) => party.identifier));
  const written = parseFactionOrder(raw).filter((side) => known.has(side) || side === UNASSIGNED_SIDE);

  const order = [...written];
  for (const party of parties) {
    if (!order.includes(party.identifier)) order.push(party.identifier);
  }

  if (options.skipUnassigned) return order.filter((side) => side !== UNASSIGNED_SIDE);
  if (!order.includes(UNASSIGNED_SIDE)) order.push(UNASSIGNED_SIDE);
  return order;
}

/** Which side a piece is on, where a party that has been taken away leaves it on none. */
export function sideOfPiece(piece: SidedPiece, order: readonly string[]): string {
  const held = piece.partyIdentifier;
  return held.length > 0 && order.includes(held) ? held : UNASSIGNED_SIDE;
}

/**
 * The pieces gathered under the side each is on, in the order the sides are taken.
 *
 * A side nobody is on is left out, so a party whose pieces all sit the round out never
 * opens a phase with nothing in it.
 */
export function groupBySide<T extends SidedPiece>(pieces: readonly T[], order: readonly string[]): SideGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const side of order) groups.set(side, []);
  for (const piece of pieces) {
    const side = sideOfPiece(piece, order);
    groups.get(side)?.push(piece);
  }
  return order.map((side) => ({ side, members: groups.get(side) ?? [] })).filter((group) => group.members.length > 0);
}

/**
 * The side the round stands on, which is the one it is held on while that side is still there.
 *
 * A party taken away in the middle of a fight would otherwise leave the round on a side no
 * piece is on, where it would find nobody to hand the turn to and never move again.
 */
export function resolveCurrentSide<T>(
  held: string,
  groups: readonly SideGroup<T>[],
  hasUnacted: (group: SideGroup<T>) => boolean
): string {
  if (groups.some((group) => group.side === held)) return held;
  return (groups.find(hasUnacted) ?? groups[0])?.side ?? '';
}

/** The next side with anybody left to act, or nothing once the round has been all the way round. */
export function nextSide<T>(
  current: string,
  groups: readonly SideGroup<T>[],
  hasUnacted: (group: SideGroup<T>) => boolean
): string {
  const standing = groups.findIndex((group) => group.side === current);
  for (let step = standing + 1; step < groups.length; step++) {
    if (hasUnacted(groups[step])) return groups[step].side;
  }
  return '';
}

/** What a side is called and the colour it is shown in. */
export function describeSide(
  side: string,
  parties: readonly PartyLike[],
  unassignedName: string
): { name: string; color: string } {
  const party = parties.find((held) => held.identifier === side);
  return party ? { name: party.name, color: party.color } : { name: unassignedName, color: '' };
}
