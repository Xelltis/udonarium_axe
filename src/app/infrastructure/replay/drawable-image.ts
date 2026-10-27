import { loadImage } from '@axe/core/util/load-image';
import type { ReplayFrameImage } from '@axe/infrastructure/replay/replay-canvas';

export type DrawableImage = ReplayFrameImage & { close?(): void };

/**
 * Turns a stored image into something a canvas can draw.
 *
 * When the bytes are there, `createImageBitmap` decodes up front so drawing never waits.
 * The caller releases it with `close()` when done.
 */
export async function toDrawableImage(blob: Blob | null, url: string): Promise<DrawableImage | null> {
  if (blob && typeof createImageBitmap === 'function') {
    return (await createImageBitmap(blob)) as DrawableImage;
  }
  if (url.length < 1) return null;
  const element = await loadImage(url, { crossOrigin: 'anonymous' }).catch(() => {
    throw new Error(`読めない絵です: ${url}`);
  });
  return element as unknown as ReplayFrameImage;
}

export interface DrawableImageSource {
  get(identifier: string): { blob: Blob | null; url: string } | null;
}

/**
 * Loads every image a render needs.
 *
 * Loading them one at a time costs the sum of every wait, and no load depends on another,
 * so they run together. Images this browser no longer holds are skipped; the painter treats them as absent.
 */
export async function loadDrawableImages(
  storage: DrawableImageSource,
  identifiers: readonly string[],
  onMissing?: (identifier: string, reason?: unknown) => void
): Promise<Map<string, DrawableImage>> {
  const wanted = [...new Set(identifiers.filter((identifier) => identifier.length > 0))];
  const decoded = await Promise.all(
    wanted.map(async (identifier) => {
      const image = storage.get(identifier);
      if (!image) {
        onMissing?.(identifier);
        return null;
      }
      try {
        return await toDrawableImage(image.blob, image.url);
      } catch (reason) {
        onMissing?.(identifier, reason);
        return null;
      }
    })
  );

  const loaded = new Map<string, DrawableImage>();
  for (const [index, drawable] of decoded.entries()) {
    if (drawable) loaded.set(wanted[index], drawable);
  }
  return loaded;
}
