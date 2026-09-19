import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { SUPPORTED_LANGS, type SupportedLang } from '@axe/application/i18n/transloco.config';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import type { ReplayVideoProduction } from '@axe/application/replay/replay-video-production';
import {
  ReplayVideoAudience,
  type ReplayVideoRecording,
  ReplayVideoStudioService,
} from '@axe/application/replay/replay-video-studio.service';
import { Logger } from '@axe/core/logging/logger';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';
import { ReplayFocusService } from '@axe/features/replay/replay-focus.service';
import { formatReplayElapsed } from '@axe/features/replay/replay-log-line';
import { REPLAY_PREVIEW_SIZE, ReplayVideoSettingsService } from '@axe/features/replay/replay-video-settings.service';
import { TranslocoModule } from '@jsverse/transloco';

/** How long the preview waits for editing to settle before laying the video out again. */
const REBUILD_DELAY_MS = 300;

/**
 * The replay video as it will be written, drawn in the workspace.
 *
 * It plays and seeks, and goes to whatever row is chosen in the list. The look, who it is made for
 * and its language are chosen here and shared with the export, and every edit to the recording
 * shows at once, since the preview is drawn by the same renderer the export uses.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-video-preview',
  templateUrl: './replay-video-preview.component.html',
  imports: [TranslocoModule],
})
export class ReplayVideoPreviewComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly studio = inject(ReplayVideoStudioService);
  private readonly focus = inject(ReplayFocusService);
  protected readonly settings = inject(ReplayVideoSettingsService);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly styles = [ReplayVideoStyle.Novel, ReplayVideoStyle.Tabletop];
  protected readonly audiences = [
    ReplayVideoAudience.Public,
    ReplayVideoAudience.Player,
    ReplayVideoAudience.GameMaster,
  ];
  protected readonly langs = SUPPORTED_LANGS;
  protected readonly width = REPLAY_PREVIEW_SIZE.width;
  protected readonly height = REPLAY_PREVIEW_SIZE.height;

  private readonly production = signal<ReplayVideoProduction | null>(null);
  protected readonly time = signal(0);
  protected readonly isPlaying = signal(false);
  protected readonly isBuilding = signal(false);
  protected readonly duration = computed(() => this.production()?.durationMs ?? 0);
  protected readonly elapsed = computed(() => formatReplayElapsed(this.time()));
  protected readonly total = computed(() => formatReplayElapsed(this.duration()));
  protected readonly isEmpty = computed(() => {
    const production = this.production();
    return production !== null && production.timeline.segments.length < 1;
  });

  private frame = 0;
  private lastTick = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      const recording = this.recording();
      const settings = this.settings.settingsAt(REPLAY_PREVIEW_SIZE);
      untracked(() => this.scheduleRebuild(recording, settings));
    });
    effect(() => {
      const seq = this.focus.seq() ?? this.playback.currentEvent()?.seq ?? null;
      const production = this.production();
      if (seq === null || !production) return;
      untracked(() => {
        if (this.isPlaying()) return;
        const at = production.timeOf(seq);
        if (at !== null) this.seek(at);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
      this.generation++;
      this.production()?.dispose();
    });
  }

  private readonly recording = computed<ReplayVideoRecording | null>(() => {
    const id = this.playback.recordingId();
    if (id === null) return null;
    const manifest = this.playback.manifest();
    return {
      id,
      roomName: manifest?.roomName ?? '',
      startedAt: manifest?.startedAt ?? 0,
      manifest,
      events: this.editor.isEditing() ? this.editor.edited() : this.playback.events(),
      userId: PeerCursor.myCursor?.userId ?? '',
    };
  });

  private scheduleRebuild(
    recording: ReplayVideoRecording | null,
    settings: ReturnType<ReplayVideoSettingsService['settingsAt']>
  ): void {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    const generation = ++this.generation;
    this.rebuildTimer = setTimeout(async () => {
      this.rebuildTimer = null;
      if (!recording) {
        this.replace(null);
        return;
      }
      this.isBuilding.set(true);
      try {
        const made = await this.studio.produce(recording, settings, () => this.requestPaint());
        if (generation !== this.generation) {
          made.dispose();
          return;
        }
        this.replace(made);
      } catch (reason) {
        Logger.warn('[ReplayVideoPreview] 動画を組めませんでした', reason);
      } finally {
        if (generation === this.generation) this.isBuilding.set(false);
      }
    }, REBUILD_DELAY_MS);
  }

  private replace(next: ReplayVideoProduction | null): void {
    this.production()?.dispose();
    this.production.set(next);
    this.time.update((time) => Math.min(time, next?.durationMs ?? 0));
    this.requestPaint();
  }

  /** Goes to a moment of the video. */
  protected seek(atMs: number): void {
    this.time.set(Math.max(0, Math.min(this.duration(), atMs)));
    this.requestPaint();
  }

  protected togglePlay(): void {
    if (this.isPlaying()) {
      this.isPlaying.set(false);
      return;
    }
    if (this.time() >= this.duration()) this.time.set(0);
    this.isPlaying.set(true);
    this.lastTick = performance.now();
    this.requestPaint();
  }

  protected setStyle(style: ReplayVideoStyle): void {
    this.settings.style.set(style);
  }

  protected setAudience(value: string): void {
    this.settings.audience.set(value as ReplayVideoAudience);
  }

  protected setLang(value: string): void {
    this.settings.setLang(value as SupportedLang);
  }

  private requestPaint(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame((now) => this.draw(now));
  }

  private draw(now: number): void {
    const production = this.production();
    const context = this.canvas().nativeElement.getContext('2d');
    if (!production || !context) return;

    if (this.isPlaying()) {
      const next = this.time() + (now - this.lastTick);
      this.lastTick = now;
      if (next >= production.durationMs) {
        this.time.set(production.durationMs);
        this.isPlaying.set(false);
      } else {
        this.time.set(next);
      }
    }
    production.paint(context, this.time());
    if (!production.isReady(this.time())) void production.prepare(this.time());
    if (this.isPlaying()) this.frame = requestAnimationFrame((later) => this.draw(later));
  }
}
