import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface TableRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RectHitTestOptions {
  gridSize?: number;
  excludeAliases?: string[];
}

interface SizedObject {
  width?: number;
  height?: number;
  size?: number;
}

const DEFAULT_GRID_SIZE = 50;
const DEFAULT_EXCLUDES = ['range'];

export function normalizeRect(rect: TableRect): TableRect {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);
  return { x1, y1, x2, y2 };
}

function getObjectExtent(obj: TabletopObject, gridSize: number): { width: number; height: number } {
  const sized = obj as unknown as SizedObject;
  const width =
    typeof sized.width === 'number'
      ? sized.width * gridSize
      : typeof sized.size === 'number'
        ? Math.max(1, sized.size) * gridSize
        : gridSize;
  const height =
    typeof sized.height === 'number'
      ? sized.height * gridSize
      : typeof sized.size === 'number'
        ? Math.max(1, sized.size) * gridSize
        : gridSize;
  return { width, height };
}

export function selectByRect(
  objects: readonly TabletopObject[],
  rect: TableRect,
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
    const { width, height } = getObjectExtent(obj, gridSize);
    const centerX = obj.location.x + width / 2;
    const centerY = obj.location.y + height / 2;
    if (centerX < normalized.x1 || centerX > normalized.x2) continue;
    if (centerY < normalized.y1 || centerY > normalized.y2) continue;
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
