import { computed, inject, Injectable, signal } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
import type { SupportedLang } from '@axe/application/i18n/transloco.config';
import { ReplayVideoAudience, type ReplayVideoSettings } from '@axe/application/replay/replay-video-studio.service';
import { ReplayVideoPacing, ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';

/** The sizes a video can be made at, as YouTube lists them. */
export const REPLAY_VIDEO_SIZES = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
} as const;

export type ReplayVideoSizeKey = keyof typeof REPLAY_VIDEO_SIZES;

/** The size the preview is drawn at: small enough to draw every frame, the same shape as the video. */
export const REPLAY_PREVIEW_SIZE = { width: 1280, height: 720 } as const;

/**
 * The choices a replay video is made with, shared by the preview and the export so the preview
 * shows the video that will be written.
 *
 * A video is made for the public by default, in the language the interface is in.
 */
@Injectable({ providedIn: 'root' })
export class ReplayVideoSettingsService {
  private readonly language = inject(LanguageService);

  readonly style = signal<ReplayVideoStyle>(ReplayVideoStyle.Novel);
  readonly audience = signal<ReplayVideoAudience>(ReplayVideoAudience.Public);
  private readonly chosenLang = signal<SupportedLang | null>(null);
  readonly lang = computed<SupportedLang>(() => this.chosenLang() ?? this.language.currentLang());
  readonly sizeKey = signal<ReplayVideoSizeKey>('1080p');
  readonly fps = signal<30 | 60>(60);
  readonly pacing = signal<ReplayVideoPacing>(ReplayVideoPacing.Reading);
  readonly readingSpeed = signal(1);
  readonly withOpening = signal(true);
  readonly withEffects = signal(true);
  readonly withMusic = signal(true);

  /** Chooses the language of the video. */
  setLang(lang: SupportedLang): void {
    this.chosenLang.set(lang);
  }

  /** The settings a video is made with at a size. */
  settingsAt(size: { width: number; height: number }): ReplayVideoSettings {
    return {
      style: this.style(),
      audience: this.audience(),
      lang: this.lang(),
      width: size.width,
      height: size.height,
      pacing: this.pacing(),
      readingSpeed: this.readingSpeed(),
      tabs: null,
      withOpening: this.withOpening(),
    };
  }
}
