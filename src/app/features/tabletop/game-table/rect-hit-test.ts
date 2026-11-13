import type { MarqueeRect } from '@axe/application/ui/selection-signal.service';
import { placedCentreOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface RectHitTestOptions {
  gridSize?: number;
  excludeAliases?: string[];
}

const DEFAULT_GRID_SIZE = 50;
const DEFAULT_EXCLUDES = ['range'];

/**
 * The same rectangle with its corners ordered, so x1/y1 is the top-left whichever way it was
 * dragged.
 */
export function normalizeRect(rect: MarqueeRect): MarqueeRect {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);
  return { x1, y1, x2, y2 };
}

/**
 * The identifiers of pieces on the table whose centres fall inside a marquee rectangle.
 *
 * A piece's centre is where `placedCentreOf` puts it: by its `width` and `height`, or its `size`,
 * in grid cells, and one cell in otherwise. Pieces off the table and the excluded aliases, ranges
 * by default, are never caught, and nor is a look on the ground locked in place, as the water a
 * generator lays, which nothing on the table is to move.
 */
export function selectByRect(
  objects: readonly TabletopObject[],
  rect: MarqueeRect,
  options: RectHitTestOptions = {}
): string[] {
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
  const excludes = new Set(options.excludeAliases ?? DEFAULT_EXCLUDES);
  const normalized = normalizeRect(rect);
  const hits: string[] = [];

  for (const obj of objects) {
    if (!obj) continue;
    if (obj.location?.name !== 'table') continue;
    if (excludes.has(obj.aliasName)) continue;
    if (obj.aliasName === TableAmbience.aliasName && (obj as { isLock?: unknown }).isLock === true) continue;
    const centre = placedCentreOf(obj, gridSize);
    if (centre.x < normalized.x1 || centre.x > normalized.x2) continue;
    if (centre.y < normalized.y1 || centre.y > normalized.y2) continue;
    hits.push(obj.identifier);
  }
  return hits;
}

/** What a marquee does with what it caught: put it in, take it out, or stand in for the lot. */
export type MarqueeApply = 'add' | 'toggle' | 'replace';

/**
 * How a marquee's catch joins what is already picked out.
 *
 * A finger has no keys to hold, so a second marquee drawn while something is already picked
 * out toggles what it catches rather than replacing it. Starting again is a tap on bare
 * table, which puts the selection down and lets the next marquee stand in for the lot.
 */
export function marqueeApply(
  modifiers: { shift: boolean; ctrl: boolean; touch: boolean },
  hasSelection: boolean
): MarqueeApply {
  if (modifiers.shift) return 'add';
  if (modifiers.ctrl || (modifiers.touch && hasSelection)) return 'toggle';
  return 'replace';
}
