import { ChatLogExporter, ChatLogImageSrcResolver, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import { renderPlainChatLog } from '@axe/domain/chat/chat-log-plain';
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

/**
 * Renders a saved chat log as a standalone html page in the chosen style, or as plain text for the
 * `text` one.
 *
 * `scope` is the first of `tabs` alone, or every spoken tab merged in the order lines were placed.
 * The standard and the classic `coc` layouts come from `ChatLogExporter`, plain text from
 * `renderPlainChatLog`, and every other style from `renderRichChatLog`.
 */
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
    case 'text':
      return renderPlainChatLog(scope, tabs, options);
    default:
      return renderRichChatLog(style, scope, tabs, options);
  }
}
