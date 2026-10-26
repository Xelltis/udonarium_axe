import { canMakeImages, ImageCache } from '@axe/core/util/load-image';
import { StampDef } from '@axe/domain/map-editor/stamp-types';

const DEFAULT_COLOR = '#1a1a1a';

const cache = new ImageCache('stamp image');

function cacheKey(id: string, size: number, color: string | null): string {
  return `${id}|${size}|${color ?? ''}`;
}

function recolorSvg(svg: string, color: string | null): string {
  const resolved = color ?? DEFAULT_COLOR;
  return svg.split('currentColor').join(resolved);
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * A stamp's picture at a size and colour once it has loaded, or null until then.
 *
 * The first ask starts the load and the picture is kept for every later ask, so drawing may ask on
 * every frame. Each size and colour is kept apart; a stamp with no colour is drawn in near-black.
 */
export function getStampImage(def: StampDef, size: number, color: string | null): HTMLImageElement | null {
  return cache.get(cacheKey(def.id, size, color), () => toDataUri(recolorSvg(def.svg, color)), size);
}

/**
 * Waits for a stamp's picture at a size and colour to load, sharing the load and the kept picture
 * with `getStampImage`. Rejects when it cannot be loaded.
 */
export function loadStampImage(def: StampDef, size: number, color: string | null): Promise<HTMLImageElement> {
  return cache.load(cacheKey(def.id, size, color), () => toDataUri(recolorSvg(def.svg, color)), size);
}

/**
 * Loads the picture of every stamp placed on the map ahead of drawing, each stamp, size and colour
 * once. A stamp with no definition, or a picture that fails to load, is passed over.
 */
export async function warmStampImages(
  items: { stampId: string; size?: number; color: string | null }[],
  defs: StampDef[]
): Promise<void> {
  if (!canMakeImages()) return;
  const defById = new Map(defs.map((def) => [def.id, def]));
  const seen = new Set<string>();
  const pending: Promise<unknown>[] = [];
  for (const item of items) {
    const def = defById.get(item.stampId);
    if (!def) continue;
    const size = item.size ?? 1;
    const key = cacheKey(def.id, size, item.color);
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(loadStampImage(def, size, item.color).catch(() => undefined));
  }
  await Promise.all(pending);
}
