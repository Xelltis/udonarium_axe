import { inject, Injectable, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { Network } from '@axe/core/network/network';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

/** How long the menu goes on showing a finished save, so the last of its count can be read. */
const SAVED_SHOWN_MS = 500;

/** Saving the room to a file, and loading rooms and pieces from files, for whichever screen asks. */
@Injectable({ providedIn: 'root' })
export class RoomFilesService {
  private readonly saveData = inject(SaveDataService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  private readonly saving = signal(false);
  private readonly percent = signal(0);

  /** Whether a save is running. */
  readonly isSaving = this.saving.asReadonly();
  /** How far the running save has gone, out of a hundred. */
  readonly progressPercent = this.percent.asReadonly();

  /**
   * Saves the room to a file named after it, counting its progress as it goes.
   *
   * A press while a save is already running is ignored.
   */
  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.percent.set(0);

    const roomName =
      Network.peerContext && Network.peerContext.roomName.length > 0
        ? Network.peerContext.roomName
        : this.t('app.roomDataDefault');
    await this.saveData.saveRoomAsync(roomName, (percent) => this.percent.set(percent));

    setTimeout(() => {
      this.saving.set(false);
      this.percent.set(0);
    }, SAVED_SHOWN_MS);
  }

  /**
   * Loads the files chosen in a file picker into the room.
   *
   * Refused for a role that may not edit the table. The picker is cleared either way, so the same
   * file can be chosen again.
   */
  loadChosen(input: HTMLInputElement): void {
    if (!this.rolePermission.canEditTabletop()) {
      input.value = '';
      return;
    }
    const files = input.files;
    this.objectStore.get<ReloadCheck>('ReloadCheck')?.reloadCheckStart(Network.peerContext.roomName !== '');
    if (files && files.length) this.fileArchiver.load(files);
    input.value = '';
  }
}
