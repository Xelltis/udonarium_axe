import {
  buildReplayBoardScene,
  collectBoardAssetIds,
  type ReplayBoardScene,
} from '@axe/domain/replay/replay-board-view';
import { cutInScenesOf, replaySceneDurationOf } from '@axe/domain/replay/replay-cut-in-scene';
import { syncValueOf } from '@axe/domain/replay/replay-diff';
import {
  type ReplayEvent,
  type ReplayManifest,
  type ReplayTargetSnapshot,
  type ReplayViewer,
  resolveSnapshotAt,
} from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { applyReplayEvents } from '@axe/domain/replay/replay-patch';
import type { ReplayTextMeasure } from '@axe/domain/replay/video/replay-text-layout';
import {
  replaySubtitleFont,
  type ReplayVideoLayout,
  replayVideoLayout,
} from '@axe/domain/replay/video/replay-video-layout';
import {
  buildReplayVideoTimeline,
  type ReplayVideoCutIn,
  type ReplayVideoPacing,
  type ReplayVideoStyle,
  type ReplayVideoText,
  type ReplayVideoTimeline,
} from '@axe/domain/replay/video/replay-video-timeline';
import { toPortraitSlot } from '@axe/domain/visual-novel/vn-portrait-position';
import type { ReplayFrameCanvas } from '@axe/infrastructure/replay/replay-canvas';
import { REPLAY_FONT_JP, REPLAY_FONT_KR } from '@axe/infrastructure/replay/video/replay-fonts';
import { ReplayImageCache, type ReplayImageSource } from '@axe/infrastructure/replay/video/replay-image-cache';
import { ReplayVideoRenderer } from '@axe/infrastructure/replay/video/replay-video-renderer';

/**
 * The font every word of a replay video is set in: the faces bundled with the app first, Korean or
 * Japanese first by the language, so a line mixing the two draws each from its own bundled face;
 * then the device's own faces for anything neither covers.
 */
