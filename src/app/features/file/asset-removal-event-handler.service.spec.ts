import { TestBed } from '@angular/core/testing';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { bundledMapModels } from '@axe/core/storage/bundled-models';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetRemoval } from '@axe/domain/media/asset-removal';
import { AssetRemovalEventHandlerService } from '@axe/features/file/asset-removal-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AssetRemovalEventHandlerService', () => {
  const pictureId = 'a'.repeat(64);
  const trackId = 'b'.repeat(64);
  const modelId = 'e'.repeat(64);
  const picture = () =>
    ImageFile.create({
      identifier: pictureId,
      name: '',
      type: 'image/png',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      url: 'blob:full',
      thumbnail: { type: 'image/png', blob: null, url: '' },
    });

  /** Lets the batched change notices and the handler's work run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const start = () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(AssetRemovalEventHandlerService);
  };

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const identifier of [pictureId, trackId, modelId]) {
      ImageStorage.instance.unmarkRemoved(identifier);
      AudioStorage.instance.unmarkRemoved(identifier);
      ModelStorage.instance.unmarkRemoved(identifier);
      ImageStorage.instance.delete(identifier);
      AudioStorage.instance.delete(identifier);
      ModelStorage.instance.delete(identifier);
    }
  });

  it('lets go of what the room had removed before this seat came', () => {
    ImageStorage.instance.add(picture());
    AssetRemoval.remove(pictureId, 'image');
    AssetRemoval.remove(trackId, 'audio');

    start();

    expect(ImageStorage.instance.get(pictureId)).toBeNull();
    expect(ImageStorage.instance.isRemoved(pictureId)).toBe(true);
    expect(AudioStorage.instance.isRemoved(trackId)).toBe(true);
    expect(ImageStorage.instance.isRemoved(trackId)).toBe(false);
  });

  it('lets go of a 3D model the room removed, as a model and nothing else', () => {
    ModelStorage.instance.add({
      identifier: modelId,
      name: 'a.glb',
      type: 'model/gltf-binary',
      blob: new Blob([new Uint8Array([1])]),
      url: '',
    });
    AssetRemoval.remove(modelId, 'model');

    start();

    expect(ModelStorage.instance.get(modelId)).toBeNull();
    expect(ModelStorage.instance.isRemoved(modelId)).toBe(true);
    expect(ImageStorage.instance.isRemoved(modelId)).toBe(false);
  });

  it('passes over a removal of a model bundled with the app, which the room cannot remove', () => {
    const oak = bundledMapModels()['tree_oak'];
    AssetRemoval.remove(oak, 'model');

    start();

    expect(ModelStorage.instance.isRemoved(oak)).toBe(false);
    ObjectStore.instance.remove(AssetRemoval.get(oak)!);
  });

  it('tells the room who added a 3D model made on this seat', () => {
    start();

    ModelStorage.instance.onAddedLocally(modelId);

    expect(AssetOwner.get(modelId)?.kind).toBe('model');
    ObjectStore.instance.remove(AssetOwner.get(modelId)!);
  });

  it('follows a removal as it comes and is put back', async () => {
    start();
    ImageStorage.instance.add(picture());

    AssetRemoval.remove(pictureId, 'image');
    await settle();
    expect(ImageStorage.instance.get(pictureId)).toBeNull();
    expect(ImageStorage.instance.isRemoved(pictureId)).toBe(true);

    AssetRemoval.restore(pictureId);
    await settle();
    expect(ImageStorage.instance.isRemoved(pictureId)).toBe(false);
  });

  it('follows each record by itself, keeping the others as they are', async () => {
    start();
    const picture = AssetRemoval.remove(pictureId, 'image');
    AssetRemoval.remove(trackId, 'audio');
    await settle();

    ObjectStore.instance.remove(picture);
    await settle();

    expect(ImageStorage.instance.isRemoved(pictureId)).toBe(false);
    expect(AudioStorage.instance.isRemoved(trackId)).toBe(true);
  });

  it('takes nothing as removed once the records go, as when the seat goes into another room', async () => {
    start();
    const record = AssetRemoval.remove(trackId, 'audio');
    await settle();
    expect(AudioStorage.instance.isRemoved(trackId)).toBe(true);

    ObjectStore.instance.remove(record);
    await settle();

    expect(AudioStorage.instance.isRemoved(trackId)).toBe(false);
  });

  describe('what this seat chooses to add again', () => {
    /** Adds it as one chosen to be added, as a file picked or dropped is. */
    const choose = (file: ImageFile) =>
      (
        ImageStorage.instance as unknown as { _add(file: ImageFile, isLocal: boolean, putBack: boolean): ImageFile }
      )._add(file, true, true);

    it('puts back for the room what the GM adds again', async () => {
      start();
      const putBack = vi.spyOn(TestBed.inject(AssetRemovalService), 'putBack');
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditShared').mockReturnValue(true);
      AssetRemoval.remove(pictureId, 'image');
      await settle();

      choose(picture());
      await settle();

      expect(putBack.mock.calls).toEqual([[pictureId]]);
      expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(false);
      expect(ImageStorage.instance.get(pictureId)).not.toBeNull();
    });

    it('keeps it removed, and says only the GM may, for anyone else', async () => {
      start();
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditShared').mockReturnValue(false);
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});
      AssetRemoval.remove(pictureId, 'image');
      await settle();

      choose(picture());
      await settle();

      expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(true);
      expect(ImageStorage.instance.get(pictureId)).toBeNull();
      expect(show.mock.calls).toEqual([[TestBed.inject(TRANSLATE_FN)('feature.file.removal.imageRefused')]]);
    });
  });

  it('has the GM take out of the store bytes that reached it after their removal', () => {
    start();
    const takeOut = vi.spyOn(TestBed.inject(AssetRemovalService), 'takeOut').mockImplementation(() => {});

    AudioStorage.instance.onUploadedWhileRemoved(trackId);

    expect(takeOut.mock.calls).toEqual([[[trackId]]]);
  });
});
