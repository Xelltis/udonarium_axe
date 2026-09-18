/** Where each row of a long list sits: `offsets[i]` is the top of row `i`, and `offsets[count]` the whole height. */
export interface VirtualLayout {
  readonly offsets: Float64Array;
  readonly total: number;
}

/**
 * The heights of the rows of a long list, as measured once drawn and as guessed before that.
 *
 * Heights are kept by each row's key rather than its place, so a row keeps its height when rows
 * above it are added, removed or moved.
 */
export class VirtualRowHeights {
  private readonly heights = new Map<unknown, number>();

  constructor(private readonly estimate: number) {}

  /** Records a row's drawn height and answers how far it moved from what was assumed before. */
  measure(key: unknown, height: number): number {
    const before = this.heights.get(key) ?? this.estimate;
    this.heights.set(key, height);
    return height - before;
  }

  /** The height a row is laid out with: as drawn, or the estimate until it has been. */
  heightOf(key: unknown): number {
    return this.heights.get(key) ?? this.estimate;
  }

  /** The top of every row and the height of them all, for rows with these keys in this order. */
  layout(keys: readonly unknown[]): VirtualLayout {
    const offsets = new Float64Array(keys.length + 1);
    for (let i = 0; i < keys.length; i++) offsets[i + 1] = offsets[i] + this.heightOf(keys[i]);
    return { offsets, total: offsets[keys.length] };
  }

  /** Forgets every measured height, as when what the rows show has changed wholesale. */
  clear(): void {
    this.heights.clear();
  }
}

/**
 * The rows to draw for a stretch of the list, `start` inclusive and `end` exclusive: every row that
 * reaches into the stretch from `top` to `bottom`.
 */
export function visibleRows(layout: VirtualLayout, top: number, bottom: number): { start: number; end: number } {
  const count = layout.offsets.length - 1;
  if (count < 1) return { start: 0, end: 0 };
  const start = Math.min(count - 1, Math.max(0, lastAtOrBelow(layout.offsets, count, top)));
  let end = start;
  while (end < count && layout.offsets[end] < bottom) end++;
  return { start, end: Math.max(end, start + 1) };
}

/** The last row whose top is at or above `value`, found by halving. */
function lastAtOrBelow(offsets: Float64Array, count: number, value: number): number {
  let low = 0;
  let high = count - 1;
  let found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
