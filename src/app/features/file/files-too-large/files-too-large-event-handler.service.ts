import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import {
  emitImageDropped,
  filesTooLarge$,
  FilesTooLargeEvent,
  FileTooLarge,
  ImageDroppedEvent,
} from '@axe/core/event/domain-events';
import { MAX_LOADED_IMAGE_BYTES } from '@axe/core/storage/file-archiver';
import { filesTooLargeMessage } from '@axe/features/file/files-too-large/files-too-large-message';
import { ImageEditQueue } from '@axe/ui/components/image-editor/image-edit-queue.service';

/** How long the notice stays, a little longer than most, since it names files to go and find. */
const NOTICE_MS = 8000;

/**
 * Deals with the dropped or chosen files a load left out for being too large.
 *
 * A picture that came on its own opens in the image editor, to be cut down or made smaller and
 * added after all, and is placed where it was dropped once the editor has closed: a picture only
 * goes where the table shows under the point, and the editor would stand over it. The rest, sounds
 * and pictures from inside an archive among them, are named at the foot of the screen rather than
 * let vanish without a word, as is a picture still too large once taken as it came.
 */
@Injectable({ providedIn: 'root' })
export class FilesTooLargeEventHandlerService {
  private readonly snackbar = inject(SnackbarService);
  private readonly editQueue = inject(ImageEditQueue);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    filesTooLarge$.subscribe((event) => void this.deal(event), inject(DestroyRef));
  }

  private async deal(event: FilesTooLargeEvent): Promise<void> {
    const editable = this.rolePermission.canEditTabletop ? event.files.filter((entry) => entry.file) : [];
    this.tell(event.files.filter((entry) => !editable.includes(entry)));
    if (editable.length === 0) return;
    const placed: ImageDroppedEvent[] = [];
    const { oversized } = await this.editQueue.editAll(
      editable.map((entry) => entry.file!),
      (file, image) => {
        const dropPoint = editable.find((entry) => entry.file === file)?.dropPoint;
        if (dropPoint) placed.push({ identifier: image.identifier, fileName: file.name, dropPoint });
      }
    );
    for (const event of placed) emitImageDropped(event);
    this.tell(oversized.map((name) => ({ name, kind: 'image', limitBytes: MAX_LOADED_IMAGE_BYTES })));
  }

  private tell(files: readonly FileTooLarge[]): void {
    const message = filesTooLargeMessage(files, this.t);
    if (message) this.snackbar.show(message, { ms: NOTICE_MS });
  }
}
