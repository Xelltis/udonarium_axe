import { ChatLogExporter, ChatLogImageSrcResolver, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import { renderPlainChatLog } from '@axe/domain/chat/chat-log-plain';
import { ChatLogRenderOptions, ChatLogScope, renderRichChatLog } from '@axe/domain/chat/chat-log-rich';
import { ChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { DEFAULT_RUBY_DISPLAY, rubyDisplayCss } from '@axe/domain/chat/ruby-display';

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
  if (style === 'text') return renderPlainChatLog(scope, tabs, options);
  return withRubyStyle(renderHtmlChatLog(style, scope, tabs, options), options);
}

/**
 * Gives a page of the log the style sheet its ruby is drawn by, as the reader saving it has ruby
 * drawn, so the page reads as the chat did for them.
 */
function withRubyStyle(html: string, options: ChatLogExportOptions): string {
  const sheet = `<style>${rubyDisplayCss(options.ruby ?? DEFAULT_RUBY_DISPLAY)}</style>`;
  const head = html.indexOf('</head>');
  return head < 0 ? sheet + html : html.slice(0, head) + sheet + html.slice(head);
}

function renderHtmlChatLog(
  style: Exclude<ChatLogStyle, 'text'>,
  scope: ChatLogScope,
  tabs: readonly ChatLogTab[],
  options: ChatLogExportOptions
): string {
  const { userId, imageSrcResolver, textDecoder, reactionsOf } = options;
  const tab = tabs[0] ?? EMPTY_TAB;
  switch (style) {
    case 'standard':
      return scope === 'all'
        ? ChatLogExporter.exportAllTabsHtml(
            tabs,
            options.showTime ?? true,
            userId,
            imageSrcResolver,
            textDecoder,
            reactionsOf
          )
        : ChatLogExporter.exportTabHtml(tab, userId, imageSrcResolver, textDecoder, reactionsOf);
    case 'coc':
      return scope === 'all'
        ? ChatLogExporter.exportAllTabsHtmlCoc(tabs, userId, imageSrcResolver, textDecoder)
        : ChatLogExporter.exportTabHtmlCoc(tab, userId, imageSrcResolver, textDecoder);
    default:
      return renderRichChatLog(style, scope, tabs, options);
  }
}
