import { toHalfWidth } from '@axe/core/util/string-util';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import type { ChatTab } from '@axe/domain/chat/chat-tab';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { rollTargetSuffix } from '@axe/domain/dice/roll-target-suffix';
import { canRoleEdit, PeerRole } from '@axe/domain/peer/peer-role';

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
 * What may not follow a number to beat written out, for it to be read as one: more figures, a counter,
 * a sum, a decimal, or a range running on to another number.
 */
const NOT_ALONE_AFTER = String.raw`(?![0-9０-９]|[倍つ個回人点体枚割分dDｄＤ]|\s*[+＋\-－−×*/／÷xXｘＸ＊]\s*[0-9０-９(（{｛]|[+＋\-－−×*÷ｘＸ＊]\p{L}|[.．][0-9０-９]|\s*[〜～~ー‐–—]\s*[0-9０-９]|\s*から\s*[0-9０-９])`;

/**
 * A number to beat written out in so many words, as `探索判定：目標値13` writes 13: what follows the
 * word, after a colon, an equals sign or a は, in figures of either width, words after it or not. A
 * reference to the number in braces, `{目標値}`, writes none, and nor does a number a counter
 * follows right after, as `目標値2倍` and `目標値3つ` do, nor one worked on or running to another,
 * as `目標値10+2`, `目標値10+{修正}`, `目標値12／2`, `目標値13〜15`, `目標値13ー15` and
 * `目標値13から15` are, the marks a Japanese keyboard writes among them. A slash before words, as in
 * `目標値12／成功で情報`, only parts it from what follows. A percent after it is the number itself,
 * as a percentile roll writes it. A number put right with an arrow, as `目標値13→15に修正` puts it,
 * is read as the one the arrow points to; see {@link CORRECTED_PATTERN}.
 */
const PRESENTED_PATTERN = new RegExp(
  String.raw`(?<![{｛])目標値\s*[:：=＝は]?\s*([0-9０-９]+)` + NOT_ALONE_AFTER,
  'gu'
);

/**
 * An arrow and the number a number to beat is put right to, as `→15` follows `目標値13`: one read as
 * a number to beat is, so that `目標値13→2d6ダメージ` puts nothing right.
 */
const CORRECTED_PATTERN = new RegExp(String.raw`\s*(?:→|⇒|➡|->|=>)\s*([0-9０-９]+)` + NOT_ALONE_AFTER, 'uy');

/** The number written at `at` and on, or the last one it is put right to with arrows after it. */
function correctedOf(text: string, at: number, written: string): string {
  let number = written;
  CORRECTED_PATTERN.lastIndex = at;
  for (let arrow = CORRECTED_PATTERN.exec(text); arrow; arrow = CORRECTED_PATTERN.exec(text)) number = arrow[1];
  return number;
}

/**
 * The number to beat a line that is not a roll writes out in so many words (see
 * {@link PRESENTED_PATTERN}), where it writes out one: a line naming two different numbers, as one
 * setting two checks at once does, names none to be read as its. Null for a line that names none.
 */
export function presentedTotalOf(text: string): number | null {
  // Most lines say nothing of a number to beat, and are passed over before the pattern is run.
  if (!text.includes(TARGET_NUMBER_REFERENCE)) return null;
  let found: number | null = null;
  for (const matched of text.matchAll(PRESENTED_PATTERN)) {
    const total = Number(toHalfWidth(correctedOf(text, matched.index + matched[0].length, matched[1])));
    if (found != null && found !== total) return null;
    found = total;
  }
  return found;
}

/**
 * What a line comes to as a number to beat: what a dice bot's answer came to, or the number another
 * line writes out (see {@link presentedTotalOf}). Null for a line that comes to none.
 */
export function totalOfLine(message: ChatMessage): number | null {
  const text = `${message.text ?? ''}`;
  return message.isDicebot ? rollTotalOf(text) : presentedTotalOf(text);
}

/**
 * The number to beat for a speaker in a tab: the newest answer rolled at them with `t:`, or else
 * the answer set as the tab's number to beat where it is newer, or else the newest one rolled at
 * nobody by someone else, or written out by a game master (see {@link presentedTotalOf}), whichever
 * came last. An answer kept secret, or one they may not see, is passed over, and so is one rolled at
 * somebody else, which is that one's number to beat, and one to a line that beat a number of its own,
 * as a resistance does, which is nobody's number to beat. Null where none is found.
 */
export function findTargetNumber(tab: ChatTab, speaker: TargetNumberSpeaker): number | null {
  return findTargetNumberSource(tab, speaker)?.total ?? null;
}

/**
 * Where the number to beat was found: rolled at the speaker, set as the tab's, rolled at nobody by
 * someone else, or written out by a game master.
 */
export type TargetNumberFrom = 'aimed' | 'pinned' | 'byOthers' | 'presented';

/** The number to beat for a speaker, with the answer it was read from and how that answer was found. */
export interface TargetNumberSource {
  readonly total: number;
  readonly answer: ChatMessage;
  readonly from: TargetNumberFrom;
}

