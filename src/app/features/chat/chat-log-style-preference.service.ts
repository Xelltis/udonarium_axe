import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ChatLogStyle, DEFAULT_CHAT_LOG_STYLE, isChatLogStyle } from '@axe/domain/chat/chat-log-style';

@Injectable({ providedIn: 'root' })
export class ChatLogStylePreferenceService {
  readonly style = signal<ChatLogStyle>(stored());

  /**
   * Whether this reader's saved logs leave out deleted lines. Off until asked for, so a saved log
   * keeps everything said that the reader can see, deleted lines included.
   */
  readonly omitDeleted = signal<boolean>(storedFlag(STORAGE_KEYS.chatLogOmitDeleted));

  /** Switches how this reader's chat log is laid out and remembers it in this browser. Nothing is sent to the room. */
  choose(style: ChatLogStyle): void {
    this.style.set(style);
    writeLocal(STORAGE_KEYS.chatLogStyle, style);
  }

  /** Sets whether saved logs leave out deleted lines, and remembers it in this browser. */
  setOmitDeleted(omit: boolean): void {
    this.omitDeleted.set(omit);
    writeLocal(STORAGE_KEYS.chatLogOmitDeleted, String(omit));
  }
}

function stored(): ChatLogStyle {
  const value = readLocal(STORAGE_KEYS.chatLogStyle);
  return isChatLogStyle(value) ? value : DEFAULT_CHAT_LOG_STYLE;
}

function storedFlag(key: string): boolean {
  return readLocal(key) === 'true';
}
