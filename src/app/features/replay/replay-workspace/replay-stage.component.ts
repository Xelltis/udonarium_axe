import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import {
  formatReplayElapsed,
  replayLineParams,
  type ReplayLogLine,
  toReplayLogLine,
} from '@axe/features/replay/replay-log-line';
import { EMPTY_REPLAY_DICTIONARY, replayNamesAt } from '@axe/features/replay/replay-names';
import {
  buildReplayTimeline,
  type ReplayTimelineChapter,
  replayTimelineIndexAt,
  replayTimelinePosition,
} from '@axe/features/replay/replay-timeline';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-stage',
  templateUrl: './replay-stage.component.html',
  imports: [TranslocoModule],
})
export class ReplayStageComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly confirm = inject(ConfirmService);

  protected readonly cursor = this.playback.cursor;
  protected readonly isBoardMode = this.playback.isBoardMode;
  protected readonly isSeeking = this.playback.isSeeking;
  protected readonly autoPlay = this.playback.autoPlay;
  protected readonly isAtStart = this.playback.isAtStart;
  protected readonly isAtEnd = this.playback.isAtEnd;

  protected readonly total = computed(() => this.playback.events().length);
  protected readonly elapsed = computed(() => formatReplayElapsed(this.playback.currentEvent()?.t ?? 0));
  protected readonly duration = computed(() => {
    const events = this.playback.events();
    return formatReplayElapsed(events[events.length - 1]?.t ?? 0);
  });

  protected readonly timeline = computed(() => buildReplayTimeline(this.playback.events()));
  protected readonly playhead = computed(() => replayTimelinePosition(this.playback.events(), this.cursor()));

  protected readonly chapter = computed<ReplayTimelineChapter | null>(() => {
    const cursor = this.cursor();
    let reached: ReplayTimelineChapter | null = null;
    for (const chapter of this.timeline().chapters) {
      if (chapter.index > cursor) break;
      reached = chapter;
    }
    return reached;
  });

  protected readonly line = computed<ReplayLogLine | null>(() => {
    const event = this.playback.currentEvent();
    if (!event) return null;
    const dictionary = this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY;
    return toReplayLogLine(event, replayNamesAt(dictionary, event.seq));
  });

  private wantedIndex: number | null = null;
  private isScrubbing = false;

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected lineParams(line: ReplayLogLine): Record<string, string | number> {
    return replayLineParams(line, this.t, this.language.currentLang());
  }

  protected async seekTo(index: number): Promise<void> {
    await this.playback.seekTo(index);
  }

  protected async scrubStart(event: PointerEvent): Promise<void> {
    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture(event.pointerId);
    await this.scrubTo(event);
  }

  protected async scrubMove(event: PointerEvent): Promise<void> {
    const track = event.currentTarget as HTMLElement;
    if (!track.hasPointerCapture(event.pointerId)) return;
    await this.scrubTo(event);
  }

  protected async scrubKey(step: number): Promise<void> {
    await this.playback.seekTo(this.cursor() + step);
  }

  private async scrubTo(event: PointerEvent): Promise<void> {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (bounds.width < 1) return;
    const ratio = (event.clientX - bounds.left) / bounds.width;
    this.wantedIndex = replayTimelineIndexAt(this.playback.events(), ratio);
    await this.pumpScrub();
  }

  private async pumpScrub(): Promise<void> {
    if (this.isScrubbing) return;
    this.isScrubbing = true;
    try {
      while (this.wantedIndex !== null) {
        const index = this.wantedIndex;
        this.wantedIndex = null;
        await this.playback.seekTo(index);
      }
    } finally {
      this.isScrubbing = false;
    }
  }

  protected async toStart(): Promise<void> {
    await this.playback.toStart();
  }

  protected async previous(): Promise<void> {
    await this.playback.previous();
  }

  protected async next(): Promise<void> {
    await this.playback.next();
  }

  protected async toEnd(): Promise<void> {
    await this.playback.toEnd();
  }

  protected toggleAutoPlay(): void {
    this.playback.toggleAutoPlay();
  }

  protected async toggleBoardMode(): Promise<void> {
    if (this.isBoardMode()) {
      await this.playback.exitBoardMode();
      return;
    }
    if (!this.canEdit) return;
    if (!(await this.confirm.ask(this.t('feature.replay.player.boardConfirm')))) return;
    await this.playback.enterBoardMode();
  }
}
