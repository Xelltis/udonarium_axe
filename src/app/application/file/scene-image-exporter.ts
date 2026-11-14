import { InjectionToken } from '@angular/core';
import { exportSceneToBlob } from '@axe/infrastructure/map-editor/export-image';

/** What bakes a map editor scene into an image blob; a spec hands in its own. */
export const SCENE_IMAGE_EXPORTER = new InjectionToken<typeof exportSceneToBlob>('SCENE_IMAGE_EXPORTER', {
  providedIn: 'root',
  factory: () => exportSceneToBlob,
});
