import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { stampOf, stampOrder } from '@axe/domain/chat/stamp-catalog';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** One stamp on a line: how many put it on, who they are, and whether the reader is among them. */
export interface ReactionTally {
  readonly stampId: string;
  readonly count: number;
  readonly names: readonly string[];
  readonly mine: boolean;
}

/**
 * The stamps put on lines of chat, and putting them on.
 *
 * The reader only ever writes to their own record for a line, made the first time they answer it
 * and taken away once they have taken every stamp back off.
 */
@Injectable({ providedIn: 'root' })
export class ChatReactionService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  private readonly byMessage = computed(
    () => {
      this.objectChange.collectionOf(ChatReaction.aliasName)();
      const byMessage = new Map<string, ChatReaction[]>();
      for (const reaction of this.objectStore.getObjects<ChatReaction>(ChatReaction)) {
        this.objectChange.versionOf(reaction.identifier)();
        const records = byMessage.get(reaction.messageIdentifier);
        if (records) records.push(reaction);
        else byMessage.set(reaction.messageIdentifier, [reaction]);
      }
      return byMessage;
    },
    { equal: () => false }
  );

  /** The reader's user id, empty before a room has been joined. */
  myUserId(): string {
    const fromCursor = PeerCursor.myCursor?.userId ?? '';
    return fromCursor.length > 0 ? fromCursor : getPeerContext().userId;
  }

  /**
   * The stamps on a line, each once with how many put it on, who and whether the reader did, the
   * ones that come with the app first in the order they are offered. A stamp this version does not
   * know is left out.
   */
  talliesOf(messageIdentifier: string): ReactionTally[] {
    const records = this.byMessage().get(messageIdentifier) ?? [];
    this.objectChange.trackMyCursor();
    const myUserId = this.myUserId();
    const tallies = new Map<string, { names: string[]; mine: boolean }>();
    for (const record of records) {
      for (const stampId of record.stampIds) {
        if (!stampOf(stampId)) continue;
        const tally = tallies.get(stampId) ?? { names: [], mine: false };
        tally.names.push(nameOf(record));
        tally.mine ||= record.userId === myUserId;
        tallies.set(stampId, tally);
      }
    }
    return [...tallies]
      .map(([stampId, tally]) => ({ stampId, count: tally.names.length, names: tally.names, mine: tally.mine }))
      .sort((a, b) => stampOrder(a.stampId) - stampOrder(b.stampId) || a.stampId.localeCompare(b.stampId));
  }

  /**
   * Puts a stamp on a line for the reader, or takes it off where they put it on already. Whether it
   * is now on; false too, with nothing changed, for a stamp this version does not know, a line the
   * reader is not shown, or before a room has been joined.
   */
  toggle(message: ChatMessage, stampId: string): boolean {
    const userId = this.myUserId();
    if (userId.length < 1 || !stampOf(stampId) || !message.isShownInChat) return false;

    const name = PeerCursor.myCursor?.name ?? '';
    const record =
      this.objectStore
        .getObjects<ChatReaction>(ChatReaction)
        .find((each) => each.messageIdentifier === message.identifier && each.userId === userId) ??
      ChatReaction.create(message.identifier, userId, name);
    if (name.length > 0 && record.userName !== name) record.userName = name;

    const on = record.toggle(stampId);
    if (record.stampIds.length < 1) record.destroy();
    return on;
  }
}

/** Who a record is by: their name as they are now, or as it was when they answered, after they left. */
function nameOf(record: ChatReaction): string {
  const present = PeerCursor.findByUserId(record.userId)?.name ?? '';
  if (present.length > 0) return present;
  return record.userName.length > 0 ? record.userName : record.userId.slice(0, 6);
}
