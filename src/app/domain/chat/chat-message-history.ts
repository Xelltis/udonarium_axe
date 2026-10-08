/** One wording a line has had, and from when it said it. */
export interface ChatMessageVersion {
  readonly text: string;
  readonly at: number;
}

/** How many earlier wordings a line keeps; past it the first is kept and the ones after it go first. */
export const MAX_CHAT_MESSAGE_EDITS = 50;

/**
 * The earlier wordings of a line, oldest first, read from what `appendChatMessageEdit` wrote: each is
 * what the line said and when an edit replaced it.
 *
 * Anything that cannot be read, a whole history or a single entry, is passed over rather than
 * stopping the rest.
 */
export function parseChatMessageEdits(raw: unknown): ChatMessageVersion[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const edits: ChatMessageVersion[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { text, at } = item as Record<string, unknown>;
    const time = Number(at);
    if (typeof text !== 'string' || !Number.isFinite(time)) continue;
    edits.push({ text, at: time });
  }
  return edits;
}

/**
 * The history with one more earlier wording at its end, written out to keep: `text` is what the line
 * said until an edit replaced it at `at`. Past `max` the first wording is kept and the ones after it
 * go first.
 */
export function appendChatMessageEdit(raw: unknown, text: string, at: number, max = MAX_CHAT_MESSAGE_EDITS): string {
  const edits = [...parseChatMessageEdits(raw), { text, at }];
  const kept = edits.length > max ? [edits[0], ...edits.slice(edits.length - max + 1)] : edits;
  return JSON.stringify(kept);
}

/**
 * Every wording a line has had, oldest first, each from when it began to say it: the first from when
 * the line was said, each after it from the edit that gave it, and the last what it says now.
 *
 * Empty for a line with no earlier wordings kept, never edited or edited before they were kept.
 */
export function chatMessageVersions(
  edits: readonly ChatMessageVersion[],
  current: string,
  saidAt: number
): ChatMessageVersion[] {
  if (edits.length === 0) return [];
  return [
    ...edits.map((edit, index) => ({ text: edit.text, at: index === 0 ? saidAt : edits[index - 1].at })),
    { text: current, at: edits[edits.length - 1].at },
  ];
}
