import { computed, inject, Injectable, signal } from '@angular/core';
import { readKeyframeBytes } from '@axe/application/replay/replay-keyframe-bytes';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { ReplaySoundMixer } from '@axe/application/replay/replay-sound-mixer';
import { Logger } from '@axe/core/logging/logger';
import { VideoEncoderGateway } from '@axe/core/media/video-encoder';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import type { ReplayRecordingMeta } from '@axe/core/storage/replay-log-store';
import { replayArchiveName } from '@axe/domain/replay/replay-archive';
import { REPLAY_BOARD_TOP_DOWN, type ReplayBoardCamera } from '@axe/domain/replay/replay-board-camera';
import {
  buildReplayBoardScene,
  collectBoardAssetIds,
  type ReplayBoardScene,
} from '@axe/domain/replay/replay-board-view';
import { collectReplayCast } from '@axe/domain/replay/replay-cast';
import { cutInScenesOf, sceneImageIdentifiers } from '@axe/domain/replay/replay-cut-in-scene';
import { syncValueOf } from '@axe/domain/replay/replay-diff';
import { earliestReplaySeq } from '@axe/domain/replay/replay-edit';
import type { ReplayEvent, ReplayViewer } from '@axe/domain/replay/replay-event';
import { REPLAY_FRAME_PRESETS, replayFrameLayout, type ReplayFrameSize } from '@axe/domain/replay/replay-frame-layout';
import { decodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { applyReplayEvents } from '@axe/domain/replay/replay-patch';
import {
  buildReplaySoundtrack,
  clipReplaySoundtrack,
  DEFAULT_REPLAY_SOUND_CHOICE,
  hasReplaySound,
  type ReplaySoundChoice,
} from '@axe/domain/replay/replay-soundtrack';
import {
  buildReplayStoryboard,
  type ReplayShot,
  type ReplayShotCaption,
  ReplayShotPacing as Pacing,
  type ReplayShotPacing,
  type ReplayShotScope,
  ReplayShotScope as Scope,
  type ReplayStoryboard,
  shotAt,
} from '@axe/domain/replay/replay-storyboard';
import { type DrawableImage, loadDrawableImages } from '@axe/infrastructure/replay/drawable-image';
import { DEFAULT_REPLAY_FRAME_STYLE, paintReplayFrame } from '@axe/infrastructure/replay/replay-frame-painter';

export const REPLAY_VIDEO_FPS = 30;
const CUT_IN_ALIAS = 'cut-in';

export interface ReplayVideoOptions {
  size: ReplayFrameSize;
  fps: number;
  /** How the board is seen. Directly above, by default. */
  camera?: ReplayBoardCamera;
  pacing: ReplayShotPacing;
  scope: ReplayShotScope;
  sound: ReplaySoundChoice;
  caption?: ReplayShotCaption;
}

export const DEFAULT_REPLAY_VIDEO_OPTIONS: ReplayVideoOptions = {
  size: REPLAY_FRAME_PRESETS['1080p'],
  fps: REPLAY_VIDEO_FPS,
  pacing: Pacing.Reading,
  scope: Scope.Lines,
  sound: DEFAULT_REPLAY_SOUND_CHOICE,
};

@Injectable({ providedIn: 'root' })
export class ReplayVideoService {
  private readonly library = inject(ReplayLibraryService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly mixer = inject(ReplaySoundMixer);
  private readonly encoder = inject(VideoEncoderGateway);

  private readonly _isRendering = signal(false);
  private readonly _failed = signal(false);
  private readonly _done = signal(0);
  private readonly _total = signal(0);
  private cancelled = false;

  readonly isRendering = this._isRendering.asReadonly();
  readonly failed = this._failed.asReadonly();
  readonly progress = computed(() => {
    const total = this._total();
    return total > 0 ? this._done() / total : 0;
  });

  /** Whether this browser can encode a replay into a video. */
  get isSupported(): boolean {
    return this.encoder.isSupported;
  }

  /** Whether recording can only run in real time. It costs as long as the video lasts, so say so before the button is pressed. */
  get isRealtimeOnly(): boolean {
    return this.encoder.isRealtimeOnly;
  }

  /** Asks a video being made to stop at its next frame; nothing is saved. */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Turns a recording's events into a video and saves it, publishing progress as it goes.
   *
   * Shots are chosen from the events, the board is drawn behind them, and the sound is mixed in
   * where the browser can. The file goes to the handle given, or is handed to the browser to
   * download. Answers false when a video is already being made, the browser cannot encode, there is
   * nothing to show, it was cancelled, or it failed.
   */
  async render(
    meta: ReplayRecordingMeta,
    events: readonly ReplayEvent[],
    options: ReplayVideoOptions = DEFAULT_REPLAY_VIDEO_OPTIONS,
    viewer?: ReplayViewer,
    file: FileSystemFileHandle | null = null
  ): Promise<boolean> {
    if (this._isRendering() || !this.isSupported || events.length < 1) return false;

    this._isRendering.set(true);
    this._failed.set(false);
    this.cancelled = false;
    this._done.set(0);
    this._total.set(0);

    try {
      const base = await this.baseBoardOf(meta.id, events);
      const cast = collectReplayCast(base);
      const cutIns = cutInImagesOf(base);
      const cutInScenes = cutInScenesOf(base);
      const storyboard = buildReplayStoryboard(events, cast, {
        ...options,
        viewer,
        cutInImage: (identifier) => cutIns.get(identifier) ?? '',
        cutInScene: (identifier) => cutInScenes.get(identifier) ?? null,
      });
      if (storyboard.shots.length < 1) {
        Logger.warn('[ReplayVideo] 画にできる場面がありませんでした', meta.id);
        this._failed.set(true);
        return false;
      }

      // No cut-off by length: whatever was recorded is exported in full.
      const frameCount = Math.max(1, Math.round((storyboard.totalMs / 1000) * options.fps));
      this._total.set(frameCount);

      const layout = replayFrameLayout(options.size);
      const boards = this.boardsFor(storyboard.shots, events, base);
      const boardOfSeq = new Map(storyboard.shots.map((shot, index) => [shot.seq, boards[index]]));
      if (this.cancelled) return false;
      const assets = await this.loadAssets([
        ...storyboard.shots.flatMap((shot) => [shot.portraitId, shot.backgroundId, shot.cutInId]),
        // The pictures the layers of a composed cut-in are built from.
        ...[...cutInScenes.values()].flatMap((scene) => sceneImageIdentifiers(scene)),
        // Counting images does not need the darkness solved.
        ...boards.flatMap((board) =>
          collectBoardAssetIds(board ? buildReplayBoardScene(board, undefined, { withOverlay: false }) : null)
        ),
      ]);
      const msPerFrame = 1000 / options.fps;
      // One scene is built at a time, and held for as long as that shot lasts.
      let shown: { seq: number; scene: ReplayBoardScene | null } | null = null;
      const sceneOf = (seq: number): ReplayBoardScene | null => {
        if (shown?.seq !== seq) {
          const snapshots = boardOfSeq.get(seq);
          shown = { seq, scene: snapshots ? buildReplayBoardScene(snapshots, viewer ?? undefined) : null };
        }
        return shown.scene;
      };
      const audio = this.cancelled
        ? null
        : await this.soundOf(events, storyboard, options.sound, (frameCount / options.fps) * 1000);
      if (this.cancelled) return false;

      try {
        const encoded = await this.encoder.encode({
          width: options.size.width,
          height: options.size.height,
          fps: options.fps,
          frameCount,
          audio,
          file,
          isCancelled: () => this.cancelled,
          onProgress: (done, total) => {
            this._done.set(done);
            this._total.set(total);
          },
          paint: (ctx, index) => {
            const atMs = index * msPerFrame;
            const shot = shotAt(storyboard, atMs);
            const board = shot ? sceneOf(shot.seq) : null;
            paintReplayFrame(
              ctx,
              layout,
              shot,
              { imageOf: (identifier) => assets.get(identifier) ?? null },
              frameCount > 1 ? index / (frameCount - 1) : 1,
              DEFAULT_REPLAY_FRAME_STYLE,
              board,
              shot && shot.durationMs > 0 ? (atMs - shot.startMs) / shot.durationMs : 1,
              options.camera ?? REPLAY_BOARD_TOP_DOWN
            );
          },
        });
        if (!encoded) {
          this._failed.set(!this.cancelled);
          return false;
        }

        this.encoder.save(
          encoded.blob,
          `${replayArchiveName({ roomName: meta.roomName, startedAt: meta.startedAt })}.${encoded.extension}`
        );
        return true;
      } finally {
        for (const bitmap of assets.values()) bitmap.close?.();
      }
    } catch (reason) {
      Logger.warn('[ReplayVideo] 動画にできませんでした', reason);
      this._failed.set(true);
      return false;
    } finally {
      this._isRendering.set(false);
    }
  }

  private async soundOf(
    events: readonly ReplayEvent[],
    storyboard: ReplayStoryboard,
    choice: ReplaySoundChoice,
    videoMs: number
  ) {
    try {
      const soundtrack = clipReplaySoundtrack(buildReplaySoundtrack(events, storyboard, choice), videoMs);
      if (!hasReplaySound(soundtrack)) return null;
      return await this.mixer.mix(soundtrack, async (identifier) => {
        const audio = this.audioStorage.get(identifier);
        if (!audio) {
          Logger.warn('[ReplayVideo] この音はこのブラウザに残っていません', identifier);
          return null;
        }
        if (audio.blob) return await audio.blob.arrayBuffer();
        if (audio.url.length > 0) return await (await fetch(audio.url)).arrayBuffer();
        Logger.warn('[ReplayVideo] 音の中身がありません', identifier);
        return null;
      });
    } catch (reason) {
      Logger.warn('[ReplayVideo] 音を作れませんでした', reason);
      return null;
    }
  }

  private async baseBoardOf(id: number, events: readonly ReplayEvent[]): Promise<ReplayObjectSnapshot[]> {
    try {
      const keyframe = await this.library.keyframeBefore(id, earliestReplaySeq(events));
      if (!keyframe) return [];
      return decodeReplayKeyframe(await readKeyframeBytes(keyframe.blob));
    } catch (reason) {
      Logger.warn('[ReplayVideo] 卓の様子を読めませんでした', reason);
      return [];
    }
  }

  /**
   * The board for each shot.
   *
   * The scenes themselves are not built: holding one solved scene per shot would put a whole
   * room times the shot count in memory before the export began. Anything no event touches is
   * shared with the previous board, so holding them all costs almost nothing.
   */
  private boardsFor(
    shots: readonly ReplayShot[],
    events: readonly ReplayEvent[],
    base: readonly ReplayObjectSnapshot[]
  ): (readonly ReplayObjectSnapshot[] | null)[] {
    if (base.length < 1) return shots.map(() => null);

    const indexOfSeq = new Map(events.map((event, index) => [event.seq, index]));
    let board: readonly ReplayObjectSnapshot[] = base;
    let from = 0;

    return shots.map((shot) => {
      const upto = indexOfSeq.get(shot.seq);
      if (upto !== undefined && upto >= from) {
        board = applyReplayEvents(board, events.slice(from, upto + 1), { shareInput: true });
        from = upto + 1;
      }
      return board;
    });
  }

  private loadAssets(identifiers: readonly string[]): Promise<Map<string, DrawableImage>> {
    return loadDrawableImages(this.imageStorage, identifiers, (identifier, reason) =>
      Logger.warn('[ReplayVideo] 絵を読めませんでした', identifier, reason)
    );
  }
}

/** From a cut-in to the image that was showing for it. */
function cutInImagesOf(snapshots: readonly ReplayObjectSnapshot[]): Map<string, string> {
  const images = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (snapshot.aliasName !== CUT_IN_ALIAS) continue;
    // A video cut-in has no picture; like a sound-only one, it appears as a subtitle.
    if (syncValueOf(snapshot.syncData, 'isVideoCutIn') === true) continue;
    images.set(snapshot.identifier, String(syncValueOf(snapshot.syncData, 'imageIdentifier') ?? ''));
  }
  return images;
}
