import { Network } from '@axe/core/network/network';
import { BUNDLED_PIECE_MODELS } from '@axe/core/storage/bundled-models';
import { MODEL_TYPE, ModelFile, ModelFileContext } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { describeSharedAssetStorage } from '@axe/testing/shared-asset-storage-cases';

const GLB_HEADER = [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0];

/** A model held whole under the identifier, as one received from a peer. */
const contextOf = (identifier: string): ModelFileContext => ({
  identifier,
  name: 'theme.glb',
  type: MODEL_TYPE,
  blob: new Blob([new Uint8Array(GLB_HEADER)], { type: MODEL_TYPE }),
  url: '',
});

describeSharedAssetStorage<ModelStorage, ModelFile, ModelFileContext>(
  {
    name: 'ModelStorage',
    noun: 'model',
    storage: () => ModelStorage.instance,
    files: (storage) => storage.models,
    file: ModelFile,
    contextOf,
    uploadName: 'theme.glb',
    readable: () => new Blob([new Uint8Array(GLB_HEADER)]),
  },
  {
    assetServer: (h) => {
      it('never puts up a model bundled with the app, nor names it to peers, as every seat has it beside its own page', async () => {
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('gm');
        h.storage.add(ModelFile.create(contextOf(BUNDLED_PIECE_MODELS.goblin)));
        h.storage.add(ModelFile.create(contextOf(h.heldId)));

        h.storage.uploadAllToAssetStore();
        await Promise.resolve();

        expect(h.upload.mock.calls.map(([identifier]) => identifier)).not.toContain(BUNDLED_PIECE_MODELS.goblin);
        expect(h.upload.mock.calls.map(([identifier]) => identifier)).toContain(h.heldId);
        expect(h.catalogued(BUNDLED_PIECE_MODELS.goblin)).toBe(false);
      });
    },
  }
);
