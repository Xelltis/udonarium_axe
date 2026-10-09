import { Injectable, signal } from '@angular/core';
import { ChatLogStyle, DEFAULT_CHAT_LOG_STYLE, isChatLogStyle } from '@axe/domain/chat/chat-log-style';

export const CHAT_LOG_STYLE_STORAGE_KEY = 'chat-log-style';
export const CHAT_LOG_OMIT_DELETED_STORAGE_KEY = 'chat-log-omit-deleted';

@Injectable({ providedIn: 'root' })
export class ChatLogStylePreferenceService {
  readonly style = signal<ChatLogStyle>(stored());

  /**
   * Whether this reader's saved logs leave out deleted lines. Off until asked for, so a saved log
   * keeps everything said that the reader can see, deleted lines included.
   */
  readonly omitDeleted = signal<boolean>(storedFlag(CHAT_LOG_OMIT_DELETED_STORAGE_KEY));

  /** Switches how this reader's chat log is laid out and remembers it in this browser. Nothing is sent to the room. */
  choose(style: ChatLogStyle): void {
    this.style.set(style);
    remember(CHAT_LOG_STYLE_STORAGE_KEY, style);
  }

  /** Sets whether saved logs leave out deleted lines, and remembers it in this browser. */
  setOmitDeleted(omit: boolean): void {
    this.omitDeleted.set(omit);
    remember(CHAT_LOG_OMIT_DELETED_STORAGE_KEY, String(omit));
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing refuses the write; the choice still holds for this session.
  }
}

function stored(): ChatLogStyle {
  try {
    const value = localStorage.getItem(CHAT_LOG_STYLE_STORAGE_KEY);
    return isChatLogStyle(value) ? value : DEFAULT_CHAT_LOG_STYLE;
  } catch {
    return DEFAULT_CHAT_LOG_STYLE;
  }
}

function storedFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}
