import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { findActorAt, findTargetAt, type ReplayManifest } from '@axe/domain/replay/replay-event';
import { replayLineParams, type ReplayLogLine, toReplayLogLine } from '@axe/features/replay/replay-log-line';
import { TranslocoModule } from '@jsverse/transloco';

const EMPTY_DICTIONARY: Pick<ReplayManifest, 'actors' | 'targets'> = { actors: [], targets: [] };

@Component({
  selector: 'replay-staging-banner',
  templateUrl: './replay-staging-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class ReplayStagingBannerComponent {
  private readonly staging = inject(ReplayStagingService);
  private readonly editor = inject(ReplayEditorService);
  private readonly playback = inject(ReplayPlaybackService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);

  protected readonly isStaging = this.staging.isStaging;
  protected readonly captured = this.staging.captured;
  protected readonly actorId = this.staging.actorId;

  protected readonly actors = computed(() => {
    const manifest = this.playback.manifest();
    const seen = new Map<string, string>();
    for (const actor of manifest?.actors ?? []) seen.set(actor.userId, actor.name || actor.userId);
    for (const event of this.playback.events()) if (!seen.has(event.actorId)) seen.set(event.actorId, event.actorId);
    return [...seen].map(([userId, name]) => ({ userId, name }));
  });

  protected readonly lines = computed(() => {
    const manifest = this.playback.manifest() ?? EMPTY_DICTIONARY;
    return this.captured()
      .slice(-4)
      .map((event) => ({
        seq: event.seq,
        line: toReplayLogLine(event, {
          actorName: (userId) => findActorAt(manifest, userId, event.seq)?.name || userId,
          targetName: (identifier) => findTargetAt(manifest, identifier, event.seq)?.name || identifier,
        }),
      }));
  });

  protected lineParams(line: ReplayLogLine): Record<string, string | number> {
    return replayLineParams(line, this.t, this.language.currentLang());
  }

  protected setActorId(actorId: string): void {
    this.staging.setActorId(actorId);
  }

  protected async accept(): Promise<void> {
    const captured = this.staging.take();
    this.editor.insertMany(this.staging.insertIndex(), captured);
    await this.playback.seekTo(this.playback.cursor());
  }

  protected async discard(): Promise<void> {
    this.staging.discard();
    await this.playback.seekTo(this.playback.cursor());
  }
}
