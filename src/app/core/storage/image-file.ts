import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { convertBlobToWebP } from '@axe/core/storage/image-downscale';
import { createThumbnailInWorker } from '@axe/core/storage/image-thumbnail';

const THUMBNAIL_MAX_SIZE = 128;

export enum ImageState {
  NULL = 0,
  THUMBNAIL = 1,
  COMPLETE = 2,
  URL = 1000,
}

export interface ImageContext {
  identifier: string;
  name: string;
  type: string;
  blob: Blob | null;
  url: string;
  thumbnail: ThumbnailContext;
}

export interface ThumbnailContext {
  type: string;
  blob: Blob | null;
  url: string;
}

export class ImageFile {
  context: ImageContext = {
    identifier: '',
    name: '',
    blob: null,
    type: '',
    url: '',
    thumbnail: {
      blob: null,
      type: '',
      url: '',
    },
  };

  /**
   * The key the image is stored and shared under: the SHA-256 of its bytes, a hash kept from a
   * save-data file name, or the URL itself for a linked image.
   */
  get identifier(): string {
    return this.context.identifier;
  }
  /** The file name the image was added with, or its URL for a linked image; empty when neither applies. */
  get name(): string {
    return this.context.name;
  }
  /**
   * The full image bytes, or the thumbnail's while only the thumbnail has
   * arrived; null when there is neither.
   */
  get blob(): Blob | null {
    return this.context.blob ? this.context.blob : this.context.thumbnail.blob;
  }
  /**
   * The URL to draw the image from: the full image's, or the thumbnail's while only that has
   * arrived.
   *
   * The string changes when the full image replaces the thumbnail although the object stays
   * the same; see `imageFileEqual`.
   */
  get url(): string {
    return this.context.url ? this.context.url : this.context.thumbnail.url;
  }
  /**
   * The small preview, at most 128 pixels on its longer side, that is sent to
   * peers ahead of the full image.
   */
  get thumbnail(): ThumbnailContext {
    return this.context.thumbnail;
  }

  /**
   * How much of the image this seat holds, compared with peers' catalogues to decide what to
   * request.
   *
   * NULL means nothing, THUMBNAIL only the preview, COMPLETE the full bytes, and URL a link with no
   * bytes.
   */
  get state(): ImageState {
    if (!this.url && !this.blob) return ImageState.NULL;
    if (this.url && !this.blob) return ImageState.URL;
    if (this.blob === this.thumbnail.blob) return ImageState.THUMBNAIL;
    return ImageState.COMPLETE;
  }

  /** Whether there is nothing to draw yet, neither bytes nor a URL. */
  get isEmpty(): boolean {
    return this.state <= ImageState.NULL;
  }

  private constructor() {}

  /**
   * A placeholder for an image known only by its identifier, as from a peer's
   * catalogue, until its data arrives.
   */
  static createEmpty(identifier: string): ImageFile {
    const imageFile = new ImageFile();
    imageFile.context.identifier = identifier;

    return imageFile;
  }

  /**
   * Wraps either an external URL, which serves as identifier, name and URL at once, or
   * a context received from a peer.
   */
  static create(url: string): ImageFile;
  static create(context: ImageContext): ImageFile;
  static create(arg: string | ImageContext): ImageFile {
    if (typeof arg === 'string') {
      const imageFile = new ImageFile();
      imageFile.context.identifier = arg;
      imageFile.context.name = arg;
      imageFile.context.url = arg;
      return imageFile;
    } else {
      const imageFile = new ImageFile();
      imageFile.apply(arg);
      return imageFile;
    }
  }

  /**
   * Reads an added file into an image entry with its object URL and thumbnail ready.
   *
   * A file named like a save-data image, a 64-character hash and an extension, keeps that hash as
   * its identifier and its bytes untouched, so the pieces in a loaded room still find it. Anything
   * else is converted to WebP when that comes out smaller, and keyed by the hash of the result.
   */
  static async createAsync(file: File): Promise<ImageFile>;
  static async createAsync(blob: Blob): Promise<ImageFile>;
  static async createAsync(arg: File | Blob): Promise<ImageFile> {
    if (arg instanceof File) {
      return await ImageFile._createAsync(arg, arg.name);
    } else if (arg instanceof Blob) {
      return await ImageFile._createAsync(arg);
    }
    return await ImageFile._createAsync(arg);
  }

  private static readonly SAVE_DATA_FILENAME_RE = /^([0-9a-f]{64})\./;

  private static async _createAsync(blob: Blob, name?: string): Promise<ImageFile> {
    const preservedId = name ? (ImageFile.SAVE_DATA_FILENAME_RE.exec(name)?.[1] ?? null) : null;

    const imageFile = new ImageFile();
    if (preservedId) {
      imageFile.context.identifier = preservedId;
      imageFile.context.blob = blob;
    } else {
      const converted = await convertBlobToWebP(blob);
      const arrayBuffer = await FileReaderUtil.readAsArrayBufferAsync(converted);
      imageFile.context.identifier = await FileReaderUtil.calcSHA256Async(arrayBuffer);
      imageFile.context.blob = new Blob([arrayBuffer], { type: converted.type });
    }
    imageFile.context.name = name ?? '';
    imageFile.context.url = window.URL.createObjectURL(imageFile.context.blob);

    imageFile.context.thumbnail = await ImageFile.createThumbnailAsync(imageFile.context);

    if (imageFile.context.name == null) imageFile.context.name = imageFile.context.identifier;

    return imageFile;
  }

