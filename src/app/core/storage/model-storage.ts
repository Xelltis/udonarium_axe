import { isBundledModel } from '@axe/core/storage/bundled-models';
import { ModelFile, ModelFileContext, ModelState } from '@axe/core/storage/model-file';
import { SharedAssetStorage } from '@axe/core/storage/shared-asset-storage';

/**
 * The 3D models this seat holds, kept and shared as the sounds are: each under the SHA-256 of its
 * bytes, listed to peers once it is held in full, put up to the room server's asset store where the
 * room has one, and let go of where the room's GM removed it. One bundled with the app is neither put
 * up nor named to peers, as every seat has it beside its own page.
 */
export class ModelStorage extends SharedAssetStorage<ModelFile, ModelFileContext> {
  private static _instance: ModelStorage;
  /** The one store of models for the page, created on first use. */
  static get instance(): ModelStorage {
    if (!ModelStorage._instance) ModelStorage._instance = new ModelStorage();
    return ModelStorage._instance;
  }

  private constructor() {
    super({
      catalogMessage: 'SYNCHRONIZE_MODEL_LIST',
      complete: ModelState.COMPLETE,
      isFile: (arg): arg is ModelFile => arg instanceof ModelFile,
      fromContext: (context) => ModelFile.create(context),
      readAsync: (blob) => ModelFile.createAsync(blob),
      keptHome: isBundledModel,
    });
  }

  /** Every model this seat knows of, including placeholders whose bytes have not arrived. */
  get models(): ModelFile[] {
    return this.files;
  }
}
