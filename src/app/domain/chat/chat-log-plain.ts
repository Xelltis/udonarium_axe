import { ChatLogEntry, ChatLogExporter, ChatLogLine, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import {
  ChatLogLabels,
  ChatLogRenderOptions,
  ChatLogScope,
  DEFAULT_CHAT_LOG_LABELS,
  formatLogDate,
  formatLogTime,
} from '@axe/domain/chat/chat-log-rich';
import { RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';
import { vnBodyOf } from '@axe/domain/visual-novel/vn-emote';

const INDENT = '    ';
const QUOTE_LENGTH = 280;
const REPLY_LENGTH = 120;

/**
 * Writes a chat log as plain text, for reading or pasting where a page cannot go.
 *
 * It keeps what the themed pages keep, as words alone: the lines the reader may see in the order
 * they were placed, each under its time and name and, for every tab at once, its tab; a day line
 * where the date changes; the quoted or replied-to line below the one answering it; and the marks
 * for a secret roll, an edit and a deletion. A ruby is written as the words with their reading after
 * them in brackets, and an attached picture by its name.
 */
export function renderPlainChatLog(
  scope: ChatLogScope,
  tabs: readonly ChatLogTab[],
  options: ChatLogRenderOptions = {}
): string {
  const labels: ChatLogLabels = { ...DEFAULT_CHAT_LOG_LABELS, ...options.labels };
  const logTabs = scope === 'all' ? ChatLogExporter.spokenTabs(tabs) : tabs.slice(0, 1);
  const entries =
    scope === 'all'
      ? ChatLogExporter.mergeEntries(logTabs, options.userId)
      : (logTabs[0]?.chatMessages ?? [])
          .filter((message) => ChatLogExporter.isVisibleMessage(message, options.userId))
          .map((message) => ({ tab: logTabs[0], tabIndex: 0, message }));
  const showTab = scope === 'all' && logTabs.length > 1;

  const title = scope === 'all' ? labels.allTabs : (logTabs[0]?.name ?? '');
  const lines = [options.roomName ? `${title} — ${options.roomName}` : title];
  lines.push(
    options.exportedAt != null
      ? `${labels.exportedWith} · ${formatLogDate(options.exportedAt)} ${formatLogTime(options.exportedAt)}`
      : labels.exportedWith
  );

  let day = '';
  for (const entry of entries) {
    const entryDay = formatLogDate(entry.message.placedAt);
    if (entryDay !== day) {
      day = entryDay;
      lines.push('', `--- ${entryDay} ---`);
    }
    lines.push(...entryLines(entry, showTab, labels, options));
  }
  return lines.join('\n') + '\n';
}

function entryLines(
  entry: ChatLogEntry,
  showTab: boolean,
  labels: ChatLogLabels,
  options: ChatLogRenderOptions
): string[] {
  const { message } = entry;
  const head =
    `[${formatLogTime(message.timestamp)}] ` +
    (showTab ? `[${entry.tab.name}] ` : '') +
    `${ChatLogExporter.decode(message.name, options.textDecoder)}：`;

  const body = ChatLogExporter.isSealed(message, options.userId)
    ? [`（${labels.secret}）`]
    : bodyLines(message, options);
  const marks =
    (message.fixd ? `（${labels.edited}）` : '') + (message.isPseudoDeleted ? `（${labels.pseudoDeleted}）` : '');
  const [first = '', ...rest] = body;

  const reactions = ChatLogExporter.isSealed(message, options.userId)
    ? ''
    : ChatLogExporter.reactionSummary(message, options.reactionsOf);
  return [
    head + first + marks,
    ...rest.map((line) => INDENT + line),
    ...referenceLines(message, labels, options).map((line) => INDENT + line),
    ...(reactions ? [`${INDENT}${labels.reactions}: ${reactions}`] : []),
  ];
}

function bodyLines(message: ChatLogLine, options: ChatLogRenderOptions): string[] {
  const text = withRubyInBrackets(vnBodyOf(message.vnEmote, ChatLogExporter.decode(message.text, options.textDecoder)));
  const lines = text.split(/\r?\n/);
  for (const image of message.attachmentImages ?? []) lines.push(`[${image.name || '?'}]`);
  return lines;
}

function referenceLines(message: ChatLogLine, labels: ChatLogLabels, options: ChatLogRenderOptions): string[] {
  const lines: string[] = [];
  const quote = ChatLogExporter.referencedLine(message.quoteOf ? message.quoteOfMessage : null, options.userId);
  const reply = ChatLogExporter.referencedLine(message.replyTo ? message.replyToMessage : null, options.userId);
  if (quote) lines.push(`❝ ${labels.quote} ${referenceText(quote, QUOTE_LENGTH, labels, options)}`);
  if (reply) lines.push(`↩ ${labels.reply} ${referenceText(reply, REPLY_LENGTH, labels, options)}`);
  return lines;
}

function referenceText(
  target: ChatLogLine,
  length: number,
  labels: ChatLogLabels,
  options: ChatLogRenderOptions
): string {
  const name = ChatLogExporter.decode(target.name, options.textDecoder);
  const text = ChatLogExporter.isSealed(target, options.userId)
    ? labels.secret
    : withRubyInBrackets(ChatLogExporter.referenceExcerpt(target, length, options.textDecoder));
  return `${name}：${text}`;
}

function withRubyInBrackets(text: string): string {
  return text.replace(RUBY_NOTATION, '$1（$2）');
}
