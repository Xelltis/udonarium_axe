import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { downloadBlob } from '@axe/core/util/download-blob';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { replayArchiveName } from '@axe/domain/replay/replay-archive';
import { replayCastOnTable } from '@axe/domain/replay/replay-cast';
import {
  buildReplayDigest,
  buildReplayDigestMarkdown,
  EMPTY_REPLAY_DIGEST,
  type ReplayDigestLabels,
} from '@axe/domain/replay/replay-digest';
import { replayScriptElapsed } from '@axe/domain/replay/replay-script';
import { ReplayPhotoService } from '@axe/features/replay/replay-digest-panel/replay-photo.service';
import { ReplayEditorService } from '@axe/features/replay/replay-editor.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The one picture left after a session ends.
 *
 * It counts only what the recording kept, and says outright where it can show nothing.
 * What is visible follows the role of whoever reads it, as with the video and the reading.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-digest-panel',
  templateUrl: './replay-digest-panel.component.html',
  host: { class: 'block min-h-0 flex-1 overflow-y-auto' },
  imports: [TranslocoModule],
})
export class ReplayDigestPanelComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly photo = inject(ReplayPhotoService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly digest = computed(() => {
    // A change of role changes that, and a screen left open follows rather than going stale.
    this.objectChange.trackMyCursor();
    const manifest = this.playback.manifest();
    if (!manifest) return EMPTY_REPLAY_DIGEST;
    const events = this.editor.isEditing() ? this.editor.edited() : this.playback.events();
    return buildReplayDigest(events, manifest, {
      userId: PeerCursor.myCursor?.userId ?? '',
      role: PeerCursor.myRole,
    });
  });

  protected readonly isEmpty = computed(() => {
    const digest = this.digest();
    const numbers = digest.numbers;
    return (
      numbers.messages + numbers.diceRolls + numbers.effects + numbers.rounds < 1 &&
      digest.ledger.length < 1 &&
      digest.fortunes.length < 1
    );
  });

  protected readonly fortuneColumns = ['who', 'rolls', 'average', 'best', 'worst', 'criticals', 'fumbles'] as const;
  protected readonly ledgerColumns = ['who', 'damage', 'heal', 'biggestHit'] as const;

  protected readonly isSavingPhoto = signal(false);
  protected readonly photoOmitted = signal(0);
  protected readonly photoFailed = signal(false);
  protected readonly photoCast = computed(() => replayCastOnTable(this.playback.cast()));

  protected elapsed(ms: number): string {
    return replayScriptElapsed(ms);
  }

  protected saveMarkdown(): void {
    const manifest = this.playback.manifest();
    if (!manifest) return;

    const text = buildReplayDigestMarkdown(this.digest(), this.labels());
    downloadBlob(
      new Blob([text], { type: 'text/markdown;charset=utf-8' }),
      `${replayArchiveName(manifest)}_summary.md`
    );
  }

  private labels(): ReplayDigestLabels {
    const at = (key: string): string => this.t(`feature.replay.digest.${key}`);
    return {
      numbers: {
        elapsedMs: at('numbers.elapsed'),
        messages: at('numbers.messages'),
        diceRolls: at('numbers.diceRolls'),
        effects: at('numbers.effects'),
        rounds: at('numbers.rounds'),
        speakers: at('numbers.speakers'),
      },
      awards: at('awards'),
      awardOf: (key) => at(`award.${key}`),
      fortune: { title: at('fortune.title'), columns: this.fortuneColumns.map((column) => at(`fortune.${column}`)) },
      ledger: {
        title: at('ledger.title'),
        columns: this.ledgerColumns.map((column) => at(`ledger.${column}`)),
        note: at('ledger.note'),
      },
      elapsed: (ms) => replayScriptElapsed(ms),
    };
  }

  protected async savePhoto(): Promise<void> {
    const manifest = this.playback.manifest();
    if (!manifest || this.isSavingPhoto()) return;

    this.isSavingPhoto.set(true);
    this.photoOmitted.set(0);
    this.photoFailed.set(false);
    try {
      const result = await this.photo.save({
        cast: this.photoCast(),
        roomName: manifest.roomName,
        subtitle: this.t('feature.replay.digest.photo.taken', { date: this.dateOf(manifest.startedAt) }),
        fileName: `${replayArchiveName(manifest)}_photo`,
      });
      this.photoOmitted.set(result.omitted);
      this.photoFailed.set(!result.saved);
    } catch {
      // A picture may not load and a sheet may not be made; better to say so than to have nothing happen in silence.
      this.photoFailed.set(true);
    } finally {
      this.isSavingPhoto.set(false);
    }
  }

  private dateOf(at: number): string {
    const date = new Date(at);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
