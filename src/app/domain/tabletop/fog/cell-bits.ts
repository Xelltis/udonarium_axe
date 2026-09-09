import { decodeBytes, encodeBytes } from '@axe/core/util/base64-bytes';

export class CellBits {
  private readonly words: Uint8Array;

  constructor(readonly count: number) {
    this.words = new Uint8Array(Math.max(0, Math.ceil(count / 8)));
  }

  get(index: number): boolean {
    if (index < 0 || index >= this.count) return false;
    return (this.words[index >> 3] & (1 << (index & 7))) !== 0;
  }

  set(index: number): void {
    if (index < 0 || index >= this.count) return;
    this.words[index >> 3] |= 1 << (index & 7);
  }

  unset(index: number): void {
    if (index < 0 || index >= this.count) return;
    this.words[index >> 3] &= ~(1 << (index & 7));
  }

  clear(): void {
    this.words.fill(0);
  }

  get isEmpty(): boolean {
    return this.words.every((word) => word === 0);
  }

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

  covers(other: CellBits): boolean {
    for (let i = 0; i < other.words.length; i++) {
      const mine = this.words[i] ?? 0;
      if ((mine | other.words[i]) !== mine) return false;
    }
    return true;
  }

  equals(other: CellBits): boolean {
    if (this.count !== other.count) return false;
    return this.words.every((word, i) => word === other.words[i]);
  }

  copy(): CellBits {
    const clone = new CellBits(this.count);
    clone.words.set(this.words);
    return clone;
  }

  bytes(): Uint8Array {
    return this.words;
  }
}

export function encodeCellBits(bits: CellBits): string {
  return encodeBytes(bits.bytes());
}

export function decodeCellBits(text: string, count: number): CellBits {
  const bits = new CellBits(count);
  const words = bits.bytes();
  words.set(decodeBytes(text, words.length));
  return bits;
}
