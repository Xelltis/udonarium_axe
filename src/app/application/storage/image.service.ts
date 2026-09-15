import { inject, Injectable } from '@angular/core';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';

const skeletonImage: ImageFile = ImageFile.create('./assets/images/skeleton.png');

@Injectable({
  providedIn: 'root',
})
export class ImageService {
  private readonly imageStorage = inject(ImageStorage);

  constructor() {}

  /** The picture named, or the skeleton placeholder when it is missing, unknown or empty. */
  getSkeletonOr(arg: ImageFile | string | null): ImageFile {
    if (!arg) return skeletonImage;
    const image = arg instanceof ImageFile ? arg : this.imageStorage.get(arg);
    return image && !image.isEmpty ? image : skeletonImage;
  }

  /** The picture named, or the empty image when it is missing, unknown or empty. */
  getEmptyOr(arg: ImageFile | string | null): ImageFile {
    if (!arg) return ImageFile.Empty;
    const image = arg instanceof ImageFile ? arg : this.imageStorage.get(arg);
    return image && !image.isEmpty ? image : ImageFile.Empty;
  }
}
