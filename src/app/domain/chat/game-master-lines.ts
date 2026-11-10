import { ObjectStore } from '@axe/core/sync/object-store';
import type { ChatMessageContext } from '@axe/domain/chat/chat-message';
import type { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** The users seated as game master in the room now, each once. */
export function gameMasterUserIds(): string[] {
  const masters = ObjectStore.instance
    .getObjects<PeerCursor>(PeerCursor)
    .filter((cursor) => cursor.isGameMaster && cursor.userId.length > 0)
    .map((cursor) => cursor.userId);
  return [...new Set(masters)];
}

/**
 * Tells the game masters alone what a line says in full: the line, saying `text` instead, addressed
 * to them and answering nobody, so the seat that put the line out does not see it unless it is a game
 * master's. Nothing is said where no game master is seated.
 */
export function tellGameMasters(tab: ChatTab, line: ChatMessageContext, text: string): void {
  const masters = gameMasterUserIds();
  if (masters.length < 1) return;
  tab.addMessage({ ...line, originFrom: '', to: masters.join(' '), text });
}
