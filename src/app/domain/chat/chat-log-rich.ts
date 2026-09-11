import {
  ChatLogEntry,
  ChatLogExporter,
  ChatLogImageSrcResolver,
  ChatLogLine,
  ChatLogTab,
  ChatLogTextDecoder,
} from '@axe/domain/chat/chat-log-exporter';
import type { RichChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { CHAT_LOG_BASE_CSS, CHAT_LOG_THEME_CSS } from '@axe/domain/chat/chat-log-theme-css';
import type { DiceRollOutcome } from '@axe/domain/dice/dice-roll-detail';
import { vnBodyOf } from '@axe/domain/visual-novel/vn-emote';

export type ChatLogScope = 'tab' | 'all';

export interface ChatLogLabels {
  secret: string;
  edited: string;
  quote: string;
  reply: string;
  critical: string;
  fumble: string;
  success: string;
  failure: string;
  allTabs: string;
  everyTab: string;
  messages: (count: number) => string;
  exportedWith: string;
}

export const DEFAULT_CHAT_LOG_LABELS: ChatLogLabels = {
  secret: 'シークレットダイス',
  edited: '編集済',
  quote: '引用',
  reply: '返信先',
  critical: 'クリティカル',
  fumble: 'ファンブル',
  success: '成功',
  failure: '失敗',
  allTabs: '全タブ',
  everyTab: 'すべて',
  messages: (count) => `${count} 件の発言`,
  exportedWith: 'Udonarium Axe',
};

export interface ChatLogRenderOptions {
  userId?: string;
  imageSrcResolver?: ChatLogImageSrcResolver;
  textDecoder?: ChatLogTextDecoder;
  roomName?: string;
  labels?: Partial<ChatLogLabels>;
  lang?: string;
  exportedAt?: number;
}

type Kind = 'say' | 'roll' | 'system';

interface RenderContext {
  readonly options: ChatLogRenderOptions;
  readonly labels: ChatLogLabels;
  readonly showTab: boolean;
}

const CONTINUATION_WINDOW_MS = 5 * 60 * 1000;
const CAST_LIMIT = 32;
const DEFAULT_COLOR = '#666666';
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
const ROLLER_NAME = /^<(?:Secret-)?BCDice[：:](.*)>$/s;

const OUTCOME_CLASS: Readonly<Record<Exclude<DiceRollOutcome, ''>, string>> = {
  critical: 'crit',
  fumble: 'fumble',
  success: 'ok',
  failure: 'ng',
};

const DIE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
  '<circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>' +
  '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>' +
  '<circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>' +
  '</svg>';

const TAB_FILTER_SCRIPT =
  '<script>(function(){var n=document.querySelector(".tabs");if(!n)return;' +
  'n.addEventListener("click",function(e){var b=e.target.closest("button[data-tab]");if(!b)return;' +
  'var t=b.getAttribute("data-tab");' +
  'n.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b));});' +
  'document.querySelectorAll("[data-t]").forEach(function(el){el.hidden=t!=="*"&&el.getAttribute("data-t")!==t;});' +
  '});})();</script>';

const esc = ChatLogExporter.escapeHtml;
const attr = ChatLogExporter.escapeAttribute;

export function renderRichChatLog(
  style: RichChatLogStyle,
  scope: ChatLogScope,
  tabs: readonly ChatLogTab[],
  options: ChatLogRenderOptions = {}
): string {
  const labels: ChatLogLabels = { ...DEFAULT_CHAT_LOG_LABELS, ...options.labels };
  const logTabs = scope === 'all' ? ChatLogExporter.spokenTabs(tabs) : tabs.slice(0, 1);
  const entries =
    scope === 'all' ? ChatLogExporter.mergeEntries(logTabs, options.userId) : singleTabEntries(logTabs[0], options);
  const showTabs = scope === 'all' && logTabs.length > 1;
  const context: RenderContext = { options, labels, showTab: showTabs };

  const title = scope === 'all' ? labels.allTabs : (logTabs[0]?.name ?? '');
  const documentTitle = options.roomName ? `${title} — ${options.roomName}` : title;
  const footer =
    `<footer class="foot">${esc(labels.exportedWith)}` +
    (options.exportedAt != null ? ` · ${formatDateTime(options.exportedAt)}` : '') +
    '</footer>';

  return (
    '<!DOCTYPE html>\n' +
    `<html lang="${attr(options.lang || 'ja')}" data-style="${style}">\n` +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="generator" content="Udonarium Axe">\n' +
    `<title>${esc(documentTitle)}</title>\n` +
    `<style>${CHAT_LOG_BASE_CSS}${CHAT_LOG_THEME_CSS[style]}</style>\n` +
    '</head>\n' +
    '<body>\n' +
    '<div class="log">\n' +
    renderHeader(title, entries, logTabs, showTabs, context) +
    '\n<main class="body">\n' +
    renderRows(entries, context) +
    '</main>\n' +
    footer +
    '\n</div>\n' +
    (showTabs ? TAB_FILTER_SCRIPT + '\n' : '') +
    '</body>\n' +
    '</html>'
  );
}

function singleTabEntries(tab: ChatLogTab | undefined, options: ChatLogRenderOptions): ChatLogEntry[] {
  if (!tab) return [];
  return tab.chatMessages
    .filter((message) => ChatLogExporter.isVisibleMessage(message, options.userId))
    .map((message) => ({ tab, tabIndex: 0, message }));
}

function kindOf(message: ChatLogLine): Kind {
  if (message.isDicebot) return 'roll';
  if (message.isSystemMessage) return 'system';
  return 'say';
}

function renderHeader(
  title: string,
  entries: readonly ChatLogEntry[],
  logTabs: readonly ChatLogTab[],
  showTabs: boolean,
  context: RenderContext
): string {
  const { labels, options } = context;
  const kicker = options.roomName ? `<p class="kicker">${esc(options.roomName)}</p>` : '';
  const spoken = entries.filter((entry) => kindOf(entry.message) !== 'system');

  const meta: string[] = [];
  const range = rangeOf(entries);
  if (range) meta.push(`<span>${range}</span>`);
  meta.push(`<span>${esc(labels.messages(spoken.length))}</span>`);

  const cast = castOf(spoken, context);
  const castList = cast.length
    ? `<ul class="cast">${cast.map((member) => `<li style="--c:${member.color}">${esc(member.name)}</li>`).join('')}</ul>`
    : '';

  const tabFilter = showTabs
    ? '<nav class="tabs">' +
      `<button type="button" data-tab="*" aria-pressed="true">${esc(labels.everyTab)}</button>` +
      logTabs
        .map((tab, index) => `<button type="button" data-tab="${index}" aria-pressed="false">${esc(tab.name)}</button>`)
        .join('') +
      '</nav>'
    : '';

  return (
    '<header class="head">' +
    kicker +
    `<h1 class="title">${esc(title)}</h1>` +
    `<p class="meta">${meta.join('')}</p>` +
    castList +
    tabFilter +
    '</header>'
  );
}

function castOf(entries: readonly ChatLogEntry[], context: RenderContext): { name: string; color: string }[] {
  const seen = new Map<string, string>();
  for (const { message } of entries) {
    if (kindOf(message) !== 'say') continue;
    const name = decode(message.name, context).trim();
    if (!name || seen.has(name)) continue;
    seen.set(name, colorOf(message.messColor));
    if (seen.size >= CAST_LIMIT) break;
  }
  return [...seen].map(([name, color]) => ({ name, color }));
}

function renderRows(entries: readonly ChatLogEntry[], context: RenderContext): string {
  const parts: string[] = [];
  let day = '';
  let previous: ChatLogEntry | null = null;
  for (const entry of entries) {
    const entryDay = formatDate(entry.message.placedAt);
    if (entryDay !== day) {
      day = entryDay;
      parts.push(`<div class="day"><span>${entryDay}</span></div>\n`);
      previous = null;
    }
    parts.push(renderEntry(entry, isContinuation(previous, entry), context));
    previous = entry;
  }
  return parts.join('');
}

function isContinuation(previous: ChatLogEntry | null, current: ChatLogEntry): boolean {
  if (!previous) return false;
  const before = previous.message;
  const now = current.message;
  return (
    kindOf(before) === 'say' &&
    kindOf(now) === 'say' &&
    previous.tabIndex === current.tabIndex &&
    before.name === now.name &&
    before.messColor === now.messColor &&
    before.image?.identifier === now.image?.identifier &&
    !before.isSecret &&
    !now.isSecret &&
    !!before.isOutOfStory === !!now.isOutOfStory &&
    now.placedAt - before.placedAt < CONTINUATION_WINDOW_MS
  );
}

function renderEntry(entry: ChatLogEntry, continuation: boolean, context: RenderContext): string {
  switch (kindOf(entry.message)) {
    case 'roll':
      return renderRoll(entry, context);
    case 'system':
      return renderSystem(entry, context);
    default:
      return renderSay(entry, continuation, context);
  }
}

function renderSay(entry: ChatLogEntry, continuation: boolean, context: RenderContext): string {
  const { message } = entry;
  const { labels } = context;
  const name = decode(message.name, context);
  const visible = !message.isSecret || ChatLogExporter.canSee(message, context.options.userId);

  const classes = ['msg'];
  if (continuation) classes.push('cont');
  if (message.isOutOfStory) classes.push('ooc');
  if (!visible) classes.push('sealed');

  const body = visible
    ? textHtml(vnBodyOf(message.vnEmote, decode(message.text, context))) + renderAttachments(message, context)
    : `<span class="seal">${esc(labels.secret)}</span>`;
  const edited = message.fixd ? `<span class="ed">${esc(labels.edited)}</span>` : '';

  return (
    `<article class="${classes.join(' ')}" data-t="${entry.tabIndex}" style="--c:${colorOf(message.messColor)}">` +
    `<div class="pt">${renderPortrait(message, name, context)}</div>` +
    '<div class="bd">' +
    `<div class="hd"><span class="nm">${esc(name)}</span>${tabBadge(entry, context)}${timeOf(message)}</div>` +
    renderReferences(message, context) +
    `<div class="tx">${body}${edited}</div>` +
    '</div></article>\n'
  );
}

function renderRoll(entry: ChatLogEntry, context: RenderContext): string {
  const { message } = entry;
  const { labels } = context;
  const visible = !message.isSecret || ChatLogExporter.canSee(message, context.options.userId);
  const outcome = visible ? (message.rollDetail?.outcome ?? '') : '';

  const classes = ['msg', 'roll'];
  if (outcome) classes.push(OUTCOME_CLASS[outcome]);
  if (message.isOutOfStory) classes.push('ooc');
  if (!visible) classes.push('sealed');

  const roller = rollerName(decode(message.name, context));
  const badge = outcome ? `<span class="oc">${esc(labels[outcome])}</span>` : '';
  const body = visible
    ? rollTextHtml(decode(message.text, context))
    : `<span class="seal">${esc(labels.secret)}</span>`;

  return (
    `<article class="${classes.join(' ')}" data-t="${entry.tabIndex}" style="--c:${colorOf(message.messColor)}">` +
    `<div class="pt">${DIE_ICON}</div>` +
    '<div class="bd">' +
    `<div class="hd"><span class="nm">${esc(roller)}</span>${badge}${tabBadge(entry, context)}${timeOf(message)}</div>` +
    `<div class="tx">${body}</div>` +
    '</div></article>\n'
  );
}

function renderSystem(entry: ChatLogEntry, context: RenderContext): string {
  return `<div class="sys" data-t="${entry.tabIndex}"><span>${textHtml(decode(entry.message.text, context))}</span></div>\n`;
}

function tabBadge(entry: ChatLogEntry, context: RenderContext): string {
  return context.showTab ? `<span class="tg">${esc(entry.tab.name)}</span>` : '';
}

function timeOf(message: ChatLogLine): string {
  return `<time>${formatTime(message.timestamp)}</time>`;
}

function renderPortrait(message: ChatLogLine, name: string, context: RenderContext): string {
  const image = message.image;
  const key = image ? (context.options.imageSrcResolver?.(image) ?? image.url) : '';
  if (image && key) return `<img data-img-key="${attr(key)}" alt="">`;
  const initial = Array.from(name.trim())[0] ?? '';
  return `<span class="ini">${esc(initial)}</span>`;
}

function renderReferences(message: ChatLogLine, context: RenderContext): string {
  const { labels } = context;
  const quote = message.quoteOf ? message.quoteOfMessage : null;
  const reply = message.replyTo ? message.replyToMessage : null;
  let html = '';
  if (quote) html += renderReference('❝', quote, 280, labels.quote, context);
  if (reply) html += renderReference('↩', reply, 120, labels.reply, context);
  return html;
}

function renderReference(
  icon: string,
  target: ChatLogLine,
  maxTextLength: number,
  label: string,
  context: RenderContext
): string {
  const name = decode(target.name, context) || label;
  const excerpt = ChatLogExporter.referenceExcerpt(target, maxTextLength, context.options.textDecoder);
  return `<div class="ref"><span class="rn">${icon} ${esc(name)}</span><span class="rt">${esc(excerpt)}</span></div>`;
}

function renderAttachments(message: ChatLogLine, context: RenderContext): string {
  const tags = (message.attachmentImages ?? [])
    .map((image) => {
      const key = context.options.imageSrcResolver?.(image) ?? image.url;
      return key ? `<img data-img-key="${attr(key)}" alt="${attr(image.name || '')}">` : '';
    })
    .filter((tag) => tag.length > 0)
    .join('');
  return tags ? `<div class="att">${tags}</div>` : '';
}

function textHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => esc(line))
    .join('<br>');
}

