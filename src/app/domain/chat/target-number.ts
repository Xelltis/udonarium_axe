import type { ChatMessage } from '@axe/domain/chat/chat-message';
import type { ChatTab } from '@axe/domain/chat/chat-tab';
import { rollTargetSuffix, TOGETHER_SEPARATOR } from '@axe/domain/dice/roll-target-suffix';

/**
 * The reference a line fills in with the number it has to beat: what was last rolled against the
 * speaker, as `2d+{生命抵抗}>={目標値}` resists the spell just cast at them. A sheet or palette item
 * of the same name answers it first, as it answers any reference.
 */
export const TARGET_NUMBER_REFERENCE = '目標値';

const TARGET_NUMBER_PATTERN = /(?<![tTｔＴ])[{｛]\s*目標値\s*[}｝]/g;
const HOLDS_TARGET_NUMBER = new RegExp(TARGET_NUMBER_PATTERN.source);

/** Who speaks a line, as the rolls made against them and by them are told by. */
export interface TargetNumberSpeaker {
  identifier: string;
  name: string;
}

/** Whether a reference, its braces taken off, is the one filled in with the number to beat. */
export function isTargetNumberReference(name: string): boolean {
  return name.trim() === TARGET_NUMBER_REFERENCE;
}

/** Whether a line holds the reference to the number to beat, waiting to be filled in. */
export function holdsTargetNumber(text: string): boolean {
  return HOLDS_TARGET_NUMBER.test(text);
}

/**
 * Fills the references to the number to beat in a line, asking for the number only where there is
 * one, and leaving them as typed where nothing has been rolled to beat.
 */
export function fillTargetNumber(text: string, total: () => number | null): string {
  if (!holdsTargetNumber(text)) return text;
  const found = total();
  return found == null ? text : text.replace(TARGET_NUMBER_PATTERN, String(found));
}

/**
 * What a dice bot's answer came to: the last number its arrows lead to, the name of whoever it was
 * rolled at taken off first. Null for an answer that comes to no number, as a choice does.
 */
export function rollTotalOf(text: string): number | null {
  const steps = withoutAim(text).split('→');
  for (let index = steps.length - 1; index > 0; index--) {
    const step = steps[index].trim();
    if (/^-?\d+$/.test(step)) return Number(step);
  }
  return null;
}

/**
 * The number to beat for a speaker in a tab: the newest answer rolled at them with `t:`, or else
 * the newest one rolled at nobody by someone else. An answer kept secret, or one they may not see,
 * is passed over, and so is one rolled at somebody else, which is that one's number to beat, and one
 * to a line that beat a number of its own, as a resistance does, which is nobody's number to beat.
 * Null where none is found.
 */
export function findTargetNumber(tab: ChatTab, speaker: TargetNumberSpeaker): number | null {
  const aims = aimsAt(speaker.name);
  const messages = tab.chatMessages;
  let byOthers: number | null = null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message.isDicebot || message.isSecret || !message.isDisplayable) continue;
    const text = `${message.text ?? ''}`.trimEnd();
    const total = rollTotalOf(text);
    if (total == null) continue;
    if (aims.some((aim) => text.endsWith(aim)) || aimedAmong(text, speaker.name)) return total;
    if (byOthers == null && aimOf(text) == null && !rolledBy(tab, message, speaker) && !answeredOne(tab, message)) {
      byOthers = total;
    }
  }
  return byOthers;
}

/**
 * The number to beat for a speaker in a tab, looked for the first time it is asked for and kept: a
 * line and every copy of it aimed at a target are filled in with the same number.
 */
export function targetNumberOnce(tab: ChatTab, speaker: TargetNumberSpeaker): () => number | null {
  let found: number | null | undefined;
  return () => {
    if (found === undefined) found = findTargetNumber(tab, speaker);
    return found;
  };
}

/** The ways the name of somebody rolled at stands after an answer: as it is, or as a room server takes it. */
function aimsAt(name: string): string[] {
  if (name.length < 1) return [];
  return [...new Set([` [${name}]`, rollTargetSuffix(name) ?? ''])].filter((aim) => aim.length > 0);
}

/**
 * Whether an answer was rolled at the speaker among everyone a line was aimed at all at once, as
 * `t:範囲` aims it: their names stand in the brackets after it one after another.
 */
function aimedAmong(text: string, name: string): boolean {
  const aim = aimOf(text);
  if (aim == null || !aim.includes(TOGETHER_SEPARATOR) || name.length < 1) return false;
  const asTaken = rollTargetSuffix(name)?.slice(2, -1);
  return aim.split(TOGETHER_SEPARATOR).some((one) => one === name || one === asTaken);
}

/** The name of whoever an answer was rolled at, from the brackets after it; null for an answer rolled at nobody. */
function aimOf(text: string): string | null {
  return / \[([^[\]\n]+)\]$/.exec(text)?.[1] ?? null;
}

function withoutAim(text: string): string {
  const trimmed = text.trimEnd();
  const aim = aimOf(trimmed);
  return aim == null ? trimmed : trimmed.slice(0, -(aim.length + 3));
}

/** Whether the line an answer answers was said to beat a number of its own, filled in for its `{目標値}`. */
function answeredOne(tab: ChatTab, answer: ChatMessage): boolean {
  return tab.findRollSource(answer)?.answersTargetNumber === '1';
}

/** Whether the speaker said the line an answer answers. */
function rolledBy(tab: ChatTab, answer: ChatMessage, speaker: TargetNumberSpeaker): boolean {
  const source = tab.findRollSource(answer);
  if (source) return source.sendFrom === speaker.identifier;
  return answer.name === `<BCDice：${speaker.name}>`;
}
