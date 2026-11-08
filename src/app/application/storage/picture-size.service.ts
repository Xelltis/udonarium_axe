import { Injectable, signal } from '@angular/core';
import { AlphaMask } from '@axe/domain/ui/see-through';
import { readAlphaMask } from '@axe/infrastructure/image/alpha-mask-reader';

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
 * stays unknown. How opaque it is at each point is read once it has come too, for a press on a
 * clear part of a piece's picture to pass through it.
 */
@Injectable({ providedIn: 'root' })
export class PictureSizeService {
  private readonly sizes = new Map<string, PictureSize | null>();
  private readonly masks = new Map<string, AlphaMask | null>();
  private readonly changes = signal(0);

  /** Goes up each time a picture's size comes to be known. */
  readonly version = this.changes.asReadonly();

  /** How big the picture at a URL is, or null while that is not known. Follows {@link version}. */
  sizeOf(url: string): PictureSize | null {
    this.changes();
    if (!url) return null;
    if (this.sizes.has(url)) return this.sizes.get(url) ?? null;
    this.sizes.set(url, null);
    if (this.sizes.size > KEPT) {
      const oldest = this.sizes.keys().next().value!;
      this.sizes.delete(oldest);
      this.masks.delete(oldest);
    }
    this.load(url);
    return null;
  }

  /** How opaque the picture at a URL is at each point, or null while that is not known or cannot be read. */
  maskOf(url: string): AlphaMask | null {
    return this.masks.get(url) ?? null;
  }

  private load(url: string): void {
    if (typeof Image !== 'function') return;
    const picture = new Image();
    picture.onload = () => {
      if (!this.sizes.has(url) || !(picture.naturalWidth > 0) || !(picture.naturalHeight > 0)) return;
      this.sizes.set(url, { width: picture.naturalWidth, height: picture.naturalHeight });
      this.masks.set(url, readAlphaMask(picture, picture.naturalWidth, picture.naturalHeight));
      this.changes.update((version) => version + 1);
    };
    picture.src = url;
  }
}
