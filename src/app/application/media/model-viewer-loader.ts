import { InjectionToken } from '@angular/core';
import type { ModelViewerModule } from '@axe/infrastructure/model-viewer/model-viewer-port';

/** Loads what draws 3D models on their own, or gives null where it cannot be loaded. */
export type ModelViewerLoader = () => Promise<ModelViewerModule | null>;

/** Loads the module that draws models on their own, the first time something asks for it. */
function loadModelViewer(): Promise<ModelViewerModule | null> {
  return import('@axe/infrastructure/model-viewer/model-viewer').then(
    (viewer: ModelViewerModule) => viewer,
    () => null
  );
}

/** How the list of models loads what draws them, which a spec gives a stand-in for. */
export const MODEL_VIEWER_LOADER = new InjectionToken<ModelViewerLoader>('MODEL_VIEWER_LOADER', {
  providedIn: 'root',
  factory: () => loadModelViewer,
});
