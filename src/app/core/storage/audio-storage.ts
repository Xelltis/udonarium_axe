import { AudioFile, AudioFileContext, AudioState } from '@axe/core/storage/audio-file';
import { SharedAssetStorage } from '@axe/core/storage/shared-asset-storage';

/**
 * The sounds this seat holds: each under the SHA-256 of its bytes, or under a link given in their
 * stead, listed to peers once it is held, put up to the room server's asset store where the room has
 * one, and let go of where the room's GM removed it.
 */
export class AudioStorage extends SharedAssetStorage<AudioFile, AudioFileContext> {
  private static _instance: AudioStorage;
  /** The one audio store for the page, created on first use. */
  static get instance(): AudioStorage {
    if (!AudioStorage._instance) AudioStorage._instance = new AudioStorage();
    return AudioStorage._instance;
  }

  private constructor() {
    super({
      catalogMessage: 'SYNCHRONIZE_AUDIO_LIST',
      complete: AudioState.COMPLETE,
      isFile: (arg): arg is AudioFile => arg instanceof AudioFile,
      fromContext: (context) => AudioFile.create(context),
      readAsync: (blob) => AudioFile.createAsync(blob),
    });
  }

  /** Every audio this seat knows of, including placeholders whose bytes have not arrived. */
  get audios(): AudioFile[] {
    return this.files;
  }

  /**
   * Adds audio from a link, an entry or a context received from a peer, returning the entry the
   * store keeps; see {@link SharedAssetStorage.add}. A link is held as it is, put up nowhere.
   */
  override add(arg: string | AudioFile | AudioFileContext): AudioFile {
    return typeof arg === 'string' ? this._add(AudioFile.create(arg), false) : super.add(arg);
  }
}
