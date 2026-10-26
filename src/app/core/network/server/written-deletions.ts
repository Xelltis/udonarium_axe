import {
  CHANGE,
  COMING_BACK,
  DELETION,
  identifierOf,
  MAX_HELD_BROADCASTS,
  parentOf,
} from '@axe/core/network/server/outbound-events';
import { AuthorityEvent, EventContext } from '@axe/core/network/server/server-protocol';

/** How long a deletion is noted for once there are many, long enough for the server to turn it down. */
const NOTE_KEPT_MS = 60_000;

/**
 * What a link has carried deletions of, and when, for telling a deletion the server turned down. A
 * word that something comes back, or a change of it, written after its deletion takes the note away,
 * as the deletion went through.
 */
export class WrittenDeletions {
  private readonly writtenAt = new Map<string, number>();

  /**
   * Notes the deletions among events written to the link, for a while long enough for the server to
   * turn them down: the notes older than a minute go once there are many.
   */
  note(events: EventContext[]): void {
    const now = Date.now();
    for (const event of events) {
      const identifier = identifierOf(event);
      if (event.eventName === COMING_BACK) {
        const { identifiers } = event.data as { identifiers?: unknown };
        if (Array.isArray(identifiers)) for (const id of identifiers) this.writtenAt.delete(String(id));
      } else if (identifier === undefined) {
        continue;
      } else if (event.eventName === DELETION) {
        this.writtenAt.set(identifier, now);
      } else if (event.eventName === CHANGE) {
        this.writtenAt.delete(identifier);
      }
    }
    if (this.writtenAt.size <= MAX_HELD_BROADCASTS) return;
    for (const [identifier, at] of this.writtenAt) {
      if (now - at > NOTE_KEPT_MS) this.writtenAt.delete(identifier);
    }
  }

  /**
   * The objects among what the authority, by its peer id, hands back that this link carried the
   * deletion of, or that come back under one it did, as the lines of a tab a player may not delete.
   */
  takenBack(events: EventContext[], authority: string | undefined): Set<string> {
    const parents = new Map<string, string | undefined>();
    for (const event of events) {
      const identifier = identifierOf(event);
      if (event.eventName !== AuthorityEvent.AUTHORITATIVE || event.sendFrom !== authority || !identifier) continue;
      parents.set(identifier, parentOf(event));
    }
    const underDeletion = (identifier: string) => {
      let at: string | undefined = identifier;
      for (let step = 0; at !== undefined && step <= parents.size; step++) {
        if (this.writtenAt.has(at)) return true;
        at = parents.get(at);
      }
      return false;
    };
    return new Set([...parents.keys()].filter(underDeletion));
  }

  /** Forgets every note, a new link having carried nothing yet. */
  clear(): void {
    this.writtenAt.clear();
  }
}