export function replayVideoFontFamily(lang: string): string {
  const bundled = lang === 'ko' ? [REPLAY_FONT_KR, REPLAY_FONT_JP] : [REPLAY_FONT_JP, REPLAY_FONT_KR];
  const japanese = "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic UI', 'Yu Gothic', Meiryo";
  const korean = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic'";
  const device = lang === 'ko' ? `${korean}, ${japanese}` : `${japanese}, ${korean}`;
  return `${bundled.map((family) => `'${family}'`).join(', ')}, ${device}, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
}

/** Everything a production is made from, gathered by the service that makes it. */
export interface ReplayVideoProductionInput {
  events: readonly ReplayEvent[];
  manifest: ReplayManifest | null;
  /** The board as it stood before the first event. */
  base: readonly ReplayObjectSnapshot[];
  viewer: ReplayViewer;
  text: ReplayVideoText;
  width: number;
  height: number;
  style: ReplayVideoStyle;
  pacing: ReplayVideoPacing;
  readingSpeed: number;
  tabs: ReadonlySet<string> | null;
  opening: { title: string; subtitle: string } | null;
  images: ReplayImageSource;
  /** Measures text the way the frame will draw it, set in the font given. */
  measureWith: (font: string) => ReplayTextMeasure;
  /** Told whenever a picture becomes ready, so a preview can draw again. */
  onImageLoaded?: () => void;
  /** The timeline already laid out, as a worker is handed it; laid out afresh when absent. */
  timeline?: ReplayVideoTimeline;
  /**
   * Whether the bundled fonts were loaded when the text was laid out, so whatever draws it later
   * sets it in the same fonts. Taken as loaded when not said.
   */
  bundledFonts?: boolean;
}

/**
 * What a production is made from, as plain data that can be handed to a worker: everything but the
 * means of measuring text, translating it and finding pictures, which stay with the page, and with
 * the timeline already laid out by them.
 */
export interface ReplayVideoShared {
  events: readonly ReplayEvent[];
  manifest: ReplayManifest | null;
  base: readonly ReplayObjectSnapshot[];
  viewer: ReplayViewer;
  lang: string;
  width: number;
  height: number;
  style: ReplayVideoStyle;
  pacing: ReplayVideoPacing;
  readingSpeed: number;
  opening: { title: string; subtitle: string } | null;
  timeline: ReplayVideoTimeline;
  /** Whether the text was laid out in the bundled fonts, which a worker then has to draw it in too. */
  bundledFonts: boolean;
}

const CHECKPOINT_EVERY = 400;
const RECENT_BOARDS = 12;
const CUT_IN_ALIAS = 'cut-in';
const CHARACTER_ALIAS = 'character';

/**
 * One replay video, ready to draw: its timeline, the renderer that draws it, the boards it shows and
 * the pictures it needs.
 *
 * Boards are worked out as they are wanted, from the nearest one already known, and only a few
 * are kept besides a checkpoint every few hundred events, so a long recording costs little to
 * hold. Pictures load as they are wanted too; `prepare` waits for those of a moment, which is
 * what the export does before drawing it.
 */
export class ReplayVideoProduction {
  readonly layout: ReplayVideoLayout;
  readonly timeline: ReplayVideoTimeline;
  readonly fontFamily: string;
  private readonly renderer: ReplayVideoRenderer;
  private readonly images: ReplayImageCache;
  private readonly boards = new Map<number, readonly ReplayObjectSnapshot[]>();
  private readonly recent: number[] = [];
  private readonly scenes = new Map<number, ReplayBoardScene | null>();
  private readonly wanted = new Map<number, string[]>();

  constructor(private readonly input: ReplayVideoProductionInput) {
    this.fontFamily = replayVideoFontFamily(input.text.lang);
    this.layout = replayVideoLayout(input.width, input.height, input.style);
    this.images = new ReplayImageCache(input.images, Math.max(2048, input.width), input.onImageLoaded);
    this.timeline =
      input.timeline ??
      buildReplayVideoTimeline(input.events, {
        viewer: input.viewer,
        text: input.text,
        subtitle: {
          measure: input.measureWith(replaySubtitleFont(this.layout, this.fontFamily)),
          maxWidth: this.layout.text.maxWidth,
          maxLines: this.layout.text.maxLines,
        },
        pacing: input.pacing,
        readingSpeed: input.readingSpeed,
        tabs: input.tabs,
        opening: input.opening,
        ...lookupsOf(input.manifest, input.base),
      });
    this.boards.set(0, input.base);
    this.renderer = new ReplayVideoRenderer({
      timeline: this.timeline,
      layout: this.layout,
      boardAt: (applied) => this.sceneAt(applied),
      assets: this.images,
      fontFamily: this.fontFamily,
    });
  }

  /**
   * A production made again from what another one shared, drawing the same frames with pictures
   * found through `images`. It lays nothing out, so it needs neither translations nor a way to
   * measure text, and can be made in a worker.
   */
  static fromShared(shared: ReplayVideoShared, images: ReplayImageSource): ReplayVideoProduction {
    return new ReplayVideoProduction({
      ...shared,
      tabs: null,
      text: { lang: shared.lang, decode: (text) => text, t: (key) => key },
      images,
      measureWith: () => () => 0,
    });
  }

  get durationMs(): number {
    return this.timeline.totalMs;
  }

  /** What this production is made from, as plain data a worker can be handed. */
  share(): ReplayVideoShared {
    const { events, manifest, base, viewer, text, width, height, style, pacing, readingSpeed, opening } = this.input;
    return {
      bundledFonts: this.input.bundledFonts ?? true,
      events,
      manifest,
      base,
      viewer,
      lang: text.lang,
      width,
      height,
      style,
      pacing,
      readingSpeed,
      opening,
      timeline: this.timeline,
    };
  }

  /** Draws the frame at a moment, with whatever pictures are ready. */
  paint(ctx: ReplayFrameCanvas, atMs: number): void {
    this.renderer.paint(ctx, atMs);
  }

  /** The event the moment shows, to find it in the list. */
  seqAt(atMs: number): number | null {
    const index = this.renderer.segmentIndexAt(atMs);
    return index < 0 ? null : this.timeline.segments[index].seq;
  }

  /** When the video reaches an event, or the moment nearest before it. */
  timeOf(seq: number): number | null {
    return this.timeline.timeOfSeq.get(seq) ?? null;
  }

  /** Whether every picture of the moment is ready. */
  isReady(atMs: number): boolean {
    return this.images.has(this.imagesAt(atMs));
  }

  /** Waits for the pictures of the moment, and starts on those of the moment after it. */
  async prepare(atMs: number): Promise<void> {
    const index = this.renderer.segmentIndexAt(atMs);
    if (index < 0) return;
    void this.images.ensure(this.imagesOf(index + 1));
    await this.images.ensure(this.imagesOf(index));
  }

  /** Lets the pictures and boards go. */
  dispose(): void {
    this.images.dispose();
    this.boards.clear();
    this.scenes.clear();
    this.wanted.clear();
  }

  private imagesAt(atMs: number): string[] {
    const index = this.renderer.segmentIndexAt(atMs);
    return index < 0 ? [] : this.imagesOf(index);
  }

  private imagesOf(index: number): string[] {
    const known = this.wanted.get(index);
    if (known) return known;
    const segment = this.timeline.segments[index];
    if (!segment) return [];
    const wanted = [segment.background, ...collectBoardAssetIds(this.sceneAt(segment.boardTo))];
    if (segment.kind === 'board') wanted.push(...collectBoardAssetIds(this.sceneAt(segment.boardFrom)));
    if (segment.kind === 'line' || segment.kind === 'dice') {
      wanted.push(segment.portrait, ...segment.stage.map((figure) => figure.imageIdentifier));
    }
    if (segment.kind === 'cut-in') {
      wanted.push(segment.imageIdentifier, ...(segment.scene?.layers ?? []).map((layer) => layer.imageIdentifier));
    }
    const previous = this.timeline.segments[index - 1];
    if (previous?.kind === 'line' || previous?.kind === 'dice') {
      wanted.push(...previous.stage.map((figure) => figure.imageIdentifier));
    }
    const found = [...new Set(wanted.filter((identifier) => identifier.length > 0))];
    keepRecent(this.wanted, index, found, 32);
    return found;
  }

  private sceneAt(applied: number): ReplayBoardScene | null {
    if (this.scenes.has(applied)) return this.scenes.get(applied) ?? null;
    const scene = buildReplayBoardScene(this.boardAt(applied), this.input.viewer);
    keepRecent(this.scenes, applied, scene, 16);
    return scene;
  }

  /** The board once `applied` events have been played, worked out from the nearest one known. */
  private boardAt(applied: number): readonly ReplayObjectSnapshot[] {
    const known = this.boards.get(applied);
    if (known) return known;
    let from = 0;
    for (const key of this.boards.keys()) if (key <= applied && key > from) from = key;

    let board = this.boards.get(from) ?? this.input.base;
    for (let at = from; at < applied;) {
      const next = Math.min(applied, (Math.floor(at / CHECKPOINT_EVERY) + 1) * CHECKPOINT_EVERY);
      board = applyReplayEvents(board, this.input.events.slice(at, next), { shareInput: true });
      at = next;
      if (at % CHECKPOINT_EVERY === 0) this.boards.set(at, board);
    }
    this.remember(applied, board);
    return board;
  }

  private remember(applied: number, board: readonly ReplayObjectSnapshot[]): void {
    this.boards.set(applied, board);
    this.recent.push(applied);
    while (this.recent.length > RECENT_BOARDS) {
      const old = this.recent.shift()!;
      if (old !== 0 && old % CHECKPOINT_EVERY !== 0 && !this.recent.includes(old)) this.boards.delete(old);
    }
  }
}

/** Keeps a value, letting the oldest go once more than `limit` are kept. */
function keepRecent<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value as K);
}

/**
 * How the timeline looks up what the recording knew of its pieces, cut-ins and characters. The
 * manifest's history of each piece is gathered once, since a long recording asks after thousands of
 * them.
 */
function lookupsOf(manifest: ReplayManifest | null, base: readonly ReplayObjectSnapshot[]) {
  const byIdentifier = new Map(base.map((snapshot) => [snapshot.identifier, snapshot]));
  const characters = new Set(base.filter((one) => one.aliasName === CHARACTER_ALIAS).map((one) => one.identifier));
  for (const target of manifest?.targets ?? []) {
    if (target.aliasName === CHARACTER_ALIAS) characters.add(target.identifier);
  }
  const scenes = cutInScenesOf(base);
  const histories = new Map<string, ReplayTargetSnapshot[]>();
  for (const target of manifest?.targets ?? []) {
    const history = histories.get(target.identifier);
    if (history) history.push(target);
    else histories.set(target.identifier, [target]);
  }
  const targetAt = (identifier: string, seq: number) => resolveSnapshotAt(histories.get(identifier) ?? [], seq);

  return {
    isCharacter: (identifier: string) => characters.has(identifier),
    stageSlotOf: (identifier: string) => {
      const character = byIdentifier.get(identifier);
      return character ? toPortraitSlot(syncValueOf(character.syncData, 'vnPortraitPos')) : null;
    },
    ownerOf: (identifier: string, seq: number) => targetAt(identifier, seq)?.ownerIdentifier ?? '',
    nameOf: (identifier: string, seq: number) => {
      const known = targetAt(identifier, seq)?.name;
      if (known) return known;
      const snapshot = byIdentifier.get(identifier);
      return snapshot ? String(syncValueOf(snapshot.syncData, 'name') ?? '') : '';
    },
    cutInOf: (identifier: string): ReplayVideoCutIn | null => {
      const cutIn = byIdentifier.get(identifier);
      if (!cutIn || cutIn.aliasName !== CUT_IN_ALIAS) return null;
      if (syncValueOf(cutIn.syncData, 'isVideoCutIn') === true) return null;
      const scene = scenes.get(identifier) ?? null;
      const outTime = Number(syncValueOf(cutIn.syncData, 'outTime') ?? 0);
      return {
        imageIdentifier: String(syncValueOf(cutIn.syncData, 'imageIdentifier') ?? ''),
        scene,
        durationMs: scene ? replaySceneDurationOf(scene) : outTime > 0 ? outTime * 1000 : 0,
      };
    },
  };
}
