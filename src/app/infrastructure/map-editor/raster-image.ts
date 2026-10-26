interface CacheEntry {
  image: HTMLImageElement;
  decoded: boolean;
  promise: Promise<HTMLImageElement>;
}

const cache = new Map<string, CacheEntry>();

function canUseImage(): boolean {
  return typeof Image !== 'undefined';
}

function startDecode(url: string): CacheEntry | null {
  if (!canUseImage()) return null;
  const image = new Image();
  const entry: CacheEntry = {
    image,
    decoded: false,
    promise: new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => {
        entry.decoded = true;
        resolve(image);
      };
      image.onerror = (event) => {
        reject(event instanceof Error ? event : new Error('raster image decode failed'));
      };
    }),
  };
  try {
    image.src = url;
  } catch (error) {
    entry.promise = Promise.reject(error instanceof Error ? error : new Error('raster image src failed'));
  }
  return entry;
}

/**
 * The picture at the address once it has loaded, or null until then.
 *
 * The first ask starts the load and the picture is kept for every later ask, so drawing may ask on
 * every frame. Null too where it failed to load or the browser has no images to make.
 */
export function getRasterImage(url: string): HTMLImageElement | null {
  let entry = cache.get(url);
  if (!entry) {
    const created = startDecode(url);
    if (!created) return null;
    entry = created;
    cache.set(url, entry);
  }
  return entry.decoded ? entry.image : null;
}

/**
 * Waits for the picture at the address to load, sharing the load and the kept picture with
 * `getRasterImage`. Rejects when it cannot be loaded.
 */
export function loadRasterImage(url: string): Promise<HTMLImageElement> {
  let entry = cache.get(url);
  if (!entry) {
    const created = startDecode(url);
    if (!created) return Promise.reject(new Error('Image API unavailable'));
    entry = created;
    cache.set(url, entry);
  }
  return entry.promise;
}

/**
 * Loads every picture in the list ahead of drawing, each address once. A picture that fails to load
 * is passed over rather than failing the rest.
 */
export async function warmRasterImages(urls: string[]): Promise<void> {
  if (!canUseImage()) return;
  const seen = new Set<string>();
  const pending: Promise<unknown>[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    pending.push(loadRasterImage(url).catch(() => undefined));
  }
  await Promise.all(pending);
}
