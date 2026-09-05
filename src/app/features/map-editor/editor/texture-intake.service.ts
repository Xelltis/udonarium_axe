import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag } from '@axe/domain/media/image-tag';
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

  /** Takes a picture in as a texture, square and tagged, or nothing where the crop was left. */
  async takeIn(file: File): Promise<ImageFile | null> {
    const objectUrl = URL.createObjectURL(file);
    const blob = await this.modalService
      .open<Blob | null>(TextureCropDialogComponent, { objectUrl } as TextureCropDialogOption)
      .catch(() => null);
    URL.revokeObjectURL(objectUrl);
    if (!blob) return null;
    const imageFile = await this.imageStorage.addAsync(blob);
    ImageTag.create(imageFile.identifier).tag = TEXTURE_IMAGE_TAG;
    this.objectChange.notifyCollectionChanged('image-tag');
    return imageFile;
  }
}
