import { generateUuid } from '@axe/core/util/uuid';
import {
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';

export const INSERTABLE_KINDS: readonly ReplayEventKind[] = [
  ReplayEventKind.ChatMessage,
  ReplayEventKind.ChatDice,
  ReplayEventKind.Marker,
];

const TEXTABLE_KINDS: ReadonlySet<ReplayEventKind> = new Set(INSERTABLE_KINDS);

export interface ReplayEntryDraft {
  kind: ReplayEventKind;
  actorId: string;
  speaker: string;
  text: string;
  tabIdentifier: string;
  imageIdentifier?: string;
  chatColor?: string;
  /** Who may see the line, as those who could read its tab there; public when not given. */
  visibility?: ReplayVisibility;
}

export const DICEBOT_SENDER = 'System-BCDice';

/**
 * Whether a line speaks for who could read its tab: a chat or dice line said to the tab, rather
 * than a whisper or a secret roll kept to its own readers (an older recording kept a secret roll to
 * the GM), and one the editor `sees`.
 */
function speaksForTab(event: ReplayEvent, sees: (event: ReplayEvent) => boolean): boolean {
  return (
    (event.kind === ReplayEventKind.ChatMessage || event.kind === ReplayEventKind.ChatDice) &&
    event.visibility.kind !== 'direct' &&
    !String(event.detail['tag'] ?? '').includes('secret') &&
    sees(event)
  );
}

/**
 * The chat tab of the nearest line before a position that names one, or failing that the nearest
 * after, so a line inserted there lands in the same tab. Only lines said to their tab that the
 * editor `sees` are looked at, so a line is not put in a tab kept from whoever writes it, as a
 * whisper to them there would.
 *
 * Empty when no line names a tab.
 */
export function chatTabIdentifierNear(
  events: readonly ReplayEvent[],
  atIndex: number,
  sees: (event: ReplayEvent) => boolean = () => true
): string {
  const tabOf = (event: ReplayEvent) => (speaksForTab(event, sees) ? String(event.detail['tabIdentifier'] ?? '') : '');
  for (let index = Math.min(atIndex, events.length) - 1; index >= 0; index--) {
    const tab = tabOf(events[index]);
    if (tab.length > 0) return tab;
  }
  for (let index = Math.max(0, atIndex); index < events.length; index++) {
    const tab = tabOf(events[index]);
    if (tab.length > 0) return tab;
  }
  return '';
}

/**
 * Who could read a tab at a position, as the nearest line said in it before, or failing that
 * after, was kept: a line inserted there is kept the same way. Only lines that speak for their tab
 * are looked at. Public when no line says.
 */
export function tabVisibilityNear(
  events: readonly ReplayEvent[],
  atIndex: number,
  tabIdentifier: string,
  sees: (event: ReplayEvent) => boolean = () => true
): ReplayVisibility {
  const says = (event: ReplayEvent) => event.detail['tabIdentifier'] === tabIdentifier && speaksForTab(event, sees);
  for (let index = Math.min(atIndex, events.length) - 1; index >= 0; index--) {
    if (says(events[index])) return events[index].visibility;
  }
  for (let index = Math.max(0, atIndex); index < events.length; index++) {
    if (says(events[index])) return events[index].visibility;
  }
  return PUBLIC_VISIBILITY;
}

/** Whether the replay editor can insert events of this kind: a chat line, a dice line or a marker. */
export function isInsertableKind(kind: ReplayEventKind): boolean {
  return INSERTABLE_KINDS.includes(kind);
}

/**
 * Builds the event for a line inserted in the replay editor.
 *
 * A marker keeps its text as a label. A chat line gets a fresh message identifier and a patch
 * that creates the message in its tab; a dice line is sent as the dice bot, with no picture or
 * colour. A marker is public, and a line is kept as the draft says; its offset is left at 0 until
 * the list is restamped.
 */
export function createReplayEntry(draft: ReplayEntryDraft, seq: number, at: number): ReplayEvent {
  if (draft.kind === ReplayEventKind.Marker) {
    return {
      seq,
      at,
      t: 0,
      kind: draft.kind,
      actorId: draft.actorId,
      detail: { label: draft.text },
      visibility: PUBLIC_VISIBILITY,
    };
  }

  const isDice = draft.kind === ReplayEventKind.ChatDice;
  const from = isDice ? DICEBOT_SENDER : draft.actorId;
  const tag = isDice ? 'system' : '';
  const identifier = generateUuid();
  const imageIdentifier = isDice ? '' : (draft.imageIdentifier ?? '');
  const chatColor = isDice ? '' : (draft.chatColor ?? '');

  return {
    seq,
    at,
    t: 0,
    kind: draft.kind,
    actorId: draft.actorId,
    targetId: identifier,
    detail: {
      text: draft.text,
      name: draft.speaker,
      from,
      to: '',
      tag,
      dicebot: '',
      timestamp: at,
      tabIdentifier: draft.tabIdentifier,
      imageIdentifier,
      messColor: chatColor,
    },
    patch: {
      identifier,
      aliasName: 'chat',
      before: {},
      after: {
        value: draft.text,
        parentIdentifier: draft.tabIdentifier,
        majorIndex: 0,
        minorIndex: 0,
        'attributes.from': from,
        'attributes.to': '',
        'attributes.name': draft.speaker,
        'attributes.tag': tag,
        'attributes.dicebot': '',
        'attributes.timestamp': at,
        'attributes.imageIdentifier': imageIdentifier,
        'attributes.messColor': chatColor,
        'attributes.originFrom': draft.actorId,
      },
    },
    visibility: draft.visibility ?? PUBLIC_VISIBILITY,
  };
}

/**
 * Works each event's offset out afresh from the time of the first event, never below 0.
 *
 * An event whose offset comes out the same is handed back as it was, so an edit to one event of
 * a long recording copies that one rather than every event.
 */
export function restampReplayTimes(events: readonly ReplayEvent[]): ReplayEvent[] {
  const origin = events[0]?.at ?? 0;
  return events.map((event) => {
    const t = Math.max(0, event.at - origin);
    return t === event.t ? event : { ...event, t };
  });
}

/**
 * Inserts one event at a position, keeping its own sequence number and time, and restamps the
 * offsets. A chat line is said just after the line before it in its tab.
 */
export function insertReplayEvent(events: readonly ReplayEvent[], atIndex: number, event: ReplayEvent): ReplayEvent[] {
  const next = [...events];
  next.splice(Math.max(0, Math.min(next.length, atIndex)), 0, event);
  return restampReplayTimes(withChatMoments(next, new Set([event.seq])));
}

/**
 * Inserts several events at a position and restamps the offsets.
 *
 * They are given sequence numbers above any already used and times spread evenly between their
 * new neighbours. Inserting nothing hands back the list unchanged.
 */
export function insertReplayEvents(
  events: readonly ReplayEvent[],
  atIndex: number,
  entries: readonly ReplayEvent[],
  seqFloor = 0
): ReplayEvent[] {
  if (entries.length < 1) return [...events];

  const index = Math.max(0, Math.min(events.length, atIndex));
  const seqBase = nextInsertSeq(events, seqFloor);
  const times = spreadInsertTimes(events, index, entries.length);
  const placed = entries.map((entry, offset) => ({ ...entry, seq: seqBase + offset, at: times[offset] }));

  const next = [...events];
  next.splice(index, 0, ...placed);
  return restampReplayTimes(withChatMoments(next, new Set(placed.map((event) => event.seq))));
}

/**
 * Times for events inserted at a position, spread evenly strictly between the neighbours' times.
 *
 * At either end of the list, or when both neighbours share a time, they follow on about a
 * millisecond apart.
 */
export function spreadInsertTimes(events: readonly ReplayEvent[], atIndex: number, count: number): number[] {
  const before = events[atIndex - 1]?.at;
  const after = events[atIndex]?.at;
  const start = before ?? after ?? 0;
  const end = after ?? (before ?? 0) + count;
  const span = Math.max(0, end - start);
  const step = span > 0 ? span / (count + 1) : 1;
  return Array.from({ length: count }, (_, offset) => Math.round(start + step * (offset + 1)));
}

const MOMENT_KEY = 'attributes.timestamp';

/** Who says a dice result or a resource notice, which follows the line that asked for it a moment or two after it. */
const ANSWER_SENDERS: ReadonlySet<string> = new Set([DICEBOT_SENDER, 'System']);

/** How many moments after the line it answers a dice result, and then a resource notice, is said. */
const ANSWER_GAPS = [1, 2];

/**
 * How many moments an answer left behind wants kept free for it ahead of the next line kept, when a
 * line moved in before it is placed: its own, and the ones just after its asker's lines, which would
 * take it as theirs. Whether a result left behind stays where it is counts one, as staying it needs
 * only its own.
 */
const LEFT_ANSWER_ROOM = ANSWER_GAPS.length + 1;

interface ChatLine {
  index: number;
  tab: string;
  /** The message the line makes, which a line made again later makes too. */
  message: string;
  /** Who says the line, which with its tab and its moment is what ties an answer to it. */
  speaker: string;
  /** For a dice result or a notice, who asked for it, whose line it answers; empty for any other line. */
  asker: string;
  moment: number;
  /** The fraction the chat adds to the moment to sort lines said at the same one. */
  minor: number;
  /** The line this one answers, and how many moments after it, when it is an answer whose line is in the list. */
  answers: { seq: number; gap: number } | null;
}

/** When a chat line is said: its moment, and the fraction the chat sorts by besides. */
interface Said {
  moment: number;
  minor: number;
}

/**
 * The list with each chat line in `moved` said afresh, so that the chat on a replayed board, which
 * orders a tab's lines by their moments and a fraction of their own, orders them as the list does.
 *
 * A moved line is said after the line before it in its tab and after that line's answers, and
 * before the next line there that keeps its moment. Moments are taken from the lines, not from the
 * list's times, which may run on another clock, and are whole where there is room; only where
 * there is none does the line take the fraction between its neighbours. A dice result or a resource
 * notice stays the moment or two after the line it answers, as that moment is what ties the two,
 * while it follows that line in the list and either of them moved; one moved above its line goes
 * its own way, as does one whose line moved away below it, or one in `untied` whose line is gone,
 * staying at its moment where that ties it to no other line and still falls in its place, and
 * otherwise said afresh where it ties to none. A message made again later in the list, as one taken back
 * and given back, is said when its first making now is. Every other line keeps its moment.
 */
function withChatMoments(
  events: readonly ReplayEvent[],
  moved: ReadonlySet<number>,
  untied: ReadonlySet<number> = new Set()
): ReplayEvent[] {
  const lines = chatLinesOf(events);
  const followed = (seq: number): boolean => {
    const line = lines.get(seq);
    const answered = line?.answers ? lines.get(line.answers.seq) : undefined;
    return !!answered && answered.index < line!.index;
  };
  const leftBehind = new Set(untied);
  for (const [seq, line] of lines) {
    if (line.answers && moved.has(line.answers.seq) && !followed(seq)) leftBehind.add(seq);
  }
  for (const seq of leftBehind) {
    const line = lines.get(seq);
    if (line) line.answers = null;
  }
  const retold = new Set<number>();
  for (const [seq, line] of lines) {
    if (moved.has(seq) || leftBehind.has(seq) || (followed(seq) && moved.has(line.answers!.seq))) retold.add(seq);
  }
  if (retold.size < 1) return [...events];

  const firstMaking = new Map<string, number>();
  const remade = new Map<number, number>();
  for (const event of events) {
    const line = lines.get(event.seq);
    if (!line || line.message === '') continue;
    const first = firstMaking.get(line.message);
    if (first === undefined) firstMaking.set(line.message, event.seq);
    else if (retold.has(first) && !moved.has(event.seq)) remade.set(event.seq, first);
  }
  for (const seq of remade.keys()) retold.add(seq);

  const answerTops = new Map<number, number>();
  for (const [seq, line] of lines) {
    if (!followed(seq)) continue;
    const top = line.answers!.gap + line.minor;
    answerTops.set(line.answers!.seq, Math.max(answerTops.get(line.answers!.seq) ?? 0, top));
  }

  const nextKept = new Map<number, number>();
  const ahead = new Map<string, number>();
  for (let index = events.length - 1; index >= 0; index--) {
    const seq = events[index].seq;
    const line = lines.get(seq);
    if (!line) continue;
    if (retold.has(seq)) {
      const kept = ahead.get(line.tab);
      if (kept !== undefined) nextKept.set(seq, kept);
    } else if (!followed(seq)) {
      ahead.set(line.tab, line.moment + line.minor);
    }
  }

  const roomWanted = new Map<number, number>();
  const stayWanted = new Map<number, number>();
  const wantedAhead = new Map<string, number>();
  const stayAhead = new Map<string, number>();
  for (let index = events.length - 1; index >= 0; index--) {
    const seq = events[index].seq;
    const line = lines.get(seq);
    if (!line) continue;
    if (retold.has(seq)) {
      roomWanted.set(seq, wantedAhead.get(line.tab) ?? 0);
      stayWanted.set(seq, stayAhead.get(line.tab) ?? 0);
      if (remade.has(seq) || (followed(seq) && retold.has(line.answers!.seq))) continue;
      const top = answerTops.get(seq) ?? 0;
      const own = top > 0 ? Math.ceil(top) + 1 : 1;
      wantedAhead.set(
        line.tab,
        (wantedAhead.get(line.tab) ?? 0) + (top === 0 && line.asker !== '' ? LEFT_ANSWER_ROOM : own)
      );
      stayAhead.set(line.tab, (stayAhead.get(line.tab) ?? 0) + own);
    } else if (!followed(seq)) {
      wantedAhead.set(line.tab, 0);
      stayAhead.set(line.tab, 0);
    }
  }

  const keyOf = (tab: string, speaker: string, moment: number) => `${tab}\0${speaker}\0${moment}`;
  const count = (counts: Map<string, number>, key: string, by: number) => counts.set(key, (counts.get(key) ?? 0) + by);
  const linesAhead = new Map<string, number>();
  const linesBehind = new Set<string>();
  const answersAt = new Map<string, number>();
  const followers = new Map<number, ChatLine[]>();
  for (const [seq, line] of lines) {
    if (!retold.has(seq)) {
      count(linesAhead, keyOf(line.tab, line.speaker, line.moment), 1);
      if (line.asker !== '') count(answersAt, keyOf(line.tab, line.asker, line.moment), 1);
    } else if (followed(seq) && !remade.has(seq)) {
      const answered = lines.get(line.answers!.seq)!;
      if (retold.has(line.answers!.seq)) {
        followers.set(line.answers!.seq, [...(followers.get(line.answers!.seq) ?? []), line]);
      } else {
        count(answersAt, keyOf(line.tab, line.asker, answered.moment + line.answers!.gap), 1);
      }
    }
  }
  const clashes = (line: ChatLine, answerTop: number) => (moment: number) => {
    const says = (speaker: string, at: number) =>
      (linesAhead.get(keyOf(line.tab, speaker, at)) ?? 0) > 0 || linesBehind.has(keyOf(line.tab, speaker, at));
    const answered = (at: number) => (answersAt.get(keyOf(line.tab, line.speaker, at)) ?? 0) > 0;
    if (line.asker !== '' && (says(line.asker, moment - 1) || says(line.asker, moment - 2))) return true;
    if (answerTop > 0) {
      const noticed = answerTop >= ANSWER_GAPS[1];
      return (
        says(line.speaker, moment) ||
        (noticed && says(line.speaker, moment + 1)) ||
        answered(moment + 1) ||
        answered(moment + 2)
      );
    }
    if (linesBehind.has(keyOf(line.tab, line.speaker, moment))) return false;
    return answered(moment + 1) || (answered(moment + 2) && !says(line.speaker, moment + 1));
  };

  const said = new Map<number, Said>();
  const passed = new Map<string, number>();
  return events.map((event) => {
    const line = lines.get(event.seq);
    if (!line) return event;
    const answerTop = answerTops.get(event.seq) ?? 0;
    const isFollower = retold.has(event.seq) && followed(event.seq) && !remade.has(event.seq);
    let when: Said = { moment: line.moment, minor: line.minor };
    if (!retold.has(event.seq)) count(linesAhead, keyOf(line.tab, line.speaker, line.moment), -1);
    if (remade.has(event.seq)) {
      when = said.get(remade.get(event.seq)!)!;
    } else if (isFollower) {
      when = { moment: said.get(line.answers!.seq)!.moment + line.answers!.gap, minor: line.minor };
    } else if (retold.has(event.seq)) {
      const after = passed.get(line.tab);
      const before = nextKept.get(event.seq);
      const key = line.moment + line.minor;
      const mayStay =
        leftBehind.has(event.seq) &&
        !moved.has(event.seq) &&
        (after === undefined || after < key) &&
        (before === undefined || key < before) &&
        !clashes(line, answerTop)(line.moment);
      const elsewhere = saidBetween(
        after,
        before,
        answerTop,
        when,
        clashes(line, answerTop),
        roomWanted.get(event.seq) ?? 0
      );
      const staysPut =
        mayStay &&
        (before === undefined ||
          Math.ceil(before) - line.moment - 1 >= (stayWanted.get(event.seq) ?? 0) ||
          elsewhere.moment + elsewhere.minor >= key);
      if (!staysPut) when = elsewhere;
    }
    linesBehind.add(keyOf(line.tab, line.speaker, when.moment));
    if (retold.has(event.seq) && !isFollower && line.asker !== '')
      count(answersAt, keyOf(line.tab, line.asker, when.moment), 1);
    for (const follower of followers.get(event.seq) ?? []) {
      count(answersAt, keyOf(follower.tab, follower.asker, when.moment + follower.answers!.gap), 1);
    }
    said.set(event.seq, when);
    const reach = Math.max(when.moment + when.minor, answerTop > 0 ? when.moment + answerTop : -Infinity);
    passed.set(line.tab, Math.max(passed.get(line.tab) ?? reach, reach));
    return when.moment === line.moment && when.minor === line.minor ? event : withMoment(event, when);
  });
}

/**
 * How far from nothing a moment can be and still be counted on, with every moment a line could be
 * moved to around it: well inside the numbers counted exactly.
 */
const COUNTABLE_MOMENT = 2 ** 52;

/**
 * The chat lines of the list that carry a moment, by sequence number, with the line each answer
 * answers. A moment that is no number, or too large to count on the moments around it, counts as
 * none; a fraction that is no number, or not one, counts as nothing.
 */
function chatLinesOf(events: readonly ReplayEvent[]): Map<number, ChatLine> {
  const lines = new Map<number, ChatLine>();
  const bySpeaker = new Map<string, number>();
  const keyOf = (tab: string, speaker: string, moment: number) => `${tab}\0${speaker}\0${moment}`;
  events.forEach((event, index) => {
    const after = event.patch?.after;
    const moment = after?.[MOMENT_KEY];
    if (!after || typeof moment !== 'number' || !(Math.abs(moment) < COUNTABLE_MOMENT)) return;
    const tab = String(after['parentIdentifier'] ?? event.detail['tabIdentifier'] ?? '');
    const fraction = after['minorIndex'];
    const minor = typeof fraction === 'number' && fraction >= 0 && fraction < 1 ? fraction : 0;
    const speaker = String(after['attributes.from'] ?? '');
    const asker = ANSWER_SENDERS.has(speaker) ? String(after['attributes.originFrom'] ?? '') : '';
    const message = event.patch?.identifier ?? '';
    lines.set(event.seq, { index, tab, message, speaker, asker, moment, minor, answers: null });
    const key = keyOf(tab, speaker, moment);
    if (!bySpeaker.has(key)) bySpeaker.set(key, event.seq);
  });
  for (const line of lines.values()) {
    if (line.asker === '') continue;
    for (const gap of ANSWER_GAPS) {
      const seq = bySpeaker.get(keyOf(line.tab, line.asker, line.moment - gap));
      if (seq !== undefined && lines.get(seq) !== line) {
        line.answers = { seq, gap };
        break;
      }
    }
  }
  return lines;
}

/**
 * When to say a line placed after lines that reach as far as `after` in the chat's order and before
 * one sorting at `before`, either of which may be missing, its own answers reaching `answerTop`
 * past its moment. A line with nothing either side keeps `own`. It never takes a moment `clashes`
 * says would hand an answer to another line than its own, as an answer goes to whichever line of
 * its asker said the moment before it comes first. A whole moment is taken where there is room for
 * the line and its answers; a line with no answers otherwise takes a fraction past `after` within
 * its moment. Where there is no room at all, as lines said by clocks that disagree can leave, it
 * goes after `after`, so that it is never said before a line that comes before it in the list. With
 * `wanted` whole moments to be left behind it for lines moved in after it, a place leaving them is
 * taken first.
 */
function saidBetween(
  after: number | undefined,
  before: number | undefined,
  answerTop: number,
  own: Said,
  clashes: (moment: number) => boolean,
  wanted = 0
): Said {
  if (after === undefined) {
    if (before === undefined) return own;
    let moment = Math.floor(before - answerTop) - 1;
    while (clashes(moment)) moment--;
    return { moment, minor: 0 };
  }
  if (before !== undefined && before > after) {
    const reach = answerTop > 0 ? Math.ceil(answerTop) : 0;
    for (let moment = Math.floor(after) + 1; moment + reach + wanted < before; moment++) {
      if (!clashes(moment)) return { moment, minor: 0 };
    }
    const at = Math.floor(after);
    if (wanted > 0 && answerTop === 0 && !clashes(at) && at + wanted < before)
      return { moment: at, minor: (after + Math.min(at + 1, before)) / 2 - at };
    for (let moment = Math.floor(after) + 1; moment + answerTop < before; moment++) {
      if (!clashes(moment)) return { moment, minor: 0 };
    }
    const moment = Math.floor(after);
    if (answerTop === 0 && !clashes(moment))
      return { moment, minor: (after + Math.min(moment + 1, before)) / 2 - moment };
  }
  let moment = Math.floor(after) + 1;
  while (clashes(moment)) moment++;
  return { moment, minor: 0 };
}

/**
 * The event with its chat line said at a moment and sorted by a fraction, both in what is shown
 * and in the message its patch creates.
 */
function withMoment(event: ReplayEvent, when: Said): ReplayEvent {
  return {
    ...event,
    detail: 'timestamp' in event.detail ? { ...event.detail, timestamp: when.moment } : event.detail,
    patch: { ...event.patch!, after: { ...event.patch!.after, [MOMENT_KEY]: when.moment, minorIndex: when.minor } },
  };
}

/**
 * The sequence number for a new event: one above the highest in the list, and above `floor`, the
 * highest already handed out, so that a number taken back with what it was on is never given again.
 */
export function nextInsertSeq(events: readonly ReplayEvent[], floor = 0): number {
  return events.reduce((highest, event) => Math.max(highest, event.seq), floor) + 1;
}

/** A time for an event placed at a position: halfway between its neighbours, or the one neighbour's time at an end. */
export function insertTimeAt(events: readonly ReplayEvent[], atIndex: number): number {
  if (events.length < 1) return 0;
  const before = events[atIndex - 1];
  const after = events[atIndex];
  if (before && after) return Math.round((before.at + after.at) / 2);
  return before ? before.at : after.at;
}

/** Whether the replay editor lets the text of this event be rewritten: a chat line, a dice line or a marker. */
export function isTextEditable(event: ReplayEvent): boolean {
  return TEXTABLE_KINDS.has(event.kind);
}

/** The text an event shows: a marker's label, or the text of anything else. Empty when it has none. */
export function textOf(event: ReplayEvent): string {
  const key = event.kind === ReplayEventKind.Marker ? 'label' : 'text';
  return String(event.detail[key] ?? '');
}

/** Takes the event with the given sequence number out of the list and restamps the offsets, as removeReplayEvents does. */
export function removeReplayEvent(events: readonly ReplayEvent[], seq: number): ReplayEvent[] {
  return removeReplayEvents(events, new Set([seq]));
}

/**
 * Takes every event with one of these sequence numbers out of the list and restamps the offsets
 * once. A dice result or a notice whose line is taken out, and not made again further on, is said
 * afresh where it ties to no other line of the speaker, as its moment could otherwise tie it to
 * one said a moment or two before; one whose moment ties it to none stays where it is.
 */
export function removeReplayEvents(events: readonly ReplayEvent[], seqs: ReadonlySet<number>): ReplayEvent[] {
  if (seqs.size < 1) return [...events];
  const lines = chatLinesOf(events);
  const madeStill = new Set<string>();
  for (const [seq, line] of lines) {
    if (!seqs.has(seq) && line.message !== '') madeStill.add(line.message);
  }
  const orphans = new Set<number>();
  for (const [seq, line] of lines) {
    const answered = line.answers ? lines.get(line.answers.seq) : undefined;
    if (!answered || seqs.has(seq) || !seqs.has(line.answers!.seq) || madeStill.has(answered.message)) continue;
    orphans.add(seq);
  }
  const kept = events.filter((event) => !seqs.has(event.seq));
  return restampReplayTimes(orphans.size > 0 ? withChatMoments(kept, new Set(), orphans) : kept);
}

/**
 * Moves each chosen event one place up (`-1`) or down (`1`), keeping the chosen events in the same
 * order and the same distance apart, and restamps the offsets once.
 *
 * A place is counted by the events `isStop` accepts, every event unless told otherwise: a list that
 * leaves some events out moves a chosen one past the next it shows, over any it leaves out on the
 * way. An event that would pass the end of the list, or run into a chosen event that cannot move,
 * stays where it is. Each event that moves takes a time between its new neighbours.
 */
export function stepReplayEvents(
  events: readonly ReplayEvent[],
  seqs: ReadonlySet<number>,
  direction: -1 | 1,
  isStop: (event: ReplayEvent) => boolean = () => true
): ReplayEvent[] {
  const next = [...events];
  const order = next.map((_, index) => index).filter((index) => seqs.has(next[index].seq));
  if (direction === 1) order.reverse();
  const passes = (at: number): boolean => at >= 0 && at < next.length && !seqs.has(next[at].seq) && !isStop(next[at]);
  const moved = new Set<number>();
  for (const index of order) {
    let target = index + direction;
    while (passes(target)) target += direction;
    if (target < 0 || target >= next.length || seqs.has(next[target].seq)) continue;
    const [event] = next.splice(index, 1);
    next.splice(target, 0, { ...event, at: insertTimeAt(next, target) });
    moved.add(event.seq);
  }
  return restampReplayTimes(withChatMoments(next, moved));
}

/**
 * Moves an event up or down the list by a number of places, giving it a time between its new
 * neighbours, and restamps the offsets.
 *
 * The list comes back unchanged when no event has that sequence number or the move goes nowhere
 * or past either end.
 */
export function moveReplayEvent(events: readonly ReplayEvent[], seq: number, offset: number): ReplayEvent[] {
  const index = events.findIndex((event) => event.seq === seq);
  if (index < 0) return [...events];

  const target = index + offset;
  if (offset === 0 || target < 0 || target >= events.length) return [...events];

  const next = [...events];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, { ...moved, at: insertTimeAt(next, target) });
  return restampReplayTimes(withChatMoments(next, new Set([seq])));
}

