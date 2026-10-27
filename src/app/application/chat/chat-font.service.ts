import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { chatFontWanted$ } from '@axe/core/event/domain-events';
import { ChatFontKey } from '@axe/domain/chat/chat-decoration';

/**
 * The sheet each font that comes with the tool is declared in, copied out of its `@fontsource`
 * package at build time. The tool's own font has none.
 */
export const CHAT_FONT_SHEETS: Readonly<Partial<Record<ChatFontKey, string>>> = {
  mincho: 'assets/fonts/chat/shippori-mincho/400.css',
  rounded: 'assets/fonts/chat/zen-maru-gothic/400.css',
  hand: 'assets/fonts/chat/yomogi/400.css',
  pop: 'assets/fonts/chat/mochiy-pop-one/400.css',
  pixel: 'assets/fonts/chat/dotgothic16/400.css',
};

/**
 * Puts the sheet of a font the chat's decorations ask for into the page the first time a line is
 * drawn in it, and never before: the five fonts weigh some 17MB between them, and a room that never
 * names one should not pay for it.
 *
 * Each sheet cuts its font into slices by the letters they hold, so a browser fetches only the slices
 * of the letters it draws. A panel taken out into a window is given the sheet with the rest of the
 * page's sheets (PanelWindowService).
 */
@Injectable({ providedIn: 'root' })
export class ChatFontService {
  private readonly document = inject(DOCUMENT);
  private readonly loaded = new Set<string>();

  constructor() {
    chatFontWanted$.subscribe((font) => this.load(font), inject(DestroyRef));
  }

  /** Puts in the sheet of a font, once; a name with no sheet, the tool's own font among them, is passed over. */
  load(font: string): void {
    const sheet = CHAT_FONT_SHEETS[font as ChatFontKey];
    if (!sheet || this.loaded.has(font)) return;
    this.loaded.add(font);
    const link = this.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheet;
    link.dataset['chatFont'] = font;
    this.document.head.appendChild(link);
  }
}
