import { TestBed } from '@angular/core/testing';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetRemoval } from '@axe/domain/media/asset-removal';
import { AssetRemovalEventHandlerService } from '@axe/features/file/asset-removal-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AssetRemovalEventHandlerService', () => {
  const pictureId = 'a'.repeat(64);
  const trackId = 'b'.repeat(64);
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
    for (const identifier of [pictureId, trackId]) {
      ImageStorage.instance.unmarkRemoved(identifier);
      AudioStorage.instance.unmarkRemoved(identifier);
      ImageStorage.instance.delete(identifier);
      AudioStorage.instance.delete(identifier);
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

  it('takes nothing as removed once the records go, as when the seat goes into another room', async () => {
    start();
    const record = AssetRemoval.remove(trackId, 'audio');
    await settle();
    expect(AudioStorage.instance.isRemoved(trackId)).toBe(true);

    ObjectStore.instance.remove(record);
    await settle();

    expect(AudioStorage.instance.isRemoved(trackId)).toBe(false);
  });

  it('puts back for the room what this seat adds in full again', async () => {
    start();
    AssetRemoval.remove(pictureId, 'image');
    AssetRemoval.remove(trackId, 'audio');
    await settle();

    ImageStorage.instance.add(picture());
    AudioStorage.instance.add(
      AudioFile.create({
        identifier: trackId,
        name: 'theme.ogg',
        type: 'audio/ogg',
        blob: new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], { type: 'audio/ogg' }),
        url: 'blob:track',
      })
    );
    await settle();

    expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(false);
    expect(AssetRemoval.get(trackId)?.isRemoved).toBe(false);
    expect(ImageStorage.instance.get(pictureId)).not.toBeNull();
  });
});
