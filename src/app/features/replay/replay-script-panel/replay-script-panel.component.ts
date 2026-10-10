import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { downloadBlob } from '@axe/core/util/download-blob';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { replayArchiveName } from '@axe/domain/replay/replay-archive';
import type { ReplayEvent } from '@axe/domain/replay/replay-event';
import {
  buildReplayScriptLines,
  buildReplayScriptMarkdown,
  ReplayScriptFormat,
} from '@axe/domain/replay/replay-script';
import { buildReplayStoryboard, ReplayShotPacing, ReplayShotScope } from '@axe/domain/replay/replay-storyboard';
import { renderReplayLogLine, toReplayLogLine } from '@axe/features/replay/replay-log-line';
import { EMPTY_REPLAY_DICTIONARY, replayNamesAt } from '@axe/features/replay/replay-names';
import { TranslocoModule } from '@jsverse/transloco';

export const REPLAY_SCRIPT_FORMATS = [ReplayScriptFormat.Novel, ReplayScriptFormat.Script] as const;

/**
 * Exports a recording as something to read.
 *
 * It works from the same storyboard as the video, so the chapter breaks and the narration match it.
 * What is visible follows the role of whoever exports it, as it does for the video.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-script-panel',
  templateUrl: './replay-script-panel.component.html',
  imports: [TranslocoModule],
})
export class ReplayScriptPanelComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);

  protected readonly formats = REPLAY_SCRIPT_FORMATS;
  protected readonly isOpen = signal(false);
  protected readonly format = signal<ReplayScriptFormat>(ReplayScriptFormat.Novel);
  protected readonly withTime = signal(false);
  protected readonly withBoard = signal(false);

  protected readonly estimate = computed(() => ({ lines: buildReplayScriptLines(this.storyboard()).length }));

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  protected setFormat(value: string): void {
    this.format.set(value as ReplayScriptFormat);
  }

  protected toggleTime(): void {
    this.withTime.update((value) => !value);
  }

  protected toggleBoard(): void {
    this.withBoard.update((value) => !value);
  }

  protected save(): void {
    const manifest = this.playback.manifest();
    const title = manifest?.roomName ?? '';
    const text = buildReplayScriptMarkdown(this.storyboard(), {
      format: this.format(),
      title,
      withTime: this.withTime(),
    });
    if (text.length < 1) return;

    const name = replayArchiveName({ roomName: title, startedAt: manifest?.startedAt ?? 0 });
    downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
    this.isOpen.set(false);
  }

  private storyboard() {
    return buildReplayStoryboard(this.events(), this.playback.cast(), {
      pacing: ReplayShotPacing.Reading,
      // The movements on the board would turn the reading into an operation log, so they go in only when asked for.
      scope: this.withBoard() ? ReplayShotScope.Everything : ReplayShotScope.Lines,
      viewer: { userId: PeerCursor.myCursor?.userId ?? '', role: PeerCursor.myRole },
      caption: (event: ReplayEvent) => this.captionOf(event),
    });
  }

  private captionOf(event: ReplayEvent): string {
    const dictionary = this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY;
    const line = toReplayLogLine(event, replayNamesAt(dictionary, event.seq));
    return renderReplayLogLine(line, this.t, this.language.currentLang());
  }

  private events() {
    return this.editor.isEditing() ? this.editor.edited() : this.playback.events();
  }
}
