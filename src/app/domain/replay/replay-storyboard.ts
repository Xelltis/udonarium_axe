import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import type { ReplayCutInScene } from '@axe/domain/replay/replay-cut-in-scene';
import {
  canViewReplayEvent,
  isIncidentalReplayEvent,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayViewer,
} from '@axe/domain/replay/replay-event';
import { ReplayEventCategory, replayEventCategory } from '@axe/domain/replay/replay-event-category';
import { buildReplayRoute, type ReplayRoutePoint, toRoutePoint } from '@axe/domain/replay/replay-route';

export const ReplayShotPacing = {
  Reading: 'reading',
  Recorded: 'recorded',
} as const;

export type ReplayShotPacing = (typeof ReplayShotPacing)[keyof typeof ReplayShotPacing];

export const ReplayShotScope = {
  Lines: 'lines',
  Everything: 'everything',
} as const;

export type ReplayShotScope = (typeof ReplayShotScope)[keyof typeof ReplayShotScope];

export const REPLAY_SHOT_MIN_MS = 1_200;
export const REPLAY_SHOT_MAX_MS = 8_000;
export const REPLAY_SHOT_PER_CHAR_MS = 55;
export const REPLAY_CHAPTER_HOLD_MS = 2_400;
export const REPLAY_SHOT_MAX_CHARS = 90;

export interface ReplayStoryboardOptions {
  pacing: ReplayShotPacing;
  scope: ReplayShotScope;
  viewer?: ReplayViewer;
  caption?: ReplayShotCaption;
  /** Looks the picture of a cut-in up, from its identifier to the picture's own. */
  cutInImage?: (identifier: string) => string;
  /** Looks up the layers a cut-in was built from, for one that is not a single picture. */
  cutInScene?: (identifier: string) => ReplayCutInScene | null;
}

export const DEFAULT_REPLAY_STORYBOARD_OPTIONS: ReplayStoryboardOptions = {
  pacing: ReplayShotPacing.Reading,
  scope: ReplayShotScope.Lines,
};

export interface ReplayShotMove {
  targetId: string;
  route: readonly ReplayRoutePoint[];
}

export interface ReplayShot {
  seq: number;
  startMs: number;
  durationMs: number;
  kind: ReplayEventKind;
  chapter: string;
  isChapterStart: boolean;
  speaker: string;
  speakerColor: string;
  portraitId: string;
  backgroundId: string;
  /** The picture of the cut-in showing. Empty for none. */
  cutInId: string;
  /** The layers the cut-in showing was built from, for one that has them. */
  cutInScene: ReplayCutInScene | null;
  text: string;
  isNarration: boolean;
  move: ReplayShotMove | null;
}

export interface ReplayStoryboard {
  shots: readonly ReplayShot[];
  totalMs: number;
  timeOfSeq: ReadonlyMap<number, number>;
}

export const EMPTY_REPLAY_STORYBOARD: ReplayStoryboard = { shots: [], totalMs: 0, timeOfSeq: new Map() };

const SPOKEN_KINDS: ReadonlySet<ReplayEventKind> = new Set([ReplayEventKind.ChatMessage, ReplayEventKind.ChatDice]);

const NARRATED_KINDS: ReadonlySet<ReplayEventKind> = new Set([
  ReplayEventKind.Marker,
  ReplayEventKind.TableChange,
  ReplayEventKind.TurnChange,
  ReplayEventKind.VoteStart,
  ReplayEventKind.VoteFinish,
  ReplayEventKind.MediaCutIn,
  ReplayEventKind.MediaBgm,
  ReplayEventKind.EffectCast,
  ReplayEventKind.ObjectMove,
  ReplayEventKind.ObjectCreate,
  ReplayEventKind.ObjectRemove,
  ReplayEventKind.ObjectValue,
  ReplayEventKind.ObjectDiceRoll,
  ReplayEventKind.ObjectShuffle,
  ReplayEventKind.ObjectFace,
]);

export type ReplayShotCaption = (event: ReplayEvent) => string;

/**
 * Lays a recording out as the shots of a video, one after another.
 *
 * Markers open chapters, chat and dice lines become shots, and with the wider scope other events
 * are narrated through the caption. A long line is split over several shots, each lasting as the
 * pacing says. A visual novel scene sets the background for what follows. Events the viewer may
 * not see are skipped; every other event's start time is kept by its sequence number.
 */
export function buildReplayStoryboard(
  events: readonly ReplayEvent[],
  cast: readonly ReplayCastMember[],
  options: ReplayStoryboardOptions = DEFAULT_REPLAY_STORYBOARD_OPTIONS
): ReplayStoryboard {
  const portraits = portraitsByName(cast);
  const shots: ReplayShot[] = [];
  const timeOfSeq = new Map<number, number>();

  let chapter = '';
  let background = '';
  let startMs = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (options.viewer && !canViewReplayEvent(event, options.viewer)) continue;
    timeOfSeq.set(event.seq, startMs);
    const category = replayEventCategory(event);
    if (category === ReplayEventCategory.Hidden || category === ReplayEventCategory.System) continue;

    if (event.kind === ReplayEventKind.VnScene) {
      background = event.targetId ?? '';
      continue;
    }

    const isChapter = event.kind === ReplayEventKind.Marker;
    if (isChapter) chapter = String(event.detail['label'] ?? '').trim();

    if (!isShown(event.kind, options.scope)) continue;

    const text = textOfShot(event, options.caption);
    if (text.length < 1 && !isChapter) continue;

    const speaker = isChapter ? '' : String(event.detail['name'] ?? '').trim();
    const parts = isChapter ? [text] : splitLongText(text);
    const whole = durationOf(event, events[index + 1], text, isChapter, options.pacing);

    for (const [part, piece] of parts.entries()) {
      const durationMs = Math.max(REPLAY_SHOT_MIN_MS, Math.round(whole / parts.length));
      shots.push({
        seq: event.seq,
        startMs,
        durationMs,
        kind: event.kind,
        chapter,
        isChapterStart: isChapter,
        speaker,
        speakerColor: String(event.detail['messColor'] ?? '').trim(),
        portraitId: portraitOf(event, speaker, portraits),
        backgroundId: background,
        cutInId: cutInOf(event, options.cutInImage),
        cutInScene: cutInSceneOf(event, options.cutInScene),
        text: piece,
        isNarration: isChapter || speaker.length < 1,
        move: part === 0 ? moveOf(event) : null,
      });
      startMs += durationMs;
    }
  }

  return { shots, totalMs: startMs, timeOfSeq };
}

