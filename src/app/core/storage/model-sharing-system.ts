import { ModelFile, ModelFileContext } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { SharedAssetSharingSystem } from '@axe/core/storage/shared-asset-sharing-system';

/**
 * Trades the 3D models between peers as the sounds are traded: catalogues, requests, transfers one
 * file at a time from each peer holding one, and the room server's asset store where the room has
 * one.
 */
export class ModelSharingSystem extends SharedAssetSharingSystem<ModelFile, ModelFileContext> {
  private static _instance: ModelSharingSystem;
  /** The one model sharing system for the page, created on first use. */
  static get instance(): ModelSharingSystem {
    if (!ModelSharingSystem._instance) ModelSharingSystem._instance = new ModelSharingSystem();
    return ModelSharingSystem._instance;
  }

  private constructor() {
    super({
      storage: () => ModelStorage.instance,
      createEmpty: (identifier, name) => ModelFile.createEmpty(identifier, name),
      messages: {
        request: 'REQUEST_MODEL_RESOURE',
        update: 'UPDATE_MODEL_RESOURE',
        start: 'START_MODEL_TRANSMISSION',
      },
      logName: 'ModelSync',
    });
  }
}
