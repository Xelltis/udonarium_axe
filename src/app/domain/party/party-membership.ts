export interface PartyMemberLike {
  owner: string;
  partyIdentifier: string;
}

/** Reads the written players of a party, by user identifier, dropping the blanks and the repeats. */
export function readPartyPlayers(written: string): string[] {
  return [...new Set((written ?? '').split(' ').filter((held) => held.length > 0))];
}

/** Only what a party needs to say who plays it, so a spec need not build one. */
export interface PartyPlayersLike {
  identifier: string;
  playerIds: readonly string[];
}

/**
 * The parties a user is in, each listed once: those they have characters in, and those that name
 * them among their players. Empty for no user.
 */
export function partyIdsOwnedBy(
  members: readonly PartyMemberLike[],
  userId: string,
  parties: readonly PartyPlayersLike[] = []
): string[] {
  if (!userId) return [];
  const ids = new Set<string>();
  for (const member of members) {
    if (member.owner !== userId) continue;
    if (member.partyIdentifier) ids.add(member.partyIdentifier);
  }
  for (const party of parties) {
    if (party.playerIds.includes(userId)) ids.add(party.identifier);
  }
  return [...ids];
}

/** The members that belong to that party. Empty for no party. */
export function membersOfParty<T extends PartyMemberLike>(members: readonly T[], partyIdentifier: string): T[] {
  if (!partyIdentifier) return [];
  return members.filter((member) => member.partyIdentifier === partyIdentifier);
}

/**
 * The members in no party, or in one that is not among the known parties, as after a party is
 * deleted.
 */
export function membersWithoutParty<T extends PartyMemberLike>(
  members: readonly T[],
  knownPartyIdentifiers: readonly string[]
): T[] {
  const known = new Set(knownPartyIdentifiers);
  return members.filter((member) => !member.partyIdentifier || !known.has(member.partyIdentifier));
}
