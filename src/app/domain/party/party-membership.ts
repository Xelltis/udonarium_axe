export interface PartyMemberLike {
  owner: string;
  partyIdentifier: string;
}

/** The parties a user has characters in, each listed once. Empty for no user. */
export function partyIdsOwnedBy(members: readonly PartyMemberLike[], userId: string): string[] {
  if (!userId) return [];
  const ids = new Set<string>();
  for (const member of members) {
    if (member.owner !== userId) continue;
    if (member.partyIdentifier) ids.add(member.partyIdentifier);
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
