/** The names offered as a line is written, each by what it is written with. */
export interface ChatCompletionWords {
  readonly statuses: readonly string[];
  readonly variables: readonly string[];
  readonly portraits: readonly string[];
  readonly effects: readonly string[];
  /** The buffs the speaker has, to take off or stack onto. */
  readonly buffs: readonly string[];
  /** The cut-ins that start from chat, offered after an at mark to play their sound alone. */
  readonly cutIns: readonly string[];
  readonly diceExamples: readonly string[];
}

/** What a name is offered for: a chip it becomes, or text written after a mark. */
export type ChatTriggerKind = 'reference' | 'effect' | 'tail' | 'status' | 'buff';

/** A name being written: what for, where its mark starts, and what is written after the mark so far. */
export interface ChatTrigger {
  kind: ChatTriggerKind;
  /** Where the mark that starts it stands in the text read. */
  from: number;
  query: string;
}

const TRIGGERS: readonly { kind: ChatTriggerKind; pattern: RegExp }[] = [
  { kind: 'reference', pattern: /([tTｔＴ]?[{｛][^{}｛｝\s\ufffc]*)$/ },
  { kind: 'effect', pattern: /(《[^《》\s\ufffc]*)$/ },
  { kind: 'tail', pattern: /(?:^|\s)([@＠][^\s\ufffc]*)$/ },
  { kind: 'status', pattern: /(?:^|\s)([sSｓＳ]?[tTｔＴ]?[:：][^\s:：&＆+\-=>＋－＝＞\ufffc]*)$/ },
  { kind: 'buff', pattern: /(?:^|\s)([sｓ]?[tTｔＴ]?[&＆][+＋!！]*[^\s/&＆\ufffc]*)$/ },
];

/**
 * Finds the name being written right before the caret, from the text of its line up to the caret:
 * a reference's after `{`, an effect's after `《`, a portrait's or a cut-in's after an at mark that
 * starts a word, a status after a colon that does, and a buff after an ampersand that does. Null
 * where none is, so nothing is offered in words of chat.
 */
export function findChatTrigger(before: string): ChatTrigger | null {
  for (const { kind, pattern } of TRIGGERS) {
    const match = pattern.exec(before);
    if (!match) continue;
    const written = match[1];
    const from = match.index + match[0].length - written.length;
    const mark =
      /^[sｓ]?[tTｔＴ]?[&＆][+＋!！]*|^[sSｓＳ]?[tTｔＴ]?[:：]|^[tTｔＴ]?[{｛]|^[@＠]|^《/.exec(written)?.[0] ?? '';
    return { kind, from, query: written.slice(mark.length) };
  }
  return null;
}

/** The names offered for what is being written, those starting with what is written first. */
export function chatTriggerOptions(trigger: ChatTrigger, words: ChatCompletionWords): string[] {
  const pool =
    trigger.kind === 'reference'
      ? [...words.statuses, ...words.variables]
      : trigger.kind === 'effect'
        ? [...words.effects, 'vs']
        : trigger.kind === 'tail'
          ? [...words.portraits, ...words.cutIns]
          : trigger.kind === 'status'
            ? words.statuses
            : words.buffs;
  const query = trigger.query.toLowerCase();
  const names = [...new Set(pool.filter((name) => name.length > 0))];
  const starts = names.filter((name) => name.toLowerCase().startsWith(query));
  const contains = names.filter((name) => !name.toLowerCase().startsWith(query) && name.toLowerCase().includes(query));
  return [...starts, ...contains];
}
