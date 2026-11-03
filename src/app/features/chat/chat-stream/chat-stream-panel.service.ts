import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import type { ChatStreamComponent } from '@axe/features/chat/chat-stream/chat-stream.component';
import { Z_VISUAL_NOVEL_PANEL } from '@axe/ui/z-layers';

/**
 * What the widget showing a tab is found by: one per tab, so several conversations can be watched
 * side by side. A widget switched to another tab is found by that one instead.
 */
export function chatStreamPanelName(tabIdentifier: string): string {
  return `chat-stream:${tabIdentifier}`;
}

function panelNameFor(tab: ChatTab): string {
  return chatStreamPanelName(tab.identifier);
}

/**
 * Opens the stream chat widget for a tab. Its code is fetched as it is first opened: the widget
 * carries a tab strip whose menu opens it, and the two would otherwise each need the other loaded
 * first.
 */
@Injectable({ providedIn: 'root' })
export class ChatStreamPanelService {
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  /** Whether the stream window for this chat tab is currently open. */
  isOpen(tab: ChatTab): boolean {
    return this.panelService.hasSingle(panelNameFor(tab));
  }

  /** Opens the widget for a tab, or puts it away if it is already up. */
  toggle(tab: ChatTab, spot?: { left: number; top: number }): void {
    const name = panelNameFor(tab);
    if (this.panelService.closeSingle(name)) return;

    const width = Math.min(360, Math.max(260, window.innerWidth - 48));
    this.panelService.openLazy<ChatStreamComponent>(
      () => import('@axe/features/chat/chat-stream/chat-stream.component').then((m) => m.ChatStreamComponent),
      {
        title: this.t('feature.chat.stream.title'),
        left: spot?.left ?? Math.max(8, window.innerWidth - width - 24),
        top: spot?.top ?? 24,
        width,
        height: Math.min(480, Math.max(240, window.innerHeight - 220)),
        minWidth: 220,
        minHeight: 200,
        // Novel mode covers the screen, and this is a window meant to be watched beside it.
        layer: Z_VISUAL_NOVEL_PANEL,
        single: name,
      },
      (stream) => stream.tabIdentifier.set(tab.identifier)
    );
  }
}
