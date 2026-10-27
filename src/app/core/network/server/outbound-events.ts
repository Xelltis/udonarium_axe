import { AuthorityEvent, EventContext } from '@axe/core/network/server/server-protocol';

/** Events gathered for one peer, or for everybody else when `to` is undefined. */
export interface Outbound {
  to: string | undefined;
  events: EventContext[];
}

/** How many requests to the server a seat keeps while it gets back into the room. */
export const MAX_HELD_EVENTS = 64;
/**
 * How many deletions a seat keeps while it gets back into the room, apart from the requests: a tab
 * deleted goes as one deletion for each of its lines. The words on what comes back are kept past it,
 * and so are the changes, of which only the last of each object between deletions is kept.
 */
export const MAX_HELD_BROADCASTS = 20_000;

/** The word that what was deleted is coming back. */
export const COMING_BACK = 'FORGET_DELETED_OBJECTS';
/** A change of an object. */
export const CHANGE = 'UPDATE_GAME_OBJECT';
/** A deletion of an object. */
export const DELETION = 'DELETE_GAME_OBJECT';

/**
 * Requests to the server that would be lost while reconnecting, and that the catalogs traded on
 * getting back in do not mend: a role change asked for in the meantime. A roll is not among them:
 * the dice bot asks again for every roll unanswered, those lost on the way included.
 */
const HELD_EVENT_NAMES: ReadonlySet<string> = new Set([AuthorityEvent.ROLE_REQUEST]);
/**
 * What goes to everybody that the catalogs do not mend either, the server keeping deletions
 * itself: a deletion, and the word that what was deleted is coming back. The changes go with them,
 * in the order they were made, though the catalogs would mend those: a deck split while getting
 * back in moves its cards into the new one before the old one is deleted, and its deletion going
 * first would take the cards with it.
 */
const HELD_BROADCAST_EVENT_NAMES: ReadonlySet<string> = new Set([DELETION, COMING_BACK, CHANGE]);

/** The identifier an event names, if it names one. */
export function identifierOf(event: EventContext): string | undefined {
  const identifier = (event.data as { identifier?: unknown } | null)?.identifier;
  return typeof identifier === 'string' ? identifier : undefined;
}

/** The parent an object's context names, when it names one. */
export function parentOf(event: EventContext): string | undefined {
  const parent = (event.data as { syncData?: { parentIdentifier?: unknown } } | null)?.syncData?.parentIdentifier;
  return typeof parent === 'string' && parent !== '' ? parent : undefined;
}

/**
 * The batches with only the last change of each object kept between deletions and words on what
 * comes back, at its place: one dragged while getting back into the room goes once, as it stands
 * now, while a change made before a deletion stays before it, as a card moved out of a deck before
 * the deck is deleted has to.
 */
export function latestChanges(batches: Outbound[]): Outbound[] {
  const seen = new Set<string>();
  const kept = [...batches].reverse().map((batch) => ({
    to: batch.to,
    events: [...batch.events].reverse().filter((event) => {
      if (event.eventName === DELETION || event.eventName === COMING_BACK) seen.clear();
      const identifier = identifierOf(event);
      if (event.eventName !== CHANGE || identifier === undefined) return true;
      if (seen.has(identifier)) return false;
      seen.add(identifier);
      return true;
    }),
  }));
  return kept.reverse().map((batch) => ({ to: batch.to, events: batch.events.reverse() }));
}

/**
 * What among events for one peer, or for everybody, is kept while getting back into the room: the
 * requests to the authority, and the changes, deletions and words on what comes back sent to everybody.
 */
export function keptWhileAway(
  events: EventContext[],
  sendTo: string | undefined,
  authorityPeerId: string | undefined
): EventContext[] {
  const names =
    sendTo === undefined ? HELD_BROADCAST_EVENT_NAMES : sendTo === authorityPeerId ? HELD_EVENT_NAMES : null;
  return names ? events.filter((event) => names.has(event.eventName)) : [];
}
