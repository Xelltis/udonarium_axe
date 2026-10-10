import { chatSearchOffsets } from '@axe/features/chat/chat-search/chat-search';

/** The highlight the words found are marked with, which the global stylesheet colours. */
export const CHAT_SEARCH_HIGHLIGHT = 'chat-search';
/** The highlight the words found in the line the search stands on are marked with. */
export const CHAT_SEARCH_CURRENT_HIGHLIGHT = 'chat-search-current';
/** The attribute that picks out the line the search stands on. */
export const CHAT_SEARCH_CURRENT_ATTRIBUTE = 'data-chat-search-current';

/** The parts of a drawn line that hold its name and its words, where the phrase is looked for. */
const SEARCHED_PARTS = '.msg-name, [data-chat-search-text]';

interface Marks {
  readonly all: Range[];
  readonly current: Range[];
}

// Every log's marks on a page, since a page has one highlight of each name for all its logs.
const marksByDocument = new WeakMap<Document, Map<HTMLElement, Marks>>();

type HighlightWindow = Window & typeof globalThis;

function highlightWindowOf(document: Document): HighlightWindow | null {
  const view = document.defaultView as HighlightWindow | null;
  if (!view || typeof view.Highlight !== 'function' || !view.CSS?.highlights) return null;
  return view;
}

/**
 * Marks where the phrase falls in the lines drawn under a log, the line the search stands on apart
 * from the rest, and picks that line out.
 *
 * The words are marked through the browser's highlights, which leave the lines as they are drawn. A
 * browser without them still picks out the line the search stands on. Marking again replaces what
 * this log had marked; lines drawn later are marked only when this is called again.
 */
export function markChatSearch(log: HTMLElement, query: string, currentIdentifier: string | null): void {
  const all: Range[] = [];
  const current: Range[] = [];
  for (const line of Array.from(log.querySelectorAll<HTMLElement>('chat-message[data-message-id]'))) {
    const isCurrent = query.length > 0 && line.dataset['messageId'] === currentIdentifier;
    line.toggleAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE, isCurrent);
    if (query.length === 0) continue;
    for (const range of rangesIn(line, query)) (isCurrent ? current : all).push(range);
  }
  publish(log, { all, current });
}

/** Takes away every mark a log's search made. */
export function unmarkChatSearch(log: HTMLElement): void {
  for (const line of Array.from(log.querySelectorAll(`[${CHAT_SEARCH_CURRENT_ATTRIBUTE}]`))) {
    line.removeAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE);
  }
  publish(log, null);
}

function rangesIn(line: HTMLElement, query: string): Range[] {
  const document = line.ownerDocument;
  const ranges: Range[] = [];
  for (const part of Array.from(line.querySelectorAll(SEARCHED_PARTS))) {
    const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const [start, end] of chatSearchOffsets(node.textContent ?? '', query)) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        ranges.push(range);
      }
    }
  }
  return ranges;
}

function publish(log: HTMLElement, marks: Marks | null): void {
  const document = log.ownerDocument;
  let byLog = marksByDocument.get(document);
  if (!byLog) {
    byLog = new Map();
    marksByDocument.set(document, byLog);
  }
  if (marks) byLog.set(log, marks);
  else byLog.delete(log);

  const view = highlightWindowOf(document);
  if (!view) return;
  const every = [...byLog.values()];
  const all = every.flatMap((each) => each.all);
  const current = every.flatMap((each) => each.current);
  if (all.length > 0) view.CSS.highlights.set(CHAT_SEARCH_HIGHLIGHT, new view.Highlight(...all));
  else view.CSS.highlights.delete(CHAT_SEARCH_HIGHLIGHT);
  if (current.length > 0) view.CSS.highlights.set(CHAT_SEARCH_CURRENT_HIGHLIGHT, new view.Highlight(...current));
  else view.CSS.highlights.delete(CHAT_SEARCH_CURRENT_HIGHLIGHT);
}
