import { Injectable, signal } from '@angular/core';
import { gltfFactsOf } from '@axe/core/storage/gltf-facts';

/**
 * How the 3D models held here say they are laid on the blocks drawn as them, read from each file's
 * own JSON once and remembered, whatever draws them: above all, whether one is made as a wall joined
 * to the walls beside it.
 */
@Injectable({ providedIn: 'root' })
export class ModelFitService {
  private readonly fits = new Map<string, string>();
  private readonly reading = new Set<string>();
  private readonly read = signal(0);

  /**
   * Whether the model read from a URL is made as a wall joined to the walls beside it: false while it
   * is still being read, which it is from the first time it is asked about, and asked again once it is.
   * Only bytes held here are read, from an object URL or a data URL.
   */
  isJoined(url: string): boolean {
    this.read();
    const fit = this.fits.get(url);
    if (fit === undefined) this.readSoon(url);
    return fit === 'joined';
  }

  private readSoon(url: string): void {
    if (this.reading.has(url)) return;
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      this.fits.set(url, '');
      return;
    }
    this.reading.add(url);
    void (async () => {
      let fit: string;
      try {
        fit = gltfFactsOf(await (await fetch(url)).arrayBuffer())?.fit ?? '';
      } catch {
        fit = '';
      }
      this.fits.set(url, fit);
      this.reading.delete(url);
      this.read.update((count) => count + 1);
    })();
  }
}