function rollTextHtml(text: string): string {
  const lines = text.split('\n');
  return lines
    .map((line, index) => {
      const next = lines[index + 1];
      const arrow = line.lastIndexOf('→');
      if (arrow < 0 || (next != null && next.trimStart().startsWith('→'))) return esc(line);
      const result = line.slice(arrow + 1).trim();
      if (!result) return esc(line);
      return `${esc(line.slice(0, arrow + 1))} <strong class="res">${esc(result)}</strong>`;
    })
    .join('<br>');
}

function rollerName(name: string): string {
  return ROLLER_NAME.exec(name)?.[1] ?? name;
}

function decode(text: string | null | undefined, context: RenderContext): string {
  return ChatLogExporter.decode(text, context.options.textDecoder);
}

function colorOf(color: string | null | undefined): string {
  const value = (color ?? '').trim().toLowerCase();
  return SAFE_COLOR.test(value) ? value : DEFAULT_COLOR;
}

function rangeOf(entries: readonly ChatLogEntry[]): string {
  if (entries.length < 1) return '';
  const first = entries[0].message.placedAt;
  const last = entries[entries.length - 1].message.placedAt;
  const from = formatDateTime(first);
  if (formatDate(first) === formatDate(last)) return `${from} – ${formatTime(last)}`;
  return `${from} – ${formatDateTime(last)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function formatTime(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(time: number): string {
  return `${formatDate(time)} ${formatTime(time)}`;
}
