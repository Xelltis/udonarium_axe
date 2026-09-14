import { networkSend } from '@axe/core/network/network-messaging';
import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';

export type CatalogItem = {
  readonly identifier: string;
  readonly state: number;
};

export class ImageStorage {
  private static _instance: ImageStorage;
  static get instance(): ImageStorage {
    if (!ImageStorage._instance) ImageStorage._instance = new ImageStorage();
    return ImageStorage._instance;
  }

  private imageHash: { [identifier: string]: ImageFile } = {};

  get images(): ImageFile[] {
    return Object.values(this.imageHash);
  }

  private lazyTimer: ResettableTimeout | null = null;
  /** Who the waiting catalogue goes to: a peer, everyone (undefined), or nothing waiting (null). */
  private lazyPeer: string | undefined | null = null;

  private constructor() {}

  private destroy() {
    for (const identifier of Object.keys(this.imageHash)) {
      this.delete(identifier);
    }
  }

  async addAsync(arg: Blob): Promise<ImageFile> {
    const image: ImageFile = await ImageFile.createAsync(arg);

    return this._add(image);
  }

  add(arg: string | ImageFile | ImageContext): ImageFile {
    let image: ImageFile;
    if (typeof arg === 'string') {
      image = ImageFile.create(arg);
    } else if (arg instanceof ImageFile) {
      image = arg;
    } else {
      if (this.update(arg)) return this.imageHash[arg.identifier];
      image = ImageFile.create(arg);
    }
    return this._add(image);
  }

  private _add(image: ImageFile): ImageFile {
    if (ImageState.COMPLETE <= image.state) this.lazySynchronize(100);
    if (this.update(image)) return this.imageHash[image.identifier];
    this.imageHash[image.identifier] = image;
    return image;
  }

  private update(image: ImageFile | ImageContext): boolean {
    const updatingImage: ImageFile = this.imageHash[image.identifier];
    if (updatingImage) {
      updatingImage.apply(image instanceof ImageFile ? image.toContext() : image);
      return true;
    }
    return false;
  }

  delete(identifier: string): boolean {
    const deleteImage: ImageFile = this.imageHash[identifier];
    if (deleteImage) {
      deleteImage.destroy();
      delete this.imageHash[identifier];
      return true;
    }
    return false;
  }

  get(identifier: string): ImageFile | null {
    return this.imageHash[identifier] ?? null;
  }

  /**
   * Sends the catalogue now, to one peer or to everyone.
   *
   * A catalogue sent to everyone stands in for one waiting to go out later; one sent to a single
   * peer only stands in for a later one meant for that same peer.
   */
  synchronize(peer?: string) {
    if (this.lazyTimer && (peer === undefined || this.lazyPeer === peer)) {
      this.lazyTimer.stop();
      this.lazyPeer = null;
    }
    const catalog = this.getCatalog();
    networkSend('SYNCHRONIZE_FILE_LIST', catalog, peer);
  }

  /**
   * Sends the catalogue once things have been quiet for a while, folding the calls made meanwhile.
   *
   * Calls for the same peer send to that peer; calls for different peers, or for everyone, send
   * to everyone.
   */
  lazySynchronize(ms: number, peer?: string) {
    this.lazyPeer = this.lazyPeer === null || this.lazyPeer === peer ? peer : undefined;
    if (this.lazyTimer === null) {
      this.lazyTimer = new ResettableTimeout(() => {
        const target = this.lazyPeer ?? undefined;
        this.lazyPeer = null;
        this.synchronize(target);
      }, ms);
    }
    this.lazyTimer.reset(ms);
  }

  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const image of this.images) {
      if (ImageState.COMPLETE <= image.state) {
        catalog.push({ identifier: image.identifier, state: image.state });
      }
    }
    return catalog;
  }
}
