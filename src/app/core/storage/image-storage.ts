import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';
import { SharedAssetStorage } from '@axe/core/storage/shared-asset-storage';

/**
 * The pictures this seat holds: each under the SHA-256 of its bytes, or under a link given in their
 * stead, listed to peers once it is held in full, put up to the room server's asset store where the
 * room has one, and let go of where the room's GM removed it. The catalogue names no picture, as a
 * room holds many.
 */
export class ImageStorage extends SharedAssetStorage<ImageFile, ImageContext> {
  private static _instance: ImageStorage;
  /** The one image store for the page, created on first use. */
  static get instance(): ImageStorage {
    if (!ImageStorage._instance) ImageStorage._instance = new ImageStorage();
    return ImageStorage._instance;
  }

  private constructor() {
    super({
      catalogMessage: 'SYNCHRONIZE_FILE_LIST',
      complete: ImageState.COMPLETE,
      isFile: (arg): arg is ImageFile => arg instanceof ImageFile,
      fromContext: (context) => ImageFile.create(context),
      readAsync: (blob) => ImageFile.createAsync(blob),
      catalogNames: false,
    });
  }

  /** Every image this seat knows of, including placeholders whose data has not arrived. */
  get images(): ImageFile[] {
    return this.files;
  }

  /**
   * Reads a file the user added into the store, with its thumbnail, and tells peers about it
   * shortly after; see {@link SharedAssetStorage.addAsync}. Adding an image already held merges into
   * the existing entry and returns that one, keeping the object URLs made for the bytes read again.
   */
  override async addAsync(arg: Blob, options: { putBack?: boolean } = {}): Promise<ImageFile | null> {
    const image = await ImageFile.createAsync(arg);
    const kept = this._add(image, true, options.putBack === true);
    if (!this.isRemoved(image.identifier)) return kept;
    image.destroy();
    return null;
  }

  /**
   * Adds an image from a link, an entry or a context received from a peer, returning the entry the
   * store keeps; see {@link SharedAssetStorage.add}. A link is held as it is, put up nowhere. An
   * entry made here that the room removed is not taken in, unless `putBack` says it was chosen here
   * in full and this seat may put it back.
   */
  override add(arg: string | ImageFile | ImageContext, options: { putBack?: boolean } = {}): ImageFile {
    if (typeof arg === 'string') return this._add(ImageFile.create(arg), false);
    if (arg instanceof ImageFile) return this._add(arg, true, options.putBack === true);
    return super.add(arg);
  }
}
