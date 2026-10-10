import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { playChatSound } from '@axe/domain/chat/chat-sound';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * How lately a line has to have been said to be worth a sound.
 *
 * Joining a room and loading one from a file both hand every line that was ever said to the
 * same event a new line arrives on. Without this, walking into an evening's conversation
 * played three hundred notes at once.
 */
const JUST_SAID_MS = 30_000;

/**
 * Sounds a note when somebody speaks.
 *
 * Only what other people say is heard: a reader knows their own line has gone. What the room
 * says of itself - a roll, a notice - is left to the sounds those already carry, and a tab
 * the reader may not read is not announced to them either.
 */
@Injectable({ providedIn: 'root' })
export class ChatSoundEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly preferences = inject(ChatPreferencesService);

  constructor() {
    this.objectChange.messageAdded$.subscribe((event) => {
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (!message || message.isSendFromSelf || message.isSystem) return;
      // A line older than this arrived by sync or by loading a room, and was not just said.
      if (Date.now() - message.timestamp > JUST_SAID_MS) return;

      const tab = this.objectStore.get<ChatTab>(event.tabIdentifier);
      if (!tab || !canRoleViewTab(tab, PeerCursor.myRole)) return;
      const setting = this.preferences.soundOfTab(tab.name);
      if (!setting.enabled) return;

      playChatSound(setting.type, message.text, setting.volume);
    }, this.destroyRef);
  }
}
