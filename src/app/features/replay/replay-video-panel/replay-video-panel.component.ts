import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SUPPORTED_LANGS, type SupportedLang } from '@axe/application/i18n/transloco.config';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayVideoService } from '@axe/application/replay/replay-video.service';
import {
  ReplayVideoAudience,
  type ReplayVideoRecording,
  ReplayVideoStudioService,
} from '@axe/application/replay/replay-video-studio.service';
import { askVideoFile, isVideoFileSinkSupported, VIDEO_FILE_DECLINED } from '@axe/core/media/video-file-sink';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { replayArchiveName } from '@axe/domain/replay/replay-archive';
import { ReplayVideoPacing, ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';
import { formatReplayElapsed } from '@axe/features/replay/replay-log-line';
import {
  REPLAY_VIDEO_SIZES,
  ReplayVideoSettingsService,
  type ReplayVideoSizeKey,
} from '@axe/features/replay/replay-video-settings.service';
import { TranslocoModule } from '@jsverse/transloco';

export const REPLAY_VIDEO_FPS_CHOICES = [30, 60] as const;
export const REPLAY_READING_SPEEDS = [0.8, 1, 1.25, 1.5] as const;

/**
 * The export of a replay as a video file: its size and frame rate, its look, who it is made for, its
 * language, its pace and its sound, with how long it will run. The choices are shared with the
 * preview, so what was previewed is what is written.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-video-panel',
  templateUrl: './replay-video-panel.component.html',
  imports: [TranslocoModule],
})
export class ReplayVideoPanelComponent {
  private readonly video = inject(ReplayVideoService);
  private readonly studio = inject(ReplayVideoStudioService);
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly rolePermission = inject(RolePermissionService);
  protected readonly settings = inject(ReplayVideoSettingsService);

  protected readonly sizes = Object.keys(REPLAY_VIDEO_SIZES) as ReplayVideoSizeKey[];
  protected readonly fpsChoices = REPLAY_VIDEO_FPS_CHOICES;
  protected readonly styles = [ReplayVideoStyle.Novel, ReplayVideoStyle.Tabletop];
  protected readonly audiences = [
    ReplayVideoAudience.Public,
    ReplayVideoAudience.Player,
    ReplayVideoAudience.GameMaster,
  ];
  protected readonly langs = SUPPORTED_LANGS;
  protected readonly pacings = [ReplayVideoPacing.Reading, ReplayVideoPacing.Recorded];
  protected readonly speeds = REPLAY_READING_SPEEDS;

  protected readonly isRendering = this.video.isRendering;
  protected readonly progress = this.video.progress;
  protected readonly failure = this.video.failure;
  protected readonly isOpen = signal(false);

  protected readonly isSupported = this.video.isSupported;
  protected readonly isRealtimeOnly = this.video.isRealtimeOnly;

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

  protected readonly estimate = computed(() => {
    if (!this.isOpen()) return { count: 0, length: '' };
    const recording = this.recording();
    if (!recording) return { count: 0, length: '' };
    const { count, durationMs } = this.studio.estimate(
      recording,
      this.settings.settingsAt({ width: 1920, height: 1080 })
    );
    return { count, length: formatReplayElapsed(durationMs) };
  });

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  protected setSize(value: string): void {
    this.settings.sizeKey.set(value as ReplayVideoSizeKey);
  }

  protected setFps(value: string): void {
    this.settings.fps.set(Number(value) === 30 ? 30 : 60);
  }

  protected setStyle(value: string): void {
    this.settings.style.set(value as ReplayVideoStyle);
  }

  protected setAudience(value: string): void {
    this.settings.audience.set(value as ReplayVideoAudience);
  }

  protected setLang(value: string): void {
    this.settings.setLang(value as SupportedLang);
  }

  protected setPacing(value: string): void {
    this.settings.pacing.set(value as ReplayVideoPacing);
  }

  protected setSpeed(value: string): void {
    this.settings.readingSpeed.set(Number(value) || 1);
  }

  protected toggleOpening(): void {
    this.settings.withOpening.update((value) => !value);
  }

  protected toggleEffects(): void {
    this.settings.withEffects.update((value) => !value);
  }

  protected toggleMusic(): void {
    this.settings.withMusic.update((value) => !value);
  }

  protected cancel(): void {
    this.video.cancel();
  }

  protected async render(): Promise<void> {
    const recording = this.recording();
    if (!recording || this.estimate().count < 1) return;

    // Where to save is asked within the press itself; asking after the writing leaves the
    // browser unconvinced it followed an action, and it shows no dialogue.
    const name = replayArchiveName({ roomName: recording.roomName, startedAt: recording.startedAt });
    const file = isVideoFileSinkSupported() ? await askVideoFile(`${name}.mp4`) : null;
    if (file === VIDEO_FILE_DECLINED) return;

    this.isOpen.set(false);
    await this.video.render(
      {
        recording,
        settings: this.settings.settingsAt(REPLAY_VIDEO_SIZES[this.settings.sizeKey()]),
        fps: this.settings.fps(),
        sound: { withEffects: this.settings.withEffects(), withMusic: this.settings.withMusic() },
      },
      file
    );
  }
}
