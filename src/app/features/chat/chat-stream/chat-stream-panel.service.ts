import { inject, Injectable } from '@angular/core';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatStreamComponent } from '@axe/features/chat/chat-stream/chat-stream.component';
import { Z_VISUAL_NOVEL_PANEL } from '@axe/ui/z-layers';

/** One window per tab, so several conversations can be watched side by side. */
function panelNameFor(tab: ChatTab): string {
  return `chat-stream:${tab.identifier}`;
}

@Injectable({ providedIn: 'root' })
export class ChatStreamPanelService {
  private readonly panelService = inject(PanelService);

  /** Whether the stream window for this chat tab is currently open. */
  isOpen(tab: ChatTab): boolean {
    return this.panelService.hasSingle(panelNameFor(tab));
  }

  /** Opens the window for a tab, or puts it away if it is already up. */
  toggle(tab: ChatTab, spot?: { left: number; top: number }): void {
    const name = panelNameFor(tab);
    if (this.panelService.closeSingle(name)) return;

    const width = Math.min(360, Math.max(260, window.innerWidth - 48));
    const stream = this.panelService.open<ChatStreamComponent>(ChatStreamComponent, {
      title: tab.name,
      left: spot?.left ?? Math.max(8, window.innerWidth - width - 24),
      top: spot?.top ?? 24,
      width,
      height: Math.min(420, Math.max(200, window.innerHeight - 220)),
      minWidth: 220,
      minHeight: 140,
      // Novel mode covers the screen, and this is a window meant to be watched beside it.
      layer: Z_VISUAL_NOVEL_PANEL,
      single: name,
    });
    stream.tabIdentifier.set(tab.identifier);
  }
}
