import { AudioFile, AudioFileContext } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { calcSHA256Async } from '@axe/core/storage/file-reader-util';
import { describeSharedAssetStorage } from '@axe/testing/shared-asset-storage-cases';

/** A sound held whole under the identifier, as one received from a peer. */
const contextOf = (identifier: string): AudioFileContext => ({
  identifier,
  name: 'theme.ogg',
  type: 'audio/ogg',
  blob: new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], { type: 'audio/ogg' }),
  url: 'blob:track',
});

describeSharedAssetStorage<AudioStorage, AudioFile, AudioFileContext>(
  {
    name: 'AudioStorage',
    noun: 'sound',
    storage: () => AudioStorage.instance,
    files: (storage) => storage.audios,
    file: AudioFile,
    contextOf,
    uploadName: 'theme.ogg',
    readable: () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/ogg' }),
  },
  {
    held: (h) => {
      describe('a sound held by a link', () => {
        it('adds and returns audio by url', () => {
          const audio = h.storage.add('https://example.com/test.mp3');
          expect(audio).toBeTruthy();
          expect(audio.identifier).toBe('https://example.com/test.mp3');
          const retrieved = h.storage.get('https://example.com/test.mp3');
          expect(retrieved).toBe(audio);
        });

        it('adds an audio file made from a url', () => {
          const file = AudioFile.create('https://example.com/music.ogg');
          const added = h.storage.add(file);
          expect(added).toBe(file);
        });

        it('removes audio', () => {
          h.storage.add('https://example.com/del.mp3');
          expect(h.storage.delete('https://example.com/del.mp3')).toBe(true);
          expect(h.storage.get('https://example.com/del.mp3')).toBeFalsy();
        });

        it('lists what has been added', () => {
          h.storage.add('https://example.com/a.mp3');
          h.storage.add('https://example.com/b.mp3');
          expect(h.storage.audios.length).toBeGreaterThanOrEqual(2);
        });

        it('catalogues it', () => {
          h.storage.add('https://example.com/catalog.mp3');
          const catalog = h.storage.getCatalog();
          expect(catalog.find((item) => item.identifier === 'https://example.com/catalog.mp3')).toBeTruthy();
        });
      });

      describe('a placeholder whose bytes are read', () => {
        it('keeps the object url the placeholder takes up', async () => {
          const revoked = vi.spyOn(URL, 'revokeObjectURL');
          const bytes = new Uint8Array([5, 6, 7]);
          const placeholder = h.storage.add(AudioFile.createEmpty(await calcSHA256Async(bytes.buffer)));

          expect(await h.storage.addAsync(new Blob([bytes], { type: 'audio/ogg' }))).toBe(placeholder);
          expect(placeholder.url).not.toBe('');
          expect(revoked).not.toHaveBeenCalledWith(placeholder.url);
        });
      });
    },
    assetServer: (h) => {
      it('sends no linked audio, on entering a room either', () => {
        h.storage.add('https://example.com/theme.mp3');
        expect(h.upload).not.toHaveBeenCalled();

        h.storage.uploadAllToAssetStore();

        expect(h.upload).not.toHaveBeenCalled();
      });
    },
  }
);
