import { InjectionToken } from '@angular/core';
import { cropImageRegion } from '@axe/infrastructure/image/image-region-crop';

/** What cuts a rectangle out of a picture into an image blob; a spec hands in its own. */
export const IMAGE_REGION_CROPPER = new InjectionToken<typeof cropImageRegion>('IMAGE_REGION_CROPPER', {
  providedIn: 'root',
  factory: () => cropImageRegion,
});
