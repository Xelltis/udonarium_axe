import { Injectable, signal } from '@angular/core';
import { ChatLogStyle, DEFAULT_CHAT_LOG_STYLE, isChatLogStyle } from '@axe/domain/chat/chat-log-style';

export const CHAT_LOG_STYLE_STORAGE_KEY = 'chat-log-style';

@Injectable({ providedIn: 'root' })
export class ChatLogStylePreferenceService {
  readonly style = signal<ChatLogStyle>(stored());

  choose(style: ChatLogStyle): void {
    this.style.set(style);
    try {
      localStorage.setItem(CHAT_LOG_STYLE_STORAGE_KEY, style);
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
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
