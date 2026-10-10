import { type DiceRollOutcome, parseDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { isReplayBoardPieceAlias } from '@axe/domain/replay/replay-board-view';
import type { ReplayCutInScene } from '@axe/domain/replay/replay-cut-in-scene';
import { expandSyncPaths, syncValueOf } from '@axe/domain/replay/replay-diff';
import {
  canViewReplayEvent,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayViewer,
} from '@axe/domain/replay/replay-event';
import { ReplayEventCategory, replayEventCategory } from '@axe/domain/replay/replay-event-category';
import {
  buildReplayRoute,
  distanceBetween,
  type ReplayRoutePoint,
  routeLength,
  toRoutePoint,
} from '@axe/domain/replay/replay-route';
import {
  layoutReplayText,
  replayPageDurationMs,
  type ReplayTextMeasure,
  type ReplayTextPage,
} from '@axe/domain/replay/video/replay-text-layout';
import { vnBodyOf, vnEmoteOf } from '@axe/domain/visual-novel/vn-emote';
import { toPortraitSlot } from '@axe/domain/visual-novel/vn-portrait-position';
import {
  buildVnStage,
  messageSlotOf,
  VN_STAGE_LOOKBACK,
  type VnStageSource,
} from '@axe/domain/visual-novel/vn-stage-cast';

/** How a replay video is framed: a novel over the board, or the board with subtitles under it. */
export const ReplayVideoStyle = {
  Novel: 'novel',
  Tabletop: 'tabletop',
} as const;

export type ReplayVideoStyle = (typeof ReplayVideoStyle)[keyof typeof ReplayVideoStyle];

/** How long each moment is held: long enough to read it, or as long as it took on the day. */
export const ReplayVideoPacing = {
  Reading: 'reading',
  Recorded: 'recorded',
} as const;

export type ReplayVideoPacing = (typeof ReplayVideoPacing)[keyof typeof ReplayVideoPacing];

/** The words of the video in the language it is made in. */
export interface ReplayVideoText {
  lang: string;
  /** What a line the room wrote of itself (packed as `@i18n:`) says in that language. */
  decode(text: string): string;
  /** A fixed phrase of the video, such as the name of a round. */
  t(key: string, params?: Record<string, unknown>): string;
}

/** The box subtitles are set in, so a line is broken into the pages that will be shown. */
export interface ReplaySubtitleBox {
  measure: ReplayTextMeasure;
  maxWidth: number;
  maxLines: number;
}

/** What a cut-in shows: one picture, or the layers it was built from. */
export interface ReplayVideoCutIn {
  imageIdentifier: string;
  scene: ReplayCutInScene | null;
  durationMs: number;
}

export interface ReplayVideoTimelineOptions {
  /** Whose eyes the video is made through. Nothing kept from them is shown. */
  viewer: ReplayViewer;
  text: ReplayVideoText;
  subtitle: ReplaySubtitleBox;
  pacing?: ReplayVideoPacing;
  /** How fast subtitles are read, 1 being the usual pace of the language. */
  readingSpeed?: number;
  /** In the recorded pacing, the longest a quiet stretch is kept. */
  quietCapMs?: number;
  /** The chat tabs whose lines are shown. Every tab when absent. */
  tabs?: ReadonlySet<string> | null;
  /** A card to open the video with, such as the name of the room and the day. */
  opening?: { title: string; subtitle: string } | null;
  /** Whether a line was said as a character, so their portrait may stand on the novel stage. */
  isCharacter?: (identifier: string) => boolean;
  /** Where a character stands on the novel stage when the line does not say. */
  stageSlotOf?: (identifier: string) => number | null;
  /** The piece a part belonged to at a point in the recording, so its change shows over the piece. */
  ownerOf?: (identifier: string, seq: number) => string;
  /** The name something had at a point in the recording. */
  nameOf?: (identifier: string, seq: number) => string;
  /** What a cut-in shows. */
  cutInOf?: (identifier: string) => ReplayVideoCutIn | null;
}

/** A page of a subtitle, timed within its segment. */
export interface ReplayTimedPage extends ReplayTextPage {
  startMs: number;
  durationMs: number;
}

/** A portrait standing on the novel stage. */
export interface ReplayStageFigure {
  id: string;
  imageIdentifier: string;
  /** Where it stands across the stage, as a percentage of its width. */
  left: number;
  isActive: boolean;
  isFlipped: boolean;
  isLeaving: boolean;
}

interface ReplaySegmentBase {
  startMs: number;
  durationMs: number;
  /** The event the segment begins with, to find it from the list. */
  seq: number;
  /** How many events have been applied to the board shown as the segment begins. */
  boardFrom: number;
  /** How many events have been applied to the board shown as it ends. */
  boardTo: number;
  /** The chapter it falls in. */
  chapter: string;
  /** The picture behind the novel stage. */
  background: string;
  /** The pieces the camera looks for. The whole board when empty. */
  focus: readonly string[];
}

/** Something said: a speech, a narration or a place. */
export interface ReplayLineSegment extends ReplaySegmentBase {
  kind: 'line';
  mode: 'speech' | 'narration' | 'location';
  speaker: string;
  color: string;
  /** The speaker's own picture, for a face beside the subtitle. */
  portrait: string;
  pages: readonly ReplayTimedPage[];
  stage: readonly ReplayStageFigure[];
}

/** A roll of the dice and what came of it. */
export interface ReplayDiceSegment extends ReplaySegmentBase {
  kind: 'dice';
  speaker: string;
  color: string;
  portrait: string;
  /** What the roll was for, as its roller wrote it. */
  comment: string;
  /** The working of the roll, each step as the dice bot wrote it. */
  steps: readonly string[];
  /** What it came to. */
  result: string;
  outcome: DiceRollOutcome;
  isSecret: boolean;
  stage: readonly ReplayStageFigure[];
}

/** A title card: the opening, a chapter, a new table. */
export interface ReplayChapterSegment extends ReplaySegmentBase {
  kind: 'chapter';
  title: string;
  subtitle: string;
}

/** A short notice over the picture: a new round, whose turn it is. */
export interface ReplayBannerSegment extends ReplaySegmentBase {
  kind: 'banner';
  text: string;
}

/** A cut-in played across the screen. */
export interface ReplayCutInSegment extends ReplaySegmentBase {
  kind: 'cut-in';
  imageIdentifier: string;
  scene: ReplayCutInScene | null;
}

/** How a piece moves in a beat of the board. */
export type ReplayMotionKind = 'path' | 'shake' | 'flip' | 'spin' | 'arrive' | 'depart';

/** One thing that happens to a piece in a beat of the board, timed within the beat. */
export interface ReplayMotion {
  kind: ReplayMotionKind;
  targetId: string;
  startMs: number;
  durationMs: number;
  /** The way it goes, for a move. */
  route: readonly ReplayRoutePoint[];
  /** The angle it turns from and to, for a turn. */
  fromAngle: number;
  toAngle: number;
}

/** A change of a value, shown rising over its piece. */
export interface ReplayValuePop {
  targetId: string;
  label: string;
  value: string;
  delta: number;
  startMs: number;
}

/** An effect cast from one piece at others. */
export interface ReplayBeam {
  fromId: string;
  toIds: readonly string[];
  startMs: number;
}

/** What happened on the board between two things said, played as one beat. */
export interface ReplayBoardSegment extends ReplaySegmentBase {
  kind: 'board';
  motions: readonly ReplayMotion[];
  pops: readonly ReplayValuePop[];
  beams: readonly ReplayBeam[];
}

export type ReplayVideoSegment =
  | ReplayLineSegment
  | ReplayDiceSegment
  | ReplayChapterSegment
  | ReplayBannerSegment
  | ReplayCutInSegment
  | ReplayBoardSegment;

export interface ReplayVideoTimeline {
  segments: readonly ReplayVideoSegment[];
  totalMs: number;
  /** When in the video each event falls, for the sound to be placed by. */
  timeOfSeq: ReadonlyMap<number, number>;
  /** Every picture the video draws besides the board: portraits, backgrounds and cut-ins. */
  imageIdentifiers: readonly string[];
}

export const REPLAY_CHAPTER_MS = 3_200;
export const REPLAY_OPENING_MS = 4_000;
export const REPLAY_BANNER_MS = 1_800;
export const REPLAY_DICE_MS = 2_800;
export const REPLAY_CUT_IN_MS = 3_500;
export const REPLAY_BEAT_MIN_MS = 900;
export const REPLAY_BEAT_MAX_MS = 4_500;
export const REPLAY_BEAT_STAGGER_MS = 180;
export const REPLAY_BEAT_MAX_EVENTS = 16;
export const REPLAY_POP_MS = 1_400;
export const REPLAY_QUIET_CAP_MS = 8_000;
/** A beat of the board is cut where nothing happened on it for this long on the day. */
const REPLAY_BEAT_SPLIT_MS = 20_000;
/** A sound made this soon after a roll, on the day, is the rattle of those dice and plays as the roll does. */
const DICE_SOUND_WINDOW_MS = 3_000;
/** A dice command said just before its result is taken as part of the roll. */
const DICE_COMMAND_WINDOW_MS = 5_000;

const ROLLER_NAME = /^<(Secret-)?BCDice[：:](.*)>$/s;
const DICE_COMMAND = /^(?=[!-~]*[A-Za-z])(?=[!-~]*\d)[!-~]+$/;
const DICE_STEP = /\s*[＞→>]\s*/;
/** The name of the game system a dice bot puts before its working, as in `DiceBot : (2D6)`. */
const DICE_SYSTEM = /^[^(（:：]{1,40}\s[:：]\s*(?=[(（])/;
const SYSTEM_SENDER = 'System';

/**
 * Lays an edited recording out as a video: what is said, rolled and staged, one after another,
 * with what happened on the board in between played as beats of its own.
 *
 * Only what the viewer may see is shown, and only lines of the chosen tabs. A line is broken into
 * the pages its subtitle box holds, each held long enough to read in the language of the video.
 * The running of the room and the parts of pieces are left out of the picture, though they still
 * change the board. A roll is shown with the command said just before it. Every event is given the
 * moment it falls at, for the sound. A recording with nothing to show makes an empty timeline, with
 * no opening card either.
 */
export function buildReplayVideoTimeline(
  events: readonly ReplayEvent[],
  options: ReplayVideoTimelineOptions
): ReplayVideoTimeline {
  const builder = new TimelineBuilder(events, options);
  return builder.build();
}

interface ChatLine {
  event: ReplayEvent;
  index: number;
  name: string;
  text: string;
  color: string;
  imageIdentifier: string;
  sendFrom: string;
  source: VnStageSource;
}

class TimelineBuilder {
  private readonly segments: ReplayVideoSegment[] = [];
  private readonly timeOfSeq = new Map<number, number>();
  private readonly images = new Set<string>();
  private readonly stageWindow: VnStageSource[] = [];
  private readonly pacing: ReplayVideoPacing;
  private readonly speed: number;
  private readonly quietCapMs: number;

  private cursorMs = 0;
  private chapter = '';
  private background = '';
  private beat: { from: number; events: { event: ReplayEvent; index: number }[] } | null = null;
  private pendingCommand: ChatLine | null = null;
  /** The last roll shown: when it was made on the day, and when it comes on screen. */
  private lastRoll: { t: number; startMs: number } | null = null;
  private hasOpening = false;

  constructor(
    private readonly events: readonly ReplayEvent[],
    private readonly options: ReplayVideoTimelineOptions
  ) {
    this.pacing = options.pacing ?? ReplayVideoPacing.Reading;
    this.speed = options.readingSpeed ?? 1;
    this.quietCapMs = options.quietCapMs ?? REPLAY_QUIET_CAP_MS;
  }

  build(): ReplayVideoTimeline {
    const opening = this.options.opening;
    if (opening && opening.title.trim().length > 0) {
      this.hasOpening = true;
      this.push({
        ...this.base(this.events[0]?.seq ?? 0, 0, REPLAY_OPENING_MS),
        kind: 'chapter',
        title: opening.title.trim(),
        subtitle: opening.subtitle.trim(),
      });
    }

    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      this.timeOfSeq.set(event.seq, this.cursorMs);
      this.read(event, index);
    }
    this.flushCommand();
    this.flushBeat(this.events.length);

    if (this.segments.length === (this.hasOpening ? 1 : 0)) this.segments.length = 0;
    const last = this.segments[this.segments.length - 1];
    const totalMs = last ? last.startMs + last.durationMs : 0;
    for (const [seq, at] of this.timeOfSeq) if (at > totalMs) this.timeOfSeq.set(seq, totalMs);
    this.images.delete('');
    return { segments: this.segments, totalMs, timeOfSeq: this.timeOfSeq, imageIdentifiers: [...this.images] };
  }

  private read(event: ReplayEvent, index: number): void {
    if (event.kind === ReplayEventKind.MediaSoundEffect) {
      const roll = this.lastRoll;
      if (roll && event.t - roll.t <= DICE_SOUND_WINDOW_MS) this.timeOfSeq.set(event.seq, roll.startMs);
      return;
    }
    if (event.kind === ReplayEventKind.VnScene) {
      this.settle(event, index);
      this.background = event.targetId ?? '';
      this.images.add(this.background);
      return;
    }
    const category = replayEventCategory(event);
    if (category === ReplayEventCategory.Hidden || category === ReplayEventCategory.System) return;
    if (!canViewReplayEvent(event, this.options.viewer)) return;

    if (category === ReplayEventCategory.Board) {
      this.flushCommand();
      if (this.beat && this.shouldSplitBeat(event)) this.flushBeat(index);
      this.beat ??= { from: index, events: [] };
      this.beat.events.push({ event, index });
      return;
    }

    switch (event.kind) {
      case ReplayEventKind.ChatMessage: {
        const line = this.chatLineOf(event, index);
        if (!line) return;
        this.settle(event, index);
        this.pendingCommand = line;
        return;
      }
      case ReplayEventKind.ChatDice: {
        const line = this.chatLineOf(event, index);
        if (!line) return;
        const command = this.takeCommandFor(event);
        this.settle(event, index);
        this.pushDice(line, command, index);
        return;
      }
      default:
        this.settle(event, index);
        this.readStory(event, index);
    }
  }

  /** Plays out whatever was waiting before a new moment begins, and places the event at that moment. */
  private settle(event: ReplayEvent, index: number): void {
    this.flushCommand();
    this.flushBeat(index);
    this.timeOfSeq.set(event.seq, this.cursorMs);
  }

  private readStory(event: ReplayEvent, index: number): void {
    switch (event.kind) {
      case ReplayEventKind.Marker: {
        const title = String(event.detail['label'] ?? '').trim();
        if (title.length < 1) return;
        this.chapter = title;
        this.push({ ...this.base(event.seq, index + 1, REPLAY_CHAPTER_MS), kind: 'chapter', title, subtitle: '' });
        return;
      }
      case ReplayEventKind.TableChange: {
        const name = this.options.nameOf?.(event.targetId ?? '', event.seq) ?? '';
        if (name.trim().length < 1) return;
        this.push({ ...this.base(event.seq, index + 1, REPLAY_BANNER_MS), kind: 'banner', text: name.trim() });
        return;
      }
      case ReplayEventKind.TurnChange: {
        const text = this.turnText(event);
        if (text.length < 1) return;
        const focus = event.targetId ? [event.targetId] : [];
        this.push({ ...this.base(event.seq, index + 1, REPLAY_BANNER_MS, focus), kind: 'banner', text });
        return;
      }
      case ReplayEventKind.MediaCutIn: {
        if (event.detail['isStart'] !== true || event.detail['soundOnly'] === true) return;
        const cutIn = this.options.cutInOf?.(event.targetId ?? '');
        if (!cutIn || (cutIn.imageIdentifier.length < 1 && !cutIn.scene)) return;
        this.images.add(cutIn.imageIdentifier);
        for (const layer of cutIn.scene?.layers ?? []) this.images.add(layer.imageIdentifier);
        const durationMs = clamp(cutIn.durationMs || REPLAY_CUT_IN_MS, 1_500, 8_000);
        this.push({
          ...this.base(event.seq, index + 1, durationMs),
          kind: 'cut-in',
          imageIdentifier: cutIn.imageIdentifier,
          scene: cutIn.scene,
        });
        return;
      }
      default:
        return;
    }
  }

  private turnText(event: ReplayEvent): string {
    const round = Number(event.detail['round'] ?? 0);
    const name = event.targetId ? (this.options.nameOf?.(event.targetId, event.seq) ?? '').trim() : '';
    const { t } = this.options.text;
    if (name.length > 0 && round > 0) return t('feature.replay.video.roundTurn', { round, name });
    if (name.length > 0) return t('feature.replay.video.turn', { name });
    if (round > 0) return t('feature.replay.video.round', { round });
    return '';
  }

  private chatLineOf(event: ReplayEvent, index: number): ChatLine | null {
    const tab = String(event.detail['tabIdentifier'] ?? '');
    if (this.options.tabs && !this.options.tabs.has(tab)) return null;

    const after = event.patch ? expandSyncPaths(event.patch.after) : {};
    const field = (name: string): unknown => event.detail[name] ?? syncValueOf(after, name);
    const code = String(field('vnEmote') ?? '');
    const raw = String(event.detail['text'] ?? '');
    const isSystem = String(event.detail['from'] ?? '') === SYSTEM_SENDER;
    const text = vnBodyOf(code, isSystem ? this.options.text.decode(raw) : raw).trim();
    const rawName = String(event.detail['name'] ?? '').trim();
    const name = isSystem ? this.options.text.decode(rawName) : rawName;
    const sendFrom = String(field('sendFrom') ?? '');
    const imageIdentifier = String(event.detail['imageIdentifier'] ?? '');
    const isDice = event.kind === ReplayEventKind.ChatDice;
    if (text.length < 1) return null;

    return {
      event,
      index,
      name,
      text,
      color: String(event.detail['messColor'] ?? ''),
      imageIdentifier,
      sendFrom,
      source: {
        name,
        placedAt: event.at,
        sendFrom,
        imageIdentifier,
        imagePos: field('imagePos'),
        vnPortraitPos: Number(field('vnPortraitPos') ?? -1),
        isSystemMessage: isSystem,
        isDicebot: isDice,
        isGameCharacter: sendFrom.length > 0 && (this.options.isCharacter?.(sendFrom) ?? false),
        isDiceCommand: false,
        emote: vnEmoteOf(code, raw),
      },
    };
  }

  /**
   * The command said just before a roll by the same person in the same tab, taken off to go with
   * it. A line is taken as the command when it begins with one: a run of letters, digits and signs
   * such as `2d6+3` or `CC<=50`.
   */
  private takeCommandFor(dice: ReplayEvent): ChatLine | null {
    const command = this.pendingCommand;
    if (!command) return null;
    const sameTab = command.event.detail['tabIdentifier'] === dice.detail['tabIdentifier'];
    const soon = dice.t - command.event.t <= DICE_COMMAND_WINDOW_MS;
    if (command.event.actorId !== dice.actorId || !sameTab || !soon) return null;
    if (!DICE_COMMAND.test(command.text.split(/\s+/)[0] ?? '')) return null;
    this.pendingCommand = null;
    command.source.isDiceCommand = true;
    this.stageWindow.push(command.source);
    return command;
  }

  private flushCommand(): void {
    const line = this.pendingCommand;
    if (!line) return;
    this.pendingCommand = null;
    this.pushLine(line);
  }

  private pushLine(line: ChatLine): void {
    this.stageWindow.push(line.source);
    const stage = this.stage();
    const kind = line.source.emote.kind;
    const mode = kind === 'narration' ? 'narration' : kind === 'location' || kind === 'scene' ? 'location' : 'speech';
    const { measure, maxWidth, maxLines } = this.options.subtitle;
    const pages = layoutReplayText(line.text, measure, maxWidth, maxLines);
    let at = 0;
    const timed = pages.map((page) => {
      const durationMs = replayPageDurationMs(page, this.options.text.lang, this.speed);
      const timedPage = { ...page, startMs: at, durationMs };
      at += durationMs;
      return timedPage;
    });
    for (const figure of stage) this.images.add(figure.imageIdentifier);
    this.images.add(line.imageIdentifier);

    const focus = line.sendFrom.length > 0 ? [line.sendFrom] : [];
    this.push({
      ...this.base(line.event.seq, line.index + 1, at, focus),
      kind: 'line',
      mode,
      speaker: mode === 'speech' ? line.name : '',
      color: line.color,
      portrait: line.imageIdentifier,
      pages: timed,
      stage,
    });
  }

  private pushDice(line: ChatLine, command: ChatLine | null, index: number): void {
    this.lastRoll = { t: line.event.t, startMs: this.cursorMs };
    this.stageWindow.push(line.source);
    const roller = ROLLER_NAME.exec(line.name);
    const detail = parseDiceRollDetail(String(line.event.detail['dicebot'] ?? ''));
    const steps = line.text
      .split('\n')[0]
      .replace(DICE_SYSTEM, '')
      .split(DICE_STEP)
      .map((step) => step.trim())
      .filter((step) => step.length > 0);
    const result = steps.length > 1 ? steps[steps.length - 1] : (steps[0] ?? '');
    const speaker = command?.name || (roller ? roller[2].trim() : line.name);
    const comment = command ? commentOf(command.text) : '';
    const portrait = command?.imageIdentifier || line.imageIdentifier;
    this.images.add(portrait);
    const sendFrom = command?.sendFrom ?? line.sendFrom;
    const rollerId = sendFrom || speaker;
    const stage = this.stage().map((figure) => ({ ...figure, isActive: figure.id === rollerId }));
    for (const figure of stage) this.images.add(figure.imageIdentifier);

    const readMs = comment.length > 0 ? Math.round(([...comment].length / 7) * 1000) : 0;
    this.push({
      ...this.base(
        command?.event.seq ?? line.event.seq,
        index + 1,
        REPLAY_DICE_MS + readMs,
        sendFrom ? [sendFrom] : []
      ),
      kind: 'dice',
      speaker,
      color: command?.color || line.color,
      portrait,
      comment,
      steps: steps.slice(0, -1),
      result,
      outcome: detail?.outcome ?? '',
      isSecret: Boolean(roller?.[1]),
      stage,
    });
  }

  private stage(): ReplayStageFigure[] {
    if (this.stageWindow.length > VN_STAGE_LOOKBACK)
      this.stageWindow.splice(0, this.stageWindow.length - VN_STAGE_LOOKBACK);
    const slotOf = (source: VnStageSource): number => {
      const own = toPortraitSlot(source.vnPortraitPos);
      if (own != null) return own;
      const standing = source.sendFrom ? this.options.stageSlotOf?.(source.sendFrom) : null;
      return standing ?? messageSlotOf(source);
    };
    return buildVnStage(this.stageWindow, (identifier) => identifier, slotOf).map((figure) => ({
      id: figure.id,
      imageIdentifier: figure.url,
      left: figure.left,
      isActive: figure.isActive,
      isFlipped: figure.isFlipped,
      isLeaving: figure.isLeaving,
    }));
  }

  private shouldSplitBeat(event: ReplayEvent): boolean {
    const beat = this.beat;
    if (!beat || beat.events.length < 1) return false;
    if (beat.events.length >= REPLAY_BEAT_MAX_EVENTS) return true;
    return event.t - beat.events[beat.events.length - 1].event.t > REPLAY_BEAT_SPLIT_MS;
  }

  /**
   * Plays the board events gathered since the last thing said as one beat, ending before `upto`.
   *
   * Each change starts a little after the one before, and whatever sounded with it (a die's rattle,
   * say) is placed at the moment it starts.
   */
  private flushBeat(upto: number): void {
    const beat = this.beat;
    this.beat = null;
    if (!beat) return;

    const inBeat = new Set(beat.events.map((one) => one.index));
    const motions: ReplayMotion[] = [];
    const pops: ReplayValuePop[] = [];
    const beams: ReplayBeam[] = [];
    const focus = new Set<string>();
    const offsets: [number, number][] = [];
    const stagger = Math.min(REPLAY_BEAT_STAGGER_MS, (REPLAY_BEAT_MAX_MS - 1_600) / Math.max(1, beat.events.length));
    let at = 0;
    let started = 0;
    let end = 0;

    for (let index = beat.from; index < upto; index += 1) {
      const event = this.events[index];
      offsets.push([event.seq, started]);
      if (!inBeat.has(index)) continue;

      const motion = motionOf(event);
      const pop = motion ? null : this.popOf(event);
      const beam = motion || pop ? null : beamOf(event);
      if (motion) {
        motions.push({ ...motion, startMs: at });
        focus.add(motion.targetId);
        end = Math.max(end, at + motion.durationMs);
      } else if (pop) {
        pops.push({ ...pop, startMs: at });
        focus.add(pop.targetId);
        end = Math.max(end, at + REPLAY_POP_MS);
      } else if (beam) {
        beams.push({ ...beam, startMs: at });
        focus.add(beam.fromId);
        for (const id of beam.toIds) focus.add(id);
        end = Math.max(end, at + 1_000);
      } else {
        continue;
      }
      started = at;
      offsets[offsets.length - 1][1] = at;
      at += stagger;
    }
    if (motions.length + pops.length + beams.length < 1) return;

    const startMs = this.cursorMs;
    const durationMs = clamp(end + 400, REPLAY_BEAT_MIN_MS, REPLAY_BEAT_MAX_MS);
    this.push(
      {
        ...this.base(beat.events[0].event.seq, upto, durationMs, [...focus]),
        boardFrom: beat.from,
        kind: 'board',
        motions,
        pops,
        beams,
      },
      beat.events[beat.events.length - 1].event
    );
    for (const [seq, offset] of offsets) this.timeOfSeq.set(seq, startMs + offset);
  }

  private popOf(event: ReplayEvent): Omit<ReplayValuePop, 'startMs'> | null {
    if (event.kind !== ReplayEventKind.ObjectValue) return null;
    const change = (event.detail['current'] ?? event.detail['value']) as { from?: unknown; to?: unknown } | undefined;
    if (!change) return null;
    const from = Number(change.from);
    const to = Number(change.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || change.to === '' || from === to) return null;
    const targetId = this.options.ownerOf?.(event.targetId ?? '', event.seq) || event.targetId || '';
    if (targetId.length < 1) return null;
    return { targetId, label: String(event.detail['name'] ?? ''), value: String(change.to), delta: to - from };
  }

  private base(seq: number, boardTo: number, durationMs: number, focus: readonly string[] = []): ReplaySegmentBase {
    return {
      startMs: this.cursorMs,
      durationMs,
      seq,
      boardFrom: boardTo,
      boardTo,
      chapter: this.chapter,
      background: this.background,
      focus,
    };
  }

  private push(segment: ReplayVideoSegment, lastEvent?: ReplayEvent): void {
    const ended = lastEvent ?? this.events[segment.boardTo - 1];
    const next = this.events[segment.boardTo];
    let durationMs = segment.durationMs;
    if (this.pacing === ReplayVideoPacing.Recorded && ended && next) {
      const quiet = Math.max(0, next.t - ended.t);
      durationMs = Math.max(durationMs, Math.min(quiet, this.quietCapMs));
    }
    this.segments.push({ ...segment, startMs: this.cursorMs, durationMs } as ReplayVideoSegment);
    this.cursorMs += durationMs;
  }
}

/** How a board event moves its piece, if it moves it in a way worth drawing. */
function motionOf(event: ReplayEvent): Omit<ReplayMotion, 'startMs'> | null {
  const targetId = event.targetId ?? '';
  if (targetId.length < 1) return null;
  const still = { targetId, route: [] as ReplayRoutePoint[], fromAngle: 0, toAngle: 0 };

  switch (event.kind) {
    case ReplayEventKind.ObjectMove: {
      const fromPlace = placeOf(event.detail['from']);
      const toPlace = placeOf(event.detail['to']);
      if (fromPlace === 'table' && toPlace !== 'table') return { ...still, kind: 'depart', durationMs: 600 };
      if (fromPlace !== 'table' && toPlace === 'table') return { ...still, kind: 'arrive', durationMs: 600 };
      if (toPlace !== 'table') return null;
      const from = toRoutePoint(event.detail['from']);
      const to = toRoutePoint(event.detail['to']);
      const path = Array.isArray(event.detail['path']) ? event.detail['path'].map(toRoutePoint) : [];
      const route = buildReplayRoute(from, path, to);
      if (route.length < 2 || distanceBetween(from, to) < 1) return null;
      const durationMs = clamp(450 + routeLength(route) * 0.9, 500, 1_300);
      return { ...still, kind: 'path', route, durationMs };
    }
    case ReplayEventKind.ObjectCreate:
      return isReplayBoardPieceAlias(String(event.detail['aliasName'] ?? ''))
        ? { ...still, kind: 'arrive', durationMs: 600 }
        : null;
    case ReplayEventKind.ObjectRemove:
      return isReplayBoardPieceAlias(String(event.detail['aliasName'] ?? ''))
        ? { ...still, kind: 'depart', durationMs: 600 }
        : null;
    case ReplayEventKind.ObjectDiceRoll:
    case ReplayEventKind.ObjectShuffle:
      return { ...still, kind: 'shake', durationMs: 800 };
    case ReplayEventKind.ObjectFace:
      return { ...still, kind: 'flip', durationMs: 500 };
    case ReplayEventKind.ObjectRotate: {
      const rotate = event.detail['rotate'] as { from?: unknown; to?: unknown } | undefined;
      if (!rotate) return null;
      const fromAngle = Number(rotate.from) || 0;
      const toAngle = Number(rotate.to) || 0;
      if (fromAngle === toAngle) return null;
      return { ...still, kind: 'spin', durationMs: 500, fromAngle, toAngle };
    }
    default:
      return null;
  }
}

function beamOf(event: ReplayEvent): Omit<ReplayBeam, 'startMs'> | null {
  if (event.kind !== ReplayEventKind.EffectCast) return null;
  const fromId = String(event.detail['caster'] ?? '');
  const toIds = Array.isArray(event.detail['targets']) ? event.detail['targets'].map(String) : [];
  if (fromId.length < 1 || toIds.length < 1) return null;
  return { fromId, toIds };
}

function placeOf(value: unknown): string {
  return String(((value ?? {}) as Record<string, unknown>)['name'] ?? '');
}

/** What a dice command says besides the command itself: `2d6+3 attack` is for the attack. */
function commentOf(command: string): string {
  return command.trim().split(/\s+/).slice(1).join(' ').trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
