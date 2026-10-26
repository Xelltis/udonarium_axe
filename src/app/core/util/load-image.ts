/** Whether this page can make pictures to draw, which a worker or a test without a DOM cannot. */
export function canMakeImages(): boolean {
  return typeof Image !== 'undefined';
}

/** How a picture is fetched. */
export interface ImageLoadOptions {
  /** Asked for across origins, so a canvas it is drawn on can still be read back. */
  readonly crossOrigin?: string;
  /** How long to wait before giving up on it, in milliseconds; for ever where left out. */
  readonly timeoutMs?: number;
}

/** Fetches the picture at an address, rejecting where it cannot be loaded in time. */
export function loadImage(src: string, options: ImageLoadOptions = {}): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (options.crossOrigin !== undefined) image.crossOrigin = options.crossOrigin;
    const timer =
      options.timeoutMs === undefined
        ? null
        : setTimeout(() => {
            image.onload = image.onerror = null;
            reject(new Error('image load timeout'));
          }, options.timeoutMs);
    image.onload = () => {
      if (timer !== null) clearTimeout(timer);
      resolve(image);
    };
    image.onerror = (event) => {
      if (timer !== null) clearTimeout(timer);
      reject(event);
    };
    image.src = src;
  });
}

interface CacheEntry {
  readonly image: HTMLImageElement;
  decoded: boolean;
  promise: Promise<HTMLImageElement>;
}

/**
 * Pictures loaded once by a key and kept for every later ask, so drawing may ask on every frame:
 * a picture is handed over once it has loaded, and nothing until then.
 */
export class ImageCache {
  private readonly entries = new Map<string, CacheEntry>();

  /** @param what What the pictures are, for the message a failed load rejects with. */
  constructor(private readonly what: string) {}

  /**
   * The picture kept under the key once it has loaded, or null until then; the first ask starts
   * loading it from `src`, drawn `sizePx` square where one is given. Null too where it failed to
   * load or the page cannot make pictures.
   */
  get(key: string, src: () => string, sizePx = 0): HTMLImageElement | null {
    const entry = this.entryFor(key, src, sizePx);
    return entry?.decoded ? entry.image : null;
  }

  /** Waits for the picture kept under the key, sharing the load with `get`; rejects where it cannot be loaded. */
  load(key: string, src: () => string, sizePx = 0): Promise<HTMLImageElement> {
    const entry = this.entryFor(key, src, sizePx);
    return entry ? entry.promise : Promise.reject(new Error('Image API unavailable'));
  }

  private entryFor(key: string, src: () => string, sizePx: number): CacheEntry | null {
    const held = this.entries.get(key);
    if (held) return held;
    if (!canMakeImages()) return null;
    const entry = this.startDecode(src, sizePx);
    this.entries.set(key, entry);
    return entry;
  }

  private startDecode(src: () => string, sizePx: number): CacheEntry {
    const image = new Image();
    if (sizePx > 0) {
      image.width = sizePx;
      image.height = sizePx;
    }
    const entry: CacheEntry = {
      image,
      decoded: false,
      promise: new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => {
          entry.decoded = true;
          resolve(image);
        };
        image.onerror = (event) => {
          reject(event instanceof Error ? event : new Error(`${this.what} decode failed`));
        };
      }),
    };
    try {
      image.src = src();
    } catch (error) {
      entry.promise = Promise.reject(error instanceof Error ? error : new Error(`${this.what} src failed`));
    }
    return entry;
  }
}
