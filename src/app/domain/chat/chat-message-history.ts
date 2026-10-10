/** One wording a line has had, as its history shows it. */
export interface ChatMessageVersion {
  readonly text: string;
  /** When the line began to say it, or null where that was not kept. */
  readonly since: number | null;
  /** Which edit gave it: 0 for the line as first said, then 1, 2 and on; null where the count was lost. */
  readonly edit: number | null;
}

/** One earlier wording as it is kept on the line: from when, until when, and which edit gave it. */
interface KeptWording {
  readonly text: string;
  readonly since: number | null;
  readonly until: number;
  readonly edit: number | null;
}

/** How many earlier wordings a line keeps; past it the first is kept and the ones after it go first. */
export const MAX_CHAT_MESSAGE_EDITS = 50;

/**
 * The earlier wordings of a line, oldest first, read from what `appendChatMessageEdit` wrote.
 *
 * Anything that cannot be read, a whole history or a single entry, is passed over rather than
 * stopping the rest.
 */
function parseKeptWordings(raw: unknown): KeptWording[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const kept: KeptWording[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { text, since, until, edit } = item as Record<string, unknown>;
    const end = Number(until);
    if (typeof text !== 'string' || !Number.isFinite(end)) continue;
    kept.push({ text, since: timeOrNull(since), until: end, edit: countOrNull(edit) });
  }
  return kept;
}

/** Whether a line keeps any earlier wording. */
export function hasChatMessageEdits(raw: unknown): boolean {
  return parseKeptWordings(raw).length > 0;
}

/**
 * The history with one more earlier wording at its end, written out to keep: `text` is what the line
 * said until an edit replaced it at `until`.
 *
 * The first wording kept is the line as first said, from `saidAt`, unless the line had been edited
 * before anything was kept, when neither when it began nor which edit gave it is known. Each after
 * it began when the one before it ended. Past `max` the first wording is kept and the ones after it
 * go first; each keeps its own times and count, so what is left still reads true.
 */
export function appendChatMessageEdit(
  raw: unknown,
  text: string,
  until: number,
  origin: { saidAt: number; editedBeforeKept: boolean },
  max = MAX_CHAT_MESSAGE_EDITS
): string {
  const kept = parseKeptWordings(raw);
  const last = kept.at(-1);
  const next: KeptWording = last
    ? { text, since: last.until, until, edit: last.edit === null ? null : last.edit + 1 }
    : origin.editedBeforeKept
      ? { text, since: null, until, edit: null }
      : { text, since: origin.saidAt, until, edit: 0 };
  const all = [...kept, next];
  const trimmed = all.length > max ? [all[0], ...all.slice(all.length - max + 1)] : all;
  return JSON.stringify(trimmed);
}

/**
 * Every wording a line has had, oldest first, the last being what it says now; empty for a line with
 * no earlier wording kept.
 */
export function chatMessageVersions(raw: unknown, current: string): ChatMessageVersion[] {
  const kept = parseKeptWordings(raw);
  const last = kept.at(-1);
  if (!last) return [];
  return [
    ...kept.map(({ text, since, edit }) => ({ text, since, edit })),
    { text: current, since: last.until, edit: last.edit === null ? null : last.edit + 1 },
  ];
}

function timeOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const time = Number(value);
  return Number.isFinite(time) ? time : null;
}

function countOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : null;
}
