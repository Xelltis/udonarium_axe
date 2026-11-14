import { InjectionToken } from '@angular/core';
import { loadRasterImage } from '@axe/infrastructure/map-editor/raster-image';

/** What waits for the picture at an address to load; a spec hands in its own. */
export const RASTER_IMAGE_LOADER = new InjectionToken<typeof loadRasterImage>('RASTER_IMAGE_LOADER', {
  providedIn: 'root',
  factory: () => loadRasterImage,
});