/**
 * Rewrites the text of the event with the given sequence number.
 *
 * A marker's label is replaced; a chat line's text is replaced both in what is shown and in the
 * message its patch creates. An event whose text cannot be edited is left alone.
 */
export function retextReplayEvent(events: readonly ReplayEvent[], seq: number, text: string): ReplayEvent[] {
  return events.map((event) => {
    if (event.seq !== seq || !isTextEditable(event)) return event;
    if (event.kind === ReplayEventKind.Marker) {
      return { ...event, detail: { ...event.detail, label: text } };
    }
    return {
      ...event,
      detail: { ...event.detail, text },
      patch: event.patch ? { ...event.patch, after: { ...event.patch.after, value: text } } : undefined,
    };
  });
}

/** The lowest sequence number in the list, or positive infinity for an empty list. */
export function earliestReplaySeq(events: readonly ReplayEvent[]): number {
  return events.reduce((lowest, event) => Math.min(lowest, event.seq), Number.POSITIVE_INFINITY);
}

/** Each event's current sequence number mapped to the one `resequenceReplayEvents` will give it. */
export function replaySeqRemap(events: readonly ReplayEvent[]): ReadonlyMap<number, number> {
  return new Map(events.map((event, index) => [event.seq, index + 1]));
}

/** Numbers the events 1, 2, 3 and on in list order, and restamps the offsets from the first. */
export function resequenceReplayEvents(events: readonly ReplayEvent[]): ReplayEvent[] {
  const origin = events[0]?.at ?? 0;
  return events.map((event, index) => ({ ...event, seq: index + 1, t: Math.max(0, event.at - origin) }));
}

/**
 * Whether an edited list differs from the original.
 *
 * Only the length, and the sequence number and text at each position, are compared; a change
 * of time alone does not count.
 */
export function hasReplayEdits(original: readonly ReplayEvent[], edited: readonly ReplayEvent[]): boolean {
  if (original.length !== edited.length) return true;
  return original.some((event, index) => {
    const other = edited[index];
    return event.seq !== other.seq || textOf(event) !== textOf(other);
  });
}
