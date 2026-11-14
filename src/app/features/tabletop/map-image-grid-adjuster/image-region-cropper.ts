import { InjectionToken } from '@angular/core';
import { cropImageRegion } from '@axe/features/tabletop/map-image-grid-adjuster/map-image-grid-region';

/** What cuts a rectangle out of a picture into an image blob; a spec hands in its own. */
export const IMAGE_REGION_CROPPER = new InjectionToken<typeof cropImageRegion>('IMAGE_REGION_CROPPER', {
  providedIn: 'root',
  factory: () => cropImageRegion,
});
