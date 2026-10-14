import { networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { CatalogSendSchedule } from '@axe/core/storage/catalog-send-schedule';
import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';

export type CatalogItem = {
  readonly identifier: string;
  readonly state: number;
};

export class ImageStorage {
  private static _instance: ImageStorage;
  /** The one image store for the page, created on first use. */
  static get instance(): ImageStorage {
    if (!ImageStorage._instance) ImageStorage._instance = new ImageStorage();
    return ImageStorage._instance;
  }

  private imageHash: { [identifier: string]: ImageFile } = {};
  /**
   * Images added on this seat that are still going up to the asset server. They are left out of
   * the catalogue until then, so peers fetch them from the server rather than asking this seat.
   */
  private readonly uploading = new Set<string>();

  /** Every image this seat knows of, including placeholders whose data has not arrived. */
  get images(): ImageFile[] {
    return Object.values(this.imageHash);
  }

  private readonly catalogSchedule = new CatalogSendSchedule((peer) =>
    networkSend('SYNCHRONIZE_FILE_LIST', this.getCatalog(), peer)
  );

  private constructor() {}

  private destroy() {
    for (const identifier of Object.keys(this.imageHash)) {
      this.delete(identifier);
    }
  }

  /**
   * Reads a file the user added into the store, with its thumbnail, and tells peers about it
   * shortly after.
   *
   * Adding an image already held merges into the existing entry and returns that one.
   */
  async addAsync(arg: Blob): Promise<ImageFile> {
    const image: ImageFile = await ImageFile.createAsync(arg);

    return this._add(image, true);
  }

  /**
   * Adds an image from a link, an entry or a context received from a peer,
   * returning the entry the store keeps.
   *
   * When the identifier is already held, the new data fills in what that entry lacks and the
   * existing entry is returned. A complete image also schedules a catalogue broadcast, except a
   * context merged into an entry already held.
   *
   * An entry made on this seat, rather than a context from a peer, also goes up to the asset server
   * when one is configured.
   */
  add(arg: string | ImageFile | ImageContext): ImageFile {
    let image: ImageFile;
    let isLocal = false;
    if (typeof arg === 'string') {
      image = ImageFile.create(arg);
    } else if (arg instanceof ImageFile) {
      image = arg;
      isLocal = true;
    } else {
      if (this.update(arg)) return this.imageHash[arg.identifier];
      image = ImageFile.create(arg);
    }
    return this._add(image, isLocal);
  }

  private _add(image: ImageFile, isLocal: boolean = false): ImageFile {
    if (isLocal) this.uploadToAssetStore(image);
    if (ImageState.COMPLETE <= image.state) this.catalogSchedule.whenQuiet(100);
    if (this.update(image)) return this.imageHash[image.identifier];
    this.imageHash[image.identifier] = image;
    return image;
  }

  private uploadToAssetStore(image: ImageFile): void {
    const store = AssetHttpStore.instance;
    const blob = image.blob;
    if (!store.isEnabled || image.state !== ImageState.COMPLETE || !blob) return;
    if (!AssetHttpStore.isAssetId(image.identifier) || this.uploading.has(image.identifier)) return;
    this.uploading.add(image.identifier);
    void store.upload(image.identifier, blob).finally(() => {
      this.uploading.delete(image.identifier);
      this.catalogSchedule.whenQuiet(100);
    });
  }

  private update(image: ImageFile | ImageContext): boolean {
    const updatingImage: ImageFile = this.imageHash[image.identifier];
    if (updatingImage) {
      updatingImage.apply(image instanceof ImageFile ? image.toContext() : image);
      return true;
    }
    return false;
  }

  /**
   * Removes the image and revokes its object URLs, returning false when it was not held. Peers are
   * not told.
   */
  delete(identifier: string): boolean {
    const deleteImage: ImageFile = this.imageHash[identifier];
    if (deleteImage) {
      deleteImage.destroy();
      delete this.imageHash[identifier];
      return true;
    }
    return false;
  }

  /** The image held under this identifier, or null when this seat has never heard of it. */
  get(identifier: string): ImageFile | null {
    return this.imageHash[identifier] ?? null;
  }

  /** Sends the catalogue now, to one peer or to everyone. */
  synchronize(peer?: string) {
    this.catalogSchedule.now(peer);
  }

  /** Sends the catalogue a little later, folded together with the calls made meanwhile. */
  lazySynchronize(ms: number, peer?: string) {
    this.catalogSchedule.later(ms, peer);
  }

  /**
   * The images this seat holds in full or as a link, which is what it advertises so that peers can
   * request what they lack. Thumbnail-only images are left out, and so are images still going up to
   * the asset server.
   */
  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const image of this.images) {
      if (ImageState.COMPLETE <= image.state && !this.uploading.has(image.identifier)) {
        catalog.push({ identifier: image.identifier, state: image.state });
      }
    }
    return catalog;
  }
}
