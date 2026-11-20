import { Injectable, signal, untracked } from '@angular/core';

/** A picture's own size, in pixels. */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

/** What a picture that will not load is taken to measure. */
const UNREAD: PictureSize = { width: 0, height: 0 };

/**
 * The own sizes of pictures by their address, each read once and shared, for whatever keeps a
 * picture's proportions: the cut-in editor and the AI link alike. A picture the page does not show
 * yet, as one only drawn on a canvas, has to come in before its size is known.
 */
@Injectable({ providedIn: 'root' })
export class PictureSizeService {
  private readonly sizes = signal<ReadonlyMap<string, PictureSize>>(new Map());
  private readonly reading = new Map<string, Promise<PictureSize>>();

  /**
   * A picture's own size as read, null until it has come in, and starts reading it where it has not;
   * read in a computed or an effect, it follows the picture coming in. Null for no address.
   */
  sizeOf(url: string): PictureSize | null {
    if (!url) return null;
    const known = this.sizes().get(url) ?? null;
    if (!known) void this.read(url);
    return known;
  }

  /** Reads a picture's own size, once for each address; one that will not load measures nothing. */
  read(url: string): Promise<PictureSize> {
    const known = untracked(this.sizes).get(url);
    if (known) return Promise.resolve(known);
    const pending = this.reading.get(url);
    if (pending) return pending;
    const reading = new Promise<PictureSize>((resolve) => {
      const picture = new Image();
      picture.onload = () => resolve({ width: picture.naturalWidth, height: picture.naturalHeight });
      picture.onerror = () => resolve(UNREAD);
      picture.src = url;
    }).then((size) => {
      this.reading.delete(url);
      this.sizes.update((sizes) => new Map(sizes).set(url, size));
      return size;
    });
    this.reading.set(url, reading);
    return reading;
  }
}
