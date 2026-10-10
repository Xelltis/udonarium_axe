import { type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';

export const REPLAY_TIMELINE_BUCKETS = 48;

export interface ReplayTimelineBucket {
  readonly index: number;
  readonly count: number;
  readonly ratio: number;
}

export interface ReplayTimelineChapter {
  readonly index: number;
  readonly label: string;
  readonly at: number;
}

export interface ReplayTimeline {
  readonly buckets: readonly ReplayTimelineBucket[];
  readonly chapters: readonly ReplayTimelineChapter[];
}

export const EMPTY_REPLAY_TIMELINE: ReplayTimeline = { buckets: [], chapters: [] };

function spanOf(events: readonly ReplayEvent[]): number {
  return events.length < 2 ? 0 : Math.max(0, events[events.length - 1].t - events[0].t);
}

/**
 * Where the event at `index` falls along the replay's timeline, from 0 at the first event to 1 at
 * the last.
 *
 * Positions follow the events' timestamps; when every event carries the same time they are spread
 * evenly instead.
 */
export function replayTimelinePosition(events: readonly ReplayEvent[], index: number): number {
  if (events.length < 2) return 0;
  const clamped = Math.max(0, Math.min(events.length - 1, index));
  const span = spanOf(events);
  if (span <= 0) return clamped / (events.length - 1);
  return Math.max(0, Math.min(1, (events[clamped].t - events[0].t) / span));
}

/**
 * The event nearest to a point on the timeline, given as a ratio from 0 to 1, for seeking by
 * clicking the timeline.
 */
export function replayTimelineIndexAt(events: readonly ReplayEvent[], ratio: number): number {
  if (events.length < 2) return 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const span = spanOf(events);
  if (span <= 0) return Math.round(clamped * (events.length - 1));

  const target = events[0].t + clamped * span;
  let low = 0;
  let high = events.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (events[middle].t < target) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && target - events[low - 1].t < events[low].t - target) return low - 1;
  return low;
}

/**
 * Builds the replay timeline strip: how busy each stretch of the recording is, and where its
 * chapter markers fall.
 *
 * Each bucket's height is relative to the busiest bucket, and clicking it seeks to its first event,
 * or to the event nearest its middle when it is empty. An empty recording gives an empty timeline.
 */
export function buildReplayTimeline(
  events: readonly ReplayEvent[],
  bucketCount = REPLAY_TIMELINE_BUCKETS
): ReplayTimeline {
  if (events.length < 1 || bucketCount < 1) return EMPTY_REPLAY_TIMELINE;

  const counts = new Array<number>(bucketCount).fill(0);
  const heads = new Array<number>(bucketCount).fill(-1);
  for (let index = 0; index < events.length; index += 1) {
    const slot = Math.min(bucketCount - 1, Math.floor(replayTimelinePosition(events, index) * bucketCount));
    counts[slot] += 1;
    if (heads[slot] < 0) heads[slot] = index;
  }

  const busiest = Math.max(...counts);
  const buckets = counts.map((count, slot) => ({
    count,
    ratio: busiest > 0 ? count / busiest : 0,
    index: heads[slot] >= 0 ? heads[slot] : replayTimelineIndexAt(events, (slot + 0.5) / bucketCount),
  }));

  const chapters: ReplayTimelineChapter[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind !== ReplayEventKind.Marker) continue;
    const label = String(event.detail['label'] ?? '').trim();
    chapters.push({ index, label, at: replayTimelinePosition(events, index) });
  }

  return { buckets, chapters };
}
