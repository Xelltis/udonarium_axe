import { ChatLogExporter, ChatLogImageSrcResolver, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import { ChatLogRenderOptions, ChatLogScope, renderRichChatLog } from '@axe/domain/chat/chat-log-rich';
import { ChatLogStyle } from '@axe/domain/chat/chat-log-style';

export interface ChatLogExportOptions extends ChatLogRenderOptions {
  showTime?: number | boolean;
}

export interface ChatLogImages {
  readonly resolver: ChatLogImageSrcResolver;
  readonly registryScript: string;
}

const EMPTY_TAB: ChatLogTab = { name: '', chatMessages: [] };

export function exportChatLog(
  style: ChatLogStyle,
  scope: ChatLogScope,
  tabs: readonly ChatLogTab[],
  options: ChatLogExportOptions = {}
): string {
  const { userId, imageSrcResolver, textDecoder } = options;
  const tab = tabs[0] ?? EMPTY_TAB;
  switch (style) {
    case 'standard':
      return scope === 'all'
        ? ChatLogExporter.exportAllTabsHtml(tabs, options.showTime ?? true, userId, imageSrcResolver, textDecoder)
        : ChatLogExporter.exportTabHtml(tab, userId, imageSrcResolver, textDecoder);
    case 'coc':
      return scope === 'all'
        ? ChatLogExporter.exportAllTabsHtmlCoc(tabs, userId, imageSrcResolver, textDecoder)
        : ChatLogExporter.exportTabHtmlCoc(tab, userId, imageSrcResolver, textDecoder);
    default:
      return renderRichChatLog(style, scope, tabs, options);
  }
}
