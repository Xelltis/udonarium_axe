import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayRecorderService } from '@axe/application/replay/replay-recorder.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import type { ReplayRecordingMeta } from '@axe/core/storage/replay-log-store';
import { formatSnapshotByteSize, formatSnapshotSavedAt } from '@axe/features/room-archive/snapshot-format';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-recording-list',
  templateUrl: './replay-recording-list.component.html',
  imports: [TranslocoModule],
})
export class ReplayRecordingListComponent {
  private readonly recorder = inject(ReplayRecorderService);
  private readonly library = inject(ReplayLibraryService);
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  protected readonly recordings = this.recorder.recordings;
  protected readonly isBusy = this.library.isBusy;
  protected readonly isRecording = this.recorder.isRecording;
  protected readonly openedId = this.playback.recordingId;
  protected readonly withAssets = signal(true);

  protected readonly isEmpty = computed(() => this.recordings().length < 1);

  constructor() {
    void this.recorder.refresh();
  }

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected startedAtLabel(meta: ReplayRecordingMeta): string {
    return formatSnapshotSavedAt(meta.startedAt);
  }

  protected byteSizeLabel(meta: ReplayRecordingMeta): string {
    return formatSnapshotByteSize(meta.byteSize);
  }

  protected isLive(meta: ReplayRecordingMeta): boolean {
    return this.isRecording() && meta.endedAt === null;
  }

  /**
   * Opens a recording, or opens the open one again from its start.
   *
   * While editing, the recording being edited stays as it is, and before another is opened the
   * edits are thrown away, once confirmed when there are any; the list would otherwise go on
   * showing the old recording's edited rows.
   */
  protected async open(meta: ReplayRecordingMeta): Promise<void> {
    if (this.editor.isEditing()) {
      if (meta.id === this.openedId()) return;
      if (this.editor.isDirty() && !(await this.confirm.ask(this.t('feature.replay.editor.discardConfirm')))) return;
      this.editor.cancel();
    }
    await this.playback.open(meta.id);
  }

  protected toggleAssets(): void {
    this.withAssets.update((value) => !value);
  }

  protected async exportRecording(meta: ReplayRecordingMeta): Promise<void> {
    await this.library.export(meta, this.withAssets());
  }

  protected async importRecording(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.library.import(file);
    await this.recorder.refresh();
  }

  protected async remove(meta: ReplayRecordingMeta): Promise<void> {
    if (!this.canEdit) return;
    const asked = await this.confirm.ask({
      message: this.t('feature.replay.panel.removeConfirm', { startedAt: this.startedAtLabel(meta) }),
      okLabel: this.t('common.button.delete'),
      danger: true,
    });
    if (!asked) return;
    if (this.openedId() === meta.id) await this.playback.close();
    await this.recorder.remove(meta.id);
  }
}
