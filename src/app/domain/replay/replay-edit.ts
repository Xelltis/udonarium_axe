import { generateUuid } from '@axe/core/util/uuid';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';

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
}

export const DICEBOT_SENDER = 'System-BCDice';

/**
 * The chat tab of the nearest event before a position that names one, or failing that the
 * nearest after, so a line inserted there lands in the same tab.
 *
 * Empty when no event names a tab.
 */
export function chatTabIdentifierNear(events: readonly ReplayEvent[], atIndex: number): string {
  for (let index = Math.min(atIndex, events.length) - 1; index >= 0; index--) {
    const tab = String(events[index].detail['tabIdentifier'] ?? '');
    if (tab.length > 0) return tab;
  }
  for (let index = Math.max(0, atIndex); index < events.length; index++) {
    const tab = String(events[index].detail['tabIdentifier'] ?? '');
    if (tab.length > 0) return tab;
  }
  return '';
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
 * colour. Every entry is public, and its offset is left at 0 until the list is restamped.
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
    visibility: PUBLIC_VISIBILITY,
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

/** Inserts one event at a position, keeping its own sequence number and time, and restamps the offsets. */
export function insertReplayEvent(events: readonly ReplayEvent[], atIndex: number, event: ReplayEvent): ReplayEvent[] {
  const next = [...events];
  next.splice(Math.max(0, Math.min(next.length, atIndex)), 0, event);
  return restampReplayTimes(next);
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
  entries: readonly ReplayEvent[]
): ReplayEvent[] {
  if (entries.length < 1) return [...events];

  const index = Math.max(0, Math.min(events.length, atIndex));
  const seqBase = nextInsertSeq(events);
  const times = spreadInsertTimes(events, index, entries.length);
  const placed = entries.map((entry, offset) => ({ ...entry, seq: seqBase + offset, at: times[offset] }));

  const next = [...events];
  next.splice(index, 0, ...placed);
  return restampReplayTimes(next);
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

/** The sequence number for a new event: one above the highest in the list, or 1 for an empty list. */
export function nextInsertSeq(events: readonly ReplayEvent[]): number {
  return events.reduce((highest, event) => Math.max(highest, event.seq), 0) + 1;
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

/** Takes the event with the given sequence number out of the list and restamps the offsets. */
export function removeReplayEvent(events: readonly ReplayEvent[], seq: number): ReplayEvent[] {
  return restampReplayTimes(events.filter((event) => event.seq !== seq));
}

/** Takes every event with one of these sequence numbers out of the list and restamps the offsets once. */
export function removeReplayEvents(events: readonly ReplayEvent[], seqs: ReadonlySet<number>): ReplayEvent[] {
  if (seqs.size < 1) return [...events];
  return restampReplayTimes(events.filter((event) => !seqs.has(event.seq)));
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
  for (const index of order) {
    let target = index + direction;
    while (passes(target)) target += direction;
    if (target < 0 || target >= next.length || seqs.has(next[target].seq)) continue;
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, { ...moved, at: insertTimeAt(next, target) });
  }
  return restampReplayTimes(next);
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
  return restampReplayTimes(next);
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
