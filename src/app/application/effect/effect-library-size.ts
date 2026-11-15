import type { PanelSize } from '@axe/application/ui/panel.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/** How large the list of effects opens the first time: wide enough for two columns of rows beside the index of families. */
export const EFFECT_LIBRARY_SIZE: PanelSize = { width: 540, height: 720 };

/** The smallest the list of effects may be made, which still holds its four regions and a row of the list. */
export const EFFECT_LIBRARY_MIN_SIZE: PanelSize = { width: 340, height: 420 };

/** The largest size taken as one a reader set, beyond any screen the panel is opened on. */
const LARGEST = 10000;

function isLength(value: unknown, least: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= least && value <= LARGEST;
}

/**
 * How large the list of effects opens in this browser: the size the reader last left it at, and the
 * first-time size where none is kept, the browser refuses to say, or what it keeps is broken or
 * smaller than the panel may be made.
 */
export function readEffectLibrarySize(storage: Storage | null): PanelSize {
  if (!storage) return EFFECT_LIBRARY_SIZE;
  try {
    const raw = storage.getItem(STORAGE_KEYS.effectLibrarySize);
    if (!raw) return EFFECT_LIBRARY_SIZE;
    const kept: unknown = JSON.parse(raw);
    if (typeof kept !== 'object' || kept === null) return EFFECT_LIBRARY_SIZE;
    const { width, height } = kept as { width?: unknown; height?: unknown };
    if (!isLength(width, EFFECT_LIBRARY_MIN_SIZE.width) || !isLength(height, EFFECT_LIBRARY_MIN_SIZE.height)) {
      return EFFECT_LIBRARY_SIZE;
    }
    return { width: Math.round(width), height: Math.round(height) };
  } catch {
    return EFFECT_LIBRARY_SIZE;
  }
}

/**
 * Keeps the size the reader left the list of effects at in this browser, for the next time it is
 * opened. Answers whether it was kept: a size smaller than the panel may be made is not, and a
 * browser that blocks site data keeps nothing.
 */
export function writeEffectLibrarySize(storage: Storage | null, size: PanelSize): boolean {
  if (!storage) return false;
  if (!isLength(size.width, EFFECT_LIBRARY_MIN_SIZE.width) || !isLength(size.height, EFFECT_LIBRARY_MIN_SIZE.height)) {
    return false;
  }
  try {
    storage.setItem(
      STORAGE_KEYS.effectLibrarySize,
      JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) })
    );
    return true;
  } catch {
    return false;
  }
}
