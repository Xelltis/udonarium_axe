import { Party } from '@axe/domain/party/party';

/**
 * Whether two parties stand together, asked of the identifiers alone.
 *
 * Handed to whatever needs to tell friend from foe, rather than looked up there, so that the
 * move layer goes on knowing nothing about how a room keeps its parties.
 */
export type PartyAlliance = (one: string, other: string) => boolean;

/** What a table of two plain sides comes to: nobody stands with anybody else. */
export const NO_ALLIANCE: PartyAlliance = () => false;

/**
 * The alliances a room's parties have between them.
 *
 * Either side naming the other is enough. A master who has ticked the villagers in the heroes'
 * list has said what they meant, and making them tick it twice would leave a half-written
 * alliance that quietly does nothing.
 */
export function allianceOf(parties: readonly Party[]): PartyAlliance {
  const standing = new Map<string, Set<string>>();
  const stand = (one: string, other: string) => {
    if (one.length < 1 || other.length < 1 || one === other) return;
    const held = standing.get(one);
    if (held) held.add(other);
    else standing.set(one, new Set([other]));
  };
  for (const party of parties) {
    for (const ally of party.alliedWith) {
      stand(party.identifier, ally);
      stand(ally, party.identifier);
    }
  }
  if (standing.size < 1) return NO_ALLIANCE;
  return (one, other) => standing.get(one)?.has(other) === true;
}
