/**
 * What a character's line looks like in the bubble over its piece: which lines get one, the words
 * it shows, and how long it stays.
 *
 * A bubble is for what a character says aloud on the table. A line kept from some of the room, a
 * notice from the tool, and a line the tool answered as a command (a roll, a resource change) are
 * not speech, and get none.
 */
import { toGraphemes } from '@axe/core/util/graphemes';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import { RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';

/** The most letters a bubble shows before it cuts the words short. */
export const SPEECH_BUBBLE_MAX_LETTERS = 80;
/** The most lines a bubble shows before it cuts the words short. */
export const SPEECH_BUBBLE_MAX_LINES = 4;
/** The most bubbles shown at once; past it the one shown longest gives way. */
export const SPEECH_BUBBLE_LIMIT = 8;

const BASE_MS = 3000;
const PER_LETTER_MS = 90;
const MAX_MS = 9000;
const STAMP_MS = 4000;

/** The mark put where the words were cut short. */
const CUT_SHORT = '…';

const QUOTED = /「([^「」]*)」/g;

/** What a bubble shows: the words, and the stamp sent with them, either of which may be missing. */
export interface SpeechBubbleContent {
  readonly text: string;
  readonly stamp: string | null;
}

function cutShort(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let budget = SPEECH_BUBBLE_MAX_LETTERS;
  let cut = lines.length > SPEECH_BUBBLE_MAX_LINES;
  const kept: string[] = [];
  for (const line of lines.slice(0, SPEECH_BUBBLE_MAX_LINES)) {
    const letters = toGraphemes(line);
    if (letters.length > budget) {
      kept.push(letters.slice(0, budget).join(''));
      cut = true;
      break;
    }
    kept.push(line);
    budget -= letters.length;
    if (budget <= 0 && kept.length < lines.length) {
      cut = true;
      break;
    }
  }
  return kept.join('\n') + (cut ? CUT_SHORT : '');
}

/**
 * The words of a line as a bubble shows them: what is inside 「」 where the line quotes anything,
 * the whole line otherwise, with ruby read as the words it sits on and cut short past
 * {@link SPEECH_BUBBLE_MAX_LETTERS} letters or {@link SPEECH_BUBBLE_MAX_LINES} lines.
 */
export function speechTextOf(text: string): string {
  const plain = `${text ?? ''}`.replace(/\r\n?/g, '\n').replace(RUBY_NOTATION, '$1');
  const quoted = [...plain.matchAll(QUOTED)].map((match) => match[1].trim()).filter((said) => said.length > 0);
  return cutShort(quoted.length > 0 ? quoted.join('\n') : plain);
}

/**
 * Whether a line could be said aloud on the table: said to everyone, in the open, by someone
 * rather than by the tool, and still standing. Whether its tab may be read and whether the tool
 * answered it are asked apart.
 */
export function isSpeechLine(message: ChatMessage): boolean {
  return !(
    message.isDirect ||
    message.isSecret ||
    message.isSystem ||
    message.isSystemMessage ||
    message.isSystemToPL ||
    message.isPseudoDeleted ||
    message.isOutOfStory
  );
}

/** What the bubble for a line shows, or null where it would show nothing. */
export function speechBubbleContentOf(message: ChatMessage): SpeechBubbleContent | null {
  const stamp = message.sentStamp;
  const text = speechTextOf(stamp ? message.saidWithStamp : message.text);
  if (!stamp && text.length < 1) return null;
  return { text, stamp };
}

/** How long a bubble stays: longer for more words, a stamp alone a little longer than a word. */
export function speechBubbleDurationMs(content: SpeechBubbleContent): number {
  const letters = toGraphemes(content.text.replace(/\n/g, '')).length;
  const forWords = letters > 0 ? Math.min(MAX_MS, BASE_MS + letters * PER_LETTER_MS) : 0;
  return content.stamp ? Math.max(STAMP_MS, forWords) : forWords;
}

/** One line, by where it was said, who said it and when. */
export function speechLineKey(tabIdentifier: string, from: string, timestamp: number): string {
  return `${tabIdentifier}\n${from}\n${timestamp}`;
}

/**
 * The lines a notice from the tool answers, where it is an answer: the tool posts its answer to a
 * roll one moment after the line and its answer to a resource change two after, under the name
 * of whoever said it. Empty for anything else.
 */
export function answeredLineKeys(message: ChatMessage): string[] {
  const asker = `${message.originFrom ?? ''}`;
  if (!message.isSystem || asker.length < 1) return [];
  const tab = message.tabIdentifier;
  return [1, 2].map((after) => speechLineKey(tab, asker, message.timestamp - after));
}