/**
 * The shot on screen at a moment of the storyboard.
 *
 * A moment before the start gives the first shot. Null when there are no shots or the moment is
 * past the end of the last.
 */
export function shotAt(storyboard: ReplayStoryboard, atMs: number): ReplayShot | null {
  const { shots } = storyboard;
  if (shots.length < 1) return null;
  if (atMs < 0) return shots[0];

  let low = 0;
  let high = shots.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (shots[middle].startMs <= atMs) low = middle;
    else high = middle - 1;
  }
  const shot = shots[low];
  return atMs < shot.startMs + shot.durationMs ? shot : null;
}

function isShown(kind: ReplayEventKind, scope: ReplayShotScope): boolean {
  if (isIncidentalReplayEvent(kind)) return false;
  if (SPOKEN_KINDS.has(kind) || kind === ReplayEventKind.Marker) return true;
  return scope === ReplayShotScope.Everything && NARRATED_KINDS.has(kind);
}

function textOfShot(event: ReplayEvent, caption?: ReplayShotCaption): string {
  if (event.kind === ReplayEventKind.Marker) return String(event.detail['label'] ?? '').trim();
  const spoken = String(event.detail['text'] ?? '').trim();
  if (spoken.length > 0 || SPOKEN_KINDS.has(event.kind)) return spoken;
  return (caption?.(event) ?? '').trim();
}

function durationOf(
  event: ReplayEvent,
  next: ReplayEvent | undefined,
  text: string,
  isChapter: boolean,
  pacing: ReplayShotPacing
): number {
  if (pacing === ReplayShotPacing.Recorded && next) {
    // Matching the pace of the day means the gaps of that day; rounded, it is not the pace it claims.
    const gap = Math.round(next.t - event.t);
    if (gap > 0) return Math.max(REPLAY_SHOT_MIN_MS, gap);
  }
  if (isChapter) return REPLAY_CHAPTER_HOLD_MS;
  return Math.min(REPLAY_SHOT_MAX_MS, REPLAY_SHOT_MIN_MS + text.length * REPLAY_SHOT_PER_CHAR_MS);
}

/** The picture of a scene a cut-in appeared in. A sound-only cut-in and a video one have none. */
function cutInOf(event: ReplayEvent, resolve: ((identifier: string) => string) | undefined): string {
  if (!showsCutIn(event) || !resolve) return '';
  return resolve(event.targetId ?? '');
}

/** The layers a cut-in was built from, for one that shows rather than only sounds. */
function cutInSceneOf(
  event: ReplayEvent,
  resolve: ((identifier: string) => ReplayCutInScene | null) | undefined
): ReplayCutInScene | null {
  if (!showsCutIn(event) || !resolve) return null;
  return resolve(event.targetId ?? '');
}

function showsCutIn(event: ReplayEvent): boolean {
  if (event.kind !== ReplayEventKind.MediaCutIn) return false;
  return event.detail['isStart'] === true && event.detail['soundOnly'] !== true;
}

function splitLongText(text: string): string[] {
  const characters = [...text];
  if (characters.length <= REPLAY_SHOT_MAX_CHARS) return [text];

  const parts: string[] = [];
  for (let at = 0; at < characters.length; at += REPLAY_SHOT_MAX_CHARS) {
    parts.push(characters.slice(at, at + REPLAY_SHOT_MAX_CHARS).join(''));
  }
  return parts;
}

function moveOf(event: ReplayEvent): ReplayShotMove | null {
  if (event.kind !== ReplayEventKind.ObjectMove || !event.targetId) return null;

  const from = toRoutePoint(event.detail['from']);
  const to = toRoutePoint(event.detail['to']);
  const path = Array.isArray(event.detail['path']) ? event.detail['path'].map(toRoutePoint) : [];
  const route = buildReplayRoute(from, path, to);
  return route.length > 1 ? { targetId: event.targetId, route } : null;
}

function portraitsByName(cast: readonly ReplayCastMember[]): Map<string, ReplayCastMember> {
  const byName = new Map<string, ReplayCastMember>();
  for (const member of cast) {
    const name = member.name.trim();
    if (name.length > 0 && !byName.has(name)) byName.set(name, member);
  }
  return byName;
}

function portraitOf(event: ReplayEvent, speaker: string, portraits: Map<string, ReplayCastMember>): string {
  const own = String(event.detail['imageIdentifier'] ?? '').trim();
  if (own.length > 0) return own;
  return portraits.get(speaker)?.imageIdentifier ?? '';
}
