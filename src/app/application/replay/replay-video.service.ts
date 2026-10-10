import { computed, inject, Injectable, signal } from '@angular/core';
import { ReplaySoundMixer } from '@axe/application/replay/replay-sound-mixer';
import type { ReplayVideoProduction } from '@axe/application/replay/replay-video-production';
import {
  type ReplayVideoRecording,
  type ReplayVideoSettings,
  ReplayVideoStudioService,
} from '@axe/application/replay/replay-video-studio.service';
import { encodeReplayVideoInWorker } from '@axe/application/replay/replay-video-worker-client';
import { Logger } from '@axe/core/logging/logger';
import { VideoEncoderGateway, type VideoSoundSource } from '@axe/core/media/video-encoder';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { replayArchiveName } from '@axe/domain/replay/replay-archive';
import type { ReplayEvent } from '@axe/domain/replay/replay-event';
import {
  buildReplaySoundtrack,
  clipReplaySoundtrack,
  DEFAULT_REPLAY_SOUND_CHOICE,
  hasReplaySound,
  type ReplaySoundChoice,
} from '@axe/domain/replay/replay-soundtrack';
import type { ReplayVideoTimeline } from '@axe/domain/replay/video/replay-video-timeline';

export const REPLAY_VIDEO_FPS = 60;

/** Why a video could not be made: nothing to show, its sound could not be mixed, or the encoding failed. */
export type ReplayVideoFailure = 'empty' | 'sound' | 'encode';

/** A video to write: the recording, how it is made, and at what frame rate and with what sound. */
export interface ReplayVideoJob {
  recording: ReplayVideoRecording;
  settings: ReplayVideoSettings;
  fps: number;
  sound: ReplaySoundChoice;
}

@Injectable({ providedIn: 'root' })
export class ReplayVideoService {
  private readonly studio = inject(ReplayVideoStudioService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly imageStorage = inject(ImageStorage);
  private readonly mixer = inject(ReplaySoundMixer);
  private readonly encoder = inject(VideoEncoderGateway);

  private readonly _isRendering = signal(false);
  private readonly _failure = signal<ReplayVideoFailure | null>(null);
  private readonly _done = signal(0);
  private readonly _total = signal(0);
  private readonly _wasPaused = signal(false);
  private cancelled = false;

  readonly isRendering = this._isRendering.asReadonly();
  readonly failure = this._failure.asReadonly();
  readonly failed = computed(() => this._failure() !== null);
  /**
   * Whether the browser paused the video being made while its tab was in the background, as one
   * saving energy does. It carries on from where it stopped once the tab is back in view.
   */
  readonly wasPaused = this._wasPaused.asReadonly();
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
   * Makes a recording into a video and saves it, publishing progress as it goes.
   *
   * The frames are drawn by the same renderer as the preview, each only once its pictures have
   * loaded, in a worker where the browser allows so the page stays free and a tab left in the
   * background does not slow it down, and on the page otherwise. The sound is mixed on the video's
   * own clock. A sound that cannot be mixed stops the export rather than leaving a silent video.
   * The file goes to the handle given, or is handed to the browser to download. Answers false when
   * a video is already being made, the browser cannot encode, there is nothing to show, it was
   * cancelled, or it failed.
   */
  async render(job: ReplayVideoJob, file: FileSystemFileHandle | null = null): Promise<boolean> {
    if (this._isRendering() || !this.isSupported || job.recording.events.length < 1) return false;

    this._isRendering.set(true);
    this._failure.set(null);
    this._wasPaused.set(false);
    this.cancelled = false;
    this._done.set(0);
    this._total.set(0);
    const onFreeze = (): void => this._wasPaused.set(true);
    if (typeof document !== 'undefined') document.addEventListener('freeze', onFreeze);

    let production: ReplayVideoProduction | null = null;
    try {
      production = await this.studio.produce(job.recording, job.settings);
      const made = production;
      if (made.timeline.segments.length < 1) {
        Logger.warn('[ReplayVideo] 画にできる場面がありませんでした', job.recording.id);
        this._failure.set('empty');
        return false;
      }

      const frameCount = Math.max(1, Math.round((made.durationMs / 1000) * job.fps));
      this._total.set(frameCount);
      const audio = await this.soundOf(job.recording.events, made.timeline, job.sound);
      if (audio === false) {
        this._failure.set('sound');
        return false;
      }
      if (this.cancelled) return false;

      const onProgress = (done: number, total: number) => {
        this._done.set(done);
        this._total.set(total);
      };
      const inWorker = this.encoder.isRealtimeOnly
        ? 'unavailable'
        : await encodeReplayVideoInWorker(
            {
              shared: made.share(),
              fps: job.fps,
              frameCount,
              sound: audio
                ? { sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels, length: audio.length }
                : null,
              file,
              baseUrl: typeof document !== 'undefined' ? document.baseURI : '',
            },
            {
              imageOf: (identifier) => {
                const image = this.imageStorage.get(identifier);
                return image ? { blob: image.blob, url: image.url } : null;
              },
              sound: audio,
              isCancelled: () => this.cancelled,
              onProgress,
            }
          );
      const msPerFrame = 1000 / job.fps;
      const encoded =
        inWorker !== 'unavailable'
          ? inWorker
          : this.cancelled
            ? null
            : await this.encoder.encode({
                width: job.settings.width,
                height: job.settings.height,
                fps: job.fps,
                frameCount,
                audio,
                file,
                isCancelled: () => this.cancelled,
                onProgress,
                paint: async (ctx, index) => {
                  const atMs = index * msPerFrame;
                  if (!made.isReady(atMs)) await made.prepare(atMs);
                  made.paint(ctx, atMs);
                },
              });
      if (!encoded) {
        if (!this.cancelled) this._failure.set('encode');
        return false;
      }
      if (this.cancelled) return false;

      const name = replayArchiveName({ roomName: job.recording.roomName, startedAt: job.recording.startedAt });
      this.encoder.save(encoded.blob, `${name}.${encoded.extension}`);
      return true;
    } catch (reason) {
      Logger.warn('[ReplayVideo] 動画にできませんでした', reason);
      this._failure.set('encode');
      return false;
    } finally {
      production?.dispose();
      if (typeof document !== 'undefined') document.removeEventListener('freeze', onFreeze);
      this._isRendering.set(false);
    }
  }

  /**
   * The mixed sound of a video: null for a silent one, whether chosen or with nothing to play, and
   * false when there was sound to mix and it could not be.
   */
  private async soundOf(
    events: readonly ReplayEvent[],
    timeline: ReplayVideoTimeline,
    choice: ReplaySoundChoice = DEFAULT_REPLAY_SOUND_CHOICE
  ): Promise<VideoSoundSource | null | false> {
    const soundtrack = clipReplaySoundtrack(buildReplaySoundtrack(events, timeline, choice), timeline.totalMs);
    if (!hasReplaySound(soundtrack)) return null;
    try {
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
      return false;
    }
  }
}
