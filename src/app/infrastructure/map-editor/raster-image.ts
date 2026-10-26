import { canMakeImages, ImageCache } from '@axe/core/util/load-image';

const cache = new ImageCache('raster image');

/**
 * The picture at the address once it has loaded, or null until then.
 *
 * The first ask starts the load and the picture is kept for every later ask, so drawing may ask on
 * every frame. Null too where it failed to load or the browser has no images to make.
 */
export function getRasterImage(url: string): HTMLImageElement | null {
  return cache.get(url, () => url);
}

/**
 * Waits for the picture at the address to load, sharing the load and the kept picture with
 * `getRasterImage`. Rejects when it cannot be loaded.
 */
export function loadRasterImage(url: string): Promise<HTMLImageElement> {
  return cache.load(url, () => url);
}

/**
 * Loads every picture in the list ahead of drawing, each address once. A picture that fails to load
 * is passed over rather than failing the rest.
 */
export async function warmRasterImages(urls: string[]): Promise<void> {
  if (!canMakeImages()) return;
  const seen = new Set<string>();
  const pending: Promise<unknown>[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    pending.push(loadRasterImage(url).catch(() => undefined));
  }
  await Promise.all(pending);
}
