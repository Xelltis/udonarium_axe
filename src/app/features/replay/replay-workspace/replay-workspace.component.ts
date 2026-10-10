import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayRecorderService } from '@axe/application/replay/replay-recorder.service';
import { earliestReplaySeq } from '@axe/domain/replay/replay-edit';
import { ReplayDigestPanelComponent } from '@axe/features/replay/replay-digest-panel/replay-digest-panel.component';
import { ReplayScriptPanelComponent } from '@axe/features/replay/replay-script-panel/replay-script-panel.component';
import { ReplayVideoPanelComponent } from '@axe/features/replay/replay-video-panel/replay-video-panel.component';
import { ReplayVideoPreviewComponent } from '@axe/features/replay/replay-video-preview/replay-video-preview.component';
import { ReplayEntryListComponent } from '@axe/features/replay/replay-workspace/replay-entry-list.component';
import { ReplayRecordingListComponent } from '@axe/features/replay/replay-workspace/replay-recording-list.component';
import { ReplayStageComponent } from '@axe/features/replay/replay-workspace/replay-stage.component';
import { formatSnapshotSavedAt } from '@axe/features/room-archive/snapshot-format';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-replay-workspace',
  host: { '(keydown)': 'onKeydown($event)', tabindex: '0' },
  templateUrl: './replay-workspace.component.html',
  imports: [
    TranslocoModule,
    ReplayRecordingListComponent,
    ReplayStageComponent,
    ReplayEntryListComponent,
    ReplayDigestPanelComponent,
    ReplayScriptPanelComponent,
    ReplayVideoPanelComponent,
    ReplayVideoPreviewComponent,
  ],
})
export class ReplayWorkspaceComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly recorder = inject(ReplayRecorderService);
  private readonly library = inject(ReplayLibraryService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly isOpen = this.playback.isOpen;
  protected readonly isRecording = this.recorder.isRecording;
  protected readonly isEditing = this.editor.isEditing;
  protected readonly isDirty = this.editor.isDirty;
  protected readonly isSaving = this.editor.isSaving;
  protected readonly canUndo = this.editor.canUndo;
  protected readonly isDigestOpen = signal(false);
  /** Whether the left column shows the video as it will be written, rather than the playback controls. */
  protected readonly isPreviewOpen = signal(false);
  /** Whether the list of recordings is open over the workspace, for choosing another. */
  protected readonly isChooserOpen = signal(false);

  /** The recording open, named by when it began and where. */
  protected readonly openedLabel = computed(() => {
    const id = this.playback.recordingId();
    const meta = this.recorder.recordings().find((recording) => recording.id === id);
    if (!meta) return this.t('feature.replay.player.choose');
    const room = meta.roomName || this.t('feature.replay.panel.soloRoom');
    return `${formatSnapshotSavedAt(meta.startedAt)} ・ ${room}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.editor.cancel();
      void this.playback.close();
    });
    // Closing a recording returns to the playback view, so the next one does not open on the summary.
    effect(() => {
      if (this.isOpen()) return;
      this.isDigestOpen.set(false);
      this.isPreviewOpen.set(false);
    });
    // Choosing a recording from the list is what closes it.
    effect(() => {
      this.playback.recordingId();
      untracked(() => this.isChooserOpen.set(false));
    });
  }

  protected toggleChooser(): void {
    this.isChooserOpen.update((open) => !open);
  }

  protected toggleDigest(): void {
    // The summary has no transport, and playback left running behind it could not be stopped.
    if (!this.isDigestOpen()) this.playback.stopAutoPlay();
    this.isPreviewOpen.set(false);
    this.isDigestOpen.update((open) => !open);
  }

  /** Shows the video as it will be written in the left column, or the playback controls again. */
  protected togglePreview(): void {
    if (!this.isPreviewOpen()) this.playback.stopAutoPlay();
    this.isDigestOpen.set(false);
    this.isPreviewOpen.update((open) => !open);
  }

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected beginEditing(): void {
    if (!this.canEdit) return;
    this.editor.begin(this.playback.events());
  }

  protected cancelEditing(): void {
    this.editor.cancel();
  }

  protected revertEditing(): void {
    this.editor.revert();
  }

  protected undo(): void {
    this.editor.undo();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.isEditing()) return;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    this.undo();
  }

  protected async saveEdits(): Promise<void> {
    const id = this.playback.recordingId();
    const manifest = this.playback.manifest();
    const edited = this.editor.edited();
    if (id == null || !manifest || edited.length < 1) return;

    const base = await this.library.boardBefore(id, earliestReplaySeq(edited), this.playback.events());
    const derived = await this.editor.saveAsDerived(manifest, base);
    if (derived == null) return;
    await this.recorder.refresh();
    await this.playback.open(derived);
  }
}