  /** Revokes the object URLs made for the image and its thumbnail; a linked image has none to revoke. */
  destroy() {
    this.revokeURLs();
  }

  /**
   * Fills in what this entry still lacks from another context, as when the thumbnail or
   * full image arrives from a peer.
   *
   * Fields already held are never overwritten, and object URLs are made for any bytes that came
   * without one.
   */
  apply(context: ImageContext) {
    if (!this.context.identifier && context.identifier) this.context.identifier = context.identifier;
    if (!this.context.name && context.name) this.context.name = context.name;
    if (!this.context.blob && context.blob) this.context.blob = context.blob;
    if (!this.context.type && context.type) this.context.type = context.type;
    if (!this.context.url && context.url) {
      if (this.state !== ImageState.URL) window.URL.revokeObjectURL(this.context.url);
      this.context.url = context.url;
    }
    if (!this.context.thumbnail.blob && context.thumbnail.blob) this.context.thumbnail.blob = context.thumbnail.blob;
    if (!this.context.thumbnail.type && context.thumbnail.type) this.context.thumbnail.type = context.thumbnail.type;
    if (!this.context.thumbnail.url && context.thumbnail.url) {
      if (this.state !== ImageState.URL) window.URL.revokeObjectURL(this.context.thumbnail.url);
      this.context.thumbnail.url = context.thumbnail.url;
    }
    this.createURLs();
  }

  /**
   * A copy of the fields in the shape sent to peers and handed to `apply`; the blobs are shared,
   * not copied.
   */
  toContext(): ImageContext {
    return {
      identifier: this.context.identifier,
      name: this.context.name,
      blob: this.context.blob,
      type: this.context.type,
      url: this.context.url,
      thumbnail: {
        blob: this.context.thumbnail.blob,
        type: this.context.thumbnail.type,
        url: this.context.thumbnail.url,
      },
    };
  }

  private createURLs() {
    if (this.state === ImageState.URL) return;
    if (this.context.blob && this.context.url === '') this.context.url = window.URL.createObjectURL(this.context.blob);
    if (this.context.thumbnail.blob && this.context.thumbnail.url === '')
      this.context.thumbnail.url = window.URL.createObjectURL(this.context.thumbnail.blob);
  }

  private revokeURLs() {
    if (this.state === ImageState.URL) return;
    window.URL.revokeObjectURL(this.context.url);
    window.URL.revokeObjectURL(this.context.thumbnail.url);
  }

  private static async createThumbnailAsync(context: ImageContext): Promise<ThumbnailContext> {
    const type = context.blob?.type ?? '';
    const fromWorker = context.blob ? await createThumbnailInWorker(context.blob, type, THUMBNAIL_MAX_SIZE) : null;
    if (fromWorker) {
      return { type: fromWorker.type, blob: fromWorker, url: window.URL.createObjectURL(fromWorker) };
    }
    return ImageFile.createThumbnailOnMainThread(context);
  }

  private static createThumbnailOnMainThread(context: ImageContext): Promise<ThumbnailContext> {
    return new Promise((resolve, reject) => {
      const image: HTMLImageElement = new Image();
      image.onload = () => {
        const scale: number = Math.min(THUMBNAIL_MAX_SIZE / Math.max(image.width, image.height), 1.0);
        const dstWidth = image.width * scale;
        const dstHeight = image.height * scale;

        const canvas: HTMLCanvasElement = document.createElement('canvas');
        canvas.width = dstWidth;
        canvas.height = dstHeight;
        const render: CanvasRenderingContext2D = canvas.getContext('2d')!;
        render.drawImage(image, 0, 0, dstWidth, dstHeight);

        canvas.toBlob((blob) => {
          const thumbnail: ThumbnailContext = {
            type: blob!.type,
            blob: blob,
            url: window.URL.createObjectURL(blob!),
          };
          resolve(thumbnail);
        }, context.blob!.type);
      };
      image.onabort = image.onerror = () => {
        reject();
      };
      image.src = context.url;
    });
  }

  static Empty: ImageFile = ImageFile.createEmpty('null');
}

/**
 * An `equal` function for a computed that yields an image, counting the image
 * as changed whenever its URL has.
 *
 * An image is mutable: the same instance swaps its thumbnail URL for the full image's. So this
 * compares the URL with the one it saw last rather than the two images, which catches that swap.
 * Each call makes a comparer with its own memory, so give every computed its own.
 */
export function imageFileEqual(): (a: ImageFile, b: ImageFile) => boolean {
  let lastUrl: string | null = null;
  return (_a, b) => {
    const url = b.url;
    const same = url === lastUrl;
    lastUrl = url;
    return same;
  };
}
