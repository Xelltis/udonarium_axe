import { inject, Injectable } from '@angular/core';
import { PanelService } from '@axe/application/ui/panel.service';
import { readLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import type { ChatStreamComponent } from '@axe/features/chat/chat-stream/chat-stream.component';
import { Z_VISUAL_NOVEL_PANEL } from '@axe/ui/z-layers';

/** One window per tab, so several conversations can be watched side by side. */
function panelNameFor(tab: ChatTab): string {
  return `chat-stream:${tab.identifier}`;
}

/**
 * Opens the window a tab's lines go past in. Its code is fetched as it is first opened: the window
 * carries a tab strip whose menu opens it, and the two would otherwise each need the other loaded
 * first.
 */
@Injectable({ providedIn: 'root' })
export class ChatStreamPanelService {
  private readonly panelService = inject(PanelService);

  /** Whether the stream window for this chat tab is currently open. */
  isOpen(tab: ChatTab): boolean {
    return this.panelService.hasSingle(panelNameFor(tab));
  }

  /**
   * Opens the window for a tab, or puts it away if it is already up. It opens taller where this
   * browser has it carry the input, which would otherwise leave little room for the lines.
   */
  toggle(tab: ChatTab, spot?: { left: number; top: number }): void {
    const name = panelNameFor(tab);
    if (this.panelService.closeSingle(name)) return;

    const width = Math.min(360, Math.max(260, window.innerWidth - 48));
    const speaks = readLocal(STORAGE_KEYS.chatStreamSpeaks) === 'true';
    this.panelService.openLazy<ChatStreamComponent>(
      () => import('@axe/features/chat/chat-stream/chat-stream.component').then((m) => m.ChatStreamComponent),
      {
        title: tab.name,
        left: spot?.left ?? Math.max(8, window.innerWidth - width - 24),
        top: spot?.top ?? 24,
        width,
        height: Math.min(speaks ? 640 : 420, Math.max(200, window.innerHeight - 220)),
        minWidth: 220,
        minHeight: 140,
        // Novel mode covers the screen, and this is a window meant to be watched beside it.
        layer: Z_VISUAL_NOVEL_PANEL,
        single: name,
      },
      (stream) => stream.tabIdentifier.set(tab.identifier)
    );
  }
}
