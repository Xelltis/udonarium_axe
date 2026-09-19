import { inject, Injectable } from '@angular/core';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import type { SupportedLang } from '@axe/application/i18n/transloco.config';
import { ReplayFontLoader } from '@axe/application/replay/replay-font-loader.service';
import { readKeyframeBytes } from '@axe/application/replay/replay-keyframe-bytes';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import {
  ReplayVideoProduction,
  type ReplayVideoProductionInput,
} from '@axe/application/replay/replay-video-production';
import { Logger } from '@axe/core/logging/logger';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { earliestReplaySeq } from '@axe/domain/replay/replay-edit';
import type { ReplayEvent, ReplayManifest, ReplayViewer } from '@axe/domain/replay/replay-event';
import { decodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import type { ReplayTextMeasure } from '@axe/domain/replay/video/replay-text-layout';
import type {
  ReplayVideoPacing,
  ReplayVideoStyle,
  ReplayVideoText,
} from '@axe/domain/replay/video/replay-video-timeline';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

/**
 * Whose eyes a video is made through: the public, who see what a guest at the table saw; a player,
 * who also sees what was meant for them; or the game master, who sees everything.
 */
export const ReplayVideoAudience = {
  Public: 'public',
  Player: 'player',
  GameMaster: 'gm',
} as const;

export type ReplayVideoAudience = (typeof ReplayVideoAudience)[keyof typeof ReplayVideoAudience];

/** How a replay video is made. */
export interface ReplayVideoSettings {
  style: ReplayVideoStyle;
  audience: ReplayVideoAudience;
  /** The language the words of the video are in. What was said is kept as it was said. */
  lang: SupportedLang;
  width: number;
  height: number;
  pacing: ReplayVideoPacing;
  readingSpeed: number;
  /** The chat tabs whose lines are shown. Every tab when null. */
  tabs: readonly string[] | null;
  withOpening: boolean;
}

/** What is known of the recording a video is made from. */
export interface ReplayVideoRecording {
  id: number;
  roomName: string;
  startedAt: number;
  manifest: ReplayManifest | null;
  events: readonly ReplayEvent[];
  /** The one making the video, whose own secrets a player's video shows. */
  userId: string;
}

/**
 * Makes replay videos ready to draw: it reads the board the recording starts from, sets up the words
 * in the language chosen, loads the fonts the video is set in, and hands back a production for the
 * preview or the export to draw.
 */
@Injectable({ providedIn: 'root' })
export class ReplayVideoStudioService {
  private readonly library = inject(ReplayLibraryService);
  private readonly fonts = inject(ReplayFontLoader);
  private readonly imageStorage = inject(ImageStorage);
  private readonly transloco = inject(TranslocoService);

  /** A production of the recording with the settings given. */
  async produce(
    recording: ReplayVideoRecording,
    settings: ReplayVideoSettings,
    onImageLoaded?: () => void
  ): Promise<ReplayVideoProduction> {
    const [base, text, bundledFonts] = await Promise.all([
      this.baseBoardOf(recording.id, recording.events),
      this.textFor(settings.lang),
      this.fonts.load(),
    ]);
    return new ReplayVideoProduction({
      ...this.inputOf(recording, settings, base, text, onImageLoaded),
      bundledFonts,
    });
  }

  /**
   * How long the video would run and how many moments it would hold, worked out at once without
   * reading the board or loading anything.
   */
  estimate(recording: ReplayVideoRecording, settings: ReplayVideoSettings): { count: number; durationMs: number } {
    const production = new ReplayVideoProduction(this.inputOf(recording, settings, [], this.textNow(settings.lang)));
    const estimate = { count: production.timeline.segments.length, durationMs: production.durationMs };
    production.dispose();
    return estimate;
  }

  private inputOf(
    recording: ReplayVideoRecording,
    settings: ReplayVideoSettings,
    base: readonly ReplayObjectSnapshot[],
    text: ReplayVideoText,
    onImageLoaded?: () => void
  ): ReplayVideoProductionInput {
    return {
      events: recording.events,
      manifest: recording.manifest,
      base,
      viewer: replayVideoViewer(settings.audience, recording.userId),
      text,
      width: settings.width,
      height: settings.height,
      style: settings.style,
      pacing: settings.pacing,
      readingSpeed: settings.readingSpeed,
      tabs: settings.tabs ? new Set(settings.tabs) : null,
      opening: settings.withOpening ? openingOf(recording, settings.lang) : null,
      images: this.imageStorage,
      measureWith: measureTextWith,
      onImageLoaded,
    };
  }

  /** The words of the video in a language, loading its translations first when they are not here yet. */
  async textFor(lang: SupportedLang): Promise<ReplayVideoText> {
    try {
      await firstValueFrom(this.transloco.load(lang));
    } catch (reason) {
      Logger.warn('[ReplayVideo] 翻訳を読めませんでした', lang, reason);
    }
    return this.textNow(lang);
  }

  /** The words of the video in a language, with whatever of its translations have loaded. */
  private textNow(lang: SupportedLang): ReplayVideoText {
    const t = (key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params, lang);
    return { lang, t, decode: (text) => decodeI18nMessage(text, t) };
  }

  private async baseBoardOf(id: number, events: readonly ReplayEvent[]): Promise<ReplayObjectSnapshot[]> {
    try {
      const keyframe = await this.library.keyframeBefore(id, earliestReplaySeq(events));
      return keyframe ? decodeReplayKeyframe(await readKeyframeBytes(keyframe.blob)) : [];
    } catch (reason) {
      Logger.warn('[ReplayVideo] 卓の様子を読めませんでした', reason);
      return [];
    }
  }
}

/** The viewer a video for an audience is made as. */
export function replayVideoViewer(audience: ReplayVideoAudience, userId: string): ReplayViewer {
  switch (audience) {
    case ReplayVideoAudience.GameMaster:
      return { userId, role: PeerRole.GameMaster };
    case ReplayVideoAudience.Player:
      return { userId, role: PeerRole.Player };
    default:
      return { userId: '', role: PeerRole.Guest };
  }
}

function openingOf(recording: ReplayVideoRecording, lang: SupportedLang): { title: string; subtitle: string } {
  const date = recording.startedAt > 0 ? new Date(recording.startedAt) : null;
  const subtitle = date ? new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(date) : '';
  return { title: recording.roomName, subtitle };
}

/** Measures text in a font on a canvas of its own, or by counting characters where there is no canvas. */
function measureTextWith(font: string): ReplayTextMeasure {
  const context = measuringContext();
  if (!context) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
    return (text) => [...text].length * size;
  }
  return (text) => {
    context.font = font;
    return context.measureText(text).width;
  };
}

function measuringContext(): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1).getContext('2d');
    if (typeof document !== 'undefined') return document.createElement('canvas').getContext('2d');
  } catch {
    return null;
  }
  return null;
}