/** The number to beat for a speaker in a tab, with where it was found; see {@link findTargetNumber}. */
export function findTargetNumberSource(tab: ChatTab, speaker: TargetNumberSpeaker): TargetNumberSource | null {
  const aims = aimsAt(speaker.name);
  const pinned = `${tab.pinnedTargetNumber ?? ''}`;
  const messages = tab.chatMessages;
  let byOthers: TargetNumberSource | null = null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.isSecret || !message.isDisplayable) continue;
    if (!message.isDicebot) {
      const total = presentedTotalOf(`${message.text ?? ''}`);
      if (total == null) continue;
      if (pinned.length > 0 && message.identifier === pinned) return { total, answer: message, from: 'pinned' };
      if (byOthers == null && presentedByGameMaster(message, speaker)) {
        byOthers = { total, answer: message, from: 'presented' };
      }
      continue;
    }
    const text = `${message.text ?? ''}`.trimEnd();
    const total = rollTotalOf(text);
    if (total == null) continue;
    if (aims.some((aim) => text.endsWith(aim)) || aimedAmong(tab, message, speaker)) {
      return { total, answer: message, from: 'aimed' };
    }
    if (pinned.length > 0 && message.identifier === pinned) return { total, answer: message, from: 'pinned' };
    if (byOthers == null && aimOf(text) == null && !rolledBy(tab, message, speaker) && !answeredOne(tab, message)) {
      byOthers = { total, answer: message, from: 'byOthers' };
    }
  }
  return byOthers;
}

/**
 * Whether a line may be set as its tab's number to beat: one shown to all, neither kept secret nor
 * whispered, that comes to a number, a roll or a line writing one out (see {@link totalOfLine}).
 */
export function canPinAsTargetNumber(message: ChatMessage): boolean {
  return !message.isSecret && !message.isDirect && totalOfLine(message) != null;
}

/**
 * Whether a reader of a role may set a tab's number to beat or take it off, which changes the tab
 * for everyone: anyone but a guest, in a tab they may speak in.
 */
export function mayPinTargetNumber(tab: ChatTab, role: PeerRole): boolean {
  return canRoleEdit(role) && canRoleSpeakTab(tab, role);
}

/** An answer a reader may pick as the number to beat for a line they are about to send, with what it came to. */
export interface TargetNumberChoice {
  readonly total: number;
  readonly answer: ChatMessage;
}

/**
 * The newest answers in a tab a reader may pick as the number to beat instead of the one found,
 * newest first and no more than `count`: those they may see that could be set as the tab's number
 * to beat.
 */
export function targetNumberChoices(tab: ChatTab, count: number): TargetNumberChoice[] {
  const choices: TargetNumberChoice[] = [];
  const messages = tab.chatMessages;
  for (let index = messages.length - 1; index >= 0 && choices.length < count; index--) {
    const choice = targetNumberChoiceOf(messages[index]);
    if (choice) choices.push(choice);
  }
  return choices;
}

/** An answer as a number to beat a reader may pick, where it is one they may see that could be set as the tab's; null otherwise. */
export function targetNumberChoiceOf(answer: ChatMessage): TargetNumberChoice | null {
  if (!answer.isDisplayable || !canPinAsTargetNumber(answer)) return null;
  const total = totalOfLine(answer);
  return total == null ? null : { total, answer };
}

/** Who rolled an answer, from the name the dice bot answered under, or that name as it is where it says no roller. */
export function rollerOf(answer: ChatMessage): string {
  const name = `${answer.name ?? ''}`;
  return /^<(?:Secret-)?BCDice：(.*)>$/.exec(name)?.[1] ?? name;
}

/**
 * The roll an answer was rolled for, as the dice bot wrote it in brackets after the system's name,
 * `(2D6+5)` in `DiceBot : (2D6+5) → 12`; empty where it wrote none.
 */
export function rolledOf(answer: ChatMessage): string {
  return /^[^\n(]*?:\s*\(([^()\n]+)\)/.exec(`${answer.text ?? ''}`)?.[1] ?? '';
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
 * `t:範囲` aims it: the line it answers keeps who they were, the names after the answer being only
 * what fitted in its brackets.
 */
function aimedAmong(tab: ChatTab, answer: ChatMessage, speaker: TargetNumberSpeaker): boolean {
  if (speaker.identifier.length < 1) return false;
  const line = tab.findRollSource(answer);
  return line != null && aimedTogetherAt(line).includes(speaker.identifier);
}

/** The identifiers of the pieces a line was aimed at all at once; none for any other line, or a list that cannot be read. */
function aimedTogetherAt(line: ChatMessage): string[] {
  const written = `${line.aimedTogether ?? ''}`;
  if (written.length < 1) return [];
  try {
    const read: unknown = JSON.parse(written);
    return Array.isArray(read) ? read.filter((one): one is string => typeof one === 'string') : [];
  } catch {
    return [];
  }
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

/**
 * Whether a line writing out a number to beat was said by a game master, as they were when they said
 * it, and not by the speaker: a line of a room that never wrote down who said it is nobody's.
 */
function presentedByGameMaster(message: ChatMessage, speaker: TargetNumberSpeaker): boolean {
  return message.senderRole === PeerRole.GameMaster && `${message.sendFrom ?? ''}` !== speaker.identifier;
}

/** Whether the speaker said the line an answer answers. */
function rolledBy(tab: ChatTab, answer: ChatMessage, speaker: TargetNumberSpeaker): boolean {
  const source = tab.findRollSource(answer);
  if (source) return source.sendFrom === speaker.identifier;
  return answer.name === `<BCDice：${speaker.name}>`;
}
