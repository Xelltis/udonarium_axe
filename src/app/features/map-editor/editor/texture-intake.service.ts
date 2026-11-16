import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { tagImageUnlessKept } from '@axe/domain/media/image-tagging';
import { TEXTURE_IMAGE_TAG } from '@axe/domain/media/texture-catalog';
import {
  TextureCropDialogComponent,
  TextureCropDialogOption,
} from '@axe/features/map-editor/editor/texture-crop-dialog.component';

@Injectable({ providedIn: 'root' })
export class TextureIntakeService {
  private readonly imageStorage = inject(ImageStorage);
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Takes a picture in as a texture, square and tagged, or nothing where the crop was left.
   *
   * A picture the room already holds under a tag kept to someone stays under it, and is handed over
   * to be used all the same: the person is told it lists among the textures once it is kept no more.
   */
  async takeIn(file: File): Promise<ImageFile | null> {
    const objectUrl = URL.createObjectURL(file);
    const blob = await this.modalService
      .open<Blob | null>(TextureCropDialogComponent, { objectUrl } as TextureCropDialogOption)
      .catch(() => null);
    URL.revokeObjectURL(objectUrl);
    if (!blob) return null;
    const imageFile = await this.imageStorage.addAsync(blob, { putBack: true });
    if (!imageFile) return null;
    const kept = tagImageUnlessKept(imageFile.identifier, TEXTURE_IMAGE_TAG);
    if (kept) this.snackbar.show(this.t('feature.mapEditor.props.textureKeptPrivate', { tag: kept }));
    this.objectChange.notifyCollectionChanged('image-tag');
    return imageFile;
  }
}
