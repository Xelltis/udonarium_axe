import { ObjectStore } from '@axe/core/sync/object-store';
import type { ChatMessageContext } from '@axe/domain/chat/chat-message';
import type { ChatTab } from '@axe/domain/chat/chat-tab';
import { canViewDisclosable, type Disclosable } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** The users seated as game master in the room now, each once. */
export function gameMasterUserIds(): string[] {
  const masters = ObjectStore.instance
    .getObjects<PeerCursor>(PeerCursor)
    .filter((cursor) => cursor.isGameMaster && cursor.userId.length > 0)
    .map((cursor) => cursor.userId);
  return [...new Set(masters)];
}

/** A piece as {@link tellThoseWhoMaySee} reads it: who it is disclosed to, and who owns it. */
export type SeenPiece = Disclosable & { readonly owner?: string };

/**
 * The users seated in the room now who may see what every one of the pieces given keeps back, each
 * once: the game masters, and those each piece is owned by or disclosed to.
 */
export function userIdsWhoMaySee(pieces: readonly SeenPiece[]): string[] {
  const seen = ObjectStore.instance
    .getObjects<PeerCursor>(PeerCursor)
    .filter(
      (cursor) =>
        cursor.userId.length > 0 &&
        pieces.every((piece) =>
          canViewDisclosable(piece, {
            userId: cursor.userId,
            isGameMaster: cursor.isGameMaster,
            ownerUserId: piece.owner,
          })
        )
    )
    .map((cursor) => cursor.userId);
  return [...new Set(seen)];
}

/**
 * Tells those who may see what the pieces keep back what a line says in full: the line, saying
 * `text` instead, addressed to the game masters and to those every piece is owned by or disclosed
 * to, and answering nobody, so the seat that put the line out reads it only where it is one of them.
 * Nothing is said where none of them is seated.
 */
export function tellThoseWhoMaySee(
  tab: ChatTab,
  line: ChatMessageContext,
  text: string,
  pieces: readonly SeenPiece[]
): void {
  const readers = userIdsWhoMaySee(pieces);
  if (readers.length < 1) return;
  tab.addMessage({ ...line, originFrom: '', to: readers.join(' '), text });
}
