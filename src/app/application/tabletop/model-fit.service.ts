import { Injectable, signal } from '@angular/core';
import { gltfFactsOfBlob } from '@axe/core/storage/gltf-facts';
import { isHeldModelUrl } from '@axe/core/storage/model-file';

/**
 * How the 3D models held here say they are laid on the blocks drawn as them, read from each file's
 * own JSON once and remembered, whatever draws them: above all, whether one is made as a wall joined
 * to the walls beside it.
 */
@Injectable({ providedIn: 'root' })
export class ModelFitService {
  private readonly fits = new Map<string, string>();
  private readonly reading = new Set<string>();
  private readonly joinedRead = signal(0);
  private readonly settled: (() => void)[] = [];

  /** Whether any model's file is still being read. */
  get isReading(): boolean {
    return this.reading.size > 0;
  }

  /**
   * Whether the model read from a URL is made as a wall joined to the walls beside it: false while it
   * is still being read, which it is from the first time it is asked about, and asked again once it
   * is found to be one. Only bytes held here are read, and of them only the JSON at their head.
   */
  isJoined(url: string): boolean {
    this.joinedRead();
    const fit = this.fits.get(url);
    if (fit === undefined) this.readSoon(url);
    return fit === 'joined';
  }

  /** Calls back each time a model's file has been read, whatever it says. */
  onRead(listener: () => void): void {
    this.settled.push(listener);
  }

  private readSoon(url: string): void {
    if (this.reading.has(url)) return;
    if (!isHeldModelUrl(url)) {
      this.fits.set(url, '');
      return;
    }
    this.reading.add(url);
    void this.read(url);
  }

  /** Reads a model's JSON, never before the asking is done, so nothing is written while it is asked. */
  private async read(url: string): Promise<void> {
    await Promise.resolve();
    let fit: string;
    try {
      fit = (await gltfFactsOfBlob(await (await fetch(url)).blob()))?.fit ?? '';
    } catch {
      fit = '';
    }
    this.fits.set(url, fit);
    this.reading.delete(url);
    if (fit === 'joined') this.joinedRead.update((count) => count + 1);
    for (const listener of this.settled) listener();
  }
}
