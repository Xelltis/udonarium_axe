import { Injectable, signal } from '@angular/core';

/** How many pictures' sizes are kept, well above the pictures one table shows. */
const KEPT = 512;

/** How big a picture is, in its own pixels. */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

/**
 * How big each picture is, learnt by loading it once, so a piece drawn from its picture's
 * proportions is laid out the same way by everything that lays it out.
 *
 * A picture asked about for the first time is answered as unknown and loaded; its size is known
 * from the time it has come, and {@link version} goes up then. A picture that cannot be loaded
 * stays unknown.
 */
@Injectable({ providedIn: 'root' })
export class PictureSizeService {
  private readonly sizes = new Map<string, PictureSize | null>();
  private readonly changes = signal(0);

  /** Goes up each time a picture's size comes to be known. */
  readonly version = this.changes.asReadonly();

  /** How big the picture at a URL is, or null while that is not known. Follows {@link version}. */
  sizeOf(url: string): PictureSize | null {
    this.changes();
    if (!url) return null;
    if (this.sizes.has(url)) return this.sizes.get(url) ?? null;
    this.sizes.set(url, null);
    if (this.sizes.size > KEPT) this.sizes.delete(this.sizes.keys().next().value!);
    this.load(url);
    return null;
  }

  private load(url: string): void {
    if (typeof Image !== 'function') return;
    const picture = new Image();
    picture.onload = () => {
      if (!this.sizes.has(url) || !(picture.naturalWidth > 0) || !(picture.naturalHeight > 0)) return;
      this.sizes.set(url, { width: picture.naturalWidth, height: picture.naturalHeight });
      this.changes.update((version) => version + 1);
    };
    picture.src = url;
  }
}
