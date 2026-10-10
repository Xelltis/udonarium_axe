import { decodeBytesInto, encodeBytes } from '@axe/core/util/base64-bytes';

export class CellBits {
  private readonly words: Uint8Array;

  constructor(readonly count: number) {
    this.words = new Uint8Array(Math.max(0, Math.ceil(count / 8)));
  }

  /** Whether the cell at this index is set. An index off the grid reads as unset. */
  get(index: number): boolean {
    if (index < 0 || index >= this.count) return false;
    return (this.words[index >> 3] & (1 << (index & 7))) !== 0;
  }

  /** Marks one cell. An index off the grid is ignored. */
  set(index: number): void {
    if (index < 0 || index >= this.count) return;
    this.words[index >> 3] |= 1 << (index & 7);
  }

  /** Clears one cell. An index off the grid is ignored. */
  unset(index: number): void {
    if (index < 0 || index >= this.count) return;
    this.words[index >> 3] &= ~(1 << (index & 7));
  }

  /** Clears every cell. */
  clear(): void {
    this.words.fill(0);
  }

  /** Whether no cell is set at all. */
  get isEmpty(): boolean {
    return this.words.every((word) => word === 0);
  }

  /**
   * Adds every cell set in the other set to this one, and reports whether anything was added.
   *
   * Only the bytes both sets have are merged, so a larger other set is cut down to this one's size.
   */
  or(other: CellBits): boolean {
    let changed = false;
    const limit = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < limit; i++) {
      const merged = this.words[i] | other.words[i];
      if (merged === this.words[i]) continue;
      this.words[i] = merged;
      changed = true;
    }
    return changed;
  }

  /**
   * Keeps only the cells the other set has as well, and reports whether anything was dropped.
   *
   * Cells beyond the end of the other set are dropped: a set that does not reach them does not
   * hold them either.
   */
  and(other: CellBits): boolean {
    let changed = false;
    for (let i = 0; i < this.words.length; i++) {
      const kept = this.words[i] & (other.words[i] ?? 0);
      if (kept === this.words[i]) continue;
      this.words[i] = kept;
      changed = true;
    }
    return changed;
  }

  /** Drops every cell the other set has, and reports whether anything was dropped. */
  without(other: CellBits): boolean {
    let changed = false;
    const limit = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < limit; i++) {
      const left = this.words[i] & ~other.words[i];
      if (left === this.words[i]) continue;
      this.words[i] = left;
      changed = true;
    }
    return changed;
  }

  /** Whether every cell set in the other set is also set here. */
  covers(other: CellBits): boolean {
    for (let i = 0; i < other.words.length; i++) {
      const mine = this.words[i] ?? 0;
      if ((mine | other.words[i]) !== mine) return false;
    }
    return true;
  }

  /** Whether both sets are for the same number of cells and hold the same cells. */
  equals(other: CellBits): boolean {
    if (this.count !== other.count) return false;
    return this.words.every((word, i) => word === other.words[i]);
  }

  /** An independent copy of the set. */
  copy(): CellBits {
    const clone = new CellBits(this.count);
    clone.words.set(this.words);
    return clone;
  }

  /**
   * The backing bytes, eight cells to a byte with the lowest bit first.
   *
   * This is the live buffer rather than a copy: writing into it changes the set.
   */
  bytes(): Uint8Array {
    return this.words;
  }
}

/** Packs a cell set into base64 text, the form a synced field carries it in. */
export function encodeCellBits(bits: CellBits): string {
  return encodeBytes(bits.bytes());
}

/**
 * Reads a cell set back from base64 text for a grid of `count` cells.
 *
 * The count comes from the caller rather than from the text, so the caller has to know the text was
 * written for a grid of that size.
 */
export function decodeCellBits(text: string, count: number): CellBits {
  const bits = new CellBits(count);
  decodeBytesInto(text, bits.bytes());
  return bits;
}
